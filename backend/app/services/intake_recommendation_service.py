from __future__ import annotations

from dataclasses import dataclass
import json
import os
from typing import Any

import httpx
from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app.config import Settings
from app.schemas.intake_recommendations import (
    IntakeQuestionnaireRecommendation,
    IntakeRecommendationResponse,
    InformationGap,
    PatientRecommendationSummary,
    RecordsChecked,
)
from app.schemas.questionnaires import QuestionnaireSummary
from app.services.patient_context_service import PatientContext, PatientContextService
from app.services.questionnaire_service import QuestionnaireService


MAX_RECOMMENDATIONS = 3


class IntakeRecommendationError(Exception):
    """Raised when the LLM intake recommendation call fails or returns invalid output."""


class LlmIntakeRecommendation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    questionnaireId: str
    reason: str
    confidence: float = Field(ge=0, le=1)
    evidenceRefs: list[str] = Field(default_factory=list)


class LlmIntakeRecommendationResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    overview: str
    recommendations: list[LlmIntakeRecommendation] = Field(default_factory=list)


@dataclass(frozen=True)
class QuestionnaireCandidate:
    id: str
    title: str
    description: str | None
    version: str | None
    item_count: int | None

    @property
    def search_text(self) -> str:
        return f"{self.title} {self.description or ''}".lower()


