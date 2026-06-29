from dataclasses import dataclass

from app.schemas.reconcile import ReconcileAnswer, ReconcileClinicalSuggestion, ReconciliationFinding
from app.services.record_fact_mapper import (
    AllergyFact,
    MedicationFact,
    is_active_allergy,
    is_current_medication,
    normalize_medication,
    normalize_text,
)


@dataclass(frozen=True)
class DraftAllergyFact:
    substance: str | None
    reaction: str | None
    negative: bool
    evidence: str | None
    target_kind: str
    target_link_id: str | None = None
    target_clinical_suggestion_index: int | None = None


@dataclass(frozen=True)
class DraftMedicationFact:
    medication: str | None
    negative: bool
    evidence: str | None
    target_kind: str
    target_link_id: str | None = None
    target_clinical_suggestion_index: int | None = None


class ReconciliationAgentService:
    def compare(
        self,
        *,
        answers: list[ReconcileAnswer],
        suggestions: list[ReconcileClinicalSuggestion],
        allergy_facts: list[AllergyFact],
        medication_facts: list[MedicationFact],
    ) -> list[ReconciliationFinding]:
        findings: list[ReconciliationFinding] = []
        findings.extend(self._compare_allergies(_draft_allergy_facts(answers, suggestions), allergy_facts))
        findings.extend(self._compare_medications(_draft_medication_facts(answers, suggestions), medication_facts))
        return findings

    def _compare_allergies(
        self,
        draft_facts: list[DraftAllergyFact],
        existing_facts: list[AllergyFact],
    ) -> list[ReconciliationFinding]:
        findings: list[ReconciliationFinding] = []
        active = [fact for fact in existing_facts if is_active_allergy(fact)]

        for draft in draft_facts:
            if draft.negative:
                if active:
                    refs = [fact.resource_ref for fact in active]
                    findings.append(
                        ReconciliationFinding(
                            classification="contradiction",
                            domain="AllergyIntolerance",
                            targetKind=draft.target_kind,
                            targetLinkId=draft.target_link_id,
                            targetClinicalSuggestionIndex=draft.target_clinical_suggestion_index,
                            severity="warning",
                            summary="Draft says no known allergies, but active allergy records exist.",
                            rationale="This may conflict with active AllergyIntolerance records already on file.",
                            draftEvidence=draft.evidence,
                            existingResourceRefs=refs,
                            recommendation="Worth clarifying before saving.",
                        )
                    )
                continue

            if not draft.substance:
                continue
            normalized = normalize_text(draft.substance)
            matches = [fact for fact in active if _text_matches(normalized, fact.normalized_substance)]
            if matches:
                findings.append(
                    ReconciliationFinding(
                        classification="duplicate",
                        domain="AllergyIntolerance",
                        targetKind=draft.target_kind,
                        targetLinkId=draft.target_link_id,
                        targetClinicalSuggestionIndex=draft.target_clinical_suggestion_index,
                        severity="info",
                        summary=f"{draft.substance} allergy already appears to be recorded.",
                        rationale="A matching active AllergyIntolerance was found in the checked patient record.",
                        draftEvidence=draft.evidence,
                        existingResourceRefs=[fact.resource_ref for fact in matches],
                        recommendation="Review whether the draft adds new detail before saving.",
                    )
                )
            else:
                findings.append(
                    ReconciliationFinding(
                        classification="novel",
                        domain="AllergyIntolerance",
                        targetKind=draft.target_kind,
                        targetLinkId=draft.target_link_id,
                        targetClinicalSuggestionIndex=draft.target_clinical_suggestion_index,
                        severity="info",
                        summary=f"{draft.substance} allergy was not found in checked allergy records.",
                        rationale="No matching AllergyIntolerance was found in the checked records. This does not prove absence.",
                        draftEvidence=draft.evidence,
                        existingResourceRefs=[],
                        recommendation="Review before creating a new AllergyIntolerance.",
                    )
                )
        return findings

    def _compare_medications(
        self,
        draft_facts: list[DraftMedicationFact],
        existing_facts: list[MedicationFact],
    ) -> list[ReconciliationFinding]:
        findings: list[ReconciliationFinding] = []
        current = [fact for fact in existing_facts if is_current_medication(fact)]

        for draft in draft_facts:
            if draft.negative:
                blood_thinner_matches = [fact for fact in current if _is_blood_thinner(fact.normalized_medication)]
                if blood_thinner_matches:
                    findings.append(
                        ReconciliationFinding(
                            classification="contradiction",
                            domain="MedicationStatement",
                            targetKind=draft.target_kind,
                            targetLinkId=draft.target_link_id,
                            targetClinicalSuggestionIndex=draft.target_clinical_suggestion_index,
                            severity="warning",
                            summary="Draft says the patient is not taking blood thinners, but current medication records may indicate one.",
                            rationale="This may conflict with current MedicationStatement records already on file.",
                            draftEvidence=draft.evidence,
                            existingResourceRefs=[fact.resource_ref for fact in blood_thinner_matches],
                            recommendation="Worth clarifying before saving.",
                        )
                    )
                continue

            if not draft.medication:
                continue
            normalized = normalize_medication(draft.medication)
            matches = [fact for fact in current if _text_matches(normalized, fact.normalized_medication)]
            if matches:
                findings.append(
                    ReconciliationFinding(
                        classification="duplicate",
                        domain="MedicationStatement",
                        targetKind=draft.target_kind,
                        targetLinkId=draft.target_link_id,
                        targetClinicalSuggestionIndex=draft.target_clinical_suggestion_index,
                        severity="info",
                        summary=f"{draft.medication} already appears in current medication records.",
                        rationale="A matching MedicationStatement was found in the checked patient record.",
                        draftEvidence=draft.evidence,
                        existingResourceRefs=[fact.resource_ref for fact in matches],
                        recommendation="Review whether the draft adds new detail.",
                    )
                )
            else:
                findings.append(
                    ReconciliationFinding(
                        classification="novel",
                        domain="MedicationStatement",
                        targetKind=draft.target_kind,
                        targetLinkId=draft.target_link_id,
                        targetClinicalSuggestionIndex=draft.target_clinical_suggestion_index,
                        severity="info",
                        summary=f"{draft.medication} was not found in checked medication records.",
                        rationale="No matching MedicationStatement was found in the checked records. This does not prove absence.",
                        draftEvidence=draft.evidence,
                        existingResourceRefs=[],
                        recommendation="Review before using this finding clinically.",
                    )
                )
        return findings


