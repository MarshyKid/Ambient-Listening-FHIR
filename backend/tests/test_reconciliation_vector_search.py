from __future__ import annotations

import json
import unittest
from collections.abc import Callable
from typing import Any

import httpx

from app.config import Settings
from app.schemas.reconcile import ReconcileAnswer, ReconcileRequest
from app.services.iris_vector_search_client import (
    IrisVectorSearchClient,
    IrisVectorSearchError,
    VectorSearchResult,
)
from app.services.reconciliation_agent_service import ReconciliationAgentService
from app.services.reconciliation_graph import ReconciliationGraph, build_vector_search_query
from app.services.reconciliation_semantic_comparator_service import _semantic_input


IRIS_URL = "http://iris.test/csp/demo/ambient-vector/search"


def vector_payload(
    *,
    patient_reference: str = "Patient/123",
    results: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    items = results if results is not None else []
    return {
        "patientReference": patient_reference,
        "query": "query",
        "resultCount": len(items),
        "results": items,
    }


def vector_result(
    *,
    resource_type: str = "AllergyIntolerance",
    resource_id: str = "allergy-1",
    similarity: float | None = 0.8,
) -> dict[str, Any]:
    return {
        "resourceType": resource_type,
        "resourceId": resource_id,
        "versionId": "1",
        "searchText": "Indexed allergy evidence.",
        "similarity": similarity,
    }


def settings(
    *,
    url: str | None = IRIS_URL,
    username: str | None = None,
    password: str | None = None,
) -> Settings:
    return Settings(
        IRIS_VECTOR_SEARCH_URL=url,
        IRIS_VECTOR_SEARCH_USERNAME=username,
        IRIS_VECTOR_SEARCH_PASSWORD=password,
        IRIS_VECTOR_SEARCH_TOP_K=5,
        IRIS_VECTOR_SEARCH_TIMEOUT_SECONDS=1,
        LLM_RECONCILIATION_SEMANTIC_COMPARE_ENABLED=True,
    )


class MockTransportVectorClient(IrisVectorSearchClient):
    def __init__(
        self,
        config: Settings,
        handler: Callable[[httpx.Request], httpx.Response],
    ) -> None:
        super().__init__(config)
        self.handler = handler

    def _client(self, *, auth: httpx.Auth | None) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            transport=httpx.MockTransport(self.handler),
            timeout=httpx.Timeout(self.timeout_seconds),
            auth=auth,
        )


class FakeSnapshotService:
    async def load_patient(self, patient_id: str) -> dict[str, Any]:
        return {
            "resourceType": "Patient",
            "id": patient_id,
            "text": {"status": "generated", "div": "AUTHORITATIVE RECORD ONLY"},
        }

    async def search_allergies(self, patient_id: str) -> tuple[list[dict[str, Any]], None]:
        return (
            [
                {
                    "resourceType": "AllergyIntolerance",
                    "id": "allergy-1",
                    "clinicalStatus": {"coding": [{"code": "active"}]},
                    "code": {"text": "Penicillin"},
                    "reaction": [{"manifestation": [{"text": "Rash"}]}],
                }
            ],
            None,
        )

    async def search_medication_statements(self, patient_id: str) -> tuple[list[dict[str, Any]], None]:
        return [], None


class CapturingSemanticComparator:
    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []

    async def compare(self, **kwargs: Any) -> list:
        self.calls.append(kwargs)
        return []


def reconcile_request() -> ReconcileRequest:
    return ReconcileRequest(
        patientId="Patient/123",
        answers=[
            ReconcileAnswer(
                linkId="medication-allergies",
                questionText="Do you have any medication allergies?",
                valueType="text",
                value="Penicillin causes a rash.",
                evidence="Patient reports a rash after penicillin.",
            )
        ],
    )


async def run_graph(
    vector_client: IrisVectorSearchClient | None,
    *,
    semantic_comparator: CapturingSemanticComparator | None = None,
):
    comparator = semantic_comparator if semantic_comparator is not None else CapturingSemanticComparator()
    graph = ReconciliationGraph(
        FakeSnapshotService(),  # type: ignore[arg-type]
        ReconciliationAgentService(),
        semantic_comparator=comparator,  # type: ignore[arg-type]
        vector_search_client=vector_client,
    )
    response = await graph.ainvoke(reconcile_request())
    return response, comparator


