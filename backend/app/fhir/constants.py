FHIR_JSON = "application/fhir+json"
SUPPORTED_QUESTIONNAIRE_ITEM_TYPES = {"string", "text", "boolean", "choice", "integer", "date", "dateTime", "group"}
ANSWERABLE_QUESTIONNAIRE_ITEM_TYPES = SUPPORTED_QUESTIONNAIRE_ITEM_TYPES - {"group"}

ENCOUNTER_FULL_URL = "urn:uuid:enc-1"
QUESTIONNAIRE_RESPONSE_FULL_URL = "urn:uuid:qr-1"
ALLERGY_FULL_URL_PREFIX = "urn:uuid:allergy-"
