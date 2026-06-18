import asyncio
import json
from pathlib import Path

from app.config import get_settings
from app.fhir.patient_builder import build_patient_resource
from app.fhir.questionnaire_mapper import derive_slug
from app.services.fhir_client import FhirClient


ROOT = Path(__file__).resolve().parents[2]
SEED_ROOT = ROOT / "fhir-seed"


async def main() -> None:
    settings = get_settings()
    client = FhirClient(settings)

    print("Checking FHIR metadata...")
    metadata = await client.get_metadata()
    version = (metadata.data or {}).get("fhirVersion")
    print(f"FHIR version: {version}")

    print("\nQuestionnaires")
    for path in sorted((SEED_ROOT / "questionnaires").glob("*.json")):
        resource = load_json(path)
        url = resource.get("url")
        if not url:
            print(f"{path.name}: missing url, skipped")
            continue
        slug = derive_slug(url)
        existing = await client.search("Questionnaire", {"url": url})
        matches = resources_from_bundle(existing.data or {}, "Questionnaire")
        if len(matches) == 1:
            print(f"{slug} -> Questionnaire/{matches[0].get('id')}")
        elif len(matches) > 1:
            ids = ", ".join(str(item.get("id")) for item in matches)
            print(f"{slug}: multiple existing Questionnaires matched url {url}: {ids}")
        else:
            created = await client.create("Questionnaire", resource)
            created_resource = created.data or {}
            created_id = created_resource.get("id") or id_from_location(created.headers.get("location"))
            print(f"{slug} -> Questionnaire/{created_id}")

    print("\nPractitioners")
    for path in sorted((SEED_ROOT / "practitioners").glob("*.json")):
        resource = load_json(path)
        identifier = first_identifier_value(resource, settings.fhir_staff_system)
        if not identifier:
            print(f"{path.name}: missing staff identifier, skipped")
            continue
        existing = await client.search("Practitioner", {"identifier": f"{settings.fhir_staff_system}|{identifier}"})
        matches = resources_from_bundle(existing.data or {}, "Practitioner")
        if len(matches) == 1:
            print(f"{identifier} -> Practitioner/{matches[0].get('id')}")
        elif len(matches) > 1:
            ids = ", ".join(str(item.get("id")) for item in matches)
            print(f"{identifier}: multiple existing Practitioners matched: {ids}")
        else:
            created = await client.create("Practitioner", resource)
            created_resource = created.data or {}
            created_id = created_resource.get("id") or id_from_location(created.headers.get("location"))
            print(f"{identifier} -> Practitioner/{created_id}")

    print("\nPatients")
    for path in sorted((SEED_ROOT / "patients").glob("*.json")):
        resource = load_json(path)
        mrn = first_identifier_value(resource, settings.fhir_mrn_system)
        if not mrn:
            print(f"{path.name}: missing MRN, skipped")
            continue
        response = await client.conditional_create(
            "Patient",
            resource,
            f"identifier={settings.fhir_mrn_system}|{mrn}",
        )
        if response.status == 412:
            print(f"{mrn}: multiple existing Patients matched MRN")
            continue
        if response.data and response.data.get("id"):
            print(f"{mrn} -> Patient/{response.data.get('id')}")
            continue
        existing = await client.search("Patient", {"identifier": f"{settings.fhir_mrn_system}|{mrn}"})
        matches = resources_from_bundle(existing.data or {}, "Patient")
        if len(matches) == 1:
            print(f"{mrn} -> Patient/{matches[0].get('id')}")
        elif len(matches) > 1:
            print(f"{mrn}: multiple existing Patients matched MRN")
        else:
            print(f"{mrn}: create completed but Patient id could not be found")


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def resources_from_bundle(bundle: dict, resource_type: str) -> list[dict]:
    return [
        entry.get("resource")
        for entry in bundle.get("entry") or []
        if entry.get("resource", {}).get("resourceType") == resource_type
    ]


def first_identifier_value(resource: dict, system: str) -> str | None:
    for identifier in resource.get("identifier") or []:
        if identifier.get("system") == system and identifier.get("value"):
            return str(identifier["value"])
    return None


def id_from_location(location: str | None) -> str | None:
    if not location:
        return None
    path = location.split("?", 1)[0]
    parts = [part for part in path.split("/") if part]
    return parts[-1] if parts else None


if __name__ == "__main__":
    asyncio.run(main())
