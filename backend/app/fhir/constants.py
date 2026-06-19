FHIR_JSON = "application/fhir+json"
SUPPORTED_QUESTIONNAIRE_ITEM_TYPES = {"string", "text", "boolean", "choice", "integer", "date", "dateTime", "group"}
ANSWERABLE_QUESTIONNAIRE_ITEM_TYPES = SUPPORTED_QUESTIONNAIRE_ITEM_TYPES - {"group"}
