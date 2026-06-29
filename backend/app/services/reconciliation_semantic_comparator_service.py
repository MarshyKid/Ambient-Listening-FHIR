from __future__ import annotations

import json
import os
from typing import Any, Literal

import httpx
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, ConfigDict, Field

from app.schemas.reconcile import (
    ReconcileRequest,
    ReconciliationClassification,
    ReconciliationDomain,
    ReconciliationFinding,
)
from app.services.record_fact_mapper import AllergyFact, MedicationFact


ALLOWED_SEMANTIC_DOMAINS: set[ReconciliationDomain] = {"AllergyIntolerance", "MedicationStatement"}
MIN_SEMANTIC_CONFIDENCE = 0.7


class ReconciliationSemanticComparatorError(Exception):
    """Raised when the LLM semantic comparator fails or returns invalid output."""


class SemanticComparisonFinding(BaseModel):
    model_config = ConfigDict(extra="forbid")

    classification: ReconciliationClassification
    domain: ReconciliationDomain
    targetKind: Literal["answer", "clinicalSuggestion", "general"] = "general"
    targetLinkId: str | None = None
    targetClinicalSuggestionIndex: int | None = None
    severity: Literal["info", "warning"]
    summary: str
    rationale: str
    draftEvidence: str | None = None
    existingResourceRefs: list[str] = Field(default_factory=list)
    recommendation: str | None = None
    confidence: float = Field(ge=0, le=1)


class SemanticComparisonResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    findings: list[SemanticComparisonFinding] = Field(default_factory=list)