class IrisVectorSearchClientTests(unittest.IsolatedAsyncioTestCase):
    async def test_request_is_patient_scoped_and_uses_basic_auth(self) -> None:
        captured: dict[str, Any] = {}

        def handler(request: httpx.Request) -> httpx.Response:
            captured["authorization"] = request.headers.get("Authorization")
            captured["payload"] = json.loads(request.content)
            return httpx.Response(200, json=vector_payload(results=[vector_result()]))

        client = MockTransportVectorClient(settings(username="user", password="pass"), handler)
        response = await client.search(
            patient_reference="Patient/123",
            query="Question: Allergy?\nAnswer: Penicillin",
        )

        self.assertEqual(captured["authorization"], "Basic dXNlcjpwYXNz")
        self.assertEqual(captured["payload"]["patientReference"], "Patient/123")
        self.assertEqual(captured["payload"]["topK"], 5)
        self.assertEqual(len(response.results), 1)

    async def test_request_without_credentials_is_unauthenticated(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            self.assertNotIn("Authorization", request.headers)
            return httpx.Response(200, json=vector_payload())

        client = MockTransportVectorClient(settings(username=None, password=None), handler)
        response = await client.search(patient_reference="Patient/123", query="query")
        self.assertEqual(response.results, [])

    async def test_duplicate_results_keep_highest_similarity_and_skip_malformed_items(self) -> None:
        payload = vector_payload(
            results=[
                vector_result(similarity=0.7),
                vector_result(similarity=0.9),
                {"resourceType": "Observation", "resourceId": "missing-text"},
            ]
        )

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json=payload)

        client = MockTransportVectorClient(settings(), handler)
        with self.assertLogs("app.services.iris_vector_search_client", level="WARNING"):
            response = await client.search(patient_reference="Patient/123", query="query")

        self.assertEqual(response.resultCount, 1)
        self.assertEqual(response.results[0].similarity, 0.9)

    async def test_invalid_envelopes_are_rejected(self) -> None:
        invalid_payloads: list[Any] = [
            {"patientReference": "Patient/123", "query": "query"},
            {
                "patientReference": "Patient/123",
                "query": "query",
                "resultCount": 0,
                "results": {},
            },
        ]

        for payload in invalid_payloads:
            with self.subTest(payload=payload):
                def handler(request: httpx.Request, response_payload: Any = payload) -> httpx.Response:
                    return httpx.Response(200, json=response_payload)

                client = MockTransportVectorClient(settings(), handler)
                with self.assertRaises(IrisVectorSearchError):
                    await client.search(patient_reference="Patient/123", query="query")

    def test_query_formatter_uses_draft_content_only(self) -> None:
        query = build_vector_search_query(reconcile_request())
        self.assertIn("Question: Do you have any medication allergies?", query)
        self.assertIn("Answer: Penicillin causes a rash.", query)
        self.assertNotIn("AUTHORITATIVE RECORD ONLY", query)


