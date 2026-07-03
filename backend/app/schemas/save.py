from typing import Any, Literal

from pydantic import ConfigDict

from .common import ApiModel, FhirJson


class ReviewedAnswer(ApiModel):
    linkId: str
    valueType: Literal["string", "text", "boolean", "choice", "integer", "date", "dateTime", "group"]
    value: Any


class AcceptedSuggestion(ApiModel):
    type: Literal["AllergyIntolerance", "Condition", "MedicationStatement"]
    fields: dict[str, str] = {}


class EncounterDraft(ApiModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    status: Literal["planned", "in-progress", "finished", "cancelled"] = "in-progress"
    classCode: Literal["AMB", "EMER", "IMP", "OBSENC"] = "AMB"
    periodStart: str
    reasonText: str | None = None


class SaveRequest(ApiModel):
    patientId: str
    practitionerId: str
    questionnaireId: str
    encounter: EncounterDraft | None = None
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
