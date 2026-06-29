from dataclasses import dataclass, field

from app.services.fhir_client import FhirClient, FhirClientError


@dataclass
class RecordSnapshot:
    patient: dict
    allergies: list[dict] = field(default_factory=list)
    medication_statements: list[dict] = field(default_factory=list)


class RecordSnapshotService:
    def __init__(self, client: FhirClient) -> None:
        self.client = client

    async def load_patient(self, patient_id: str) -> dict:
        response = await self.client.read("Patient", patient_id)
        patient = response.data or {}
        if patient.get("resourceType") != "Patient":
            return {}
        return patient

    async def search_allergies(self, patient_id: str) -> tuple[list[dict], str | None]:
        try:
            response = await self.client.search("AllergyIntolerance", {"patient": f"Patient/{patient_id}"})
        except FhirClientError as exc:
            return [], exc.message
        return _resources_from_bundle(response.data, "AllergyIntolerance"), None

    async def search_medication_statements(self, patient_id: str) -> tuple[list[dict], str | None]:
        try:
            response = await self.client.search("MedicationStatement", {"subject": f"Patient/{patient_id}"})
        except FhirClientError as exc:
            return [], exc.message
        return _resources_from_bundle(response.data, "MedicationStatement"), None


def _resources_from_bundle(bundle: dict | None, resource_type: str) -> list[dict]:
    if not bundle or bundle.get("resourceType") != "Bundle":
        return []
    return [
        entry.get("resource")
        for entry in bundle.get("entry") or []
        if entry.get("resource", {}).get("resourceType") == resource_type
    ]
