from dataclasses import dataclass
from typing import Any, Iterable
from urllib.parse import quote, urlparse

import httpx

from app.config import Settings, get_settings
from app.fhir.constants import FHIR_JSON


@dataclass(frozen=True)
class FhirResponse:
    request_url: str
    status: int
    status_text: str
    data: dict[str, Any] | None
    headers: dict[str, str]


class FhirClientError(Exception):
    status_code = 500

    def __init__(
        self,
        message: str,
        *,
        response_status: int | None = None,
        response_status_text: str | None = None,
        request_url: str | None = None,
        operation_outcome: dict | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.response_status = response_status
        self.response_status_text = response_status_text
        self.request_url = request_url
        self.operation_outcome = operation_outcome


class FhirServiceUnavailable(FhirClientError):
    status_code = 503


class FhirHttpError(FhirClientError):
    def __init__(self, message: str, *, response_status: int, response_status_text: str, **kwargs: Any) -> None:
        super().__init__(
            message,
            response_status=response_status,
            response_status_text=response_status_text,
            **kwargs,
        )
        self.status_code = response_status


class FhirInvalidRequest(FhirClientError):
    status_code = 400


class FhirClient:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()

    async def get_metadata(self) -> FhirResponse:
        return await self._request("GET", "metadata")

    async def search(self, resource_type: str, params: dict[str, Any]) -> FhirResponse:
        return await self._request("GET", resource_type, params=params)

    async def search_by_url(self, request_url: str, resource_type: str) -> FhirResponse:
        url = self._validated_search_url(request_url, resource_type)
        return await self._request_url("GET", url)

    async def read(self, resource_type: str, resource_id: str) -> FhirResponse:
        return await self._request("GET", f"{resource_type}/{quote(str(resource_id), safe='')}")

    async def create(self, resource_type: str, resource: dict) -> FhirResponse:
        return await self._request("POST", resource_type, json=resource)

    async def conditional_create(self, resource_type: str, resource: dict, if_none_exist: str) -> FhirResponse:
        return await self._request(
            "POST",
            resource_type,
            json=resource,
            headers={"If-None-Exist": if_none_exist},
            allowed_statuses={200, 201, 412},
        )

    async def transaction(self, bundle: dict) -> FhirResponse:
        return await self._request("POST", "", json=bundle)

    async def validate_resource(self, resource_type: str, resource: dict) -> FhirResponse:
        return await self._request("POST", f"{resource_type}/$validate", json=resource, allowed_statuses=range(200, 300))

    async def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json: dict | None = None,
        headers: dict[str, str] | None = None,
        allowed_statuses: Iterable[int] = range(200, 300),
    ) -> FhirResponse:
        url = self._url(path)
        return await self._request_url(
            method,
            url,
            params=params,
            json=json,
            headers=headers,
            allowed_statuses=allowed_statuses,
        )

    async def _request_url(
        self,
        method: str,
        url: str,
        *,
        params: dict[str, Any] | None = None,
        json: dict | None = None,
        headers: dict[str, str] | None = None,
        allowed_statuses: Iterable[int] = range(200, 300),
    ) -> FhirResponse:
        merged_headers = {"Accept": FHIR_JSON}
        if json is not None:
            merged_headers["Content-Type"] = FHIR_JSON
        if headers:
            merged_headers.update(headers)

        try:
            async with self._client() as client:
                response = await client.request(method, url, params=params, json=json, headers=merged_headers)
        except httpx.TimeoutException as exc:
            raise FhirServiceUnavailable("FHIR server request timed out.") from exc
        except httpx.TransportError as exc:
            raise FhirServiceUnavailable("FHIR server is unreachable.") from exc

        data = _json_or_none(response)
        result = FhirResponse(
            request_url=str(response.request.url),
            status=response.status_code,
            status_text=response.reason_phrase,
            data=data,
            headers=dict(response.headers),
        )

        if response.status_code not in set(allowed_statuses):
            outcome = data if isinstance(data, dict) and data.get("resourceType") == "OperationOutcome" else None
            diagnostics = _operation_outcome_diagnostics(outcome)
            message = diagnostics or f"FHIR server returned {response.status_code} {response.reason_phrase}."
            raise FhirHttpError(
                message,
                response_status=response.status_code,
                response_status_text=response.reason_phrase,
                request_url=str(response.request.url),
                operation_outcome=outcome,
            )
        return result

    def _validated_search_url(self, request_url: str, resource_type: str) -> str:
        parsed = urlparse(request_url)
        base = urlparse(self.settings.fhir_base_url)

        if not parsed.scheme or not parsed.netloc:
            raise FhirInvalidRequest("requestUrl must be an absolute FHIR URL.")
        if parsed.username or parsed.password:
            raise FhirInvalidRequest("requestUrl must not include credentials.")
        if parsed.fragment:
            raise FhirInvalidRequest("requestUrl must not include a URL fragment.")
        if parsed.params:
            raise FhirInvalidRequest("requestUrl must not include path parameters.")
        if parsed.scheme.lower() != base.scheme.lower():
            raise FhirInvalidRequest("requestUrl must use the configured FHIR_BASE_URL scheme.")
        if (parsed.hostname or "").lower() != (base.hostname or "").lower() or parsed.port != base.port:
            raise FhirInvalidRequest("requestUrl must target the configured FHIR_BASE_URL host.")

        base_path = base.path.rstrip("/")
        expected_path = f"{base_path}/{resource_type}" if base_path else f"/{resource_type}"
        if parsed.path.rstrip("/") != expected_path:
            raise FhirInvalidRequest(f"requestUrl must target the {resource_type} search endpoint.")
        return request_url

    def _client(self) -> httpx.AsyncClient:
        auth = None
        if self.settings.has_basic_auth:
            auth = httpx.BasicAuth(self.settings.fhir_username or "", self.settings.fhir_password or "")
        return httpx.AsyncClient(
            verify=self.settings.fhir_verify_ssl,
            timeout=httpx.Timeout(self.settings.fhir_timeout_seconds),
            auth=auth,
        )

    def _url(self, path: str) -> str:
        if not path:
            return self.settings.fhir_base_url
        return f"{self.settings.fhir_base_url}/{path.lstrip('/')}"


def fhir_error_payload(error: FhirClientError) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "status": error.response_status or error.status_code,
        "statusText": error.response_status_text or ("Service Unavailable" if error.status_code == 503 else "Error"),
        "error": error.message,
    }
    if error.operation_outcome:
        payload["operationOutcome"] = error.operation_outcome
    return payload


def _json_or_none(response: httpx.Response) -> dict[str, Any] | None:
    if not response.content:
        return None
    try:
        data = response.json()
    except ValueError:
        return None
    return data if isinstance(data, dict) else None


def _operation_outcome_diagnostics(outcome: dict | None) -> str | None:
    if not outcome:
        return None
    diagnostics: list[str] = []
    for issue in outcome.get("issue") or []:
        text = issue.get("diagnostics") or issue.get("details", {}).get("text")
        if text:
            diagnostics.append(str(text))
    return "; ".join(diagnostics) if diagnostics else None
