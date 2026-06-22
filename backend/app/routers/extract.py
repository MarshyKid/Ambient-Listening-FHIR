from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from app.config import Settings, get_settings
from app.schemas.extract import ExtractRequest, ExtractResponse, ExtractedAnswerCandidate, ClinicalSuggestionCandidate
from app.services.extraction_service import ExtractionService
from app.services.fhir_client import FhirClient
from app.services.questionnaire_service import QuestionnaireService
from app.services.llm_service import LlmService

router = APIRouter(prefix="/api/extract", tags=["extract"])

"""
take
{
  "questionnaireId": "70147",
  "transcript": "Nurse: ... Patient: ..."
}

and return
{
  "answers": [
    {
      "linkId": "allergy-substance",
      "valueType": "string",
      "value": "Penicillin",
      "confidence": 0.91,
      "evidence": "Patient said they are allergic to penicillin.",
      "status": "suggested"
    }
  ],
  "clinicalSuggestions": [
    {
      "resourceType": "AllergyIntolerance",
      "accepted": false,
      "confidence": 0.88,
      "evidence": "Patient said penicillin caused a rash.",
      "fields": {
        "substance": "Penicillin",
        "reaction": "rash"
      }
    }
  ]
}
"""

def extraction_service(settings: Settings = Depends(get_settings)) -> ExtractionService:
    client = FhirClient(settings)
    llmservice = LlmService(settings)
    return ExtractionService(QuestionnaireService(client, settings), llmservice)


@router.get("")
async def extract_stub() -> dict:
    return {"test": "test"}

@router.post("", response_model=ExtractResponse)
async def extract_from_transcript(request: ExtractRequest, service: ExtractionService = Depends(extraction_service)) -> ExtractResponse:
    return await service.extract(request)