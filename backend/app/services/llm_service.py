# backend/app/services/llm_service.py

from __future__ import annotations

import json
import os
from typing import Any

import httpx


class LlmExtractionError(Exception):
    """Raised when the LLM call fails or returns invalid output."""


class LlmService:
    """
    Converts a transcript + compact Questionnaire item list into candidate answers.

    Important:
    - This service does NOT create FHIR resources.
    - It only returns candidate answers for the review screen.
    - ExtractionService should validate the output against the selected Questionnaire.
    """

    def __init__(self, settings: Any) -> None:
        self.settings = settings

        # These work even before you add fields to config.py.
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
        self.default_clinical_timezone = (
            getattr(settings, "default_clinical_timezone", None)
            or os.getenv("DEFAULT_CLINICAL_TIMEZONE")
            or "Asia/Singapore"
        )

    async def extract_answers(
        self,
        *,
        transcript: str,
        questionnaire_items: list[dict],
    ) -> dict:
        """
        Return a dict shaped like ExtractResponse:

        {
            "answers": [...],
            "clinicalSuggestions": [...]
        }
        """
        if self.provider == "mock":
            return self._mock_extract(transcript=transcript, questionnaire_items=questionnaire_items)

        if self.provider == "openai":
            return await self._openai_extract(transcript=transcript, questionnaire_items=questionnaire_items)

        raise LlmExtractionError(f"Unsupported LLM_PROVIDER: {self.provider}")

    def _mock_extract(self, *, transcript: str, questionnaire_items: list[dict]) -> dict:
        """
        Development fallback.

        This lets you test /api/extract without paying for or configuring an LLM.
        Keep this simple and predictable.
        """
        transcript_lower = transcript.lower()
        allowed_link_ids = {item.get("linkId") for item in questionnaire_items}

        answers: list[dict] = []
        clinical_suggestions: list[dict] = []

        if "penicillin" in transcript_lower:
            allergy_link_id = self._first_matching_link_id(
                allowed_link_ids,
                preferred=[
                    "allergy-substance",
                    "allergies",
                    "known-allergies",
                    "allergy",
                ],
            )

            if allergy_link_id:
                answers.append(
                    {
                        "linkId": allergy_link_id,
                        "valueType": "string",
                        "value": "Penicillin",
                        "confidence": 0.9,
                        "evidence": "Transcript mentions penicillin.",
                        "status": "suggested",
                    }
                )

            clinical_suggestions.append(
                {
                    "resourceType": "AllergyIntolerance",
                    "accepted": False,
                    "confidence": 0.9,
                    "evidence": "Transcript mentions a penicillin allergy.",
                    "fields": {
                        "substance": "Penicillin",
                        "reaction": "rash" if "rash" in transcript_lower else "",
                    },
                }
            )

        return {
            "answers": answers,
            "clinicalSuggestions": clinical_suggestions,
        }

    async def _openai_extract(self, *, transcript: str, questionnaire_items: list[dict]) -> dict:
        if not self.api_key:
            raise LlmExtractionError(
                "OPENAI_API_KEY is missing. Set OPENAI_API_KEY in your backend .env, "
                "or set LLM_PROVIDER=mock for local testing."
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
                                {
                                    "transcript": transcript,
                                    "questionnaireItems": questionnaire_items,
                                    "defaultTimezone": self.default_clinical_timezone,
                                },
                                ensure_ascii=False,
                            ),
                        }
                    ],
                }
            ],
            "text": {
                "format": {
                    "type": "json_schema",
                    "name": "ambient_fhir_extraction",
                    "strict": True,
                    "schema": EXTRACTION_OUTPUT_SCHEMA,
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
            raise LlmExtractionError(
                f"OpenAI API request failed with {exc.response.status_code}: {response_text}"
            ) from exc

        data = response.json()
        output_text = self._extract_output_text(data)

        try:
            parsed = json.loads(output_text)
        except json.JSONDecodeError as exc:
            raise LlmExtractionError(f"LLM returned non-JSON output: {output_text[:500]}") from exc

        if not isinstance(parsed, dict):
            raise LlmExtractionError("LLM output must be a JSON object.")

        return parsed

    def _system_instructions(self) -> str:
        return """
You extract structured candidate answers from nurse-patient intake transcripts.

Rules:
- Return only JSON matching the provided schema.
- Do not create FHIR resources.
- Do not diagnose.
- Do not infer facts that are not stated in the transcript.
- Only use linkIds from the provided questionnaireItems.
- If an answer is not mentioned, omit it from answers.
- For choice answers, return an object using the exact fhirValueType and values from the provided options.
- For coded choice options, use {"fhirValueType":"valueCoding","system":"...","code":"..."}.
- For string choice options, use {"fhirValueType":"valueString","value":"..."}.
- For date values, use YYYY-MM-DD.
- For dateTime values, use a full FHIR dateTime with seconds and timezone.
- Valid dateTime examples: 2026-06-22T02:15:00Z and 2026-06-22T02:15:00+08:00.
- If the transcript gives a local date and time without a timezone, use the supplied defaultTimezone.
- Do not invent a different timezone.
- Do not return a dateTime without Z or an explicit UTC offset.
- Evidence should be a short quote or close paraphrase from the transcript.
- Confidence must be between 0 and 1.
- clinicalSuggestions may only contain AllergyIntolerance suggestions.
- clinicalSuggestions must always have accepted=false.
- Only suggest AllergyIntolerance when the transcript explicitly states an allergy or adverse reaction.
""".strip()

    def _extract_output_text(self, response_data: dict) -> str:
        """
        Extract output text from the raw Responses API payload.

        The response normally has output[].content[].text.
        """
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

        raise LlmExtractionError("Could not find output text in LLM response.")

    def _first_matching_link_id(self, allowed_link_ids: set[Any], preferred: list[str]) -> str | None:
        for link_id in preferred:
            if link_id in allowed_link_ids:
                return link_id
        return None

FHIR_DATETIME_PATTERN = (
    r"^\d{4}-\d{2}-\d{2}"
    r"T\d{2}:\d{2}:\d{2}"
    r"(?:\.\d+)?"
    r"(?:Z|[+-]\d{2}:\d{2})$"
)

COMMON_ANSWER_PROPERTIES: dict[str, Any] = {
    "linkId": {"type": "string"},
    "confidence": {
        "type": "number",
        "minimum": 0,
        "maximum": 1,
    },
    "evidence": {"type": "string"},
    "status": {
        "type": "string",
        "enum": ["suggested"],
    },
}


def _answer_schema(value_type: str, value_schema: dict[str, Any]) -> dict[str, Any]:
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            **COMMON_ANSWER_PROPERTIES,
            "valueType": {
                "type": "string",
                "enum": [value_type],
            },
            "value": value_schema,
        },
        "required": ["linkId", "valueType", "value", "confidence", "evidence", "status"],
    }


