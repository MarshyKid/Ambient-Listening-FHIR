from typing import Literal

from .common import ApiModel, FhirJson


class PatientSummary(ApiModel):
    id: str
    mrn: str | None = None
    name: str
    gender: str | None = None
    birthDate: str | None = None


class CreatePatientRequest(ApiModel):
    mrn: str
    given: list[str]
    family: str
    gender: Literal["male", "female", "other", "unknown"]
    birthDate: str


class CreatePatientResponse(ApiModel):
    requestUrl: str | None
    status: int
    statusText: str
    resource: FhirJson | None
    patient: PatientSummary
    created: bool


class PatientQueryResult(ApiModel):
    requestUrl: str
    status: int
    statusText: str
    bundle: FhirJson
    patients: list[PatientSummary]
    error: str | None = None


class PatientByMrnResponse(ApiModel):
    requestUrl: str
    status: int
    statusText: str
    bundle: FhirJson
    matchType: Literal["none", "single", "multiple"]
    patient: PatientSummary | None = None
    patients: list[PatientSummary] | None = None
    createHint: dict | None = None
