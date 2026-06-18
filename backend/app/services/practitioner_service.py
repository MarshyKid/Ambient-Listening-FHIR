from fastapi import HTTPException

from app.config import Settings
from app.fhir.practitioner_mapper import ResolvedPractitioner, map_practitioner
from app.services.fhir_client import FhirClient


class PractitionerService:
    def __init__(self, client: FhirClient, settings: Settings) -> None:
        self.client = client
        self.settings = settings

    async def resolve_practitioner(self, practitioner_identifier: str) -> ResolvedPractitioner:
        identifier = f"{self.settings.fhir_staff_system}|{practitioner_identifier}"
        response = await self.client.search("Practitioner", {"identifier": identifier})
        bundle = response.data or {}
        resources = [
            entry.get("resource")
            for entry in bundle.get("entry") or []
            if entry.get("resource", {}).get("resourceType") == "Practitioner"
        ]
        if not resources:
            raise HTTPException(status_code=404, detail=f"Practitioner identifier not found: {practitioner_identifier}")
        if len(resources) > 1:
            raise HTTPException(status_code=409, detail=f"Multiple practitioners matched identifier: {practitioner_identifier}")
        return map_practitioner(resources[0])
