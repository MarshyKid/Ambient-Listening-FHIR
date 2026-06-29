from dataclasses import dataclass
import re


@dataclass(frozen=True)
class AllergyFact:
    substance: str
    normalized_substance: str
    clinical_status: str | None
    verification_status: str | None
    reaction: str | None
    resource_ref: str


@dataclass(frozen=True)
class MedicationFact:
    medication: str
    normalized_medication: str
    status: str | None
    resource_ref: str


def allergy_fact(resource: dict) -> AllergyFact | None:
    resource_id = resource.get("id")
    substance = _code_text(resource.get("code"))
    if not resource_id or not substance:
        return None

    return AllergyFact(
        substance=substance,
        normalized_substance=normalize_text(substance),
        clinical_status=_first_coding_code(resource.get("clinicalStatus")),
        verification_status=_first_coding_code(resource.get("verificationStatus")),
        reaction=_reaction_text(resource),
        resource_ref=f"AllergyIntolerance/{resource_id}",
    )


def medication_fact(resource: dict) -> MedicationFact | None:
    resource_id = resource.get("id")
    medication = _code_text(resource.get("medicationCodeableConcept")) or _reference_display(resource.get("medicationReference"))
    if not resource_id or not medication:
        return None

    return MedicationFact(
        medication=medication,
        normalized_medication=normalize_medication(medication),
        status=str(resource.get("status")) if resource.get("status") else None,
        resource_ref=f"MedicationStatement/{resource_id}",
    )


def is_active_allergy(fact: AllergyFact) -> bool:
    if not fact.clinical_status:
        return True
    return fact.clinical_status.lower() == "active"


def is_current_medication(fact: MedicationFact) -> bool:
    if not fact.status:
        return True
    return fact.status.lower() in {"active", "intended", "unknown", "on-hold"}


def normalize_text(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


def normalize_medication(value: str) -> str:
    normalized = normalize_text(value)
    aliases = {
        "coumadin": "warfarin",
        "warfarin sodium": "warfarin",
        "apixaban": "eliquis",
        "acetylsalicylic acid": "aspirin",
        "asa": "aspirin",
    }
    return aliases.get(normalized, normalized)


def _code_text(value: object) -> str | None:
    if not isinstance(value, dict):
        return None
    text = value.get("text")
    if isinstance(text, str) and text.strip():
        return text.strip()
    for coding in value.get("coding") or []:
        if not isinstance(coding, dict):
            continue
        display = coding.get("display")
        code = coding.get("code")
        if isinstance(display, str) and display.strip():
            return display.strip()
        if isinstance(code, str) and code.strip():
            return code.strip()
    return None


def _reference_display(value: object) -> str | None:
    if not isinstance(value, dict):
        return None
    display = value.get("display")
    return display.strip() if isinstance(display, str) and display.strip() else None


def _first_coding_code(value: object) -> str | None:
    if not isinstance(value, dict):
        return None
    for coding in value.get("coding") or []:
        if isinstance(coding, dict) and isinstance(coding.get("code"), str):
            return str(coding["code"])
    return None


def _reaction_text(resource: dict) -> str | None:
    reactions: list[str] = []
    for reaction in resource.get("reaction") or []:
        if not isinstance(reaction, dict):
            continue
        for manifestation in reaction.get("manifestation") or []:
            if isinstance(manifestation, dict) and isinstance(manifestation.get("text"), str):
                reactions.append(manifestation["text"])
    return ", ".join(reactions) if reactions else None
