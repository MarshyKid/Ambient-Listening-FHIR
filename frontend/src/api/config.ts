export const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000").replace(/\/$/, "");
export const defaultPractitionerIdentifier = import.meta.env.VITE_DEFAULT_PRACTITIONER_IDENTIFIER ?? "nurse-demo";
export const fhirBaseUrl = (
  import.meta.env.VITE_FHIR_BASE_URL ?? "https://localhost:8443/csp/healthshare/demo/fhir/r4"
).replace(/\/$/, "");
