import { apiGet } from "./http";

export interface FhirHealthStatus {
  status: "ok" | "error";
  connected: boolean;
  fhirVersion: string | null;
  fhirRelease: string;
  isExpectedVersion: boolean;
  software?: string | null;
  message?: string | null;
  upstreamStatus?: number;
}

export async function getFhirHealthStatus(): Promise<FhirHealthStatus> {
  return apiGet<FhirHealthStatus>("/api/health/fhir");
}
