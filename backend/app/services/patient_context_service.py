from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import re

from fastapi import HTTPException

from app.schemas.intake_recommendations import InformationGap, PatientRecordFact, RecordsChecked
from app.services.fhir_client import FhirClient, FhirClientError, FhirHttpError


FHIR_ID_PATTERN = re.compile(r"^[A-Za-z0-9\-.]{1,64}$")
RECENT_QUESTIONNAIRE_DAYS = 365


@dataclass(frozen=True)
class ConditionContextFact:
    display: str
    status: str | None
    resource_ref: str


@dataclass(frozen=True)
class MedicationContextFact:
    display: str
    status: str | None
    resource_ref: str


@dataclass(frozen=True)
class AllergyContextFact:
    display: str
    status: str | None
    has_reaction: bool
    resource_ref: str


@dataclass(frozen=True)
class QuestionnaireResponseContextFact:
    questionnaire: str | None
    authored: datetime | None
    status: str | None
    resource_ref: str


@dataclass
class PatientContext:
    patient_id: str
    active_conditions: list[ConditionContextFact] = field(default_factory=list)
    current_medications: list[MedicationContextFact] = field(default_factory=list)
    known_allergies: list[AllergyContextFact] = field(default_factory=list)
    questionnaire_responses: list[QuestionnaireResponseContextFact] = field(default_factory=list)
    records_checked: RecordsChecked = field(default_factory=RecordsChecked)
    fetched_resource_refs: set[str] = field(default_factory=set)
    warnings: list[str] = field(default_factory=list)
    information_gaps: list[InformationGap] = field(default_factory=list)

    def summary_conditions(self) -> list[PatientRecordFact]:
        return [
            PatientRecordFact(display=fact.display, status=fact.status, resourceRef=fact.resource_ref)
            for fact in self.active_conditions
        ]

    def summary_medications(self) -> list[PatientRecordFact]:
        return [
            PatientRecordFact(display=fact.display, status=fact.status, resourceRef=fact.resource_ref)
            for fact in self.current_medications
        ]

    def summary_allergies(self) -> list[PatientRecordFact]:
        return [
            PatientRecordFact(display=fact.display, status=fact.status, resourceRef=fact.resource_ref)
            for fact in self.known_allergies
        ]


class PatientContextService:
    def __init__(self, client: FhirClient) -> None:
        self.client = client

    async def load_context(self, patient_id: str) -> PatientContext:
        normalized_patient_id = normalize_patient_id(patient_id)
        await self._read_patient(normalized_patient_id)

        context = PatientContext(patient_id=normalized_patient_id)

        conditions = await self._optional_search(
            "Condition",
            {"subject": f"Patient/{normalized_patient_id}"},
            context,
            "Condition records could not be checked.",
        )
        medications = await self._optional_search(
            "MedicationStatement",
            {"subject": f"Patient/{normalized_patient_id}"},
            context,
            "MedicationStatement records could not be checked.",
        )
        allergies = await self._optional_search(
            "AllergyIntolerance",
            {"patient": f"Patient/{normalized_patient_id}"},
            context,
            "AllergyIntolerance records could not be checked.",
        )
        questionnaire_responses = await self._optional_search(
            "QuestionnaireResponse",
            {"subject": f"Patient/{normalized_patient_id}"},
            context,
            "QuestionnaireResponse records could not be checked.",
        )

        context.active_conditions = [_condition_fact(resource) for resource in conditions]
        context.active_conditions = [fact for fact in context.active_conditions if fact is not None and _condition_is_active(fact)]
        context.current_medications = [_medication_fact(resource) for resource in medications]
        context.current_medications = [fact for fact in context.current_medications if fact is not None and _medication_is_current(fact)]
        context.known_allergies = [_allergy_fact(resource) for resource in allergies]
        context.known_allergies = [fact for fact in context.known_allergies if fact is not None and _allergy_is_active(fact)]
        context.questionnaire_responses = [_questionnaire_response_fact(resource) for resource in questionnaire_responses]
        context.questionnaire_responses = [fact for fact in context.questionnaire_responses if fact is not None]

        context.records_checked = RecordsChecked(
            conditionCount=len(conditions),
            medicationStatementCount=len(medications),
            allergyIntoleranceCount=len(allergies),
            questionnaireResponseCount=len(questionnaire_responses),
            questionnaireCount=0,
        )
        context.fetched_resource_refs.update(fact.resource_ref for fact in context.active_conditions)
        context.fetched_resource_refs.update(fact.resource_ref for fact in context.current_medications)
        context.fetched_resource_refs.update(fact.resource_ref for fact in context.known_allergies)
        context.fetched_resource_refs.update(fact.resource_ref for fact in context.questionnaire_responses)
        context.information_gaps = detect_information_gaps(context)
        return context

    async def _read_patient(self, patient_id: str) -> None:
        try:
            response = await self.client.read("Patient", patient_id)
        except FhirHttpError as exc:
            if exc.response_status == 404:
                raise HTTPException(status_code=404, detail=f"Patient not found: {patient_id}") from exc
            raise
        data = response.data or {}
        if data.get("resourceType") != "Patient":
            raise HTTPException(status_code=502, detail="FHIR server returned an invalid Patient response.")

    async def _optional_search(
        self,
        resource_type: str,
        params: dict[str, str],
        context: PatientContext,
        warning: str,
    ) -> list[dict]:
        try:
            response = await self.client.search(resource_type, params)
        except FhirClientError:
            context.warnings.append(warning)
            return []
        bundle = response.data or {}
        if bundle.get("resourceType") != "Bundle":
            context.warnings.append(warning)
            return []
        resources: list[dict] = []
        for entry in bundle.get("entry") or []:
            if not isinstance(entry, dict):
                continue
            resource = entry.get("resource")
            if isinstance(resource, dict) and resource.get("resourceType") == resource_type:
                resources.append(resource)
        return resources


