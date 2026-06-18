from __future__ import annotations

from .common import ApiModel, FhirJson


class ChoiceOption(ApiModel):
    system: str
    code: str
    display: str


class QuestionnaireItem(ApiModel):
    linkId: str
    text: str
    type: str
    options: list[ChoiceOption] | None = None
    items: list[QuestionnaireItem] | None = None


class CreateQuestionnaireItem(ApiModel):
    linkId: str
    text: str
    type: str
    required: bool | None = None
    options: list[ChoiceOption] | None = None
    items: list[CreateQuestionnaireItem] | None = None


class CreateQuestionnaireRequest(ApiModel):
    slug: str
    version: str
    title: str
    name: str | None = None
    description: str | None = None
    status: str = "active"
    items: list[CreateQuestionnaireItem]


class QuestionnaireSummary(ApiModel):
    id: str
    fhirId: str
    slug: str
    url: str
    version: str
    title: str
    description: str | None
    status: str
    itemCount: int | None


class QuestionnaireDetail(ApiModel):
    id: str
    fhirId: str
    slug: str
    url: str
    version: str
    title: str
    description: str | None
    status: str
    items: list[QuestionnaireItem]


class QuestionnaireQueryResult(ApiModel):
    requestUrl: str
    status: int
    statusText: str
    bundle: FhirJson
    questionnaires: list[QuestionnaireSummary]
    error: str | None = None


class QuestionnaireDetailResult(ApiModel):
    requestUrl: str
    status: int
    statusText: str
    resource: FhirJson
    questionnaire: QuestionnaireDetail


class CreateQuestionnaireResponse(ApiModel):
    requestUrl: str | None
    status: int
    statusText: str
    resource: FhirJson | None
    questionnaire: QuestionnaireDetail
    created: bool
