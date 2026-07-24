import json
import logging
import re
from typing import TypedDict

from fastapi import HTTPException
from langgraph.graph import END, StateGraph

from app.schemas.reconcile import (
    CheckedRecordSummary,
    ReconcileRequest,
    ReconcileResponse,
    ReconciliationActivity,
    ReconciliationDomain,
    ReconciliationFinding,
    ReconciliationVectorSearchEvidence,
    ReconciliationVectorSearchStatus,
    ReconciliationVectorSearchSummary,
)
from app.services.fhir_client import FhirClientError, FhirHttpError
from app.services.iris_vector_search_client import IrisVectorSearchClient, IrisVectorSearchError, VectorSearchResult
from app.services.record_fact_mapper import AllergyFact, MedicationFact, allergy_fact, medication_fact
from app.services.record_snapshot_service import RecordSnapshotService
from app.services.reconciliation_agent_service import ReconciliationAgentService, relevant_domains
from app.services.reconciliation_planner_service import ReconciliationPlannerService
from app.services.reconciliation_semantic_comparator_service import ReconciliationSemanticComparatorService


ALLOWED_DOMAINS: set[ReconciliationDomain] = {"AllergyIntolerance", "MedicationStatement"}
logger = logging.getLogger(__name__)


class ReconciliationGraphState(TypedDict, total=False):
    request: ReconcileRequest
    normalizedPatientId: str
    selectedDomains: set[ReconciliationDomain]
    failedDomains: set[ReconciliationDomain]
    patient: dict
    allergies: list[dict]
    medicationStatements: list[dict]
    allergyFacts: list[AllergyFact]
    medicationFacts: list[MedicationFact]
    vector_search_results: list[VectorSearchResult]
    vector_search_error: str | None
    vector_search_status: ReconciliationVectorSearchStatus
    vector_search_message: str
    fetchedResourceRefs: set[str]
    findings: list[ReconciliationFinding]
    activityTrail: list[ReconciliationActivity]
    response: ReconcileResponse