STRING_ANSWER_SCHEMA = _answer_schema("string", {"type": "string"})
TEXT_ANSWER_SCHEMA = _answer_schema("text", {"type": "string"})
BOOLEAN_ANSWER_SCHEMA = _answer_schema("boolean", {"type": "boolean"})
INTEGER_ANSWER_SCHEMA = _answer_schema("integer", {"type": "integer"})
DATE_ANSWER_SCHEMA = _answer_schema("date", {"type": "string", "pattern": r"^\d{4}-\d{2}-\d{2}$"})
DATETIME_ANSWER_SCHEMA = _answer_schema("dateTime", {"type": "string", "pattern": FHIR_DATETIME_PATTERN})
CHOICE_CODING_ANSWER_SCHEMA = _answer_schema(
    "choice",
    {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "fhirValueType": {
                "type": "string",
                "enum": ["valueCoding"],
            },
            "system": {"type": "string"},
            "code": {"type": "string"},
        },
        "required": ["fhirValueType", "system", "code"],
    },
)
CHOICE_STRING_ANSWER_SCHEMA = _answer_schema(
    "choice",
    {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "fhirValueType": {
                "type": "string",
                "enum": ["valueString"],
            },
            "value": {"type": "string"},
        },
        "required": ["fhirValueType", "value"],
    },
)

EXTRACTION_OUTPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "answers": {
            "type": "array",
            "items": {
                "anyOf": [
                    STRING_ANSWER_SCHEMA,
                    TEXT_ANSWER_SCHEMA,
                    BOOLEAN_ANSWER_SCHEMA,
                    INTEGER_ANSWER_SCHEMA,
                    DATE_ANSWER_SCHEMA,
                    DATETIME_ANSWER_SCHEMA,
                    CHOICE_CODING_ANSWER_SCHEMA,
                    CHOICE_STRING_ANSWER_SCHEMA,
                ]
            },
        },
        "clinicalSuggestions": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "resourceType": {
                        "type": "string",
                        "enum": ["AllergyIntolerance"],
                    },
                    "accepted": {
                        "type": "boolean",
                        "enum": [False],
                    },
                    "confidence": {
                        "type": "number",
                        "minimum": 0,
                        "maximum": 1,
                    },
                    "evidence": {"type": "string"},
                    "fields": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "substance": {"type": "string"},
                            "reaction": {"type": "string"},
                        },
                        "required": ["substance", "reaction"],
                    },
                },
                "required": ["resourceType", "accepted", "confidence", "evidence", "fields"],
            },
        },
    },
    "required": ["answers", "clinicalSuggestions"],
}
