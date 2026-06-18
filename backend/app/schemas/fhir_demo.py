from .common import ApiModel, FhirJson


class FhirRawResourceResult(ApiModel):
    requestUrl: str
    status: int
    statusText: str
    resource: FhirJson


class FhirRawBundleResult(ApiModel):
    requestUrl: str
    status: int
    statusText: str
    bundle: FhirJson
