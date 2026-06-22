import type {
  BackendClinicalSuggestion,
  BackendExtractRequest,
  BackendExtractResponse,
  BackendExtractedAnswer,
  ClinicalSuggestion,
  ExtractedAnswer,
  ExtractedValue,
  ExtractionResult,
  Questionnaire,
  QuestionnaireItem
} from "../types";
import { flattenAnswerableItems, manualEntryEvidence } from "../utils/questionnaireItems";
import { isSameChoiceOption, normalizeChoiceOption } from "../utils/choiceOptions";
import { apiPost } from "./http";

export async function extractFromTranscript(params: { questionnaire: Questionnaire; transcript: string }): Promise<ExtractionResult> {
  const payload: BackendExtractRequest = {
    questionnaireId: params.questionnaire.id,
    transcript: params.transcript
  };

  const response = await apiPost<BackendExtractResponse>("/api/extract", payload);
  return mapExtractResponse(response, params.questionnaire);
}

function mapExtractResponse(response: BackendExtractResponse, questionnaire: Questionnaire): ExtractionResult {
  const answerableItems = flattenAnswerableItems(questionnaire.items);
  const itemsByLinkId = new Map(answerableItems.map((item) => [item.linkId, item]));
  const extractedAnswers = response.answers.flatMap((answer) => {
    const item = itemsByLinkId.get(answer.linkId);
    if (!item) return [];
    return [mapAnswer(answer, item)];
  });
  const extractedLinkIds = new Set(extractedAnswers.map((answer) => answer.linkId));
  const unanswered = answerableItems
    .filter((item) => !extractedLinkIds.has(item.linkId))
    .map((item) => unansweredAnswer(item));

  return {
    answers: extractedAnswers,
    unanswered,
    clinicalSuggestions: response.clinicalSuggestions.map(mapClinicalSuggestion)
  };
}

function mapAnswer(answer: BackendExtractedAnswer, item: QuestionnaireItem): ExtractedAnswer {
  return {
    linkId: answer.linkId,
    questionText: item.text,
    itemType: answer.valueType,
    value: normalizeExtractedValue(answer.value, item),
    confidence: answer.confidence,
    evidence: answer.evidence,
    status: "extracted"
  };
}

function unansweredAnswer(item: QuestionnaireItem): ExtractedAnswer {
  return {
    linkId: item.linkId,
    questionText: item.text,
    itemType: item.type,
    value: null,
    confidence: 0,
    evidence: manualEntryEvidence,
    status: "unanswered"
  };
}

function mapClinicalSuggestion(suggestion: BackendClinicalSuggestion, index: number): ClinicalSuggestion {
  return {
    id: `suggestion-${index + 1}-${suggestion.resourceType}`,
    resourceType: suggestion.resourceType,
    source: "ai",
    summary: suggestionSummary(suggestion),
    confidence: suggestion.confidence,
    evidence: suggestion.evidence,
    fields: suggestion.fields,
    accepted: suggestion.accepted
  };
}

function suggestionSummary(suggestion: BackendClinicalSuggestion): string {
  const substance = suggestion.fields.substance?.trim();
  if (substance) {
    return `${suggestion.resourceType}: ${substance}`;
  }
  return `${suggestion.resourceType} suggestion`;
}

function normalizeExtractedValue(value: ExtractedValue, item: QuestionnaireItem): ExtractedValue {
  if (item.type !== "choice") {
    return value;
  }
  const choice = normalizeChoiceOption(value);
  if (!choice) return value;
  return item.options?.find((option) => isSameChoiceOption(option, choice)) ?? choice;
}