def _draft_allergy_facts(
    answers: list[ReconcileAnswer],
    suggestions: list[ReconcileClinicalSuggestion],
) -> list[DraftAllergyFact]:
    facts: list[DraftAllergyFact] = []

    for index, suggestion in enumerate(suggestions):
        if suggestion.resourceType == "AllergyIntolerance":
            substance = (suggestion.fields.get("substance") or "").strip()
            if substance:
                facts.append(
                    DraftAllergyFact(
                        substance=substance,
                        reaction=(suggestion.fields.get("reaction") or "").strip() or None,
                        negative=False,
                        evidence=suggestion.evidence,
                        target_kind="clinicalSuggestion",
                        target_clinical_suggestion_index=_frontend_index(suggestion, index),
                    )
                )

    for answer in answers:
        if _is_negative_allergy_answer(answer):
            facts.append(
                DraftAllergyFact(
                    substance=None,
                    reaction=None,
                    negative=True,
                    evidence=answer.evidence,
                    target_kind="answer",
                    target_link_id=answer.linkId,
                )
            )
        elif _looks_allergy_related(answer):
            text = _answer_text(answer)
            if text and not _is_negative_phrase(text):
                facts.append(
                    DraftAllergyFact(
                        substance=text,
                        reaction=None,
                        negative=False,
                        evidence=answer.evidence,
                        target_kind="answer",
                        target_link_id=answer.linkId,
                    )
                )

    return _dedupe_allergy_facts(facts)


