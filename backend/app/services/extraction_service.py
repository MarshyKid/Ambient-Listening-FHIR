from datetime import datetime
import re
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException

from app.config import Settings
from app.fhir.questionnaire_mapper import find_choice_answer, questionnaire_items_by_link_id
from app.schemas.extract import ExtractRequest, ExtractResponse, ExtractedAnswerCandidate, ClinicalSuggestionCandidate
from app.services.questionnaire_service import QuestionnaireService
from app.services.llm_service import LlmService

FHIR_DATETIME_PATTERN = re.compile(
    r"^\d{4}-\d{2}-\d{2}"
    r"T\d{2}:\d{2}:\d{2}"
    r"(?:\.\d+)?"
    r"(?:Z|[+-]\d{2}:\d{2})$"
)
LOCAL_COMPLETE_DATETIME_PATTERN = re.compile(
    r"^\d{4}-\d{2}-\d{2}"
    r"T\d{2}:\d{2}:\d{2}"
    r"(?:\.\d+)?$"
)


class ExtractionService:
    def __init__(self, questionnaire_service: QuestionnaireService, llm_service: LlmService, settings: Settings) -> None:
        self.questionnaire_service = questionnaire_service
        self.llm_service = llm_service
        self.settings = settings

    async def extract(self, request: ExtractRequest) -> ExtractResponse:
        questionnaire = await self.questionnaire_service.read_questionnaire_resource(request.questionnaireId)
        questionnaire_items = ExtractionService.questionnaire_prompt_items(questionnaire)

        raw_llm_json = await self.llm_service.extract_answers(
            transcript = request.transcript,
            questionnaire_items=questionnaire_items
        )
        parsed = ExtractResponse.model_validate(raw_llm_json)
        normalized = self._normalize_datetime_answers(parsed)
        validated = self._validate_result(normalized, questionnaire)

        return validated

    def questionnaire_prompt_items(questionnaire: dict) -> list[dict]:
        items_by_link_id = questionnaire_items_by_link_id(questionnaire)
        prompt_items = []

        for link_id, item in items_by_link_id.items():
            if item.get("type") == "group":
                continue

            prompt_item = {
                "linkId": link_id,
                "text": item.get("text", link_id),
                "type": item.get("type"),
            }

            if item.get("answerOption"):
                prompt_item["options"] = _choice_prompt_options(item)

            prompt_items.append(prompt_item)

        return prompt_items

    def _fake_extract(self, transcript: str) -> ExtractResponse:
        lower = transcript.lower()

        answers = []
        suggestions = []

        if "penicillin" in lower:
            answers.append(
                ExtractedAnswerCandidate(
                    linkId="2.1",
                    valueType="string",
                    value="Penicillin",
                    confidence=0.9,
                    evidence="Transcript mentions penicillin.",
                )
            )
            suggestions.append(
                ClinicalSuggestionCandidate(
                    resourceType="AllergyIntolerance",
                    accepted=False,
                    confidence=0.9,
                    evidence="Transcript mentions penicillin allergy.",
                    fields={"substance": "Penicillin", "reaction": "rash" if "rash" in lower else ""},
                )
            )

        return ExtractResponse(answers=answers, clinicalSuggestions=suggestions)

    def _normalize_datetime_answers(self, result: ExtractResponse) -> ExtractResponse:
        normalized_answers: list[ExtractedAnswerCandidate] = []
        for answer in result.answers:
            if answer.valueType == "dateTime" and isinstance(answer.value, str):
                try:
                    normalized_value = normalize_fhir_datetime(
                        answer.value,
                        default_timezone=self.settings.default_clinical_timezone,
                    )
                except ValueError as exc:
                    raise HTTPException(status_code=500, detail=str(exc)) from exc
                normalized_answers.append(answer.model_copy(update={"value": normalized_value}))
            else:
                normalized_answers.append(answer)
        return result.model_copy(update={"answers": normalized_answers})

    def _validate_result(self, result: ExtractResponse, questionnaire: dict) -> ExtractResponse:
        items_by_link_id = questionnaire_items_by_link_id(questionnaire)

        for answer in result.answers:
            item = items_by_link_id.get(answer.linkId)
            if item is None:
                raise HTTPException(status_code=422, detail=f"LLM returned unknown linkId: {answer.linkId}")

            item_type = item.get("type")
            if item_type == "group":
                raise HTTPException(status_code=422, detail=f"LLM returned group linkId: {answer.linkId}")

            if answer.valueType != item_type:
                raise HTTPException(
                    status_code=422,
                    detail=f"LLM valueType mismatch for {answer.linkId}: expected {item_type}, got {answer.valueType}",
                )
            
            self._validate_answer_value(answer, item)

        return result
    
    def _validate_answer_value(self, answer: ExtractedAnswerCandidate, item: dict) -> None:
        if answer.valueType in {"string", "text"}:
            if not isinstance(answer.value, str):
                raise HTTPException(status_code=422, detail=f"Expected string value for {answer.linkId}.")
            return

        if answer.valueType == "boolean":
            if not isinstance(answer.value, bool):
                raise HTTPException(status_code=422, detail=f"Expected boolean value for {answer.linkId}.")
            return

        if answer.valueType == "integer":
            if not isinstance(answer.value, int) or isinstance(answer.value, bool):
                raise HTTPException(status_code=422, detail=f"Expected integer value for {answer.linkId}.")
            return

        if answer.valueType == "date":
            if not isinstance(answer.value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", answer.value):
                raise HTTPException(status_code=422, detail=f"Expected FHIR date value for {answer.linkId}.")
            return

        if answer.valueType == "dateTime":
            if not isinstance(answer.value, str) or not _is_fhir_datetime(answer.value):
                raise HTTPException(
                    status_code=422,
                    detail=(
                        f"Expected FHIR dateTime for {answer.linkId}, including seconds "
                        "and timezone, for example 2026-06-22T02:15:00+08:00."
                    ),
                )
            return

        if answer.valueType == "choice":
            if not isinstance(answer.value, dict):
                raise HTTPException(status_code=422, detail=f"Expected choice object for {answer.linkId}.")

            if not find_choice_answer(item, answer.value):
                raise HTTPException(
                    status_code=422,
                    detail=f"Choice answer does not match Questionnaire options for {answer.linkId}.",
                )
            return

        raise HTTPException(status_code=422, detail=f"Unsupported valueType: {answer.valueType}")
    
def _is_fhir_datetime(value: str) -> bool:
    return bool(FHIR_DATETIME_PATTERN.fullmatch(value))


def normalize_fhir_datetime(value: str, *, default_timezone: str) -> str:
    if _is_fhir_datetime(value):
        parsed = _parse_datetime(value)
        return _format_datetime(parsed, use_z=value.endswith("Z"))

    if LOCAL_COMPLETE_DATETIME_PATTERN.fullmatch(value):
        try:
            timezone = ZoneInfo(default_timezone)
        except ZoneInfoNotFoundError as exc:
            raise ValueError(f"DEFAULT_CLINICAL_TIMEZONE is not a valid IANA timezone: {default_timezone}") from exc
        try:
            parsed = datetime.fromisoformat(value).replace(tzinfo=timezone)
        except ValueError:
            return value
        return _format_datetime(parsed, use_z=False)

    return value


def _parse_datetime(value: str) -> datetime:
    normalized = value.replace("Z", "+00:00")
    return datetime.fromisoformat(normalized)


def _format_datetime(value: datetime, *, use_z: bool) -> str:
    timespec = "milliseconds" if value.microsecond else "seconds"
    formatted = value.isoformat(timespec=timespec)
    if use_z and formatted.endswith("+00:00"):
        return f"{formatted[:-6]}Z"
    return formatted


def _choice_prompt_options(item: dict) -> list[dict]:
    options: list[dict] = []
    for option in item.get("answerOption") or []:
        if option.get("valueCoding"):
            coding = option["valueCoding"]
            options.append(
                {
                    "fhirValueType": "valueCoding",
                    "system": coding.get("system"),
                    "code": coding.get("code"),
                    "display": coding.get("display") or coding.get("code"),
                }
            )
        elif "valueString" in option:
            value = str(option["valueString"])
            options.append({"fhirValueType": "valueString", "value": value, "display": value})
        elif "valueInteger" in option:
            raise HTTPException(status_code=422, detail="Unsupported Questionnaire answerOption type for Phase 1/2: valueInteger")
        elif "valueDate" in option:
            raise HTTPException(status_code=422, detail="Unsupported Questionnaire answerOption type for Phase 1/2: valueDate")
    return options
