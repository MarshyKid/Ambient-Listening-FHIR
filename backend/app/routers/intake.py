from fastapi import APIRouter, Depends, Query

from app.config import Settings, get_settings
from app.schemas.intake import IntakeQueryResult
from app.services.intake_service import IntakeService
from app.services.fhir_client import FhirClient

router = APIRouter(prefix="/api/intake", tags=["intake"])


def intake_service(settings: Settings = Depends(get_settings)) -> IntakeService:
    return IntakeService(FhirClient(settings), settings)


@router.get("", response_model=IntakeQueryResult)
async def list_intakes(
    request_url: str | None = Query(default=None, alias="requestUrl"),
    service: IntakeService = Depends(intake_service),
) -> IntakeQueryResult:
    return await service.list_intakes(request_url=request_url)