def _draft_medication_facts(
    answers: list[ReconcileAnswer],
    suggestions: list[ReconcileClinicalSuggestion],
) -> list[DraftMedicationFact]:
    facts: list[DraftMedicationFact] = []

    for index, suggestion in enumerate(suggestions):
        if suggestion.resourceType == "MedicationStatement":
            medication = (suggestion.fields.get("medication") or suggestion.fields.get("name") or "").strip()
            if medication:
                facts.append(
                    DraftMedicationFact(
                        medication=medication,
                        negative=False,
                        evidence=suggestion.evidence,
                        target_kind="clinicalSuggestion",
                        target_clinical_suggestion_index=_frontend_index(suggestion, index),
                    )
                )

    for answer in answers:
        text = _answer_text(answer)
        link_text = answer.linkId.lower()
        combined = f"{link_text} {text.lower() if text else ''}"
        if "blood thinner" in combined and answer.value is False:
            facts.append(
                DraftMedicationFact(
                    medication=None,
                    negative=True,
                    evidence=answer.evidence,
                    target_kind="answer",
                    target_link_id=answer.linkId,
                )
            )
        elif "blood thinner" in combined and text and _is_negative_phrase(text):
            facts.append(
                DraftMedicationFact(
                    medication=None,
                    negative=True,
                    evidence=answer.evidence,
                    target_kind="answer",
                    target_link_id=answer.linkId,
                )
            )
        elif _looks_medication_related(answer) and text:
            for medication in _known_medications_in_text(text):
                facts.append(
                    DraftMedicationFact(
                        medication=medication,
                        negative=False,
                        evidence=answer.evidence,
                        target_kind="answer",
                        target_link_id=answer.linkId,
                    )
                )

    return _dedupe_medication_facts(facts)


def _looks_allergy_related(answer: ReconcileAnswer) -> bool:
    haystack = f"{answer.linkId} {answer.evidence or ''}".lower()
    return "allerg" in haystack or "allergen" in haystack


def _is_negative_allergy_answer(answer: ReconcileAnswer) -> bool:
    haystack = f"{answer.linkId} {answer.evidence or ''} {_answer_text(answer) or ''}".lower()
    if "allerg" not in haystack:
        return False
    return answer.value is False or "no known allerg" in haystack or "no allergies" in haystack


def _looks_medication_related(answer: ReconcileAnswer) -> bool:
    haystack = f"{answer.linkId} {answer.evidence or ''} {_answer_text(answer) or ''}".lower()
    return "medication" in haystack or "blood thinner" in haystack or bool(_known_medications_in_text(haystack))


def _known_medications_in_text(text: str) -> list[str]:
    lower = text.lower()
    medications = []
    for medication in ["warfarin", "coumadin", "eliquis", "apixaban", "aspirin"]:
        if medication in lower:
            medications.append(medication)
    return medications


def _frontend_index(suggestion: ReconcileClinicalSuggestion, fallback: int) -> int:
    try:
        return int(suggestion.fields.get("frontendIndex", fallback))
    except (TypeError, ValueError):
        return fallback


def _answer_text(answer: ReconcileAnswer) -> str | None:
    value = answer.value
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        for key in ("display", "value", "code"):
            if isinstance(value.get(key), str):
                return str(value[key])
    if isinstance(value, bool):
        return "yes" if value else "no"
    if value is not None:
        return str(value)
    return None


def _is_negative_phrase(text: str) -> bool:
    lower = text.lower()
    return any(phrase in lower for phrase in [" no ", "none", "not taking", "no known", "denies"])


def _text_matches(left: str, right: str) -> bool:
    if not left or not right:
        return False
    return left == right or left in right or right in left


def _is_blood_thinner(normalized_medication: str) -> bool:
    return normalized_medication in {"warfarin", "eliquis", "apixaban", "aspirin", "coumadin"}


def _dedupe_allergy_facts(facts: list[DraftAllergyFact]) -> list[DraftAllergyFact]:
    seen: set[tuple[bool, str]] = set()
    deduped: list[DraftAllergyFact] = []
    for fact in facts:
        key = (fact.negative, normalize_text(fact.substance or ""), fact.target_kind, fact.target_link_id or "", fact.target_clinical_suggestion_index or -1)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(fact)
    return deduped


def _dedupe_medication_facts(facts: list[DraftMedicationFact]) -> list[DraftMedicationFact]:
    seen: set[tuple[bool, str]] = set()
    deduped: list[DraftMedicationFact] = []
    for fact in facts:
        key = (fact.negative, normalize_medication(fact.medication or ""), fact.target_kind, fact.target_link_id or "", fact.target_clinical_suggestion_index or -1)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(fact)
    return deduped
