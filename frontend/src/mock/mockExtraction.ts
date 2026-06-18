import type { ChoiceOption, ClinicalSuggestion, ExtractedAnswer, ExtractedValue, Questionnaire, QuestionnaireItem } from "../types";
import { smokingOptions } from "./mockQuestionnaires";
import { flattenAnswerableItems } from "../utils/questionnaireItems";

const lower = (value: string) => value.toLowerCase();

function evidenceFor(transcript: string, needle: string, fallback: string): string {
  const normalized = lower(transcript);
  const index = normalized.indexOf(lower(needle));
  if (index === -1) return fallback;
  const start = Math.max(0, index - 45);
  const end = Math.min(transcript.length, index + needle.length + 70);
  return transcript.slice(start, end).trim();
}

function answer(item: QuestionnaireItem, value: ExtractedValue, confidence: number, evidence: string): ExtractedAnswer {
  return {
    linkId: item.linkId,
    questionText: item.text,
    itemType: item.type,
    value,
    confidence,
    evidence,
    status: confidence >= 0.85 ? "accepted" : "needs-review"
  };
}

function unanswered(item: QuestionnaireItem, evidence = "No clear evidence found in the transcript."): ExtractedAnswer {
  return {
    linkId: item.linkId,
    questionText: item.text,
    itemType: item.type,
    value: null,
    confidence: 0,
    evidence,
    status: "unanswered"
  };
}

function smokingValue(text: string): ChoiceOption | null {
  if (text.includes("quit smoking") || text.includes("former smoker")) {
    return smokingOptions.find((option) => option.display === "Former smoker") ?? null;
  }
  if (text.includes("never smoked") || text.includes("never smoker")) {
    return smokingOptions.find((option) => option.display === "Never smoked") ?? null;
  }
  if (text.includes("current smoker") || text.includes("still smoke")) {
    return smokingOptions.find((option) => option.display === "Current smoker") ?? null;
  }
  return null;
}

function extractPainScore(text: string): number | null {
  const outOfTen = text.match(/(?:pain is|pain.*?about|pain.*?is|rated?)\D{0,16}([0-9]|10)\s*(?:out of 10|\/10)?/i);
  if (outOfTen) return Number(outOfTen[1]);
  return null;
}

export function extractMock(questionnaire: Questionnaire, transcript: string) {
  const text = lower(transcript);
  const hasNoKnownAllergies = text.includes("no known allergies");
  const mentionsPenicillin = text.includes("penicillin");
  const mentionsRash = text.includes("rash");
  const smoking = smokingValue(text);
  const painScore = extractPainScore(transcript);

  const answers: ExtractedAnswer[] = [];
  const unansweredItems: ExtractedAnswer[] = [];

  for (const item of flattenAnswerableItems(questionnaire.items)) {
    let extracted: ExtractedAnswer | null = null;

    if (item.linkId === "allergy-has") {
      if (hasNoKnownAllergies) {
        extracted = answer(item, false, 0.94, evidenceFor(transcript, "No known allergies", "Patient denied known allergies."));
      } else if (mentionsPenicillin) {
        extracted = answer(item, true, 0.93, evidenceFor(transcript, "allergic to penicillin", "Patient reported penicillin allergy."));
      }
    }

    if (item.linkId === "allergy-substance" && mentionsPenicillin && !hasNoKnownAllergies) {
      extracted = answer(item, "Penicillin", 0.94, evidenceFor(transcript, "penicillin", "Patient reported penicillin allergy."));
    }

    if (item.linkId === "allergy-reaction" && mentionsRash && !hasNoKnownAllergies) {
      extracted = answer(item, "Rash", 0.88, evidenceFor(transcript, "rash", "Patient reported rash after medication exposure."));
    }

    if (item.linkId === "smoking-status" && smoking) {
      extracted = answer(item, smoking, 0.9, evidenceFor(transcript, smoking.display, "Patient described smoking history."));
    }

    if (item.linkId === "current-medications") {
      if (text.includes("lisinopril")) {
        extracted = answer(item, "Lisinopril 10 mg daily; vitamin D", 0.88, evidenceFor(transcript, "lisinopril", "Patient listed current medicines."));
      } else if (text.includes("blood pressure")) {
        extracted = answer(item, "Unknown blood pressure medication", 0.52, evidenceFor(transcript, "blood pressure", "Medication mentioned but name was unclear."));
      }
    }

    if (item.linkId === "pain-score" && painScore !== null) {
      extracted = answer(item, painScore, 0.86, evidenceFor(transcript, `${painScore}`, "Patient gave numeric pain score."));
    }

    if (item.linkId === "visit-reason") {
      if (text.includes("dry cough")) {
        extracted = answer(item, "Dry cough and fatigue for about one week", 0.89, evidenceFor(transcript, "dry cough", "Patient described reason for visit."));
      } else if (text.includes("not been feeling right")) {
        extracted = answer(item, "Not feeling right; wants to be checked", 0.62, evidenceFor(transcript, "not been feeling right", "Reason for visit was vague."));
      }
    }

    if (item.linkId === "fever") {
      if (text.includes("no fever")) {
        extracted = answer(item, false, 0.84, evidenceFor(transcript, "no fever", "Patient denied fever."));
      } else if (text.includes("fever")) {
        extracted = answer(item, true, 0.72, evidenceFor(transcript, "fever", "Fever mentioned in transcript."));
      }
    }

    if (extracted) {
      answers.push(extracted);
    } else {
      unansweredItems.push(unanswered(item));
    }
  }

  const clinicalSuggestions: ClinicalSuggestion[] = [];
  if (mentionsPenicillin && !hasNoKnownAllergies) {
    clinicalSuggestions.push({
      id: "suggestion-allergy-penicillin",
      resourceType: "AllergyIntolerance",
      summary: mentionsRash ? "Penicillin allergy with rash reaction" : "Penicillin allergy",
      confidence: mentionsRash ? 0.91 : 0.82,
      evidence: evidenceFor(transcript, "penicillin", "Patient reported penicillin allergy."),
      accepted: false,
      fields: {
        substance: "Penicillin",
        reaction: mentionsRash ? "Rash" : "",
        clinicalStatus: "active",
        verificationStatus: "unconfirmed"
      }
    });
  }

  return {
    answers,
    unanswered: unansweredItems,
    clinicalSuggestions
  };
}