class ReconciliationGraph:
    def __init__(
        self,
        snapshot_service: RecordSnapshotService,
        agent: ReconciliationAgentService,
        planner: ReconciliationPlannerService | None = None,
        semantic_comparator: ReconciliationSemanticComparatorService | None = None,
        vector_search_client: IrisVectorSearchClient | None = None,
    ) -> None:
        self.snapshot_service = snapshot_service
        self.agent = agent
        self.planner = planner
        self.semantic_comparator = semantic_comparator
        self.vector_search_client = vector_search_client
        self.graph = self._build_graph()

    async def ainvoke(self, request: ReconcileRequest) -> ReconcileResponse:
        state = await self.graph.ainvoke({"request": request})
        response = state.get("response")
        if not response:
            raise HTTPException(status_code=500, detail="Reconciliation graph did not produce a response.")
        return response

    def _build_graph(self):
        workflow = StateGraph(ReconciliationGraphState)
        workflow.add_node("prepare_request", self.prepare_request)
        workflow.add_node("select_domains", self.select_domains)
        workflow.add_node("validate_domains", self.validate_domains)
        workflow.add_node("load_patient", self.load_patient)
        workflow.add_node("fetch_record_context", self.fetch_record_context)
        workflow.add_node("search_vector_context", self.search_vector_context)
        workflow.add_node("map_record_facts", self.map_record_facts)
        workflow.add_node("compare_draft_to_record", self.compare_draft_to_record)
        workflow.add_node("llm_semantic_compare", self.llm_semantic_compare)
        workflow.add_node("validate_findings", self.validate_findings)
        workflow.add_node("build_response", self.build_response)

        workflow.set_entry_point("prepare_request")
        workflow.add_edge("prepare_request", "select_domains")
        workflow.add_edge("select_domains", "validate_domains")
        workflow.add_edge("validate_domains", "load_patient")
        workflow.add_edge("load_patient", "fetch_record_context")
        workflow.add_edge("fetch_record_context", "search_vector_context")
        workflow.add_edge("search_vector_context", "map_record_facts")
        workflow.add_edge("map_record_facts", "compare_draft_to_record")
        workflow.add_edge("compare_draft_to_record", "llm_semantic_compare")
        workflow.add_edge("llm_semantic_compare", "validate_findings")
        workflow.add_edge("validate_findings", "build_response")
        workflow.add_edge("build_response", END)
        return workflow.compile()

    async def prepare_request(self, state: ReconciliationGraphState) -> ReconciliationGraphState:
        request = state["request"]
        # TODO: In a future hardening pass, load the Questionnaire by questionnaireId and use it as the
        # source-of-truth for linkId -> question text enrichment.
        return {
            **state,
            "normalizedPatientId": normalize_patient_id(request.patientId),
            "activityTrail": [],
            "selectedDomains": set(),
            "failedDomains": set(),
            "allergies": [],
            "medicationStatements": [],
            "allergyFacts": [],
            "medicationFacts": [],
            "vector_search_results": [],
            "vector_search_error": None,
            "vector_search_status": "skipped",
            "vector_search_message": "IRIS vector search was not run.",
            "fetchedResourceRefs": set(),
            "findings": [],
        }

    async def select_domains(self, state: ReconciliationGraphState) -> ReconciliationGraphState:
        request = state["request"]
        deterministic_domains = relevant_domains(request)
        activity = list(state.get("activityTrail", []))

        if not self.planner:
            activity.append(
                ReconciliationActivity(
                    step="plan-record-domains",
                    status="skipped",
                    message="LLM planner disabled; used deterministic record check planning.",
                )
            )
            return {**state, "selectedDomains": deterministic_domains, "activityTrail": activity}

        try:
            llm_domains = await self.planner.plan_domains(request)
        except Exception:
            activity.append(
                ReconciliationActivity(
                    step="plan-record-domains",
                    status="failed",
                    message="LLM planner failed; used deterministic record check planning.",
                )
            )
            return {**state, "selectedDomains": deterministic_domains, "activityTrail": activity}

        validated_llm_domains = llm_domains & ALLOWED_DOMAINS
        selected_domains = deterministic_domains | validated_llm_domains
        added_count = len(selected_domains - deterministic_domains)
        activity.append(
            ReconciliationActivity(
                step="plan-record-domains",
                status="completed",
                message=f"Planned record checks using deterministic rules and LLM planner; added {added_count} domain(s).",
            )
        )
        return {**state, "selectedDomains": selected_domains, "activityTrail": activity}

    async def validate_domains(self, state: ReconciliationGraphState) -> ReconciliationGraphState:
        selected = state.get("selectedDomains", set())
        invalid = selected - ALLOWED_DOMAINS
        if invalid:
            raise HTTPException(status_code=400, detail=f"Unsupported reconciliation domain(s): {', '.join(sorted(invalid))}")
        return state

    async def load_patient(self, state: ReconciliationGraphState) -> ReconciliationGraphState:
        patient_id = state["normalizedPatientId"]
        try:
            patient = await self.snapshot_service.load_patient(patient_id)
        except FhirHttpError as exc:
            if exc.response_status == 404:
                raise HTTPException(status_code=404, detail=f"Patient/{patient_id} was not found.") from exc
            raise
        except FhirClientError:
            raise

        if patient.get("resourceType") != "Patient":
            raise HTTPException(status_code=404, detail=f"Patient/{patient_id} was not found.")

        return {
            **state,
            "patient": patient,
            "activityTrail": [
                *state.get("activityTrail", []),
                ReconciliationActivity(step="read-patient", status="completed", message=f"Read Patient/{patient_id}."),
            ],
        }

    async def fetch_record_context(self, state: ReconciliationGraphState) -> ReconciliationGraphState:
        patient_id = state["normalizedPatientId"]
        selected = state.get("selectedDomains", set())
        failed = set(state.get("failedDomains", set()))
        activity = list(state.get("activityTrail", []))
        allergies: list[dict] = []
        medication_statements: list[dict] = []

        if "AllergyIntolerance" in selected:
            allergies, error = await self.snapshot_service.search_allergies(patient_id)
            if error:
                failed.add("AllergyIntolerance")
            activity.append(
                ReconciliationActivity(
                    step="search-allergyintolerance",
                    status="failed" if error else "completed",
                    message=error or f"Checked {len(allergies)} AllergyIntolerance record(s) for this patient.",
                )
            )
        else:
            activity.append(
                ReconciliationActivity(
                    step="search-allergyintolerance",
                    status="skipped",
                    message="Skipped allergy search because the draft did not contain allergy-related facts.",
                )
            )

        if "MedicationStatement" in selected:
            medication_statements, error = await self.snapshot_service.search_medication_statements(patient_id)
            if error:
                failed.add("MedicationStatement")
            activity.append(
                ReconciliationActivity(
                    step="search-medicationstatement",
                    status="failed" if error else "completed",
                    message=error or f"Checked {len(medication_statements)} MedicationStatement record(s) for this patient.",
                )
            )
        else:
            activity.append(
                ReconciliationActivity(
                    step="search-medicationstatement",
                    status="skipped",
                    message="Skipped medication search because the draft did not contain medication-related facts.",
                )
            )

        return {
            **state,
            "allergies": allergies,
            "medicationStatements": medication_statements,
            "failedDomains": failed,
            "activityTrail": activity,
        }

    async def search_vector_context(self, state: ReconciliationGraphState) -> ReconciliationGraphState:
        client = self.vector_search_client
        if not self.semantic_comparator:
            return _vector_search_outcome(
                state,
                status="skipped",
                message="IRIS vector search skipped because semantic comparison is disabled.",
            )
        if not client or not client.url:
            return _vector_search_outcome(
                state,
                status="skipped",
                message="IRIS vector search skipped because the endpoint is not configured.",
            )

        patient_reference = f"Patient/{state['normalizedPatientId']}"
        if getattr(client, "has_partial_auth", False):
            error = "IRIS vector search Basic Auth configuration is incomplete."
            logger.warning("IRIS vector search skipped for %s: %s", patient_reference, error)
            return _vector_search_outcome(
                state,
                status="skipped",
                message="IRIS vector search skipped because its authentication configuration is incomplete.",
                error=error,
            )

        try:
            query = build_vector_search_query(state["request"])
            if not query:
                return _vector_search_outcome(
                    state,
                    status="skipped",
                    message="IRIS vector search skipped because the draft has no searchable clinical text.",
                )
            response = await client.search(
                patient_reference=patient_reference,
                query=query,
            )
        except Exception as exc:
            if isinstance(exc, IrisVectorSearchError):
                error = str(exc)
            else:
                error = f"Unexpected vector search error: {type(exc).__name__}."
            logger.warning(
                "IRIS vector search failed for %s with topK=%d: %s",
                patient_reference,
                client.top_k,
                error,
            )
            return _vector_search_outcome(
                state,
                status="failed",
                message="IRIS vector search was unavailable; reconciliation continued with FHIR-server data only.",
                error=error,
            )

        result_count = len(response.results)
        label = "match" if result_count == 1 else "matches"
        return _vector_search_outcome(
            state,
            status="completed",
            message=f"IRIS vector search returned {result_count} supporting evidence {label}.",
            results=response.results,
        )

    async def map_record_facts(self, state: ReconciliationGraphState) -> ReconciliationGraphState:
        allergy_facts = [fact for resource in state.get("allergies", []) if (fact := allergy_fact(resource))]
        medication_facts = [fact for resource in state.get("medicationStatements", []) if (fact := medication_fact(resource))]
        fetched_refs = {fact.resource_ref for fact in allergy_facts}
        fetched_refs.update(fact.resource_ref for fact in medication_facts)
        return {
            **state,
            "allergyFacts": allergy_facts,
            "medicationFacts": medication_facts,
            "fetchedResourceRefs": fetched_refs,
        }

    async def compare_draft_to_record(self, state: ReconciliationGraphState) -> ReconciliationGraphState:
        request = state["request"]
        findings = self.agent.compare(
            answers=request.answers,
            suggestions=request.clinicalSuggestions,
            allergy_facts=state.get("allergyFacts", []),
            medication_facts=state.get("medicationFacts", []),
        )
        failed = state.get("failedDomains", set())
        findings = [finding for finding in findings if not (finding.classification == "novel" and finding.domain in failed)]
        findings = [finding.model_copy(update={"source": "deterministic"}) for finding in findings]
        return {**state, "findings": findings}

    async def llm_semantic_compare(self, state: ReconciliationGraphState) -> ReconciliationGraphState:
        activity = list(state.get("activityTrail", []))
        deterministic_findings = state.get("findings", [])

        if not self.semantic_comparator:
            activity.append(
                ReconciliationActivity(
                    step="llm-semantic-compare",
                    status="skipped",
                    message="LLM semantic comparator disabled; used deterministic findings only.",
                )
            )
            return {**state, "activityTrail": activity}

        try:
            semantic_findings = await self.semantic_comparator.compare(
                request=state["request"],
                allergy_facts=state.get("allergyFacts", []),
                medication_facts=state.get("medicationFacts", []),
                existing_findings=deterministic_findings,
                vector_search_results=state.get("vector_search_results", []),
            )
        except Exception:
            activity.append(
                ReconciliationActivity(
                    step="llm-semantic-compare",
                    status="failed",
                    message="LLM semantic comparator failed; used deterministic findings only.",
                )
            )
            return {**state, "activityTrail": activity}

        failed_domains = state.get("failedDomains", set())
        semantic_findings = [finding for finding in semantic_findings if finding.domain not in failed_domains]
        activity.append(
            ReconciliationActivity(
                step="llm-semantic-compare",
                status="completed",
                message=f"LLM semantic comparator added {len(semantic_findings)} advisory finding(s).",
            )
        )
        return {**state, "findings": [*deterministic_findings, *semantic_findings], "activityTrail": activity}

    async def validate_findings(self, state: ReconciliationGraphState) -> ReconciliationGraphState:
        fetched = state.get("fetchedResourceRefs", set())
        valid_findings: list[ReconciliationFinding] = []

        for finding in state.get("findings", []):
            refs = set(finding.existingResourceRefs)
            if finding.classification in {"duplicate", "contradiction"}:
                if not refs or not refs.issubset(fetched):
                    continue
            elif refs and not refs.issubset(fetched):
                finding = finding.model_copy(update={"existingResourceRefs": [ref for ref in finding.existingResourceRefs if ref in fetched]})
            valid_findings.append(finding)

        return {**state, "findings": valid_findings}

    async def build_response(self, state: ReconciliationGraphState) -> ReconciliationGraphState:
        response = ReconcileResponse(
            patientId=state["normalizedPatientId"],
            findings=state.get("findings", []),
            activityTrail=state.get("activityTrail", []),
            checkedRecordSummary=CheckedRecordSummary(
                domainsChecked=sorted(state.get("selectedDomains", set())),
                allergyIntoleranceCount=len(state.get("allergies", [])),
                medicationStatementCount=len(state.get("medicationStatements", [])),
            ),
            vectorSearch=ReconciliationVectorSearchSummary(
                status=state.get("vector_search_status", "skipped"),
                message=state.get("vector_search_message", "IRIS vector search was not run."),
                resultCount=len(state.get("vector_search_results", [])),
                evidence=[
                    ReconciliationVectorSearchEvidence(
                        resourceType=result.resourceType,
                        resourceId=result.resourceId,
                        versionId=result.versionId,
                        searchText=result.searchText,
                        similarity=result.similarity,
                    )
                    for result in state.get("vector_search_results", [])
                ],
            ),
        )
        return {**state, "response": response}


