from datetime import datetime, timedelta, timezone


def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(microsecond=0)


def iso_utc(value: datetime) -> str:
    return value.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def build_encounter(*, patient_id: str, start: datetime, end: datetime | None = None) -> dict:
    actual_end = end or utc_now()
    if actual_end <= start:
        actual_end = start + timedelta(seconds=1)

    return {
        "resourceType": "Encounter",
        "status": "finished",
        "class": {
            "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode",
            "code": "AMB",
            "display": "ambulatory",
        },
        "subject": {"reference": f"Patient/{patient_id}"},
        "period": {"start": iso_utc(start), "end": iso_utc(actual_end)},
    }
