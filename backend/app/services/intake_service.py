import re
from typing import Literal

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
        parsed_reference = parse_questionnaire_reference(resource.get("questionnaire"))
        if not parsed_reference:
            return None

        reference_type, value, version = parsed_reference
        try:
            if reference_type == "logical":
                response = await self.client.read("Questionnaire", value)
                if response.data and response.data.get("resourceType") == "Questionnaire":
                    return response.data
                return None

            params = {"url": value}
            if version:
                params["version"] = version
            response = await self.client.search("Questionnaire", params)
        except FhirClientError:
            return None

        bundle = response.data or {}
        if bundle.get("resourceType") != "Bundle":
            return None
        questionnaires = [
            entry.get("resource")
            for entry in bundle.get("entry") or []
            if entry.get("resource", {}).get("resourceType") == "Questionnaire"
        ]
        return questionnaires[0] if len(questionnaires) == 1 else None


QuestionnaireReference = tuple[Literal["logical", "canonical"], str, str | None]


def parse_questionnaire_reference(reference: object) -> QuestionnaireReference | None:
    if not isinstance(reference, str):
        return None

    value = reference.strip()
    if not value:
        return None

    logical_match = re.fullmatch(r"Questionnaire/([A-Za-z0-9.-]{1,64})", value)
    if logical_match:
        return "logical", logical_match.group(1), None

    canonical_url, separator, version = value.partition("|")
    canonical_url = canonical_url.strip()
    if not canonical_url:
        return None
    if separator:
        version = version.strip()
        if not version or "|" in version:
            return None
        return "canonical", canonical_url, version
    return "canonical", canonical_url, None
