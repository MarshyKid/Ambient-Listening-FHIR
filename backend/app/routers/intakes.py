from fastapi import APIRouter, Depends, Query

from app.config import Settings, get_settings
from app.schemas.intake import IntakeDetailResult, IntakeQueryResult
from app.services.intake_service import IntakeService
from app.services.fhir_client import FhirClient
from app.dependencies.auth import current_fhir_client

router = APIRouter(prefix="/api/intakes", tags=["intakes"])


def intake_service(client: FhirClient = Depends(current_fhir_client), settings: Settings = Depends(get_settings)) -> IntakeService:
    return IntakeService(client, settings)


@router.get("", response_model=IntakeQueryResult)
async def list_intakes(
    request_url: str | None = Query(default=None, alias="requestUrl"),
    service: IntakeService = Depends(intake_service),
) -> IntakeQueryResult:
    return await service.list_intakes(request_url=request_url)


@router.get("/{questionnaire_response_id}", response_model=IntakeDetailResult)
async def get_intake_detail(
    questionnaire_response_id: str,
    service: IntakeService = Depends(intake_service),
) -> IntakeDetailResult:
    return await service.get_intake_detail(questionnaire_response_id)
