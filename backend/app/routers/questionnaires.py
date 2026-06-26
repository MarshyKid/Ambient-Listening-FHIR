from fastapi import APIRouter, Depends, HTTPException, Query

from app.config import Settings, get_settings
from app.schemas.questionnaires import (
    CreateQuestionnaireRequest,
    CreateQuestionnaireResponse,
    QuestionnaireDetailResult,
    QuestionnaireQueryResult,
)
from app.services.fhir_client import FhirClient
from app.services.questionnaire_service import QuestionnaireService
from app.dependencies.auth import current_fhir_client

router = APIRouter(prefix="/api/questionnaires", tags=["questionnaires"])


def questionnaire_service(client: FhirClient = Depends(current_fhir_client), settings: Settings = Depends(get_settings)) -> QuestionnaireService:
    return QuestionnaireService(client, settings)


@router.get("", response_model=QuestionnaireQueryResult)
async def list_questionnaires(
    request_url: str | None = Query(default=None, alias="requestUrl"),
    service: QuestionnaireService = Depends(questionnaire_service),
) -> QuestionnaireQueryResult:
    try:
        return await service.list_questionnaires(request_url=request_url)
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("", response_model=CreateQuestionnaireResponse)
async def create_questionnaire(
    request: CreateQuestionnaireRequest,
    service: QuestionnaireService = Depends(questionnaire_service),
) -> CreateQuestionnaireResponse:
    try:
        return await service.create_questionnaire(request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/{questionnaire_id}", response_model=QuestionnaireDetailResult)
async def get_questionnaire(
    questionnaire_id: str,
    service: QuestionnaireService = Depends(questionnaire_service),
) -> QuestionnaireDetailResult:
    try:
        return await service.get_questionnaire(questionnaire_id)
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
