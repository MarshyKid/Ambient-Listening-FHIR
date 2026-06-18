from typing import Any

from pydantic import BaseModel, ConfigDict


class ApiModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)


FhirJson = dict[str, Any]


class ErrorResponse(ApiModel):
    status: int
    statusText: str
    error: str
    operationOutcome: FhirJson | None = None
