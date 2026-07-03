from datetime import datetime, timezone


def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(microsecond=0)


def iso_utc(value: datetime) -> str:
    return value.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


ENCOUNTER_CLASS_DISPLAY = {
    "AMB": "ambulatory",
    "EMER": "emergency",
    "IMP": "inpatient encounter",
    "OBSENC": "observation encounter",
}


def build_encounter(
    *,
    patient_id: str,
    status: str,
    class_code: str,
    start: datetime,
    reason_text: str | None = None,
) -> dict:
    resource = {
        "resourceType": "Encounter",
        "status": status,
        "class": {
            "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode",
            "code": class_code,
            "display": ENCOUNTER_CLASS_DISPLAY.get(class_code, class_code),
        },
        "subject": {"reference": f"Patient/{patient_id}"},
        "period": {"start": iso_utc(start)},
    }
    if reason_text and reason_text.strip():
        resource["reasonCode"] = [{"text": reason_text.strip()}]
    return resource
