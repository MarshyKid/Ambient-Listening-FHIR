from uuid import uuid4


def build_transaction_bundle(*, encounter: dict, questionnaire_response: dict, allergies: list[dict]) -> dict:
    ENCOUNTER_FULL_URL = f"urn:uuid:{uuid4()}"
    QUESTIONNAIRE_RESPONSE_FULL_URL = f"urn:uuid:{uuid4()}"
    ALLERGY_FULL_URL_PREFIX = f"urn:uuid:{uuid4()}"

    #change uuid ref in questionnaireresponse.encounter.reference to actual uuid
    questionnaire_response["encounter"]["reference"] = ENCOUNTER_FULL_URL

    entries = [
        _post_entry(ENCOUNTER_FULL_URL, "Encounter", encounter),
        _post_entry(QUESTIONNAIRE_RESPONSE_FULL_URL, "QuestionnaireResponse", questionnaire_response),
    ]
    for index, allergy in enumerate(allergies, start=1):
        entries.append(_post_entry(f"{ALLERGY_FULL_URL_PREFIX}{index}", "AllergyIntolerance", allergy))
    return {"resourceType": "Bundle", "type": "transaction", "entry": entries}


def _post_entry(full_url: str, resource_type: str, resource: dict) -> dict:
    return {
        "fullUrl": full_url,
        "resource": resource,
        "request": {"method": "POST", "url": resource_type},
    }
