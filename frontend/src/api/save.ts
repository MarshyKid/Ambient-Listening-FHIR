import type {
  AcceptedSuggestionRequest,
  BackendSaveRequest,
  BackendSaveResponse,
  ChoiceOption,
  ClinicalSuggestion,
  ExtractedAnswer,
  PatientSummary,
  Questionnaire,
  ReviewedAnswerRequest,
  ReviewedAnswerValueType
} from "../types";
import { hasAnswerValue } from "../utils/questionnaireItems";
import { apiBaseUrl, defaultPractitionerIdentifier } from "./config";

export class BackendApiError extends Error {
  status: number;
  statusText: string;
  raw: unknown;

  constructor(message: string, status: number, statusText: string, raw: unknown) {
    super(message);
    this.name = "BackendApiError";
    this.status = status;
    this.statusText = statusText;
    this.raw = raw;
  }
}

export function buildBackendSaveRequest(params: {
  patient: PatientSummary;
  questionnaire: Questionnaire;
  answers: ExtractedAnswer[];
  clinicalSuggestions: ClinicalSuggestion[];
}): BackendSaveRequest {
  return {
    patientId: params.patient.id,
    practitionerId: defaultPractitionerIdentifier,
    questionnaireId: params.questionnaire.id,
    answers: params.answers.flatMap(toReviewedAnswerRequest),
    acceptedSuggestions: params.clinicalSuggestions.flatMap(toAcceptedSuggestionRequest)
  };
}

export async function saveToBackend(payload: BackendSaveRequest): Promise<BackendSaveResponse> {
  const response = await fetch(`${apiBaseUrl}/api/save`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const data = await parseResponseBody(response);

  if (!response.ok) {
    throw new BackendApiError(errorMessage(data, response), response.status, response.statusText, data);
  }

  return data as BackendSaveResponse;
}

function toReviewedAnswerRequest(answer: ExtractedAnswer): ReviewedAnswerRequest[] {
  if (!hasAnswerValue(answer.value) || answer.itemType === "group") {
    return [];
  }

  const valueType = answer.itemType as ReviewedAnswerValueType;
  const value = normalizedAnswerValue(answer);
  if (value === undefined) {
    throw new Error(`Cannot save answer for ${answer.linkId}: value does not match ${answer.itemType}.`);
  }

  return [
    {
      linkId: answer.linkId,
      valueType,
      value
    }
  ];
}

function normalizedAnswerValue(answer: ExtractedAnswer): unknown {
  if (answer.itemType === "string" || answer.itemType === "text" || answer.itemType === "date" || answer.itemType === "dateTime") {
    return typeof answer.value === "string" ? answer.value : undefined;
  }
  if (answer.itemType === "integer") {
    return typeof answer.value === "number" ? answer.value : undefined;
  }
  if (answer.itemType === "boolean") {
    return typeof answer.value === "boolean" ? answer.value : undefined;
  }
  if (answer.itemType === "choice") {
    if (isChoice(answer.value)) {
      return {
        system: answer.value.system,
        code: answer.value.code
      };
    }
    return undefined;
  }
  return undefined;
}

function toAcceptedSuggestionRequest(suggestion: ClinicalSuggestion): AcceptedSuggestionRequest[] {
  if (!suggestion.accepted || suggestion.resourceType !== "AllergyIntolerance") {
    return [];
  }
  return [
    {
      type: "AllergyIntolerance",
      fields: suggestion.fields
    }
  ];
}

function isChoice(value: unknown): value is ChoiceOption {
  return Boolean(value && typeof value === "object" && "system" in value && "code" in value);
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function errorMessage(data: unknown, response: Response): string {
  const detail = unwrapDetail(data);
  if (detail && typeof detail === "object") {
    const record = detail as Record<string, unknown>;
    if (typeof record.error === "string") return record.error;
    if (typeof record.message === "string") return record.message;
    if (typeof record.status === "number" && typeof record.statusText === "string") {
      return `${record.status} ${record.statusText}`;
    }
  }
  if (typeof detail === "string") return detail;
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    if (typeof record.error === "string") return record.error;
    if (typeof record.message === "string") return record.message;
  }
  return `${response.status} ${response.statusText}`;
}

function unwrapDetail(data: unknown): unknown {
  if (data && typeof data === "object" && "detail" in data) {
    return (data as Record<string, unknown>).detail;
  }
  return data;
}
