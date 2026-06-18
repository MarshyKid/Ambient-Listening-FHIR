import type {
  CreatePatientInput,
  FhirBundle,
  FhirPatient,
  FhirQuestionnaire,
  FhirQuestionnaireResponseAnswer,
  FhirSearchResource,
  ExtractedAnswer,
  ExtractionResult,
  PatientQueryResult,
  PatientSummary,
  Questionnaire,
  QuestionnaireResponsePreviewResult,
  QuestionnaireQueryResult,
  QuestionnaireSummary,
  SampleTranscript,
  SavePayload,
  SaveResult
} from "../types";
import { extractMock } from "./mockExtraction";
import { mockPatients } from "./mockPatients";
import { mockQuestionnaires } from "./mockQuestionnaires";
import { mockTranscripts } from "./mockTranscripts";

let patients: PatientSummary[] = [...mockPatients];
let patientCounter = patients.length + 1;
let saveCounter = 1;

const delay = <T>(value: T, ms = 350): Promise<T> =>
  new Promise((resolve) => {
    window.setTimeout(() => resolve(value), ms);
  });

const fhirBaseUrl = "http://localhost:8080/csp/healthshare/demo/fhir/r4";
const mrnSystem = "http://hospital.example.org/mrn";

function splitName(name: string) {
  const parts = name.trim().split(/\s+/);
  const family = parts.length > 1 ? parts[parts.length - 1] : "";
  const given = family ? parts.slice(0, -1) : parts;
  return { given, family };
}

function toFhirPatient(patient: PatientSummary): FhirPatient {
  const { given, family } = splitName(patient.name);

  return {
    resourceType: "Patient",
    id: patient.id,
    identifier: [
      {
        system: mrnSystem,
        value: patient.mrn
      }
    ],
    name: [
      {
        use: "official",
        family,
        given,
        text: patient.name
      }
    ],
    gender: patient.gender,
    birthDate: patient.birthDate
  };
}

function toPatientSummary(resource: FhirPatient): PatientSummary {
  return {
    id: resource.id,
    mrn: resource.identifier[0]?.value ?? "",
    name: resource.name[0]?.text ?? [...(resource.name[0]?.given ?? []), resource.name[0]?.family].filter(Boolean).join(" "),
    gender: resource.gender,
    birthDate: resource.birthDate
  };
}

function makeBundle(requestUrl: string, resources: FhirSearchResource[]): FhirBundle {
  return {
    resourceType: "Bundle",
    type: "searchset",
    total: resources.length,
    link: [
      {
        relation: "self",
        url: requestUrl
      }
    ],
    entry: resources.map((resource) => ({
      fullUrl: `${fhirBaseUrl}/${resource.resourceType}/${resource.id}`,
      resource,
      search: {
        mode: "match"
      }
    }))
  };
}

function toFhirQuestionnaire(questionnaire: Questionnaire): FhirQuestionnaire {
  return {
    resourceType: "Questionnaire",
    id: questionnaire.id,
    url: questionnaire.url,
    version: questionnaire.version,
    title: questionnaire.title,
    description: questionnaire.description,
    status: questionnaire.status,
    item: questionnaire.items.map((item) => ({
      linkId: item.linkId,
      text: item.text,
      type: item.type,
      required: item.required,
      answerOption: item.options?.map((option) => ({
        valueCoding: {
          system: option.system,
          code: option.code,
          display: option.display
        }
      }))
    }))
  };
}

function toQuestionnaireSummary(resource: FhirQuestionnaire): QuestionnaireSummary {
  return {
    id: resource.id,
    url: resource.url,
    version: resource.version,
    title: resource.title,
    description: resource.description,
    status: resource.status,
    itemCount: resource.item.length
  };
}

function emptyBundle(requestUrl: string): FhirBundle {
  return {
    resourceType: "Bundle",
    type: "searchset",
    total: 0,
    link: [
      {
        relation: "self",
        url: requestUrl
      }
    ]
  };
}

function parseRequestUrl(requestUrl: string): URL {
  return new URL(requestUrl, fhirBaseUrl);
}

