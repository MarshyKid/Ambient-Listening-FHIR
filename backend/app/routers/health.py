from fastapi import APIRouter

from app.services.fhir_client import FhirClient

router = APIRouter(prefix="/api/health", tags=["health"])


@router.get("")
async def health() -> dict:
    return {"status": "ok"}


@router.get("/fhir")
async def fhir_health() -> dict:
    try:
        response = await FhirClient().get_metadata()
    except Exception as exc:
        return {
            "status": "error",
            "connected": False,
            "fhirVersion": None,
            "fhirRelease": "unknown",
            "isExpectedVersion": False,
            "software": None,
            "message": f"Unable to connect to FHIR repository: {exc}",
        }

    if response.status != 200:
        return {
            "status": "error",
            "connected": False,
            "fhirVersion": None,
            "fhirRelease": "unknown",
            "isExpectedVersion": False,
            "software": None,
            "upstreamStatus": response.status,
            "message": "Unable to connect to FHIR repository.",
        }

    resource = response.data or {}

    fhir_version = resource.get("fhirVersion")
    is_expected_version = fhir_version == "4.0.1"
    software = resource.get("software", {}).get("name") or resource.get("software", {}).get("version")

    return {
        "status": "ok" if is_expected_version else "error",
        "connected": True,
        "fhirVersion": fhir_version,
        "fhirRelease": "R4" if fhir_version == "4.0.1" else "unknown",
        "isExpectedVersion": is_expected_version,
        "software": software,
        "message": None if is_expected_version else "This demo expects FHIR R4 / 4.0.1.",
    }


@router.get("/fhir/metadata")
async def fhir_health_metadata() -> dict:
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
