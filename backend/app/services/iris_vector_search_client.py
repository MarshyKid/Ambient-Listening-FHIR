from __future__ import annotations

import logging
import math
from typing import Any

import httpx
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from app.config import Settings


logger = logging.getLogger(__name__)


class VectorSearchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    patientReference: str = Field(min_length=1)
    query: str = Field(min_length=1)
    topK: int = Field(ge=1)


class VectorSearchResult(BaseModel):
    model_config = ConfigDict(extra="ignore")

    resourceType: str
    resourceId: str
    versionId: str | None = None
    searchText: str
    similarity: float | None = None

    @field_validator("resourceType", "resourceId", "searchText")
    @classmethod
    def validate_required_text(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("value must not be empty")
        return stripped

    @field_validator("versionId", mode="before")
    @classmethod
    def normalize_version_id(cls, value: object) -> str | None:
        if value is None:
            return None
        normalized = str(value).strip()
        return normalized or None

    @field_validator("similarity", mode="before")
    @classmethod
    def normalize_similarity(cls, value: object) -> float | None:
        if value is None or isinstance(value, bool):
            return None
        try:
            normalized = float(value)
        except (TypeError, ValueError):
            return None
        return normalized if math.isfinite(normalized) else None


class VectorSearchResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    patientReference: str
    query: str
    resultCount: int = Field(ge=0)
    results: list[VectorSearchResult]


class _VectorSearchEnvelope(BaseModel):
    model_config = ConfigDict(extra="ignore")

    patientReference: str
    query: str
    resultCount: int = Field(ge=0)
    results: list[Any]


class IrisVectorSearchError(Exception):
    """Raised when IRIS vector retrieval fails or returns an invalid response."""


class IrisVectorSearchClient:
    def __init__(self, settings: Settings) -> None:
        self.url = getattr(settings, "iris_vector_search_url", None)
        self.username = getattr(settings, "iris_vector_search_username", None)
        self.password = getattr(settings, "iris_vector_search_password", None)
        self.top_k = int(getattr(settings, "iris_vector_search_top_k", 5))
        self.timeout_seconds = float(getattr(settings, "iris_vector_search_timeout_seconds", 5))

    @property
    def has_partial_auth(self) -> bool:
        return bool(self.username) != bool(self.password)

    async def search(self, *, patient_reference: str, query: str) -> VectorSearchResponse:
        if not self.url:
            raise IrisVectorSearchError("IRIS vector search URL is not configured.")
        if self.has_partial_auth:
            raise IrisVectorSearchError("IRIS vector search Basic Auth configuration is incomplete.")

        request = VectorSearchRequest(
            patientReference=patient_reference,
            query=query,
            topK=self.top_k,
        )
        auth = httpx.BasicAuth(self.username, self.password) if self.username and self.password else None

        logger.info(
            "IRIS vector search started for %s with topK=%d.",
            patient_reference,
            self.top_k,
        )

        try:
            async with self._client(auth=auth) as client:
                response = await client.post(
                    self.url,
                    headers={"Content-Type": "application/json"},
                    json=request.model_dump(),
                )
        except httpx.TimeoutException as exc:
            raise IrisVectorSearchError("IRIS vector search request timed out.") from exc
        except httpx.TransportError as exc:
            raise IrisVectorSearchError("IRIS vector search endpoint is unreachable.") from exc

        if not 200 <= response.status_code < 300:
            raise IrisVectorSearchError(f"IRIS vector search returned HTTP {response.status_code}.")

        try:
            payload = response.json()
        except ValueError as exc:
            raise IrisVectorSearchError("IRIS vector search returned invalid JSON.") from exc

        try:
            envelope = _VectorSearchEnvelope.model_validate(payload)
        except ValidationError as exc:
            raise IrisVectorSearchError("IRIS vector search returned an invalid response.") from exc

        if envelope.patientReference != patient_reference:
            raise IrisVectorSearchError("IRIS vector search returned a different patient reference.")

        deduplicated: dict[tuple[str, str], VectorSearchResult] = {}
        for index, raw_result in enumerate(envelope.results):
            try:
                result = VectorSearchResult.model_validate(raw_result)
            except ValidationError:
                logger.warning(
                    "Skipped malformed IRIS vector search result at index %d for %s.",
                    index,
                    patient_reference,
                )
                continue

            key = (result.resourceType, result.resourceId)
            existing = deduplicated.get(key)
            if existing is None or _similarity_rank(result.similarity) > _similarity_rank(existing.similarity):
                deduplicated[key] = result

        results = list(deduplicated.values())
        logger.info(
            "IRIS vector search completed for %s with %d usable result(s).",
            patient_reference,
            len(results),
        )
        return VectorSearchResponse(
            patientReference=envelope.patientReference,
            query=envelope.query,
            resultCount=len(results),
            results=results,
        )

    def _client(self, *, auth: httpx.Auth | None) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            timeout=httpx.Timeout(self.timeout_seconds),
            auth=auth,
        )


def _similarity_rank(similarity: float | None) -> float:
    return similarity if similarity is not None else float("-inf")
