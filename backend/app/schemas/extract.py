from typing import Any, Literal

from pydantic import BaseModel, Field


class ExtractRequest(BaseModel):
    questionnaireId: str
    transcript: str = Field(min_length=1)


class ExtractedAnswerCandidate(BaseModel):
    linkId: str
    valueType: Literal["string", "text", "boolean", "choice", "integer", "date", "dateTime"]
    value: Any
    confidence: float = Field(ge=0, le=1)
    evidence: str
    status: Literal["suggested"] = "suggested"


class ClinicalSuggestionCandidate(BaseModel):
    resourceType: Literal["AllergyIntolerance"]
    accepted: bool = False
    confidence: float = Field(ge=0, le=1)
    evidence: str
    fields: dict[str, str]


class ExtractResponse(BaseModel):
    answers: list[ExtractedAnswerCandidate]
    clinicalSuggestions: list[ClinicalSuggestionCandidate] = []