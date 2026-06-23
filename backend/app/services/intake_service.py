from fastapi import HTTPException

from app.config import Settings
from app.fhir.intake_mapper import map_intake_summary, reference_id
from app.schemas.intake import IntakeQueryResult, IntakeSummary
from app.services.fhir_client import FhirClient, FhirClientError


class IntakeService:
    def __init__(self, client: FhirClient, settings: Settings) -> None:
        self.client = client
        self.settings = settings

    async def list_intakes(self, request_url: str | None = None) -> IntakeQueryResult:
        if request_url:
            response = await self.client.search_by_url(request_url, "QuestionnaireResponse")
        else:
            response = await self.client.search("QuestionnaireResponse", {"_count": 20})

        bundle = response.data or {"resourceType": "Bundle", "type": "searchset", "entry": []}
        if bundle.get("resourceType") != "Bundle":
            raise HTTPException(status_code=400, detail="FHIR QuestionnaireResponse search URL must return a Bundle.")

        intakes: list[IntakeSummary] = []
        for entry in bundle.get("entry") or []:
            resource = entry.get("resource") or {}
            if resource.get("resourceType") != "QuestionnaireResponse":
                continue

            patient = await self._read_optional_reference(resource, "subject", "Patient")
            questionnaire = await self._read_optional_questionnaire(resource)
            try:
                intakes.append(
                    map_intake_summary(
                        resource,
                        mrn_system=self.settings.fhir_mrn_system,
                        patient=patient,
                        questionnaire=questionnaire,
                    )
                )
            except ValueError:
                continue

        return IntakeQueryResult(
            requestUrl=response.request_url,
            status=response.status,
            statusText=response.status_text,
            bundle=bundle,
            intakes=intakes,
        )

    async def _read_optional_reference(self, resource: dict, field: str, resource_type: str) -> dict | None:
        reference = (resource.get(field) or {}).get("reference")
        resource_id = reference_id(reference, resource_type)
        if not resource_id:
            return None
        try:
            response = await self.client.read(resource_type, resource_id)
        except FhirClientError:
            return None
        if response.data and response.data.get("resourceType") == resource_type:
            return response.data
        return None

    async def _read_optional_questionnaire(self, resource: dict) -> dict | None:
        questionnaire_id = reference_id(resource.get("questionnaire"), "Questionnaire")
        if not questionnaire_id:
            return None
        try:
            response = await self.client.read("Questionnaire", questionnaire_id)
        except FhirClientError:
            return None
        if response.data and response.data.get("resourceType") == "Questionnaire":
            return response.data
        return None
