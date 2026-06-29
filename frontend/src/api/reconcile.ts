import type {
  ClinicalSuggestion,
  ExtractedAnswer,
  PatientSummary,
  Questionnaire,
  ReconcileClinicalSuggestionRequest,
  ReconcileRequest,
  ReconcileResponse,
  ReviewedAnswerValueType
} from "../types";
import { hasAnswerValue } from "../utils/questionnaireItems";
import { normalizeChoiceOption } from "../utils/choiceOptions";
import { normalizeFhirDateTime } from "../utils/fhirDateTime";
import { apiPost } from "./http";

export async function reconcileDraft(params: {
  patient: PatientSummary;
  questionnaire: Questionnaire;
  answers: ExtractedAnswer[];
  clinicalSuggestions: ClinicalSuggestion[];
}): Promise<ReconcileResponse> {
  return apiPost<ReconcileResponse>("/api/reconcile", buildReconcileRequest(params));
}

function buildReconcileRequest(params: {
  patient: PatientSummary;
  questionnaire: Questionnaire;
  answers: ExtractedAnswer[];
  clinicalSuggestions: ClinicalSuggestion[];
}): ReconcileRequest {
  return {
    patientId: params.patient.id,
    questionnaireId: params.questionnaire.id,
    answers: params.answers.flatMap(toReconcileAnswerRequest),
    clinicalSuggestions: params.clinicalSuggestions.flatMap(toReconcileClinicalSuggestionRequest)
  };
}

function toReconcileAnswerRequest(answer: ExtractedAnswer): ReconcileRequest["answers"] {
  if (!hasAnswerValue(answer.value) || answer.itemType === "group") {
    return [];
  }

  const value = normalizedAnswerValue(answer);
  if (value === undefined) {
    return [];
  }

  return [
    {
      linkId: answer.linkId,
      valueType: answer.itemType as ReviewedAnswerValueType,
      value,
      confidence: answer.confidence,
      evidence: answer.evidence
    }
  ];
}

function toReconcileClinicalSuggestionRequest(suggestion: ClinicalSuggestion, index: number): ReconcileClinicalSuggestionRequest[] {
  if (suggestion.resourceType !== "AllergyIntolerance" && suggestion.resourceType !== "MedicationStatement") {
    return [];
  }

  return [
    {
      resourceType: suggestion.resourceType,
      accepted: suggestion.accepted,
      confidence: suggestion.confidence,
      evidence: suggestion.evidence,
      fields: {
        ...suggestion.fields,
        frontendIndex: String(index)
      }
    }
  ];
}

function normalizedAnswerValue(answer: ExtractedAnswer): unknown {
  if (answer.itemType === "dateTime" && typeof answer.value === "string") {
    return normalizeFhirDateTime(answer.value);
  }
  if (answer.itemType === "string" || answer.itemType === "text" || answer.itemType === "date") {
    return typeof answer.value === "string" ? answer.value : undefined;
  }
  if (answer.itemType === "integer") {
    return typeof answer.value === "number" ? answer.value : undefined;
  }
  if (answer.itemType === "boolean") {
    return typeof answer.value === "boolean" ? answer.value : undefined;
  }
  if (answer.itemType === "choice") {
    const choice = normalizeChoiceOption(answer.value);
    if (choice?.fhirValueType === "valueCoding") {
      return {
        fhirValueType: "valueCoding",
        system: choice.system,
        code: choice.code,
        display: choice.display
      };
    }
    if (choice?.fhirValueType === "valueString") {
      return {
        fhirValueType: "valueString",
        value: choice.value,
        display: choice.display
      };
    }
  }

  return undefined;
}
