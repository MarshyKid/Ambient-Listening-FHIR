from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.routers import deferred, health, patients, questionnaires, save, extract, intake
from app.services.fhir_client import FhirClientError, fhir_error_payload


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Ambient FHIR Demo API")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(FhirClientError)
    async def handle_fhir_error(_: Request, exc: FhirClientError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content=fhir_error_payload(exc))

    @app.get("/")
    async def root() -> dict:
        return {"name": "Ambient FHIR Demo API", "status": "ok"}

    app.include_router(health.router)
    app.include_router(patients.router)
    app.include_router(questionnaires.router)
    app.include_router(save.router)
    app.include_router(extract.router)
    app.include_router(intake.router)
    app.include_router(deferred.router)
    return app


app = create_app()
