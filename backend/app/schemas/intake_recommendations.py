from __future__ import annotations

from pydantic import Field

from .common import ApiModel


class IntakeRecommendationRequest(ApiModel):
    patientId: str
    questionnaireIds: list[str] | None = None


class PatientRecordFact(ApiModel):
    display: str
    status: str | None = None
    resourceRef: str


class InformationGap(ApiModel):
    code: str
    message: str
    evidenceRefs: list[str] = Field(default_factory=list)


class PatientRecommendationSummary(ApiModel):
    activeConditions: list[PatientRecordFact] = Field(default_factory=list)
    currentMedications: list[PatientRecordFact] = Field(default_factory=list)
    knownAllergies: list[PatientRecordFact] = Field(default_factory=list)
    informationGaps: list[InformationGap] = Field(default_factory=list)


class IntakeQuestionnaireRecommendation(ApiModel):
    questionnaireId: str
    title: str
    version: str | None = None
    itemCount: int | None = None
    reason: str
    confidence: float
    evidenceRefs: list[str] = Field(default_factory=list)


class RecordsChecked(ApiModel):
    conditionCount: int = 0
    medicationStatementCount: int = 0
    allergyIntoleranceCount: int = 0
    questionnaireResponseCount: int = 0
    questionnaireCount: int = 0


class IntakeRecommendationResponse(ApiModel):
    patientId: str
    overview: str
    summary: PatientRecommendationSummary
    recommendations: list[IntakeQuestionnaireRecommendation] = Field(default_factory=list)
    recordsChecked: RecordsChecked
    warnings: list[str] = Field(default_factory=list)
