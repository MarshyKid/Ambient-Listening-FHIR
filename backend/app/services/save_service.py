import re
from typing import Any
from uuid import uuid4

from fastapi import HTTPException

from app.config import Settings
from app.fhir.allergy_builder import build_allergy_intolerance
from app.fhir.bundle_builder import build_transaction_bundle
from app.fhir.encounter_builder import build_encounter, utc_now
from app.fhir.questionnaire_mapper import (
    find_choice_answer,
    questionnaire_items_by_link_id,
)
from app.fhir.response_builder import build_questionnaire_response, build_response_item
from app.schemas.save import AcceptedSuggestion, CreatedResource, ReviewedAnswer, SaveRequest, SaveResponse
from app.services.audit_service import write_save_audit
from app.services.fhir_client import FhirClient
from app.services.patient_service import PatientService
from app.services.practitioner_service import PractitionerService
from app.services.questionnaire_service import QuestionnaireService


class SaveService:
    def __init__(
        self,
        client: FhirClient,
        settings: Settings,
        patient_service: PatientService,
        practitioner_service: PractitionerService,
        questionnaire_service: QuestionnaireService,
    ) -> None:
        self.client = client
        self.settings = settings
        self.patient_service = patient_service
        self.practitioner_service = practitioner_service
        self.questionnaire_service = questionnaire_service

    async def save(self, request: SaveRequest) -> SaveResponse:
        started_at = utc_now()
        audit_base = {
            "patientId": request.patientId,
            "practitionerId": request.practitionerId,
            "questionnaireId": request.questionnaireId,
        }
        audit_written = False
        try:
            patient = await self.patient_service.read_patient_resource(request.patientId)
            practitioner = await self.practitioner_service.resolve_practitioner(request.practitionerId)
            questionnaire = await self.questionnaire_service.read_questionnaire_resource(request.questionnaireId)
            questionnaire_reference = questionnaire_response_questionnaire_reference(questionnaire)

            qr_items = self._validate_and_build_answers(request.answers, questionnaire)
            authored_at = utc_now()
            encounter_full_url = f"urn:uuid:{uuid4()}"
            questionnaire_response_full_url = f"urn:uuid:{uuid4()}"
            encounter = build_encounter(patient_id=str(patient["id"]), start=started_at, end=authored_at)
            questionnaire_response = build_questionnaire_response(
                questionnaire_canonical=questionnaire_reference,
                patient_id=str(patient["id"]),
                practitioner_id=practitioner.id,
                encounter_reference=encounter_full_url,
                authored=authored_at,
                items=qr_items,
            )
            allergies = self._build_allergies(
                suggestions=request.acceptedSuggestions,
                patient_id=str(patient["id"]),
                practitioner_id=practitioner.id,
                encounter_reference=encounter_full_url,
            )
            transaction_bundle = build_transaction_bundle(
                encounter=encounter,
                questionnaire_response=questionnaire_response,
                allergies=allergies,
                encounter_full_url=encounter_full_url,
                questionnaire_response_full_url=questionnaire_response_full_url,
            )
            response = await self.client.transaction(transaction_bundle)
            response_bundle = response.data or {}
            failures = transaction_failures(response_bundle)
            if failures:
                message = "; ".join(failures)
                write_save_audit(
                    {
                        **audit_base,
                        "resolvedPatientFhirId": patient.get("id"),
                        "resolvedPractitionerFhirId": practitioner.id,
                        "resolvedQuestionnaireFhirId": questionnaire.get("id"),
                        "questionnaireReference": questionnaire_reference,
                        "createdResourceIds": [],
                        "saveStatus": "failed",
                        "errorMessage": message,
                    }
                )
                audit_written = True
                raise HTTPException(
                    status_code=422,
                    detail={
                        "status": 422,
                        "statusText": "Unprocessable Entity",
                        "error": message,
                        "responseBundle": response_bundle,
                    },
                )

            created = created_resources_from_response(response_bundle)
            encounter_id = first_id(created, "Encounter")
            questionnaire_response_id = first_id(created, "QuestionnaireResponse")
            if not encounter_id or not questionnaire_response_id:
                raise HTTPException(status_code=502, detail="Transaction succeeded but created resource IDs could not be parsed.")

            write_save_audit(
                {
                    **audit_base,
                    "resolvedPatientFhirId": patient.get("id"),
                    "resolvedPractitionerFhirId": practitioner.id,
                    "resolvedQuestionnaireFhirId": questionnaire.get("id"),
                    "questionnaireReference": questionnaire_reference,
                    "createdResourceIds": [item.model_dump() for item in created],
                    "saveStatus": "success",
                    "errorMessage": None,
                }
            )
            audit_written = True
            return SaveResponse(
                requestUrl=response.request_url,
                status=response.status,
                statusText=response.status_text,
                transactionBundle=transaction_bundle,
                responseBundle=response_bundle,
                encounterId=encounter_id,
                questionnaireResponseId=questionnaire_response_id,
                createdResources=created,
            )
        except Exception as exc:
            if not audit_written:
                error_message = _http_exception_message(exc) if isinstance(exc, HTTPException) else str(exc)
                write_save_audit({**audit_base, "saveStatus": "failed", "errorMessage": error_message})
            raise

    def _validate_and_build_answers(self, answers: list[ReviewedAnswer], questionnaire: dict) -> list[dict]:
        items_by_link_id = questionnaire_items_by_link_id(questionnaire)
        response_items: list[dict] = []
        for answer in answers:
            item = items_by_link_id.get(answer.linkId)
            if item is None:
                raise HTTPException(status_code=400, detail=f"Invalid linkId: {answer.linkId}")
            item_type = item.get("type")
            if item_type == "group":
                raise HTTPException(status_code=400, detail=f"Group item cannot be answered directly: {answer.linkId}")
            if answer.valueType != item_type:
                raise HTTPException(
                    status_code=400,
                    detail=f"valueType mismatch for {answer.linkId}: expected {item_type}, got {answer.valueType}",
                )
            response_items.append(self._build_answer_item(answer, item))
        return response_items

    def _build_answer_item(self, answer: ReviewedAnswer, item: dict) -> dict:
        text = str(item.get("text") or answer.linkId)
        if answer.valueType in {"string", "text"}:
            if not isinstance(answer.value, str):
                raise HTTPException(status_code=400, detail=f"Expected string value for {answer.linkId}.")
            return build_response_item(link_id=answer.linkId, text=text, value_key="valueString", value=answer.value)
        if answer.valueType == "boolean":
            if not isinstance(answer.value, bool):
                raise HTTPException(status_code=400, detail=f"Expected boolean value for {answer.linkId}.")
            return build_response_item(link_id=answer.linkId, text=text, value_key="valueBoolean", value=answer.value)
        if answer.valueType == "integer":
            if not isinstance(answer.value, int) or isinstance(answer.value, bool):
                raise HTTPException(status_code=400, detail=f"Expected integer value for {answer.linkId}.")
            return build_response_item(link_id=answer.linkId, text=text, value_key="valueInteger", value=answer.value)
        if answer.valueType == "date":
            if not isinstance(answer.value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", answer.value):
                raise HTTPException(status_code=400, detail=f"Expected FHIR date value for {answer.linkId}.")
            return build_response_item(link_id=answer.linkId, text=text, value_key="valueDate", value=answer.value)
        if answer.valueType == "dateTime":
            if not isinstance(answer.value, str) or not _is_fhir_datetime(answer.value):
                raise HTTPException(status_code=400, detail=f"Expected FHIR dateTime value for {answer.linkId}.")
            return build_response_item(link_id=answer.linkId, text=text, value_key="valueDateTime", value=answer.value)
        if answer.valueType == "choice":
            value_key, value = self._matched_choice(answer, item)
            return build_response_item(link_id=answer.linkId, text=text, value_key=value_key, value=value)
        raise HTTPException(status_code=400, detail=f"Unsupported valueType: {answer.valueType}")

    def _matched_choice(self, answer: ReviewedAnswer, item: dict) -> tuple[str, dict | str]:
        if not isinstance(answer.value, dict):
            raise HTTPException(status_code=400, detail=f"Expected choice object for {answer.linkId}.")
        matched = find_choice_answer(item, answer.value)
        if not matched:
            raise HTTPException(status_code=400, detail=f"Choice answer does not match Questionnaire options for {answer.linkId}.")
        return matched

    def _build_allergies(
        self,
        *,
        suggestions: list[AcceptedSuggestion],
        patient_id: str,
        practitioner_id: str,
        encounter_reference: str,
    ) -> list[dict]:
        allergies: list[dict] = []
        for suggestion in suggestions:
            if suggestion.type != "AllergyIntolerance":
                raise HTTPException(status_code=400, detail=f"{suggestion.type} creation is deferred.")
            substance = (suggestion.fields.get("substance") or "").strip()
            if not substance:
                raise HTTPException(status_code=400, detail="Accepted AllergyIntolerance suggestion requires fields.substance.")
            allergies.append(
                build_allergy_intolerance(
                    patient_id=patient_id,
                    practitioner_id=practitioner_id,
                    encounter_reference=encounter_reference,
                    substance=substance,
                    reaction=suggestion.fields.get("reaction"),
                )
            )
        return allergies


def transaction_failures(response_bundle: dict) -> list[str]:
    failures: list[str] = []
    for index, entry in enumerate(response_bundle.get("entry") or [], start=1):
        response = entry.get("response") or {}
        status = str(response.get("status") or "")
        if not status.startswith("2"):
            failures.append(f"Transaction entry {index} failed with status {status or 'unknown'}.")
    return failures


def created_resources_from_response(response_bundle: dict) -> list[CreatedResource]:
    created: list[CreatedResource] = []
    for entry in response_bundle.get("entry") or []:
        response = entry.get("response") or {}
        parsed = parse_location(response.get("location"))
        if parsed:
            resource_type, resource_id = parsed
            created.append(CreatedResource(resourceType=resource_type, id=resource_id))
    return created


def parse_location(location: Any) -> tuple[str, str] | None:
    if not isinstance(location, str) or not location:
        return None
    path = location.split("?", 1)[0]
    parts = [part for part in path.split("/") if part]
    if len(parts) < 2:
        return None
    return parts[-2], parts[-1]


def first_id(resources: list[CreatedResource], resource_type: str) -> str | None:
    for resource in resources:
        if resource.resourceType == resource_type:
            return resource.id
    return None


def questionnaire_response_questionnaire_reference(questionnaire: dict) -> str:
    url = str(questionnaire.get("url") or "").strip()
    version = str(questionnaire.get("version") or "").strip()
    questionnaire_id = questionnaire.get("id")

    if url and version:
        return f"{url}|{version}"
    if url:
        return url
    if questionnaire_id:
        return f"Questionnaire/{questionnaire_id}"

    raise HTTPException(
        status_code=500,
        detail="Questionnaire.url or Questionnaire.id is required to build QuestionnaireResponse.questionnaire.",
    )


def _http_exception_message(exc: HTTPException) -> str:
    return exc.detail if isinstance(exc.detail, str) else str(exc.detail)


def _is_fhir_datetime(value: str) -> bool:
    return bool(
        re.fullmatch(
            r"\d{4}(-\d{2}(-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?)?)?",
            value,
        )
    )