class ReconciliationSemanticComparatorService:
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

    async def compare(
        self,
        *,
        request: ReconcileRequest,
        allergy_facts: list[AllergyFact],
        medication_facts: list[MedicationFact],
        existing_findings: list[ReconciliationFinding],
    ) -> list[ReconciliationFinding]:
        if self.provider == "mock":
            return []

        if self.provider != "openai":
            raise ReconciliationSemanticComparatorError(f"Unsupported LLM_PROVIDER: {self.provider}")

        raw_findings = await self._openai_compare(
            request=request,
            allergy_facts=allergy_facts,
            medication_facts=medication_facts,
            existing_findings=existing_findings,
        )
        return _validated_findings(
            raw_findings=raw_findings,
            request=request,
            allergy_facts=allergy_facts,
            medication_facts=medication_facts,
            existing_findings=existing_findings,
        )

    async def _openai_compare(
        self,
        *,
        request: ReconcileRequest,
        allergy_facts: list[AllergyFact],
        medication_facts: list[MedicationFact],
        existing_findings: list[ReconciliationFinding],
    ) -> list[SemanticComparisonFinding]:
        if not self.api_key:
            raise ReconciliationSemanticComparatorError(
                "OPENAI_API_KEY is missing. Set OPENAI_API_KEY or disable LLM_RECONCILIATION_SEMANTIC_COMPARE_ENABLED."
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
                            "text": json.dumps(
                                _semantic_input(
                                    request=request,
                                    allergy_facts=allergy_facts,
                                    medication_facts=medication_facts,
                                    existing_findings=existing_findings,
                                ),
                                ensure_ascii=False,
                            ),
                        }
                    ],
                }
            ],
            "text": {
                "format": {
                    "type": "json_schema",
                    "name": "ambient_fhir_semantic_reconciliation",
                    "strict": True,
                    "schema": SEMANTIC_COMPARISON_SCHEMA,
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
            raise ReconciliationSemanticComparatorError(
                f"OpenAI semantic comparator request failed with {exc.response.status_code}: {response_text}"
            ) from exc

        output_text = self._extract_output_text(response.json())
        try:
            parsed = json.loads(output_text)
        except json.JSONDecodeError as exc:
            raise ReconciliationSemanticComparatorError(f"LLM semantic comparator returned non-JSON output: {output_text[:500]}") from exc

        try:
            response_model = SemanticComparisonResponse.model_validate(parsed)
        except ValueError as exc:
            raise ReconciliationSemanticComparatorError("LLM semantic comparator returned invalid JSON.") from exc

        return response_model.findings

    def _system_instructions(self) -> str:
        return """
You are an advisory semantic reconciliation assistant.

Rules:
- Compare draft intake content only against existing patient record facts already fetched by the backend.
- Do not diagnose.
- Do not decide clinical truth.
- Do not create, update, or delete FHIR resources.
- Do not call FHIR.
- Do not produce FHIR queries, FHIR URLs, or search parameters.
- Do not invent FHIR references.
- You may only cite resourceRef values that appear in existingFacts.
- For duplicate and contradiction findings, cite at least one existing resource ref.
- Do not repeat findings already covered by existingDeterministicFindings.
- Use cautious wording such as "possible conflict", "may conflict", and "worth clarifying".
- Only produce a finding when there is a clear semantic relationship.
- If uncertain, return no finding.
- Return only JSON matching the schema.

Special cases:
- If the draft says the patient has no negative reactions to food, no food reactions, no food allergies, or similar, and existingFacts include an active food-related AllergyIntolerance such as shellfish, fish, peanut, egg, milk, soy, wheat, or tree nut, return a possible contradiction.
- If the draft says the patient is not taking clot-prevention or blood-thinning medication, and existingFacts include a current anticoagulant or blood thinner, return a possible contradiction.
- If the draft mentions a daily tablet for clot prevention or irregular heartbeat and existingFacts include a clearly related current MedicationStatement, return a duplicate or related-context finding only if the relationship is clear.
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

        raise ReconciliationSemanticComparatorError("Could not find output text in LLM semantic comparator response.")


def _validated_findings(
    *,
    raw_findings: list[SemanticComparisonFinding],
    request: ReconcileRequest,
    allergy_facts: list[AllergyFact],
    medication_facts: list[MedicationFact],
    existing_findings: list[ReconciliationFinding],
) -> list[ReconciliationFinding]:
    answer_link_ids = {answer.linkId for answer in request.answers}
    suggestion_indexes = set(range(len(request.clinicalSuggestions)))
    fetched_refs = {fact.resource_ref for fact in allergy_facts}
    fetched_refs.update(fact.resource_ref for fact in medication_facts)
    existing_keys = {_finding_key(finding) for finding in existing_findings}

    findings: list[ReconciliationFinding] = []
    for raw in raw_findings:
        if raw.confidence < MIN_SEMANTIC_CONFIDENCE:
            continue
        if raw.domain not in ALLOWED_SEMANTIC_DOMAINS:
            continue
        if raw.targetKind == "answer" and (not raw.targetLinkId or raw.targetLinkId not in answer_link_ids):
            continue
        if raw.targetKind == "clinicalSuggestion" and raw.targetClinicalSuggestionIndex not in suggestion_indexes:
            continue
        if raw.classification in {"duplicate", "contradiction"}:
            refs = set(raw.existingResourceRefs)
            if not refs or not refs.issubset(fetched_refs):
                continue
        else:
            raw = raw.model_copy(update={"existingResourceRefs": [ref for ref in raw.existingResourceRefs if ref in fetched_refs]})

        finding = ReconciliationFinding(
            classification=raw.classification,
            domain=raw.domain,
            source="llm_semantic",
            targetKind=raw.targetKind,
            targetLinkId=raw.targetLinkId,
            targetClinicalSuggestionIndex=raw.targetClinicalSuggestionIndex,
            severity=raw.severity,
            summary=raw.summary,
            rationale=raw.rationale,
            draftEvidence=raw.draftEvidence,
            existingResourceRefs=raw.existingResourceRefs,
            recommendation=raw.recommendation,
        )
        key = _finding_key(finding)
        if key in existing_keys:
            continue
        existing_keys.add(key)
        findings.append(finding)

    return findings


def _semantic_input(
    *,
    request: ReconcileRequest,
    allergy_facts: list[AllergyFact],
    medication_facts: list[MedicationFact],
    existing_findings: list[ReconciliationFinding],
) -> dict[str, Any]:
    return {
        "draftAnswers": [
            {
                "linkId": answer.linkId,
                "questionText": answer.questionText,
                "valueType": answer.valueType,
                "value": jsonable_encoder(answer.value),
                "evidence": answer.evidence,
            }
            for answer in request.answers
        ],
        "clinicalSuggestions": [
            {
                "index": index,
                "resourceType": suggestion.resourceType,
                "evidence": suggestion.evidence,
                "fields": suggestion.fields,
            }
            for index, suggestion in enumerate(request.clinicalSuggestions)
        ],
        "existingFacts": [
            {
                "domain": "AllergyIntolerance",
                "resourceRef": fact.resource_ref,
                "substance": fact.substance,
                "clinicalStatus": fact.clinical_status,
                "verificationStatus": fact.verification_status,
                "reaction": fact.reaction,
            }
            for fact in allergy_facts
        ]
        + [
            {
                "domain": "MedicationStatement",
                "resourceRef": fact.resource_ref,
                "medication": fact.medication,
                "status": fact.status,
            }
            for fact in medication_facts
        ],
        "existingDeterministicFindings": [
            {
                "classification": finding.classification,
                "domain": finding.domain,
                "targetKind": finding.targetKind,
                "targetLinkId": finding.targetLinkId,
                "targetClinicalSuggestionIndex": finding.targetClinicalSuggestionIndex,
                "existingResourceRefs": finding.existingResourceRefs,
            }
            for finding in existing_findings
        ],
    }


def _finding_key(finding: ReconciliationFinding) -> tuple[str, str, str, str, int, tuple[str, ...]]:
    return (
        finding.classification,
        finding.domain,
        finding.targetKind,
        finding.targetLinkId or "",
        finding.targetClinicalSuggestionIndex if finding.targetClinicalSuggestionIndex is not None else -1,
        tuple(sorted(finding.existingResourceRefs)),
    )


SEMANTIC_COMPARISON_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "findings": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "classification": {"type": "string", "enum": ["duplicate", "contradiction", "novel"]},
                    "domain": {"type": "string", "enum": ["AllergyIntolerance", "MedicationStatement"]},
                    "targetKind": {"type": "string", "enum": ["answer", "clinicalSuggestion", "general"]},
                    "targetLinkId": {"anyOf": [{"type": "string"}, {"type": "null"}]},
                    "targetClinicalSuggestionIndex": {"anyOf": [{"type": "integer"}, {"type": "null"}]},
                    "severity": {"type": "string", "enum": ["info", "warning"]},
                    "summary": {"type": "string"},
                    "rationale": {"type": "string"},
                    "draftEvidence": {"anyOf": [{"type": "string"}, {"type": "null"}]},
                    "existingResourceRefs": {"type": "array", "items": {"type": "string"}},
                    "recommendation": {"anyOf": [{"type": "string"}, {"type": "null"}]},
                    "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                },
                "required": [
                    "classification",
                    "domain",
                    "targetKind",
                    "targetLinkId",
                    "targetClinicalSuggestionIndex",
                    "severity",
                    "summary",
                    "rationale",
                    "draftEvidence",
                    "existingResourceRefs",
                    "recommendation",
                    "confidence",
                ],
            },
        }
    },
    "required": ["findings"],
}
