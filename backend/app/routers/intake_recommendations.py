from fastapi import APIRouter, Depends

from app.config import Settings, get_settings
from app.dependencies.auth import current_fhir_client
from app.schemas.intake_recommendations import IntakeRecommendationRequest, IntakeRecommendationResponse
from app.services.fhir_client import FhirClient
from app.services.intake_recommendation_service import IntakeRecommendationService
from app.services.patient_context_service import PatientContextService
from app.services.questionnaire_service import QuestionnaireService


router = APIRouter(prefix="/api/intake-recommendations", tags=["intake-recommendations"])


def intake_recommendation_service(
    client: FhirClient = Depends(current_fhir_client),
    settings: Settings = Depends(get_settings),
) -> IntakeRecommendationService:
    return IntakeRecommendationService(
        PatientContextService(client),
        QuestionnaireService(client, settings),
        settings,
    )


@router.post("", response_model=IntakeRecommendationResponse)
async def recommend_intake_questionnaires(
    request: IntakeRecommendationRequest,
    service: IntakeRecommendationService = Depends(intake_recommendation_service),
) -> IntakeRecommendationResponse:
    return await service.generate(
        patient_id=request.patientId,
        questionnaire_ids=request.questionnaireIds,
    )
