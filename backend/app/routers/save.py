from fastapi import APIRouter, Depends, HTTPException

from app.config import Settings, get_settings
from app.schemas.save import SaveRequest, SaveResponse
from app.services.fhir_client import FhirClient
from app.services.patient_service import PatientService
from app.services.practitioner_service import PractitionerService
from app.services.questionnaire_service import QuestionnaireService
from app.services.save_service import SaveService
from app.dependencies.auth import current_fhir_client

router = APIRouter(prefix="/api/save", tags=["save"])


def save_service(client: FhirClient = Depends(current_fhir_client), settings: Settings = Depends(get_settings)) -> SaveService:
    return SaveService(
        client,
        settings,
        PatientService(client, settings),
        PractitionerService(client, settings),
        QuestionnaireService(client, settings),
    )


@router.post("", response_model=SaveResponse)
async def save_manual_review(request: SaveRequest, service: SaveService = Depends(save_service)) -> SaveResponse:
    try:
        return await service.save(request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
