from .common import ApiModel, FhirJson

class IntakeSummary(ApiModel):
    id: str
    questionnaireResponseId: str
    patientId: str | None
    patientName: str | None
    patientMrn: str | None
    questionnaire: str | None
    questionnaireTitle: str | None
    authored: str | None
    status: str

class IntakeQueryResult(ApiModel):
    requestUrl: str
    status: int
    statusText: str
    intakes: list[IntakeSummary]
    bundle: FhirJson | None = None #for demo/debug purposes


class IntakeDetailResult(ApiModel):
    requestUrl: str
    status: int
    statusText: str
    intake: IntakeSummary
    questionnaireResponse: FhirJson
    patient: FhirJson | None = None
    questionnaire: FhirJson | None = None
    encounter: FhirJson | None = None
    practitioner: FhirJson | None = None
    allergyIntolerances: list[FhirJson]
