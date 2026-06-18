from fastapi import HTTPException

from app.config import Settings
from app.fhir.patient_builder import build_patient_resource, flatten_patient
from app.schemas.patients import (
    CreatePatientRequest,
    CreatePatientResponse,
    PatientByMrnResponse,
    PatientQueryResult,
    PatientSummary,
)
from app.services.fhir_client import FhirClient, FhirHttpError


def is_mrn_like(value: str) -> bool:
    stripped = value.strip()
    return bool(stripped and any(char.isdigit() for char in stripped) and " " not in stripped)


class PatientService:
    def __init__(self, client: FhirClient, settings: Settings) -> None:
        self.client = client
        self.settings = settings

    async def search_patients(
        self,
        *,
        request_url: str | None = None,
        query: str | None = None,
        mrn: str | None = None,
        birth_date: str | None = None,
    ) -> PatientQueryResult:
        if request_url:
            response = await self.client.search_by_url(request_url, "Patient")
        else:
            params: dict[str, str | int] = {"_count": 20}
            if mrn:
                params["identifier"] = self._identifier_value(mrn)
            elif query:
                if is_mrn_like(query):
                    params["identifier"] = self._identifier_value(query)
                else:
                    params["name"] = query
            if birth_date:
                params["birthdate"] = birth_date

            response = await self.client.search("Patient", params)
        bundle = response.data or {"resourceType": "Bundle", "type": "searchset", "entry": []}
        if bundle.get("resourceType") != "Bundle":
            raise HTTPException(status_code=400, detail="FHIR Patient search URL must return a Bundle.")
        return PatientQueryResult(
            requestUrl=response.request_url,
            status=response.status,
            statusText=response.status_text,
            bundle=bundle,
            patients=self._patients_from_bundle(bundle),
        )

    async def by_mrn(self, mrn: str) -> PatientByMrnResponse:
        response = await self.client.search("Patient", {"identifier": self._identifier_value(mrn)})
        bundle = response.data or {"resourceType": "Bundle", "type": "searchset", "entry": []}
        patients = self._patients_from_bundle(bundle)
        if len(patients) == 1:
            return PatientByMrnResponse(
                requestUrl=response.request_url,
                status=response.status,
                statusText=response.status_text,
                bundle=bundle,
                matchType="single",
                patient=patients[0],
            )
        if len(patients) > 1:
            return PatientByMrnResponse(
                requestUrl=response.request_url,
                status=response.status,
                statusText=response.status_text,
                bundle=bundle,
                matchType="multiple",
                patients=patients,
            )
        return PatientByMrnResponse(
            requestUrl=response.request_url,
            status=response.status,
            statusText=response.status_text,
            bundle=bundle,
            matchType="none",
            createHint={"mrn": mrn},
        )

    async def create_patient(self, request: CreatePatientRequest) -> CreatePatientResponse:
        resource = build_patient_resource(
            mrn_system=self.settings.fhir_mrn_system,
            mrn=request.mrn,
            given=request.given,
            family=request.family,
            gender=request.gender,
            birth_date=request.birthDate,
        )
        if_none_exist = f"identifier={self._identifier_value(request.mrn)}"
        response = await self.client.conditional_create("Patient", resource, if_none_exist)

        if response.status == 412:
            raise HTTPException(
                status_code=409,
                detail={"matchType": "multiple", "message": "Multiple patients matched this MRN."},
            )

        created = response.status == 201
        patient_resource = response.data if response.data and response.data.get("resourceType") == "Patient" else None
        if patient_resource is None:
            patient_resource = await self._resource_from_location(response.headers.get("location")) or await self._single_patient_by_mrn(
                request.mrn
            )
        if patient_resource is None:
            raise HTTPException(status_code=502, detail="FHIR server did not return or locate the created Patient.")

        return CreatePatientResponse(
            requestUrl=response.request_url,
            status=response.status,
            statusText=response.status_text,
            resource=patient_resource,
            patient=flatten_patient(patient_resource, self.settings.fhir_mrn_system),
            created=created,
        )

    async def read_patient_resource(self, patient_id: str) -> dict:
        try:
            response = await self.client.read("Patient", patient_id)
        except FhirHttpError as exc:
            if exc.response_status == 404:
                raise HTTPException(status_code=404, detail=f"Patient not found: {patient_id}") from exc
            raise
        if not response.data or response.data.get("resourceType") != "Patient":
            raise HTTPException(status_code=502, detail="FHIR server returned an invalid Patient response.")
        return response.data

    async def _resource_from_location(self, location: str | None) -> dict | None:
        if not location:
            return None
        parts = location.split("/")
        try:
            patient_index = parts.index("Patient")
            patient_id = parts[patient_index + 1].split("/")[0]
        except (ValueError, IndexError):
            return None
        return await self.read_patient_resource(patient_id)

    async def _single_patient_by_mrn(self, mrn: str) -> dict | None:
        response = await self.client.search("Patient", {"identifier": self._identifier_value(mrn)})
        bundle = response.data or {}
        entries = [entry.get("resource") for entry in bundle.get("entry") or [] if entry.get("resource", {}).get("resourceType") == "Patient"]
        if len(entries) > 1:
            raise HTTPException(
                status_code=409,
                detail={"matchType": "multiple", "message": "Multiple patients matched this MRN."},
            )
        return entries[0] if entries else None

    def _patients_from_bundle(self, bundle: dict) -> list[PatientSummary]:
        patients: list[PatientSummary] = []
        for entry in bundle.get("entry") or []:
            resource = entry.get("resource") or {}
            if resource.get("resourceType") == "Patient":
                patients.append(flatten_patient(resource, self.settings.fhir_mrn_system))
        return patients

    def _identifier_value(self, mrn: str) -> str:
        return f"{self.settings.fhir_mrn_system}|{mrn}"
