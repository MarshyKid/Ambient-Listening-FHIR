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
)
from app.services.fhir_client import FhirClientError, FhirHttpError
from app.services.record_fact_mapper import AllergyFact, MedicationFact, allergy_fact, medication_fact
from app.services.record_snapshot_service import RecordSnapshotService
from app.services.reconciliation_agent_service import ReconciliationAgentService, relevant_domains
from app.services.reconciliation_planner_service import ReconciliationPlannerService


ALLOWED_DOMAINS: set[ReconciliationDomain] = {"AllergyIntolerance", "MedicationStatement"}


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
    ) -> None:
        self.snapshot_service = snapshot_service
        self.agent = agent
        self.planner = planner
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
        workflow.add_node("map_record_facts", self.map_record_facts)
        workflow.add_node("compare_draft_to_record", self.compare_draft_to_record)
        workflow.add_node("validate_findings", self.validate_findings)
        workflow.add_node("build_response", self.build_response)

        workflow.set_entry_point("prepare_request")
        workflow.add_edge("prepare_request", "select_domains")
        workflow.add_edge("select_domains", "validate_domains")
        workflow.add_edge("validate_domains", "load_patient")
        workflow.add_edge("load_patient", "fetch_record_context")
        workflow.add_edge("fetch_record_context", "map_record_facts")
        workflow.add_edge("map_record_facts", "compare_draft_to_record")
        workflow.add_edge("compare_draft_to_record", "validate_findings")
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
        return {**state, "findings": findings}

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
        )
        return {**state, "response": response}


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
