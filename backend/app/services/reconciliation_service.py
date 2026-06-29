from app.schemas.reconcile import (
    CheckedRecordSummary,
    ReconcileRequest,
    ReconcileResponse,
    ReconciliationActivity,
    ReconciliationDomain,
)
from app.services.fhir_client import FhirClient
from app.services.record_fact_mapper import allergy_fact, medication_fact
from app.services.record_snapshot_service import RecordSnapshotService
from app.services.reconciliation_agent_service import ReconciliationAgentService


class ReconciliationService:
    def __init__(self, client: FhirClient) -> None:
        self.snapshot_service = RecordSnapshotService(client)
        self.agent = ReconciliationAgentService()

    async def reconcile(self, request: ReconcileRequest) -> ReconcileResponse:
        activity: list[ReconciliationActivity] = []
        patient = await self.snapshot_service.load_patient(request.patientId)
        activity.append(
            ReconciliationActivity(
                step="read-patient",
                status="completed",
                message=f"Read Patient/{request.patientId}.",
            )
        )

        domains = _relevant_domains(request)
        allergies: list[dict] = []
        medication_statements: list[dict] = []

        if "AllergyIntolerance" in domains:
            allergies, error = await self.snapshot_service.search_allergies(request.patientId)
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

        if "MedicationStatement" in domains:
            medication_statements, error = await self.snapshot_service.search_medication_statements(request.patientId)
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

        allergy_facts = [fact for resource in allergies if (fact := allergy_fact(resource))]
        medication_facts = [fact for resource in medication_statements if (fact := medication_fact(resource))]
        findings = self.agent.compare(
            answers=request.answers,
            suggestions=request.clinicalSuggestions,
            allergy_facts=allergy_facts,
            medication_facts=medication_facts,
        )

        _ = patient  # Patient is verified for scoping; it is not returned in the MVP response.
        return ReconcileResponse(
            patientId=request.patientId,
            findings=findings,
            activityTrail=activity,
            checkedRecordSummary=CheckedRecordSummary(
                domainsChecked=sorted(domains),
                allergyIntoleranceCount=len(allergies),
                medicationStatementCount=len(medication_statements),
            ),
        )


def _relevant_domains(request: ReconcileRequest) -> set[ReconciliationDomain]:
    domains: set[ReconciliationDomain] = set()

    for suggestion in request.clinicalSuggestions:
        if suggestion.resourceType in {"AllergyIntolerance", "MedicationStatement"}:
            domains.add(suggestion.resourceType)

    for answer in request.answers:
        haystack = f"{answer.linkId} {answer.evidence or ''} {_answer_text(answer) or ''}".lower()
        if "allerg" in haystack or "allergen" in haystack:
            domains.add("AllergyIntolerance")
        if any(token in haystack for token in ["medication", "blood thinner", "warfarin", "coumadin", "eliquis", "apixaban", "aspirin"]):
            domains.add("MedicationStatement")

    return domains


def _answer_text(answer: object) -> str | None:
    value = getattr(answer, "value", None)
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        for key in ("display", "value", "code"):
            if isinstance(value.get(key), str):
                return str(value[key])
    if isinstance(value, bool):
        return "yes" if value else "no"
    if value is not None:
        return str(value)
    return None
