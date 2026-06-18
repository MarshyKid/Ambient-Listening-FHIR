from typing import Any, Literal

from .common import ApiModel, FhirJson


class ReviewedAnswer(ApiModel):
    linkId: str
    valueType: Literal["string", "text", "boolean", "choice", "integer", "date", "dateTime", "group"]
    value: Any


class AcceptedSuggestion(ApiModel):
    type: Literal["AllergyIntolerance", "Condition", "MedicationStatement"]
    fields: dict[str, str] = {}


class SaveRequest(ApiModel):
    patientId: str
    practitionerId: str
    questionnaireId: str
    answers: list[ReviewedAnswer]
    acceptedSuggestions: list[AcceptedSuggestion] = []


class CreatedResource(ApiModel):
    resourceType: str
    id: str


class SaveResponse(ApiModel):
    requestUrl: str
    status: int
    statusText: str
    transactionBundle: FhirJson
    responseBundle: FhirJson
    encounterId: str
    questionnaireResponseId: str
    createdResources: list[CreatedResource]