class ReconciliationVectorSearchTests(unittest.IsolatedAsyncioTestCase):
    async def test_success_preserves_fhir_context_and_adds_vector_evidence(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            payload = json.loads(request.content)
            self.assertEqual(payload["patientReference"], "Patient/123")
            self.assertNotIn("AUTHORITATIVE RECORD ONLY", payload["query"])
            return httpx.Response(200, json=vector_payload(results=[vector_result(similarity=0.884)]))

        response, comparator = await run_graph(MockTransportVectorClient(settings(), handler))

        self.assertEqual(response.checkedRecordSummary.allergyIntoleranceCount, 1)
        self.assertTrue(any(finding.existingResourceRefs == ["AllergyIntolerance/allergy-1"] for finding in response.findings))
        vector_search = response.vectorSearch
        self.assertIsNotNone(vector_search)
        assert vector_search is not None
        self.assertEqual(vector_search.status, "completed")
        self.assertEqual(vector_search.resultCount, 1)
        self.assertEqual(vector_search.evidence[0].resourceId, "allergy-1")
        self.assertEqual(vector_search.evidence[0].similarity, 0.884)
        self.assertTrue(
            any(
                activity.step == "search-vector-context" and activity.status == "completed"
                for activity in response.activityTrail
            )
        )
        self.assertEqual(len(comparator.calls), 1)
        call = comparator.calls[0]
        self.assertEqual(call["allergy_facts"][0].resource_ref, "AllergyIntolerance/allergy-1")
        self.assertEqual(call["vector_search_results"][0].similarity, 0.884)

        semantic_payload = _semantic_input(**call)
        self.assertEqual(semantic_payload["existingFacts"][0]["resourceRef"], "AllergyIntolerance/allergy-1")
        self.assertEqual(
            semantic_payload["additionalSemanticallyRetrievedEvidence"][0]["resourceRef"],
            "AllergyIntolerance/allergy-1",
        )
        serialized = response.model_dump()
        self.assertNotIn("query", serialized["vectorSearch"])
        self.assertNotIn("error", serialized["vectorSearch"])
        self.assertNotIn("patientReference", serialized["vectorSearch"])

    async def test_http_500_logs_warning_and_reconciliation_completes(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(500, text="failure")

        with self.assertLogs("app.services.reconciliation_graph", level="WARNING") as logs:
            response, comparator = await run_graph(MockTransportVectorClient(settings(), handler))

        self.assertEqual(response.checkedRecordSummary.allergyIntoleranceCount, 1)
        self.assertEqual(comparator.calls[0]["vector_search_results"], [])
        self.assertTrue(any("HTTP 500" in message for message in logs.output))
        self.assertEqual(response.vectorSearch.status, "failed")  # type: ignore[union-attr]
        self.assertEqual(response.vectorSearch.evidence, [])  # type: ignore[union-attr]
        self.assertNotIn("HTTP 500", response.vectorSearch.message)  # type: ignore[union-attr]

    async def test_timeout_and_connection_failures_are_fail_open(self) -> None:
        def timeout_handler(request: httpx.Request) -> httpx.Response:
            raise httpx.ReadTimeout("timeout", request=request)

        def connection_handler(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("connection failed", request=request)

        for handler in (timeout_handler, connection_handler):
            with self.subTest(handler=handler.__name__):
                with self.assertLogs("app.services.reconciliation_graph", level="WARNING"):
                    response, comparator = await run_graph(MockTransportVectorClient(settings(), handler))
                self.assertEqual(response.patientId, "123")
                self.assertEqual(comparator.calls[0]["vector_search_results"], [])
                self.assertEqual(response.vectorSearch.status, "failed")  # type: ignore[union-attr]

    async def test_malformed_json_is_fail_open(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, content=b"not-json")

        with self.assertLogs("app.services.reconciliation_graph", level="WARNING"):
            response, comparator = await run_graph(MockTransportVectorClient(settings(), handler))

        self.assertEqual(response.patientId, "123")
        self.assertEqual(comparator.calls[0]["vector_search_results"], [])
        self.assertEqual(response.vectorSearch.status, "failed")  # type: ignore[union-attr]

    async def test_invalid_response_shapes_are_fail_open(self) -> None:
        payloads: list[dict[str, Any]] = [
            {"patientReference": "Patient/123", "query": "query", "resultCount": 0},
            {
                "patientReference": "Patient/123",
                "query": "query",
                "resultCount": 0,
                "results": {},
            },
        ]

        for payload in payloads:
            with self.subTest(payload=payload):
                def handler(request: httpx.Request, response_payload: dict[str, Any] = payload) -> httpx.Response:
                    return httpx.Response(200, json=response_payload)

                with self.assertLogs("app.services.reconciliation_graph", level="WARNING"):
                    response, comparator = await run_graph(MockTransportVectorClient(settings(), handler))
                self.assertEqual(response.patientId, "123")
                self.assertEqual(comparator.calls[0]["vector_search_results"], [])
                self.assertEqual(response.vectorSearch.status, "failed")  # type: ignore[union-attr]

    async def test_zero_results_is_successful(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json=vector_payload())

        response, comparator = await run_graph(MockTransportVectorClient(settings(), handler))
        self.assertEqual(response.patientId, "123")
        self.assertEqual(comparator.calls[0]["vector_search_results"], [])
        self.assertEqual(response.vectorSearch.status, "completed")  # type: ignore[union-attr]
        self.assertEqual(response.vectorSearch.resultCount, 0)  # type: ignore[union-attr]

    async def test_mismatched_patient_reference_is_discarded(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                200,
                json=vector_payload(
                    patient_reference="Patient/other",
                    results=[vector_result()],
                ),
            )

        with self.assertLogs("app.services.reconciliation_graph", level="WARNING"):
            response, comparator = await run_graph(MockTransportVectorClient(settings(), handler))
        self.assertEqual(response.patientId, "123")
        self.assertEqual(comparator.calls[0]["vector_search_results"], [])
        self.assertEqual(response.vectorSearch.status, "failed")  # type: ignore[union-attr]

    async def test_missing_url_skips_vector_retrieval(self) -> None:
        response, comparator = await run_graph(None)
        self.assertEqual(response.patientId, "123")
        self.assertEqual(comparator.calls[0]["vector_search_results"], [])
        self.assertEqual(response.vectorSearch.status, "skipped")  # type: ignore[union-attr]

    async def test_disabled_semantic_comparator_skips_vector_retrieval(self) -> None:
        calls = 0

        def handler(request: httpx.Request) -> httpx.Response:
            nonlocal calls
            calls += 1
            return httpx.Response(200, json=vector_payload())

        graph = ReconciliationGraph(
            FakeSnapshotService(),  # type: ignore[arg-type]
            ReconciliationAgentService(),
            semantic_comparator=None,
            vector_search_client=MockTransportVectorClient(settings(), handler),
        )
        response = await graph.ainvoke(reconcile_request())
        self.assertEqual(response.patientId, "123")
        self.assertEqual(calls, 0)
        self.assertEqual(response.vectorSearch.status, "skipped")  # type: ignore[union-attr]

    async def test_partial_credentials_skip_vector_retrieval(self) -> None:
        calls = 0

        def handler(request: httpx.Request) -> httpx.Response:
            nonlocal calls
            calls += 1
            return httpx.Response(200, json=vector_payload())

        client = MockTransportVectorClient(settings(username="user", password=None), handler)
        with self.assertLogs("app.services.reconciliation_graph", level="WARNING"):
            response, comparator = await run_graph(client)

        self.assertEqual(response.patientId, "123")
        self.assertEqual(calls, 0)
        self.assertEqual(comparator.calls[0]["vector_search_results"], [])
        self.assertEqual(response.vectorSearch.status, "skipped")  # type: ignore[union-attr]

    async def test_empty_draft_skips_vector_retrieval(self) -> None:
        calls = 0

        def handler(request: httpx.Request) -> httpx.Response:
            nonlocal calls
            calls += 1
            return httpx.Response(200, json=vector_payload())

        comparator = CapturingSemanticComparator()
        graph = ReconciliationGraph(
            FakeSnapshotService(),  # type: ignore[arg-type]
            ReconciliationAgentService(),
            semantic_comparator=comparator,  # type: ignore[arg-type]
            vector_search_client=MockTransportVectorClient(settings(), handler),
        )
        response = await graph.ainvoke(ReconcileRequest(patientId="123"))

        self.assertEqual(response.patientId, "123")
        self.assertEqual(calls, 0)
        self.assertEqual(comparator.calls[0]["vector_search_results"], [])
        self.assertEqual(response.vectorSearch.status, "skipped")  # type: ignore[union-attr]

    async def test_unexpected_vector_client_error_is_fail_open(self) -> None:
        class UnexpectedFailureClient:
            url = IRIS_URL
            top_k = 5

            async def search(self, **kwargs: Any):
                raise RuntimeError("sensitive payload must not be logged")

        with self.assertLogs("app.services.reconciliation_graph", level="WARNING") as logs:
            response, comparator = await run_graph(UnexpectedFailureClient())  # type: ignore[arg-type]

        self.assertEqual(response.patientId, "123")
        self.assertEqual(comparator.calls[0]["vector_search_results"], [])
        self.assertNotIn("sensitive payload", "\n".join(logs.output))
        self.assertEqual(response.vectorSearch.status, "failed")  # type: ignore[union-attr]
        self.assertNotIn("sensitive payload", response.vectorSearch.message)  # type: ignore[union-attr]


if __name__ == "__main__":
    unittest.main()
