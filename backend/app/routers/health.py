from fastapi import APIRouter

from app.services.fhir_client import FhirClient

router = APIRouter(prefix="/api/health", tags=["health"])


@router.get("")
async def health() -> dict:
    return {"status": "ok"}


@router.get("/fhir")
async def fhir_health() -> dict:
    response = await FhirClient().get_metadata()
    resource = response.data or {}
    fhir_version = resource.get("fhirVersion")
    is_r4 = fhir_version == "4.0.1"
    software = resource.get("software", {}).get("name") or resource.get("software", {}).get("version")
    result = {
        "status": "ok" if is_r4 else "error",
        "fhirVersion": fhir_version,
        "isR4": is_r4,
        "resource": resource,
    }
    if software:
        result["software"] = software
    if not is_r4:
        result["message"] = "This demo expects FHIR R4 / 4.0.1."
    return result
