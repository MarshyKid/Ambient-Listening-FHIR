from __future__ import annotations

from types import SimpleNamespace
import unittest

from fastapi import HTTPException

from app.schemas.questionnaires import QuestionnaireQueryResult, QuestionnaireSummary
from app.services.fhir_client import FhirHttpError, FhirResponse
from app.services.intake_recommendation_service import (
    IntakeRecommendationError,
    IntakeRecommendationService,
    LlmIntakeRecommendation,
    LlmIntakeRecommendationResult,
    _candidate_from_summary,
    _llm_input,
)
from app.services.patient_context_service import PatientContextService, normalize_patient_id


def fhir_response(data: dict) -> FhirResponse:
    return FhirResponse(request_url="http://fhir.test", status=200, status_text="OK", data=data, headers={})


def bundle(resources: list[dict]) -> dict:
    return {
        "resourceType": "Bundle",
        "type": "searchset",
        "entry": [{"resource": resource} for resource in resources],
    }


def settings(**kwargs):
    defaults = {
        "llm_provider": "mock",
        "llm_model": "gpt-5.5",
        "openai_api_key": None,
        "llm_timeout_seconds": 45,
        "llm_intake_recommendation_enabled": False,
        "questionnaire_canonical_base": "http://example.org/fhir/Questionnaire",
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


class FakeFhirClient:
    def __init__(self, *, patient: dict | None = None, searches: dict[str, list[dict]] | None = None, missing_patient: bool = False) -> None:
        self.patient = patient or {"resourceType": "Patient", "id": "123"}
        self.searches = searches or {}
        self.missing_patient = missing_patient
        self.search_calls: list[tuple[str, dict]] = []
        self.write_calls: list[str] = []

    async def read(self, resource_type: str, resource_id: str) -> FhirResponse:
        if resource_type == "Patient" and self.missing_patient:
            raise FhirHttpError("not found", response_status=404, response_status_text="Not Found")
        return fhir_response(self.patient)

    async def search(self, resource_type: str, params: dict) -> FhirResponse:
        self.search_calls.append((resource_type, params))
        return fhir_response(bundle(self.searches.get(resource_type, [])))

    async def create(self, *_args, **_kwargs):
        self.write_calls.append("create")

    async def conditional_create(self, *_args, **_kwargs):
        self.write_calls.append("conditional_create")

    async def transaction(self, *_args, **_kwargs):
        self.write_calls.append("transaction")

    async def validate_resource(self, *_args, **_kwargs):
        self.write_calls.append("validate_resource")


class FakeQuestionnaireService:
    def __init__(self, questionnaires: list[QuestionnaireSummary]) -> None:
        self.questionnaires = questionnaires

    async def list_questionnaires(self) -> QuestionnaireQueryResult:
        return QuestionnaireQueryResult(
            requestUrl="http://fhir.test/Questionnaire?status=active",
            status=200,
            statusText="OK",
            bundle={"resourceType": "Bundle", "type": "searchset"},
            questionnaires=self.questionnaires,
        )


def questionnaire(questionnaire_id: str, title: str, description: str = "", item_count: int = 3) -> QuestionnaireSummary:
    return QuestionnaireSummary(
        id=questionnaire_id,
        fhirId=questionnaire_id,
        slug=questionnaire_id,
        url=f"http://example.org/fhir/Questionnaire/{questionnaire_id}",
        version="1.0.0",
        title=title,
        description=description,
        status="active",
        itemCount=item_count,
    )


class FailingOpenAiRecommendationService(IntakeRecommendationService):
    async def _openai_recommend(self, context, candidates):  # type: ignore[override]
        raise IntakeRecommendationError("simulated failure")


class IntakeRecommendationTests(unittest.IsolatedAsyncioTestCase):
    def test_patient_id_normalization(self) -> None:
        self.assertEqual(normalize_patient_id("Patient/123"), "123")
        self.assertEqual(normalize_patient_id("123"), "123")

    def test_malformed_patient_id_rejected(self) -> None:
        with self.assertRaises(HTTPException) as exc:
            normalize_patient_id("Observation/123")
        self.assertEqual(exc.exception.status_code, 400)

    async def test_missing_patient_returns_404(self) -> None:
        service = PatientContextService(FakeFhirClient(missing_patient=True))  # type: ignore[arg-type]
        with self.assertRaises(HTTPException) as exc:
            await service.load_context("Patient/123")
        self.assertEqual(exc.exception.status_code, 404)

    async def test_patient_context_queries_are_patient_scoped(self) -> None:
        client = FakeFhirClient()
        await PatientContextService(client).load_context("Patient/123")  # type: ignore[arg-type]
        self.assertIn(("Condition", {"subject": "Patient/123"}), client.search_calls)
        self.assertIn(("MedicationStatement", {"subject": "Patient/123"}), client.search_calls)
        self.assertIn(("AllergyIntolerance", {"patient": "Patient/123"}), client.search_calls)
        self.assertIn(("QuestionnaireResponse", {"subject": "Patient/123"}), client.search_calls)

    async def test_mapping_and_information_gaps(self) -> None:
        client = FakeFhirClient(
            searches={
                "Condition": [
                    {
                        "resourceType": "Condition",
                        "id": "condition-1",
                        "clinicalStatus": {"coding": [{"code": "active"}]},
                        "code": {"text": "Hypertension"},
                    }
                ],
                "MedicationStatement": [
                    {
                        "resourceType": "MedicationStatement",
                        "id": "medication-1",
                        "status": "active",
                        "medicationCodeableConcept": {"text": "Metformin"},
                    },
                    {
                        "resourceType": "MedicationStatement",
                        "id": "medication-2",
                        "status": "stopped",
                        "medicationCodeableConcept": {"text": "Warfarin"},
                    },
                ],
                "AllergyIntolerance": [
                    {
                        "resourceType": "AllergyIntolerance",
                        "id": "allergy-1",
                        "clinicalStatus": {"coding": [{"code": "active"}]},
                        "code": {"text": "Shellfish"},
                    }
                ],
                "QuestionnaireResponse": [],
            }
        )
        context = await PatientContextService(client).load_context("123")  # type: ignore[arg-type]
        self.assertEqual(context.active_conditions[0].display, "Hypertension")
        self.assertEqual([med.display for med in context.current_medications], ["Metformin"])
        self.assertEqual(context.known_allergies[0].display, "Shellfish")
        self.assertIn("missing-allergy-reaction", {gap.code for gap in context.information_gaps})
        self.assertIn("no-recent-questionnaire-response", {gap.code for gap in context.information_gaps})
        self.assertIn("medication-review-recommended", {gap.code for gap in context.information_gaps})

    async def test_raw_fhir_bundles_are_not_in_llm_payload(self) -> None:
        context = await PatientContextService(FakeFhirClient()).load_context("123")  # type: ignore[arg-type]
        payload = _llm_input(context, [_candidate_from_summary(questionnaire("allergy", "Allergy Review"))])
        self.assertNotIn("Bundle", str(payload))
        self.assertNotIn("entry", str(payload))
        self.assertNotIn("resourceType", str(payload))

    async def test_unknown_questionnaire_ids_return_400(self) -> None:
        service = IntakeRecommendationService(
            PatientContextService(FakeFhirClient()),  # type: ignore[arg-type]
            FakeQuestionnaireService([questionnaire("known", "Known Questionnaire")]),  # type: ignore[arg-type]
            settings(),
        )
        with self.assertRaises(HTTPException) as exc:
            await service.generate(patient_id="123", questionnaire_ids=["missing"])
        self.assertEqual(exc.exception.status_code, 400)

    async def test_mock_mode_returns_deterministic_recommendations(self) -> None:
        client = FakeFhirClient(
            searches={
                "AllergyIntolerance": [
                    {
                        "resourceType": "AllergyIntolerance",
                        "id": "allergy-1",
                        "clinicalStatus": {"coding": [{"code": "active"}]},
                        "code": {"text": "Shellfish"},
                    }
                ]
            }
        )
        service = IntakeRecommendationService(
            PatientContextService(client),  # type: ignore[arg-type]
            FakeQuestionnaireService(
                [
                    questionnaire("allergy", "Triage Allergy Assessment"),
                    questionnaire("general", "General Intake"),
                ]
            ),  # type: ignore[arg-type]
            settings(llm_intake_recommendation_enabled=True, llm_provider="mock"),
        )
        response = await service.generate(patient_id="123")
        self.assertEqual(response.recommendations[0].questionnaireId, "allergy")
        self.assertLessEqual(len(response.recommendations), 3)

    async def test_llm_validation_removes_invalid_refs_duplicates_and_caps(self) -> None:
        service = IntakeRecommendationService(
            PatientContextService(FakeFhirClient()),  # type: ignore[arg-type]
            FakeQuestionnaireService([]),  # type: ignore[arg-type]
            settings(),
        )
        candidates = [
            questionnaire("q1", "One"),
            questionnaire("q2", "Two"),
            questionnaire("q3", "Three"),
            questionnaire("q4", "Four"),
        ]
        validated = service._validated_llm_recommendations(
            LlmIntakeRecommendationResult(
                overview="overview",
                recommendations=[
                    LlmIntakeRecommendation(questionnaireId="q1", reason="one", confidence=0.9, evidenceRefs=["Condition/1", "Fake/1"]),
                    LlmIntakeRecommendation(questionnaireId="q1", reason="duplicate", confidence=0.8, evidenceRefs=[]),
                    LlmIntakeRecommendation(questionnaireId="q2", reason="two", confidence=0.8, evidenceRefs=[]),
                    LlmIntakeRecommendation(questionnaireId="q3", reason="three", confidence=0.7, evidenceRefs=[]),
                    LlmIntakeRecommendation(questionnaireId="q4", reason="four", confidence=0.6, evidenceRefs=[]),
                    LlmIntakeRecommendation(questionnaireId="unknown", reason="bad", confidence=0.5, evidenceRefs=[]),
                ],
            ),
            [_candidate_from_summary(candidate) for candidate in candidates],
            {"Condition/1"},
        )
        self.assertEqual([item.questionnaireId for item in validated], ["q1", "q2", "q3"])
        self.assertEqual(validated[0].evidenceRefs, ["Condition/1"])

    async def test_llm_failure_returns_deterministic_output_plus_warning(self) -> None:
        service = FailingOpenAiRecommendationService(
            PatientContextService(FakeFhirClient()),  # type: ignore[arg-type]
            FakeQuestionnaireService([questionnaire("general", "General Intake")]),  # type: ignore[arg-type]
            settings(llm_intake_recommendation_enabled=True, llm_provider="openai", openai_api_key="test-key"),
        )
        response = await service.generate(patient_id="123")
        self.assertTrue(response.warnings)
        self.assertEqual(response.recommendations[0].questionnaireId, "general")

    async def test_no_fhir_write_methods_called(self) -> None:
        client = FakeFhirClient()
        service = IntakeRecommendationService(
            PatientContextService(client),  # type: ignore[arg-type]
            FakeQuestionnaireService([questionnaire("general", "General Intake")]),  # type: ignore[arg-type]
            settings(),
        )
        await service.generate(patient_id="123")
        self.assertEqual(client.write_calls, [])


if __name__ == "__main__":
    unittest.main()