def normalize_patient_id(patient_id: str) -> str:
    value = patient_id.strip()
    if value.startswith("Patient/"):
        value = value.split("/", 1)[1]
    elif "/" in value:
        raise HTTPException(status_code=400, detail="patientId must be a Patient logical ID or Patient/{id}.")
    if not value or not FHIR_ID_PATTERN.fullmatch(value):
        raise HTTPException(status_code=400, detail="patientId is not a valid FHIR logical ID.")
    return value


def detect_information_gaps(context: PatientContext) -> list[InformationGap]:
    gaps: list[InformationGap] = []
    for allergy in context.known_allergies:
        if not allergy.has_reaction:
            gaps.append(
                InformationGap(
                    code="missing-allergy-reaction",
                    message=f"The active {allergy.display} allergy does not include reaction details.",
                    evidenceRefs=[allergy.resource_ref],
                )
            )

    has_recent_completed = _has_recent_completed_questionnaire_response(context.questionnaire_responses)
    if not has_recent_completed:
        gaps.append(
            InformationGap(
                code="no-recent-questionnaire-response",
                message="No completed QuestionnaireResponse was found in the checked records within the past 365 days.",
                evidenceRefs=[],
            )
        )
        if context.current_medications:
            gaps.append(
                InformationGap(
                    code="medication-review-recommended",
                    message="Current medication records exist and no recent completed QuestionnaireResponse was found in the checked records.",
                    evidenceRefs=[fact.resource_ref for fact in context.current_medications],
                )
            )
    return gaps


def _condition_fact(resource: dict) -> ConditionContextFact | None:
    resource_id = resource.get("id")
    display = _code_text(resource.get("code"))
    if not resource_id or not display:
        return None
    return ConditionContextFact(
        display=display,
        status=_first_coding_code(resource.get("clinicalStatus")),
        resource_ref=f"Condition/{resource_id}",
    )


def _medication_fact(resource: dict) -> MedicationContextFact | None:
    resource_id = resource.get("id")
    display = _code_text(resource.get("medicationCodeableConcept")) or _reference_display(resource.get("medicationReference"))
    if not resource_id or not display:
        return None
    return MedicationContextFact(display=display, status=str(resource.get("status")) if resource.get("status") else None, resource_ref=f"MedicationStatement/{resource_id}")


def _allergy_fact(resource: dict) -> AllergyContextFact | None:
    resource_id = resource.get("id")
    display = _code_text(resource.get("code"))
    if not resource_id or not display:
        return None
    return AllergyContextFact(
        display=display,
        status=_first_coding_code(resource.get("clinicalStatus")),
        has_reaction=_has_reaction_details(resource),
        resource_ref=f"AllergyIntolerance/{resource_id}",
    )


def _questionnaire_response_fact(resource: dict) -> QuestionnaireResponseContextFact | None:
    resource_id = resource.get("id")
    if not resource_id:
        return None
    return QuestionnaireResponseContextFact(
        questionnaire=str(resource.get("questionnaire")) if resource.get("questionnaire") else None,
        authored=_parse_fhir_datetime(resource.get("authored")),
        status=str(resource.get("status")) if resource.get("status") else None,
        resource_ref=f"QuestionnaireResponse/{resource_id}",
    )


def _condition_is_active(fact: ConditionContextFact) -> bool:
    if not fact.status:
        return True
    return fact.status.lower() in {"active", "recurrence", "relapse"}


def _medication_is_current(fact: MedicationContextFact) -> bool:
    if not fact.status:
        return True
    return fact.status.lower() not in {"stopped", "completed", "entered-in-error", "not-taken"}


def _allergy_is_active(fact: AllergyContextFact) -> bool:
    if not fact.status:
        return True
    return fact.status.lower() == "active"


def _has_recent_completed_questionnaire_response(responses: list[QuestionnaireResponseContextFact]) -> bool:
    cutoff = datetime.now(timezone.utc).timestamp() - (RECENT_QUESTIONNAIRE_DAYS * 24 * 60 * 60)
    for response in responses:
        if response.status != "completed" or response.authored is None:
            continue
        if response.authored.timestamp() >= cutoff:
            return True
    return False


def _code_text(value: object) -> str | None:
    if not isinstance(value, dict):
        return None
    text = value.get("text")
    if isinstance(text, str) and text.strip():
        return text.strip()
    for coding in value.get("coding") or []:
        if not isinstance(coding, dict):
            continue
        display = coding.get("display")
        code = coding.get("code")
        if isinstance(display, str) and display.strip():
            return display.strip()
        if isinstance(code, str) and code.strip():
            return code.strip()
    return None


def _reference_display(value: object) -> str | None:
    if not isinstance(value, dict):
        return None
    display = value.get("display")
    return display.strip() if isinstance(display, str) and display.strip() else None


def _first_coding_code(value: object) -> str | None:
    if not isinstance(value, dict):
        return None
    for coding in value.get("coding") or []:
        if isinstance(coding, dict) and isinstance(coding.get("code"), str):
            return str(coding["code"])
    return None


def _has_reaction_details(resource: dict) -> bool:
    for reaction in resource.get("reaction") or []:
        if not isinstance(reaction, dict):
            continue
        if reaction.get("description"):
            return True
        for manifestation in reaction.get("manifestation") or []:
            if not isinstance(manifestation, dict):
                continue
            if manifestation.get("text") or manifestation.get("coding"):
                return True
    return False


def _parse_fhir_datetime(value: object) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    text = value.strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)
