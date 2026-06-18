from dataclasses import dataclass


@dataclass(frozen=True)
class ResolvedPractitioner:
    id: str
    resource: dict


def map_practitioner(resource: dict) -> ResolvedPractitioner:
    practitioner_id = resource.get("id")
    if not practitioner_id:
        raise ValueError("FHIR Practitioner is missing id.")
    return ResolvedPractitioner(id=str(practitioner_id), resource=resource)
