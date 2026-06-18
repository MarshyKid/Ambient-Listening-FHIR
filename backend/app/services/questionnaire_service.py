from fastapi import HTTPException

from app.config import Settings
from app.fhir.questionnaire_builder import build_questionnaire_resource
from app.fhir.questionnaire_mapper import map_questionnaire_detail, map_questionnaire_summary
from app.schemas.questionnaires import CreateQuestionnaireRequest, CreateQuestionnaireResponse, QuestionnaireDetailResult, QuestionnaireQueryResult
from app.services.fhir_client import FhirClient, FhirHttpError


class QuestionnaireService:
    def __init__(self, client: FhirClient, settings: Settings) -> None:
        self.client = client
        self.settings = settings

    async def list_questionnaires(self, request_url: str | None = None) -> QuestionnaireQueryResult:
        if request_url:
            response = await self.client.search_by_url(request_url, "Questionnaire")
        else:
            response = await self.client.search("Questionnaire", {"status": "active"})
        bundle = response.data or {"resourceType": "Bundle", "type": "searchset", "entry": []}
        if bundle.get("resourceType") != "Bundle":
            raise HTTPException(status_code=400, detail="FHIR Questionnaire search URL must return a Bundle.")
        summaries = []
        prefix = f"{self.settings.questionnaire_canonical_base}/"
        for entry in bundle.get("entry") or []:
            resource = entry.get("resource") or {}
            if resource.get("resourceType") != "Questionnaire":
                continue
            if not str(resource.get("url") or "").startswith(prefix):
                continue
            full_resource = await self.read_questionnaire_resource(str(resource.get("id")))
            summaries.append(map_questionnaire_summary(full_resource, item_count=len(full_resource.get("item") or [])))

        return QuestionnaireQueryResult(
            requestUrl=response.request_url,
            status=response.status,
            statusText=response.status_text,
            bundle=bundle,
            questionnaires=summaries,
        )

    async def get_questionnaire(self, questionnaire_id: str) -> QuestionnaireDetailResult:
        response = await self.client.read("Questionnaire", questionnaire_id)
        if not response.data or response.data.get("resourceType") != "Questionnaire":
            raise HTTPException(status_code=502, detail="FHIR server returned an invalid Questionnaire response.")
        return QuestionnaireDetailResult(
            requestUrl=response.request_url,
            status=response.status,
            statusText=response.status_text,
            resource=response.data,
            questionnaire=map_questionnaire_detail(response.data),
        )

    async def create_questionnaire(self, request: CreateQuestionnaireRequest) -> CreateQuestionnaireResponse:
        resource = build_questionnaire_resource(canonical_base=self.settings.questionnaire_canonical_base, request=request)
        canonical_url = resource["url"]
        response = await self.client.conditional_create("Questionnaire", resource, f"url={canonical_url}")

        if response.status == 412:
            raise HTTPException(
                status_code=409,
                detail={"matchType": "multiple", "message": "Multiple questionnaires matched this canonical URL."},
            )

        created = response.status == 201
        questionnaire_resource = response.data if response.data and response.data.get("resourceType") == "Questionnaire" else None
        if questionnaire_resource is None:
            questionnaire_resource = await self._resource_from_location(response.headers.get("location")) or await self._single_questionnaire_by_url(
                canonical_url
            )
        if questionnaire_resource is None:
            raise HTTPException(status_code=502, detail="FHIR server did not return or locate the Questionnaire.")

        return CreateQuestionnaireResponse(
            requestUrl=response.request_url,
            status=response.status,
            statusText=response.status_text,
            resource=questionnaire_resource,
            questionnaire=map_questionnaire_detail(questionnaire_resource),
            created=created,
        )

    async def read_questionnaire_resource(self, questionnaire_id: str) -> dict:
        try:
            response = await self.client.read("Questionnaire", questionnaire_id)
        except FhirHttpError as exc:
            if exc.response_status == 404:
                raise HTTPException(status_code=404, detail=f"Questionnaire not found: {questionnaire_id}") from exc
            raise
        if not response.data or response.data.get("resourceType") != "Questionnaire":
            raise HTTPException(status_code=502, detail="FHIR server returned an invalid Questionnaire response.")
        return response.data

    async def _resource_from_location(self, location: str | None) -> dict | None:
        if not location:
            return None
        parts = location.split("/")
        try:
            questionnaire_index = parts.index("Questionnaire")
            questionnaire_id = parts[questionnaire_index + 1].split("/")[0]
        except (ValueError, IndexError):
            return None
        return await self.read_questionnaire_resource(questionnaire_id)

    async def _single_questionnaire_by_url(self, canonical_url: str) -> dict | None:
        response = await self.client.search("Questionnaire", {"url": canonical_url})
        bundle = response.data or {}
        entries = [
            entry.get("resource")
            for entry in bundle.get("entry") or []
            if entry.get("resource", {}).get("resourceType") == "Questionnaire"
        ]
        if len(entries) > 1:
            raise HTTPException(
                status_code=409,
                detail={"matchType": "multiple", "message": "Multiple questionnaires matched this canonical URL."},
            )
        if not entries:
            return None
        questionnaire_id = entries[0].get("id")
        if questionnaire_id:
            return await self.read_questionnaire_resource(str(questionnaire_id))
        return entries[0]
