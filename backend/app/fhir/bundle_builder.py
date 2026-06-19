from uuid import uuid4


def build_transaction_bundle(
    *,
    encounter: dict,
    questionnaire_response: dict,
    allergies: list[dict],
    encounter_full_url: str,
    questionnaire_response_full_url: str,
) -> dict:
    entries = [
        _post_entry(encounter_full_url, "Encounter", encounter),
        _post_entry(questionnaire_response_full_url, "QuestionnaireResponse", questionnaire_response),
    ]
    for allergy in allergies:
        allergy_full_url = f"urn:uuid:{uuid4()}"
        entries.append(_post_entry(allergy_full_url, "AllergyIntolerance", allergy))
    return {"resourceType": "Bundle", "type": "transaction", "entry": entries}


def _post_entry(full_url: str, resource_type: str, resource: dict) -> dict:
    return {
        "fullUrl": full_url,
        "resource": resource,
        "request": {"method": "POST", "url": resource_type},
    }