function filterPatientsFromUrl(requestUrl: string): { requestUrl: string; resources: FhirPatient[]; error?: string } {
  const parsed = parseRequestUrl(requestUrl);
  const path = parsed.pathname.toLowerCase();

  if (!path.endsWith("/patient") && !path.endsWith("/patients")) {
    return {
      requestUrl,
      resources: [],
      error: "Only Patient search URLs are supported."
    };
  }

  const name = parsed.searchParams.get("name")?.trim().toLowerCase();
  const identifier = parsed.searchParams.get("identifier")?.trim().toLowerCase();
  const id = parsed.searchParams.get("_id")?.trim().toLowerCase();
  const countParam = parsed.searchParams.get("_count");
  const count = countParam ? Math.max(0, Number(countParam)) : undefined;

  let results = patients;
  if (id) {
    results = results.filter((patient) => patient.id.toLowerCase() === id);
  }
  if (identifier) {
    results = results.filter((patient) => patient.mrn.toLowerCase().includes(identifier));
  }
  if (name) {
    results = results.filter((patient) => patient.name.toLowerCase().includes(name));
  }
  if (typeof count === "number" && Number.isFinite(count)) {
    results = results.slice(0, count);
  }

  return {
    requestUrl,
    resources: results.map(toFhirPatient)
  };
}

function filterQuestionnairesFromUrl(requestUrl: string): { requestUrl: string; resources: FhirQuestionnaire[]; error?: string } {
  const parsed = parseRequestUrl(requestUrl);
  const path = parsed.pathname.toLowerCase();

  if (!path.endsWith("/questionnaire") && !path.endsWith("/questionnaires")) {
    return {
      requestUrl,
      resources: [],
      error: "Only Questionnaire search URLs are supported."
    };
  }

  const id = parsed.searchParams.get("_id")?.trim().toLowerCase();
  const title = parsed.searchParams.get("title")?.trim().toLowerCase();
  const status = parsed.searchParams.get("status")?.trim().toLowerCase();
  const countParam = parsed.searchParams.get("_count");
  const count = countParam ? Math.max(0, Number(countParam)) : undefined;

  let results = mockQuestionnaires;
  if (id) {
    results = results.filter((questionnaire) => questionnaire.id.toLowerCase() === id);
  }
  if (title) {
    results = results.filter((questionnaire) => questionnaire.title.toLowerCase().includes(title));
  }
  if (status) {
    results = results.filter((questionnaire) => questionnaire.status.toLowerCase() === status);
  }
  if (typeof count === "number" && Number.isFinite(count)) {
    results = results.slice(0, count);
  }

  return {
    requestUrl,
    resources: results.map(toFhirQuestionnaire)
  };
}

export async function searchPatients(query: string): Promise<PatientSummary[]> {
  const normalized = query.trim().toLowerCase();
  const results = normalized
    ? patients.filter((patient) => patient.name.toLowerCase().includes(normalized) || patient.mrn.toLowerCase().includes(normalized))
    : patients;
  return delay(results);
}

export async function queryPatientsFhir(requestUrl: string): Promise<PatientQueryResult> {
  try {
    const result = filterPatientsFromUrl(requestUrl);
    const bundle = result.error ? emptyBundle(requestUrl) : makeBundle(requestUrl, result.resources);

    return delay({
      requestUrl,
      status: result.error ? 400 : 200,
      statusText: result.error ? "Bad Request" : "OK",
      bundle,
      patients: result.error ? [] : result.resources.map(toPatientSummary),
      error: result.error
    });
  } catch {
    return delay({
      requestUrl,
      status: 400,
      statusText: "Bad Request",
      bundle: emptyBundle(requestUrl),
      patients: [],
      error: "The request URL could not be parsed."
    });
  }
}

export async function queryQuestionnairesFhir(requestUrl: string): Promise<QuestionnaireQueryResult> {
  try {
    const result = filterQuestionnairesFromUrl(requestUrl);
    const bundle = result.error ? emptyBundle(requestUrl) : makeBundle(requestUrl, result.resources);

    return delay({
      requestUrl,
      status: result.error ? 400 : 200,
      statusText: result.error ? "Bad Request" : "OK",
      bundle,
      questionnaires: result.error ? [] : result.resources.map(toQuestionnaireSummary),
      error: result.error
    });
  } catch {
    return delay({
      requestUrl,
      status: 400,
      statusText: "Bad Request",
      bundle: emptyBundle(requestUrl),
      questionnaires: [],
      error: "The request URL could not be parsed."
    });
  }
}

