from datetime import datetime

from app.fhir.encounter_builder import iso_utc


def build_questionnaire_response(
    *,
    questionnaire_canonical: str,
    patient_id: str,
    practitioner_id: str,
    encounter_reference: str,
    authored: datetime,
    items: list[dict],
) -> dict:
    return {
        "resourceType": "QuestionnaireResponse",
        "status": "completed",
        "questionnaire": questionnaire_canonical,
        "subject": {"reference": f"Patient/{patient_id}"},
        "encounter": {"reference": encounter_reference},
        "author": {"reference": f"Practitioner/{practitioner_id}"},
        "authored": iso_utc(authored),
        "item": items,
    }


def build_response_item(*, link_id: str, text: str, value_key: str, value: object) -> dict:
    return {
        "linkId": link_id,
        "text": text,
        "answer": [{value_key: value}],
    }
