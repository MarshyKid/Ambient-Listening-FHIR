export function normalizeFhirDateTime(value: string): string {
    if (!value.trim()) return value;
  
    // HTML datetime-local gives: 2026-06-19T15:23
    // Convert local browser time to valid FHIR instant-like dateTime: 2026-06-19T07:23:00.000Z
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
      return new Date(value).toISOString();
    }
  
    return value;
  }