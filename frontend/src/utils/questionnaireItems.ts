import type { ExtractionResult, Questionnaire, QuestionnaireItem } from "../types";

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
      evidence: "Manual entry required. Automated extraction is deferred.",
      status: "unanswered"
    })),
    clinicalSuggestions: []
  };
}
