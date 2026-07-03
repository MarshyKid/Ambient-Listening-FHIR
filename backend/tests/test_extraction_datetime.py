from __future__ import annotations

from types import SimpleNamespace
import unittest

from fastapi import HTTPException
from pydantic import ValidationError

from app.config import Settings
from app.schemas.extract import ExtractRequest
from app.services import llm_service as llm_module
from app.services.extraction_service import ExtractionService, normalize_fhir_datetime
from app.services.llm_service import EXTRACTION_OUTPUT_SCHEMA, FHIR_DATETIME_PATTERN, LlmService


QUESTIONNAIRE = {
    "resourceType": "Questionnaire",
    "id": "q1",
    "item": [
        {"linkId": "dt", "text": "When did symptoms start?", "type": "dateTime"},
        {"linkId": "date", "text": "What date?", "type": "date"},
    ],
}


class FakeQuestionnaireService:
    async def read_questionnaire_resource(self, questionnaire_id: str) -> dict:
        return QUESTIONNAIRE


class FakeLlmService:
    def __init__(self, raw: dict) -> None:
        self.raw = raw

    async def extract_answers(self, *, transcript: str, questionnaire_items: list[dict]) -> dict:
        return self.raw


def settings(timezone: str = "Asia/Singapore") -> SimpleNamespace:
    return SimpleNamespace(default_clinical_timezone=timezone)


def answer(link_id: str, value_type: str, value):
    return {
        "linkId": link_id,
        "valueType": value_type,
        "value": value,
        "confidence": 0.9,
        "evidence": "Patient said it.",
        "status": "suggested",
    }


def raw_response(*answers: dict) -> dict:
    return {"answers": list(answers), "clinicalSuggestions": []}


class ExtractionDateTimeTests(unittest.IsolatedAsyncioTestCase):
    def test_valid_utc_datetime_passes(self) -> None:
        self.assertEqual(normalize_fhir_datetime("2026-06-22T02:15:00Z", default_timezone="Asia/Singapore"), "2026-06-22T02:15:00Z")

    def test_valid_offset_datetime_passes(self) -> None:
        self.assertEqual(
            normalize_fhir_datetime("2026-06-22T02:15:00+08:00", default_timezone="Asia/Singapore"),
            "2026-06-22T02:15:00+08:00",
        )

    def test_fractional_seconds_pass(self) -> None:
        self.assertEqual(
            normalize_fhir_datetime("2026-06-22T02:15:00.123+08:00", default_timezone="Asia/Singapore"),
            "2026-06-22T02:15:00.123+08:00",
        )

    def test_missing_timezone_is_normalized(self) -> None:
        self.assertEqual(
            normalize_fhir_datetime("2026-06-22T02:15:00", default_timezone="Asia/Singapore"),
            "2026-06-22T02:15:00+08:00",
        )

    async def test_invalid_datetime_without_seconds_is_rejected(self) -> None:
        service = ExtractionService(
            FakeQuestionnaireService(),  # type: ignore[arg-type]
            FakeLlmService(raw_response(answer("dt", "dateTime", "2026-06-22T02:15"))),  # type: ignore[arg-type]
            settings(),
        )
        with self.assertRaises(HTTPException) as exc:
            await service.extract(ExtractRequest(questionnaireId="q1", transcript="test"))
        self.assertEqual(exc.exception.status_code, 422)

    async def test_natural_language_datetime_is_rejected(self) -> None:
        service = ExtractionService(
            FakeQuestionnaireService(),  # type: ignore[arg-type]
            FakeLlmService(raw_response(answer("dt", "dateTime", "tomorrow morning"))),  # type: ignore[arg-type]
            settings(),
        )
        with self.assertRaises(HTTPException) as exc:
            await service.extract(ExtractRequest(questionnaireId="q1", transcript="test"))
        self.assertEqual(exc.exception.status_code, 422)

    async def test_date_only_passes_for_date(self) -> None:
        service = ExtractionService(
            FakeQuestionnaireService(),  # type: ignore[arg-type]
            FakeLlmService(raw_response(answer("date", "date", "2026-06-22"))),  # type: ignore[arg-type]
            settings(),
        )
        result = await service.extract(ExtractRequest(questionnaireId="q1", transcript="test"))
        self.assertEqual(result.answers[0].value, "2026-06-22")

    async def test_date_only_fails_for_datetime(self) -> None:
        service = ExtractionService(
            FakeQuestionnaireService(),  # type: ignore[arg-type]
            FakeLlmService(raw_response(answer("dt", "dateTime", "2026-06-22"))),  # type: ignore[arg-type]
            settings(),
        )
        with self.assertRaises(HTTPException) as exc:
            await service.extract(ExtractRequest(questionnaireId="q1", transcript="test"))
        self.assertEqual(exc.exception.status_code, 422)

    def test_invalid_configured_timezone_raises(self) -> None:
        with self.assertRaises(ValidationError):
            Settings(DEFAULT_CLINICAL_TIMEZONE="Not/AZone")

    async def test_openai_input_includes_default_timezone(self) -> None:
        captured: dict = {}
        original_client = llm_module.httpx.AsyncClient

        class FakeResponse:
            def raise_for_status(self) -> None:
                return None

            def json(self) -> dict:
                return {"output_text": '{"answers":[],"clinicalSuggestions":[]}'}

        class FakeAsyncClient:
            def __init__(self, *args, **kwargs) -> None:
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, tb) -> None:
                return None

            async def post(self, url: str, *, headers: dict, json: dict):
                captured["payload"] = json
                return FakeResponse()

        try:
            llm_module.httpx.AsyncClient = FakeAsyncClient  # type: ignore[assignment]
            service = LlmService(
                SimpleNamespace(
                    llm_provider="openai",
                    llm_model="test-model",
                    openai_api_key="test-key",
                    llm_timeout_seconds=1,
                    default_clinical_timezone="Asia/Singapore",
                )
            )
            await service.extract_answers(transcript="test", questionnaire_items=[])
        finally:
            llm_module.httpx.AsyncClient = original_client  # type: ignore[assignment]

        text = captured["payload"]["input"][0]["content"][0]["text"]
        self.assertIn('"defaultTimezone": "Asia/Singapore"', text)

    def test_schema_datetime_variant_has_timezone_pattern(self) -> None:
        variants = EXTRACTION_OUTPUT_SCHEMA["properties"]["answers"]["items"]["anyOf"]
        datetime_variants = [
            variant
            for variant in variants
            if variant["properties"]["valueType"]["enum"] == ["dateTime"]
        ]
        self.assertEqual(datetime_variants[0]["properties"]["value"]["pattern"], FHIR_DATETIME_PATTERN)

    async def test_unknown_questionnaire_link_id_still_rejected(self) -> None:
        service = ExtractionService(
            FakeQuestionnaireService(),  # type: ignore[arg-type]
            FakeLlmService(raw_response(answer("unknown", "dateTime", "2026-06-22T02:15:00Z"))),  # type: ignore[arg-type]
            settings(),
        )
        with self.assertRaises(HTTPException) as exc:
            await service.extract(ExtractRequest(questionnaireId="q1", transcript="test"))
        self.assertEqual(exc.exception.status_code, 422)


if __name__ == "__main__":
    unittest.main()
