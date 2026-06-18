from fastapi import APIRouter, Depends, Query

from app.config import Settings, get_settings
from app.schemas.patients import CreatePatientRequest, CreatePatientResponse, PatientByMrnResponse, PatientQueryResult
from app.services.fhir_client import FhirClient
from app.services.patient_service import PatientService

router = APIRouter(prefix="/api/patients", tags=["patients"])


def patient_service(settings: Settings = Depends(get_settings)) -> PatientService:
    return PatientService(FhirClient(settings), settings)


@router.get("", response_model=PatientQueryResult)
async def list_patients(
    request_url: str | None = Query(default=None, alias="requestUrl"),
    query: str | None = Query(default=None),
    mrn: str | None = Query(default=None),
    birthDate: str | None = Query(default=None),
    service: PatientService = Depends(patient_service),
) -> PatientQueryResult:
    return await service.search_patients(request_url=request_url, query=query, mrn=mrn, birth_date=birthDate)


@router.post("", response_model=CreatePatientResponse)
async def create_patient(
    request: CreatePatientRequest,
    service: PatientService = Depends(patient_service),
) -> CreatePatientResponse:
    return await service.create_patient(request)


@router.get("/by-mrn/{mrn}", response_model=PatientByMrnResponse)
async def get_patient_by_mrn(mrn: str, service: PatientService = Depends(patient_service)) -> PatientByMrnResponse:
    return await service.by_mrn(mrn)
