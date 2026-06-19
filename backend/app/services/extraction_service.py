import re
from fastapi import HTTPException

from app.fhir.questionnaire_mapper import questionnaire_items_by_link_id, find_choice_coding
from app.schemas.extract import ExtractRequest, ExtractResponse, ExtractedAnswerCandidate, ClinicalSuggestionCandidate
from app.services.questionnaire_service import QuestionnaireService


class ExtractionService:
    def __init__(self, questionnaire_service: QuestionnaireService) -> None:
        self.questionnaire_service = questionnaire_service

    async def extract(self, request: ExtractRequest) -> ExtractResponse:
        questionnaire = await self.questionnaire_service.read_questionnaire_resource(request.questionnaireId)

        raw_result = self._fake_extract(request.transcript)

        return self._validate_result(raw_result, questionnaire)

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
                prompt_item["options"] = [
                    option.get("valueCoding")
                    for option in item.get("answerOption", [])
                    if option.get("valueCoding")
                ]

            prompt_items.append(prompt_item)

        return prompt_items

    def _fake_extract(self, transcript: str) -> ExtractResponse:
        lower = transcript.lower()

        answers = []
        suggestions = []

        if "penicillin" in lower:
            answers.append(
                ExtractedAnswerCandidate(
                    linkId="allergy-substance",
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
                raise HTTPException(status_code=422, detail=f"Expected FHIR dateTime value for {answer.linkId}.")
            return

        if answer.valueType == "choice":
            if not isinstance(answer.value, dict):
                raise HTTPException(status_code=422, detail=f"Expected choice object for {answer.linkId}.")

            system = answer.value.get("system")
            code = answer.value.get("code")

            if not system or not code:
                raise HTTPException(status_code=422, detail=f"Choice answer requires system and code for {answer.linkId}.")

            if not find_choice_coding(item, str(system), str(code)):
                raise HTTPException(
                    status_code=422,
                    detail=f"Choice answer does not match Questionnaire options for {answer.linkId}.",
                )
            return

        raise HTTPException(status_code=422, detail=f"Unsupported valueType: {answer.valueType}")
    
def _is_fhir_datetime(value: str) -> bool:
    return bool(
        re.fullmatch(
            r"\d{4}(-\d{2}(-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2}))?)?)?",
            value,
        )
    )