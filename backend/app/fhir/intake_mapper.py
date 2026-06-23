from urllib.parse import urlparse

from app.fhir.patient_builder import flatten_patient
from app.schemas.intake import IntakeSummary


def map_intake_summary(
    questionnaire_response: dict,
    *,
    mrn_system: str,
    patient: dict | None = None,
    questionnaire: dict | None = None,
) -> IntakeSummary:
    questionnaire_response_id = _require_id(questionnaire_response)
    subject_reference = (questionnaire_response.get("subject") or {}).get("reference")
    patient_id = reference_id(subject_reference, "Patient")

    patient_summary = flatten_patient(patient, mrn_system) if patient else None

    return IntakeSummary(
        id=questionnaire_response_id,
        questionnaireResponseId=questionnaire_response_id,
        patientId=patient_id,
        patientName=patient_summary.name if patient_summary else None,
        patientMrn=patient_summary.mrn if patient_summary else None,
        questionnaire=questionnaire_response.get("questionnaire"),
        questionnaireTitle=_questionnaire_title(questionnaire),
        authored=questionnaire_response.get("authored"),
        status=str(questionnaire_response.get("status") or "unknown"),
    )


def reference_id(reference: object, resource_type: str) -> str | None:
    if not isinstance(reference, str) or not reference:
        return None

    reference_without_version = reference.split("|", 1)[0]
    parsed = urlparse(reference_without_version)
    path = parsed.path if parsed.scheme else reference_without_version
    parts = [part for part in path.strip("/").split("/") if part]

    for index, part in enumerate(parts):
        if part == resource_type and index + 1 < len(parts):
            return parts[index + 1]
    return None


def _questionnaire_title(questionnaire: dict | None) -> str | None:
    if not questionnaire:
        return None
    title = questionnaire.get("title") or questionnaire.get("name")
    return str(title) if title else None


def _require_id(resource: dict) -> str:
    fhir_id = resource.get("id")
    if not fhir_id:
        raise ValueError("FHIR QuestionnaireResponse is missing id.")
    return str(fhir_id)