def _vector_search_outcome(
    state: ReconciliationGraphState,
    *,
    status: ReconciliationVectorSearchStatus,
    message: str,
    results: list[VectorSearchResult] | None = None,
    error: str | None = None,
) -> ReconciliationGraphState:
    return {
        **state,
        "vector_search_results": results or [],
        "vector_search_error": error,
        "vector_search_status": status,
        "vector_search_message": message,
        "activityTrail": [
            *state.get("activityTrail", []),
            ReconciliationActivity(
                step="search-vector-context",
                status=status,
                message=message,
            ),
        ],
    }


def build_vector_search_query(request: ReconcileRequest) -> str:
    sections: list[str] = []

    for answer in request.answers:
        value = _readable_query_value(answer.value)
        evidence = (answer.evidence or "").strip()
        if not value and not evidence:
            continue

        question = (answer.questionText or "").strip() or answer.linkId
        lines = [f"Question: {question}"]
        if value:
            lines.append(f"Answer: {value}")
        if evidence and evidence != value:
            lines.append(f"Supporting text: {evidence}")
        sections.append("\n".join(lines))

    for suggestion in request.clinicalSuggestions:
        fields = [
            f"{key}: {value.strip()}"
            for key, value in suggestion.fields.items()
            if isinstance(value, str) and value.strip()
        ]
        evidence = (suggestion.evidence or "").strip()
        if not fields and not evidence:
            continue

        heading = f"Proposed {suggestion.resourceType}"
        lines = [f"{heading}: {'; '.join(fields)}" if fields else heading]
        if evidence:
            lines.append(f"Supporting text: {evidence}")
        sections.append("\n".join(lines))

    return "\n\n".join(sections)


def _readable_query_value(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "Yes" if value else "No"
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, dict):
        for key in ("display", "value", "code"):
            candidate = value.get(key)
            if isinstance(candidate, str) and candidate.strip():
                return candidate.strip()
    if isinstance(value, list):
        readable_items = [_readable_query_value(item) for item in value]
        readable_items = [item for item in readable_items if item]
        if readable_items:
            return ", ".join(readable_items)
    try:
        return json.dumps(value, ensure_ascii=False, sort_keys=True)
    except (TypeError, ValueError):
        return str(value)


def normalize_patient_id(patient_id: str) -> str:
    value = patient_id.strip()
    if not value:
        raise HTTPException(status_code=400, detail="patientId is required.")
    if value.startswith("Patient/"):
        value = value.split("/", 1)[1]
    elif "/" in value or ":" in value:
        raise HTTPException(status_code=400, detail="patientId must be a FHIR Patient logical ID or Patient/{id}.")
    if not re.fullmatch(r"[A-Za-z0-9.-]{1,64}", value):
        raise HTTPException(status_code=400, detail="patientId contains unsupported characters.")
    return value
