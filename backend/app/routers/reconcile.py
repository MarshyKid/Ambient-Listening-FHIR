from fastapi import APIRouter, Depends

from app.dependencies.auth import current_fhir_client
from app.schemas.reconcile import ReconcileRequest, ReconcileResponse
from app.services.fhir_client import FhirClient
from app.services.reconciliation_service import ReconciliationService


router = APIRouter(prefix="/api/reconcile", tags=["reconcile"])


def reconciliation_service(client: FhirClient = Depends(current_fhir_client)) -> ReconciliationService:
    return ReconciliationService(client)


@router.post("", response_model=ReconcileResponse)
async def reconcile_record(
    request: ReconcileRequest,
    service: ReconciliationService = Depends(reconciliation_service),
) -> ReconcileResponse:
    return await service.reconcile(request)
