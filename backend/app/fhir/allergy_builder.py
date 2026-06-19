def build_allergy_intolerance(
    *,
    patient_id: str,
    practitioner_id: str,
    encounter_reference: str,
    substance: str,
    reaction: str | None = None,
) -> dict:
    resource = {
        "resourceType": "AllergyIntolerance",
        "clinicalStatus": {
            "coding": [
                {
                    "system": "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical",
                    "code": "active",
                }
            ]
        },
        "verificationStatus": {
            "coding": [
                {
                    "system": "http://terminology.hl7.org/CodeSystem/allergyintolerance-verification",
                    "code": "unconfirmed",
                }
            ]
        },
        "code": {"text": substance},
        "patient": {"reference": f"Patient/{patient_id}"},
        "encounter": {"reference": encounter_reference},
        "recorder": {"reference": f"Practitioner/{practitioner_id}"},
    }
    if reaction and reaction.strip():
        resource["reaction"] = [{"manifestation": [{"text": reaction.strip()}]}]
    return resource
