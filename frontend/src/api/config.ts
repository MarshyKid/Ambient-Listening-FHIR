export const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
export const fhirBaseUrl = (
  import.meta.env.VITE_FHIR_BASE_URL ?? "http://localhost:8080/csp/healthshare/demo/fhir/r4"
).replace(/\/$/, "");
