from app.schemas.patients import PatientSummary


def build_patient_resource(*, mrn_system: str, mrn: str, given: list[str], family: str, gender: str, birth_date: str) -> dict:
    return {
        "resourceType": "Patient",
        "identifier": [{"system": mrn_system, "value": mrn}],
        "name": [{"given": given, "family": family}],
        "gender": gender,
        "birthDate": birth_date,
    }


def flatten_patient(resource: dict, mrn_system: str) -> PatientSummary:
    patient_id = resource.get("id")
    if not patient_id:
        raise ValueError("FHIR Patient is missing id.")

    return PatientSummary(
        id=str(patient_id),
        mrn=_extract_mrn(resource, mrn_system),
        name=_flatten_name(resource),
        gender=resource.get("gender"),
        birthDate=resource.get("birthDate"),
    )


def _extract_mrn(resource: dict, mrn_system: str) -> str | None:
    for identifier in resource.get("identifier") or []:
        if identifier.get("system") == mrn_system and identifier.get("value"):
            return str(identifier["value"])
    for identifier in resource.get("identifier") or []:
        if identifier.get("value"):
            return str(identifier["value"])
    return None


def _flatten_name(resource: dict) -> str:
    names = resource.get("name") or []
    for name in names:
        if name.get("text"):
            return str(name["text"])

    preferred = next((name for name in names if name.get("use") in {"official", "usual"}), None)
    selected = preferred or (names[0] if names else None)
    if selected:
        parts = [*(selected.get("given") or []), selected.get("family")]
        text = " ".join(str(part).strip() for part in parts if part)
        if text:
            return text
    return "Unnamed Patient"