class IntakeRecommendationService:
    def __init__(
        self,
        patient_context_service: PatientContextService,
        questionnaire_service: QuestionnaireService,
        settings: Settings,
    ) -> None:
        self.patient_context_service = patient_context_service
        self.questionnaire_service = questionnaire_service
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
            or os.getenv("OPENAI_API_KEY")
            or os.getenv("LLM_API_KEY")
        )
        self.timeout_seconds = float(
            getattr(settings, "llm_timeout_seconds", None)
            or os.getenv("LLM_TIMEOUT_SECONDS")
            or 45
        )

    async def generate(
        self,
        *,
        patient_id: str,
        questionnaire_ids: list[str] | None = None,
    ) -> IntakeRecommendationResponse:
        context = await self.patient_context_service.load_context(patient_id)
        candidates = await self._validated_candidates(questionnaire_ids)
        context.records_checked.questionnaireCount = len(candidates)
        warnings = list(context.warnings)

        deterministic_recommendations = self._deterministic_recommendations(context, candidates)
        overview = deterministic_overview(context)
        recommendations = deterministic_recommendations

        if self.settings.llm_intake_recommendation_enabled and self.provider != "mock":
            try:
                llm_result = await self._openai_recommend(context, candidates)
                validated = self._validated_llm_recommendations(llm_result, candidates, context.fetched_resource_refs)
                if llm_result.overview.strip():
                    overview = llm_result.overview.strip()
                recommendations = validated
            except IntakeRecommendationError as exc:
                warnings.append(f"AI intake recommendation unavailable; deterministic recommendations were used. {exc}")
        elif self.settings.llm_intake_recommendation_enabled and self.provider == "mock":
            recommendations = deterministic_recommendations

        return IntakeRecommendationResponse(
            patientId=context.patient_id,
            overview=overview,
            summary=PatientRecommendationSummary(
                activeConditions=context.summary_conditions(),
                currentMedications=context.summary_medications(),
                knownAllergies=context.summary_allergies(),
                informationGaps=context.information_gaps,
            ),
            recommendations=recommendations[:MAX_RECOMMENDATIONS],
            recordsChecked=context.records_checked,
            warnings=warnings,
        )

    async def _validated_candidates(self, questionnaire_ids: list[str] | None) -> list[QuestionnaireCandidate]:
        result = await self.questionnaire_service.list_questionnaires()
        candidates = [_candidate_from_summary(summary) for summary in result.questionnaires if summary.status == "active"]
        candidates_by_id = {candidate.id: candidate for candidate in candidates}

        if questionnaire_ids is None:
            return candidates

        selected: list[QuestionnaireCandidate] = []
        seen: set[str] = set()
        unknown: list[str] = []
        for questionnaire_id in questionnaire_ids:
            if not questionnaire_id or not str(questionnaire_id).strip():
                raise HTTPException(status_code=400, detail="questionnaireIds must not contain blank IDs.")
            normalized = str(questionnaire_id).strip()
            if normalized in seen:
                continue
            seen.add(normalized)
            candidate = candidates_by_id.get(normalized)
            if candidate is None:
                unknown.append(normalized)
                continue
            selected.append(candidate)
        if unknown:
            raise HTTPException(status_code=400, detail=f"Unknown active Questionnaire ID(s): {', '.join(unknown)}")
        return selected

    def _deterministic_recommendations(
        self,
        context: PatientContext,
        candidates: list[QuestionnaireCandidate],
    ) -> list[IntakeQuestionnaireRecommendation]:
        recommendations: list[IntakeQuestionnaireRecommendation] = []
        used_ids: set[str] = set()
        gap_codes = {gap.code for gap in context.information_gaps}

        if context.known_allergies or "missing-allergy-reaction" in gap_codes:
            candidate = _first_matching_candidate(candidates, used_ids, ["allergy"])
            if candidate:
                recommendations.append(
                    _recommendation(
                        candidate,
                        "An allergy record is present or allergy details may be incomplete in the checked record.",
                        0.9,
                        _gap_refs(context.information_gaps, "missing-allergy-reaction") or [fact.resource_ref for fact in context.known_allergies],
                    )
                )
                used_ids.add(candidate.id)

        if context.current_medications or "medication-review-recommended" in gap_codes:
            candidate = _first_matching_candidate(candidates, used_ids, ["medication", "medicine", "reconciliation"])
            if candidate:
                recommendations.append(
                    _recommendation(
                        candidate,
                        "Current medication records are present and medication review may be useful during intake.",
                        0.82,
                        _gap_refs(context.information_gaps, "medication-review-recommended") or [fact.resource_ref for fact in context.current_medications],
                    )
                )
                used_ids.add(candidate.id)

        if context.active_conditions or context.information_gaps:
            candidate = _first_matching_candidate(candidates, used_ids, ["comprehensive", "admission", "medical history", "general intake"])
            if candidate:
                recommendations.append(
                    _recommendation(
                        candidate,
                        "The checked record contains existing clinical context or information gaps that may benefit from a broad intake review.",
                        0.74,
                        [fact.resource_ref for fact in context.active_conditions],
                    )
                )
                used_ids.add(candidate.id)

        for candidate in candidates:
            if len(recommendations) >= MAX_RECOMMENDATIONS:
                break
            if candidate.id in used_ids:
                continue
            recommendations.append(_recommendation(candidate, "Available active Questionnaire for nurse review.", 0.55, []))
            used_ids.add(candidate.id)

        return recommendations[:MAX_RECOMMENDATIONS]

    async def _openai_recommend(
        self,
        context: PatientContext,
        candidates: list[QuestionnaireCandidate],
    ) -> LlmIntakeRecommendationResult:
        if self.provider != "openai":
            raise IntakeRecommendationError(f"Unsupported LLM_PROVIDER: {self.provider}")
        if not self.api_key:
            raise IntakeRecommendationError("OPENAI_API_KEY is missing.")

        payload = {
            "model": self.model,
            "instructions": self._system_instructions(),
            "input": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "input_text",
                            "text": json.dumps(_llm_input(context, candidates), ensure_ascii=False),
                        }
                    ],
                }
            ],
            "text": {
                "format": {
                    "type": "json_schema",
                    "name": "ambient_fhir_intake_recommendations",
                    "strict": True,
                    "schema": INTAKE_RECOMMENDATION_SCHEMA,
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
            raise IntakeRecommendationError(f"OpenAI request failed with {exc.response.status_code}: {exc.response.text[:1500]}") from exc

        output_text = _extract_output_text(response.json())
        try:
            parsed = json.loads(output_text)
        except json.JSONDecodeError as exc:
            raise IntakeRecommendationError("LLM returned non-JSON output.") from exc
        try:
            return LlmIntakeRecommendationResult.model_validate(parsed)
        except ValueError as exc:
            raise IntakeRecommendationError("LLM returned invalid intake recommendation JSON.") from exc

    def _validated_llm_recommendations(
        self,
        llm_result: LlmIntakeRecommendationResult,
        candidates: list[QuestionnaireCandidate],
        fetched_refs: set[str],
    ) -> list[IntakeQuestionnaireRecommendation]:
        candidates_by_id = {candidate.id: candidate for candidate in candidates}
        recommendations: list[IntakeQuestionnaireRecommendation] = []
        seen: set[str] = set()
        for item in llm_result.recommendations:
            if len(recommendations) >= MAX_RECOMMENDATIONS:
                break
            if item.questionnaireId in seen:
                continue
            candidate = candidates_by_id.get(item.questionnaireId)
            if candidate is None:
                continue
            refs = [ref for ref in item.evidenceRefs if ref in fetched_refs]
            recommendations.append(_recommendation(candidate, item.reason.strip(), item.confidence, refs))
            seen.add(candidate.id)
        return recommendations

    def _system_instructions(self) -> str:
        return """
You are an advisory intake questionnaire recommendation assistant.

Rules:
- Return only JSON matching the provided schema.
- Recommend only from supplied candidateQuestionnaires.
- Return no more than three recommendations.
- Do not diagnose.
- Do not decide clinical truth.
- Do not create, update, or delete FHIR resources.
- Do not generate FHIR queries, URLs, search parameters, or credentials.
- Do not invent patient facts.
- Do not invent evidence references.
- Recommendations are advisory and must be reviewed by a nurse.
- Use concise, clinically neutral wording.
- Do not state that a Questionnaire is mandatory.
""".strip()


def deterministic_overview(context: PatientContext) -> str:
    parts: list[str] = []
    if context.active_conditions:
        parts.append(f"{len(context.active_conditions)} active condition record(s)")
    if context.current_medications:
        parts.append(f"{len(context.current_medications)} current medication record(s)")
    if context.known_allergies:
        parts.append(f"{len(context.known_allergies)} active allergy record(s)")
    if context.information_gaps:
        parts.append(f"{len(context.information_gaps)} information gap(s)")
    if not parts:
        return "The checked record did not surface active conditions, current medications, active allergies, or questionnaire information gaps."
    return "The checked record includes " + ", ".join(parts) + "."


def _candidate_from_summary(summary: QuestionnaireSummary) -> QuestionnaireCandidate:
    return QuestionnaireCandidate(
        id=summary.id,
        title=summary.title or "Untitled Questionnaire",
        description=summary.description,
        version=summary.version or None,
        item_count=summary.itemCount,
    )


def _recommendation(
    candidate: QuestionnaireCandidate,
    reason: str,
    confidence: float,
    evidence_refs: list[str],
) -> IntakeQuestionnaireRecommendation:
    return IntakeQuestionnaireRecommendation(
        questionnaireId=candidate.id,
        title=candidate.title,
        version=candidate.version,
        itemCount=candidate.item_count,
        reason=reason,
        confidence=max(0, min(1, confidence)),
        evidenceRefs=evidence_refs,
    )


def _first_matching_candidate(
    candidates: list[QuestionnaireCandidate],
    used_ids: set[str],
    terms: list[str],
) -> QuestionnaireCandidate | None:
    for candidate in candidates:
        if candidate.id in used_ids:
            continue
        if any(term in candidate.search_text for term in terms):
            return candidate
    return None


def _gap_refs(gaps: list[InformationGap], code: str) -> list[str]:
    refs: list[str] = []
    for gap in gaps:
        if gap.code == code:
            refs.extend(gap.evidenceRefs)
    return refs


def _llm_input(context: PatientContext, candidates: list[QuestionnaireCandidate]) -> dict[str, Any]:
    return {
        "patientFacts": {
            "activeConditions": [fact.model_dump() for fact in context.summary_conditions()],
            "currentMedications": [fact.model_dump() for fact in context.summary_medications()],
            "knownAllergies": [fact.model_dump() for fact in context.summary_allergies()],
            "informationGaps": [gap.model_dump() for gap in context.information_gaps],
        },
        "candidateQuestionnaires": [
            {
                "id": candidate.id,
                "title": candidate.title,
                "description": candidate.description,
                "version": candidate.version,
                "itemCount": candidate.item_count,
            }
            for candidate in candidates
        ],
    }


def _extract_output_text(response_data: dict) -> str:
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

    raise IntakeRecommendationError("Could not find output text in LLM response.")


INTAKE_RECOMMENDATION_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "overview": {"type": "string"},
        "recommendations": {
            "type": "array",
            "maxItems": MAX_RECOMMENDATIONS,
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "questionnaireId": {"type": "string"},
                    "reason": {"type": "string"},
                    "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                    "evidenceRefs": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["questionnaireId", "reason", "confidence", "evidenceRefs"],
            },
        },
    },
    "required": ["overview", "recommendations"],
}
