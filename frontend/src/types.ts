export type Gender = "female" | "male" | "other" | "unknown";

export interface PatientSummary {
  id: string;
  mrn: string;
  name: string;
  gender: Gender;
  birthDate: string;
}

export interface FhirPatient {
  resourceType: "Patient";
  id: string;
  identifier: Array<{
    system: string;
    value: string;
  }>;
  name: Array<{
    use?: string;
    family?: string;
    given?: string[];
    text?: string;
  }>;
  gender: Gender;
  birthDate: string;
}

export interface FhirCoding {
  system: string;
  code: string;
  display?: string;
}

export type FhirAnswerOption = { valueCoding: FhirCoding } | { valueString: string };

export interface FhirQuestionnaireItem {
  linkId: string;
  text: string;
  type: QuestionnaireItemType;
  required?: boolean;
  answerOption?: FhirAnswerOption[];
  item?: FhirQuestionnaireItem[];
}

export interface FhirQuestionnaire {
  resourceType: "Questionnaire";
  id: string;
  url: string;
  version: string;
  title: string;
  description: string;
  status: "draft" | "active" | "retired";
  item: FhirQuestionnaireItem[];
}

export type FhirSearchResource = FhirPatient | FhirQuestionnaire;

export interface FhirBundleEntry {
  fullUrl: string;
  resource: FhirSearchResource;
  search: {
    mode: "match";
  };
}

export interface FhirBundle {
  resourceType: "Bundle";
  type: "searchset";
  total: number;
  link: Array<{
    relation: "self";
    url: string;
  }>;
  entry?: FhirBundleEntry[];
}

export interface PatientQueryResult {
  requestUrl: string;
  status: number;
  statusText: string;
  bundle: FhirBundle;
  patients: PatientSummary[];
  error?: string;
}

export interface QuestionnaireQueryResult {
  requestUrl: string;
  status: number;
  statusText: string;
  bundle: FhirBundle;
  questionnaires: QuestionnaireSummary[];
  error?: string;
}

export interface IntakeSummary {
  id: string;
  questionnaireResponseId: string;
  patientId?: string | null;
  patientName?: string | null;
  patientMrn?: string | null;
  questionnaire?: string | null;
  questionnaireTitle?: string | null;
  authored?: string | null;
  status: string;
}

export interface IntakeQueryResult {
  requestUrl: string;
  status: number;
  statusText: string;
  intakes: IntakeSummary[];
  bundle?: Record<string, unknown> | null;
  error?: string;
}

export type FhirQuestionnaireResponseAnswer =
  | { valueString: string }
  | { valueBoolean: boolean }
  | { valueInteger: number }
  | { valueDate: string }
  | { valueDateTime: string }
  | { valueCoding: FhirCoding };

export interface FhirQuestionnaireResponseItem {
  linkId: string;
  text: string;
  answer: FhirQuestionnaireResponseAnswer[];
}

export interface FhirQuestionnaireResponse {
  resourceType: "QuestionnaireResponse";
  status: "in-progress" | "completed";
  questionnaire: string;
  subject: {
    reference: string;
    display: string;
  };
  authored: string;
  item: FhirQuestionnaireResponseItem[];
}

export interface QuestionnaireResponsePreviewResult {
  requestUrl: string;
  method: "POST";
  statusText: "Preview only";
  answeredItemCount: number;
  resource: FhirQuestionnaireResponse;
}

export interface CreatePatientInput {
  mrn: string;
  givenName: string;
  familyName: string;
  gender: Gender;
  birthDate: string;
}

export type QuestionnaireItemType = "string" | "text" | "boolean" | "choice" | "integer" | "date" | "dateTime" | "group";

export interface CodedChoiceOption {
  fhirValueType: "valueCoding";
  system: string;
  code: string;
  display: string;
}

export interface StringChoiceOption {
  fhirValueType: "valueString";
  value: string;
  display: string;
}

export type ChoiceOption = CodedChoiceOption | StringChoiceOption;

export interface QuestionnaireItem {
  linkId: string;
  text: string;
  type: QuestionnaireItemType;
  required?: boolean;
  options?: ChoiceOption[];
  items?: QuestionnaireItem[];
}

export interface QuestionnaireSummary {
  id: string;
  url: string;
  version: string;
  title: string;
  description: string;
  status: "draft" | "active" | "retired";
  itemCount: number;
}

export interface Questionnaire extends Omit<QuestionnaireSummary, "itemCount"> {
  items: QuestionnaireItem[];
}

export interface BackendExtractRequest {
  questionnaireId: string;
  transcript: string;
}

export interface BackendExtractedAnswer {
  linkId: string;
  valueType: ReviewedAnswerValueType;
  value: ExtractedValue;
  confidence: number;
  evidence: string;
  status: "suggested";
}

export interface BackendClinicalSuggestion {
  resourceType: "AllergyIntolerance";
  accepted: false;
  confidence: number;
  evidence: string;
  fields: Record<string, string>;
}

export interface BackendExtractResponse {
  answers: BackendExtractedAnswer[];
  clinicalSuggestions: BackendClinicalSuggestion[];
}

export type ReviewStatus = "extracted" | "edited" | "unanswered";

export type ExtractedValue = string | number | boolean | ChoiceOption | null;

export interface ExtractedAnswer {
  linkId: string;
  questionText: string;
  itemType: QuestionnaireItemType;
  value: ExtractedValue;
  confidence: number;
  evidence: string;
  status: ReviewStatus;
}

export interface ClinicalSuggestion {
  id: string;
  resourceType: "AllergyIntolerance" | "Condition" | "MedicationStatement";
  source?: "ai" | "manual";
  summary: string;
  confidence: number;
  evidence: string;
  fields: Record<string, string>;
  accepted: boolean;
}

export interface ExtractionResult {
  answers: ExtractedAnswer[];
  unanswered: ExtractedAnswer[];
  clinicalSuggestions: ClinicalSuggestion[];
}

export interface SavePayload {
  patientId: string;
  questionnaireId: string;
  answers: ExtractedAnswer[];
  clinicalSuggestions: ClinicalSuggestion[];
}

export interface CreatedResource {
  resourceType: string;
  id: string;
}

export type ReviewedAnswerValueType = Exclude<QuestionnaireItemType, "group">;

export interface ReviewedAnswerRequest {
  linkId: string;
  valueType: ReviewedAnswerValueType;
  value: unknown;
}

export interface AcceptedSuggestionRequest {
  type: "AllergyIntolerance";
  fields: Record<string, string>;
}

export interface BackendSaveRequest {
  patientId: string;
  practitionerId: string;
  questionnaireId: string;
  answers: ReviewedAnswerRequest[];
  acceptedSuggestions: AcceptedSuggestionRequest[];
}

export interface BackendSaveResponse {
  requestUrl: string;
  status: number;
  statusText: string;
  transactionBundle: Record<string, unknown>;
  responseBundle: Record<string, unknown>;
  encounterId: string;
  questionnaireResponseId: string;
  createdResources: CreatedResource[];
}

export type SaveResult = BackendSaveResponse;

export interface SampleTranscript {
  id: string;
  label: string;
  questionnaireId?: string;
  transcript: string;
}
