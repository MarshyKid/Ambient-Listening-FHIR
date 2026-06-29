from typing import Any, Literal

from pydantic import Field

from .common import ApiModel


ReconciliationClassification = Literal["duplicate", "contradiction", "novel"]
ReconciliationDomain = Literal["AllergyIntolerance", "MedicationStatement"]


class ReconcileAnswer(ApiModel):
    linkId: str
    valueType: Literal["string", "text", "boolean", "choice", "integer", "date", "dateTime"]
    value: Any
    confidence: float | None = Field(default=None, ge=0, le=1)
    evidence: str | None = None


class ReconcileClinicalSuggestion(ApiModel):
    resourceType: Literal["AllergyIntolerance", "MedicationStatement"]
    accepted: bool = False
    confidence: float | None = Field(default=None, ge=0, le=1)
    evidence: str | None = None
    fields: dict[str, str] = {}


class ReconcileRequest(ApiModel):
    patientId: str
    questionnaireId: str | None = None
    answers: list[ReconcileAnswer] = []
    clinicalSuggestions: list[ReconcileClinicalSuggestion] = []


class ReconciliationFinding(ApiModel):
    classification: ReconciliationClassification
    domain: ReconciliationDomain
    severity: Literal["info", "warning"]
    summary: str
    rationale: str
    draftEvidence: str | None = None
    existingResourceRefs: list[str] = []
    recommendation: str | None = None


class ReconciliationActivity(ApiModel):
    step: str
    status: Literal["completed", "skipped", "failed"]
    message: str


class CheckedRecordSummary(ApiModel):
    domainsChecked: list[ReconciliationDomain]
    allergyIntoleranceCount: int = 0
    medicationStatementCount: int = 0


class ReconcileResponse(ApiModel):
    patientId: str
    findings: list[ReconciliationFinding]
    activityTrail: list[ReconciliationActivity]
    checkedRecordSummary: CheckedRecordSummary
