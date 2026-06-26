from fastapi import Depends, HTTPException, Request

from app.config import Settings, get_settings
from app.routers.auth import auth0
from app.services.fhir_client import FhirClient

async def current_access_token(request: Request) -> str:
    try:
        token = await auth0().get_access_token(
            {
                "request": request
            }
        )

    except Exception as e:
        raise HTTPException(status_code=401, detail="Not Authenticated") from e

    if not token:
        raise HTTPException(status_code=401, detail="No access token found")
    
    return token

async def current_fhir_client(request: Request, settings: Settings = Depends(get_settings)) -> FhirClient:
    access_token = await current_access_token(request)
    return FhirClient(settings, access_token=access_token)