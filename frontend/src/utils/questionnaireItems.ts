import type { ExtractedValue, ExtractionResult, Questionnaire, QuestionnaireItem } from "../types";

export const manualEntryEvidence = "Manual entry required. Automated extraction is deferred.";

export function hasAnswerValue(value: ExtractedValue) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

export function flattenAnswerableItems(items: QuestionnaireItem[]): QuestionnaireItem[] {
  return items.flatMap((item) => {
    if (item.type === "group") {
      return flattenAnswerableItems(item.items ?? []);
    }
    return [item];
  });
}

export function countGroups(items: QuestionnaireItem[]): number {
  return items.reduce((total, item) => {
    if (item.type !== "group") return total;
    return total + 1 + countGroups(item.items ?? []);
  }, 0);
}

export function buildManualReviewResult(questionnaire: Questionnaire): ExtractionResult {
  return {
    answers: [],
    unanswered: flattenAnswerableItems(questionnaire.items).map((item) => ({
      linkId: item.linkId,
      questionText: item.text,
      itemType: item.type,
      value: null,
      confidence: 0,
      evidence: manualEntryEvidence,
      status: "unanswered"
    })),
    clinicalSuggestions: []
  };
}
