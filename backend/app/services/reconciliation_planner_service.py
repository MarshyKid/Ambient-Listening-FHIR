from __future__ import annotations

import json
import os
from typing import Any

import httpx
from pydantic import BaseModel, ConfigDict, Field

from app.schemas.reconcile import ReconcileRequest, ReconciliationDomain


ALLOWED_PLANNER_DOMAINS: set[ReconciliationDomain] = {"AllergyIntolerance", "MedicationStatement"}


class ReconciliationPlannerError(Exception):
    """Raised when the LLM reconciliation planner fails or returns invalid output."""


class ReconciliationPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")

    domainsToCheck: list[str] = Field(default_factory=list)
    rationale: str


class ReconciliationPlannerService:
    def __init__(self, settings: Any) -> None:
        self.settings = settings
        self.provider = (
            getattr(settings, "llm_provider", None)
            or os.getenv("LLM_PROVIDER")
            or "mock"
        ).lower()
        self.model = (
            getattr(settings, "llm_model", None)
            or os.getenv("LLM_MODEL")
            or "gpt-5.5"
        )
        self.api_key = (
            getattr(settings, "openai_api_key", None)
            or getattr(settings, "llm_api_key", None)
            or os.getenv("OPENAI_API_KEY")
            or os.getenv("LLM_API_KEY")
        )
        self.timeout_seconds = float(
            getattr(settings, "llm_timeout_seconds", None)
            or os.getenv("LLM_TIMEOUT_SECONDS")
            or 45
        )

    async def plan_domains(self, request: ReconcileRequest) -> set[ReconciliationDomain]:
        if self.provider == "mock":
            return set()

        if self.provider == "openai":
            return await self._openai_plan_domains(request)

        raise ReconciliationPlannerError(f"Unsupported LLM_PROVIDER: {self.provider}")

    async def _openai_plan_domains(self, request: ReconcileRequest) -> set[ReconciliationDomain]:
        if not self.api_key:
            raise ReconciliationPlannerError(
                "OPENAI_API_KEY is missing. Set OPENAI_API_KEY or disable LLM_RECONCILIATION_PLANNER_ENABLED."
            )

        payload = {
            "model": self.model,
            "instructions": self._system_instructions(),
            "input": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "input_text",
                            "text": json.dumps(_planner_input(request), ensure_ascii=False),
                        }
                    ],
                }
            ],
            "text": {
                "format": {
                    "type": "json_schema",
                    "name": "ambient_fhir_reconciliation_plan",
                    "strict": True,
                    "schema": RECONCILIATION_PLAN_SCHEMA,
                }
            },
        }

        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.post(
                "https://api.openai.com/v1/responses",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )

        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            response_text = exc.response.text[:1500]
            raise ReconciliationPlannerError(
                f"OpenAI planner request failed with {exc.response.status_code}: {response_text}"
            ) from exc

        output_text = self._extract_output_text(response.json())
        try:
            parsed = json.loads(output_text)
        except json.JSONDecodeError as exc:
            raise ReconciliationPlannerError(f"LLM planner returned non-JSON output: {output_text[:500]}") from exc

        try:
            plan = ReconciliationPlan.model_validate(parsed)
        except ValueError as exc:
            raise ReconciliationPlannerError("LLM planner returned invalid reconciliation plan JSON.") from exc

        return {domain for domain in plan.domainsToCheck if domain in ALLOWED_PLANNER_DOMAINS}

    def _system_instructions(self) -> str:
        return """
You plan which existing patient record domains should be checked for a draft intake reconciliation.

Rules:
- Return only JSON matching the provided schema.
- Do not diagnose.
- Do not decide clinical truth.
- Do not create, update, or delete FHIR resources.
- Do not compare records.
- Do not produce findings.
- Do not produce FHIR queries, FHIR references, URLs, or search parameters.
- Only choose from these domains: AllergyIntolerance, MedicationStatement.
- Choose AllergyIntolerance if the draft mentions allergies, adverse reactions, allergy uncertainty, or no known allergies (even if only implied)
- Choose MedicationStatement if the draft mentions medications, current medication use, stopped medications, blood thinners, warfarin, Coumadin, Eliquis, apixaban, aspirin, or medication-status uncertainty.
""".strip()

    def _extract_output_text(self, response_data: dict) -> str:
        direct_output = response_data.get("output_text")
        if isinstance(direct_output, str) and direct_output.strip():
            return direct_output

        for output_item in response_data.get("output", []):
            if not isinstance(output_item, dict):
                continue
            for content_item in output_item.get("content", []):
                if not isinstance(content_item, dict):
                    continue
                text = content_item.get("text")
                if isinstance(text, str) and text.strip():
                    return text

        raise ReconciliationPlannerError("Could not find output text in LLM planner response.")


def _planner_input(request: ReconcileRequest) -> dict[str, Any]:
    return {
        "answers": [
            {
                "linkId": answer.linkId,
                "questionText": answer.questionText,
                "valueType": answer.valueType,
                "value": answer.value,
                "evidence": answer.evidence,
            }
            for answer in request.answers
        ],
        "clinicalSuggestions": [
            {
                "resourceType": suggestion.resourceType,
                "evidence": suggestion.evidence,
                "fields": suggestion.fields,
            }
            for suggestion in request.clinicalSuggestions
        ],
    }


RECONCILIATION_PLAN_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "domainsToCheck": {
            "type": "array",
            "items": {
                "type": "string",
                "enum": ["AllergyIntolerance", "MedicationStatement"],
            },
        },
        "rationale": {"type": "string"},
    },
    "required": ["domainsToCheck", "rationale"],
}