export async function createPatient(input: CreatePatientInput): Promise<PatientSummary> {
  const name = [input.givenName.trim(), input.familyName.trim()].filter(Boolean).join(" ");
  const patient: PatientSummary = {
    id: `patient-${String(patientCounter++).padStart(3, "0")}`,
    mrn: input.mrn.trim(),
    name,
    gender: input.gender,
    birthDate: input.birthDate
  };
  patients = [patient, ...patients];
  return delay(patient, 450);
}

export async function listQuestionnaires(): Promise<QuestionnaireSummary[]> {
  return delay(
    mockQuestionnaires.map(({ items, ...questionnaire }) => ({
      ...questionnaire,
      itemCount: items.length
    }))
  );
}

export async function getQuestionnaire(id: string): Promise<Questionnaire> {
  const questionnaire = mockQuestionnaires.find((item) => item.id === id);
  if (!questionnaire) {
    throw new Error(`Questionnaire not found: ${id}`);
  }
  return delay(questionnaire);
}

export async function listSampleTranscripts(): Promise<SampleTranscript[]> {
  return delay(mockTranscripts, 200);
}

export async function extractTranscript(params: {
  patientId: string;
  questionnaireId: string;
  transcript: string;
}): Promise<ExtractionResult> {
  const questionnaire = mockQuestionnaires.find((item) => item.id === params.questionnaireId);
  if (!questionnaire) {
    throw new Error(`Questionnaire not found: ${params.questionnaireId}`);
  }
  return delay(extractMock(questionnaire, params.transcript), 800);
}

function answerToFhirValue(answer: ExtractedAnswer): FhirQuestionnaireResponseAnswer | null {
  if (answer.value === null || answer.value === undefined) return null;

  if (answer.itemType === "boolean" && typeof answer.value === "boolean") {
    return { valueBoolean: answer.value };
  }
  if (answer.itemType === "integer" && typeof answer.value === "number") {
    return { valueInteger: answer.value };
  }
  if (answer.itemType === "date" && typeof answer.value === "string") {
    return { valueDate: answer.value };
  }
  if (answer.itemType === "choice" && typeof answer.value === "object" && "code" in answer.value) {
    return { valueCoding: answer.value };
  }
  if ((answer.itemType === "string" || answer.itemType === "text") && typeof answer.value === "string") {
    return { valueString: answer.value };
  }

  return { valueString: String(answer.value) };
}

export function buildQuestionnaireResponsePreview(params: {
  requestUrl: string;
  patient: PatientSummary;
  questionnaire: Questionnaire;
  answers: ExtractedAnswer[];
}): QuestionnaireResponsePreviewResult {
  const includedAnswers = params.answers.filter((answer) => answer.status === "accepted" || answer.status === "needs-review");
  const items = includedAnswers.flatMap((answer) => {
    const value = answerToFhirValue(answer);
    if (!value) return [];

    return [
      {
        linkId: answer.linkId,
        text: answer.questionText,
        answer: [value]
      }
    ];
  });
  const allIncludedAreAccepted = items.length > 0 && includedAnswers.every((answer) => answer.status === "accepted");

  return {
    requestUrl: params.requestUrl,
    method: "POST",
    statusText: "Preview only",
    answeredItemCount: items.length,
    resource: {
      resourceType: "QuestionnaireResponse",
      status: allIncludedAreAccepted ? "completed" : "in-progress",
      questionnaire: params.questionnaire.url,
      subject: {
        reference: `Patient/${params.patient.id}`,
        display: params.patient.name
      },
      authored: "2026-06-18T00:00:00.000Z",
      item: items
    }
  };
}

export async function saveConfirmedResources(payload: SavePayload): Promise<SaveResult> {
  const suffix = String(saveCounter++).padStart(3, "0");
  const acceptedAllergy = payload.clinicalSuggestions.some(
    (suggestion) => suggestion.resourceType === "AllergyIntolerance" && suggestion.accepted
  );
  const createdResources = [
    { resourceType: "Encounter", id: `mock-encounter-${suffix}` },
    { resourceType: "QuestionnaireResponse", id: `mock-qr-${suffix}` }
  ];

  if (acceptedAllergy) {
    createdResources.push({ resourceType: "AllergyIntolerance", id: `mock-allergy-${suffix}` });
  }

  return delay(
    {
      encounterId: `mock-encounter-${suffix}`,
      questionnaireResponseId: `mock-qr-${suffix}`,
      createdResources
    },
    900
  );
}
