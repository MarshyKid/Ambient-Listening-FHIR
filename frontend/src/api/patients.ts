import type { CreatePatientInput, Gender, PatientQueryResult, PatientSummary } from "../types";
import { apiGet, apiPost } from "./http";

interface BackendPatientSummary {
  id: string;
  mrn?: string | null;
  name: string;
  gender?: Gender | null;
  birthDate?: string | null;
}

interface BackendPatientQueryResult extends Omit<PatientQueryResult, "patients"> {
  patients: BackendPatientSummary[];
}

interface BackendCreatePatientResponse {
  patient: BackendPatientSummary;
}

export async function queryPatientsFhir(requestUrl: string): Promise<PatientQueryResult> {
  try {
    const result = await apiGet<BackendPatientQueryResult>("/api/patients", { requestUrl });
    return {
      ...result,
      patients: result.patients.map(normalizePatient)
    };
  } catch (error) {
    return {
      requestUrl,
      status: 400,
      statusText: "Bad Request",
      bundle: {
        resourceType: "Bundle",
        type: "searchset",
        total: 0,
        link: [{ relation: "self", url: requestUrl }]
      },
      patients: [],
      error: error instanceof Error ? error.message : "Patient query failed."
    };
  }
}

export async function createPatient(input: CreatePatientInput): Promise<PatientSummary> {
  const response = await apiPost<BackendCreatePatientResponse>("/api/patients", {
    mrn: input.mrn.trim(),
    given: input.givenName.trim() ? [input.givenName.trim()] : [],
    family: input.familyName.trim(),
    gender: input.gender,
    birthDate: input.birthDate
  });
  return normalizePatient(response.patient);
}

function normalizePatient(patient: BackendPatientSummary): PatientSummary {
  return {
    id: patient.id,
    mrn: patient.mrn ?? "",
    name: patient.name,
    gender: patient.gender ?? "unknown",
    birthDate: patient.birthDate ?? ""
  };
}
