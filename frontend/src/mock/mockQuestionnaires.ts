import type { ChoiceOption, Questionnaire } from "../types";

const snomed = "http://snomed.info/sct";

export const smokingOptions: ChoiceOption[] = [
  { fhirValueType: "valueCoding", system: snomed, code: "266919005", display: "Never smoked" },
  { fhirValueType: "valueCoding", system: snomed, code: "8517006", display: "Former smoker" },
  { fhirValueType: "valueCoding", system: snomed, code: "77176002", display: "Current smoker" }
];

export const yesNoOptions: ChoiceOption[] = [
  { fhirValueType: "valueCoding", system: snomed, code: "373066001", display: "Yes" },
  { fhirValueType: "valueCoding", system: snomed, code: "373067005", display: "No" }
];

export const mockQuestionnaires: Questionnaire[] = [
  {
    id: "general-intake",
    url: "https://example.org/fhir/Questionnaire/general-intake",
    version: "1.0.0",
    title: "General Intake",
    description: "Baseline intake questions for common outpatient visits.",
    status: "active",
    items: [
      { linkId: "visit-reason", text: "Reason for visit", type: "text", required: true },
      { linkId: "current-medications", text: "Current medications", type: "text" },
      { linkId: "smoking-status", text: "Smoking status", type: "choice", options: smokingOptions },
      { linkId: "pain-score", text: "Pain score from 0 to 10", type: "integer" },
      { linkId: "allergy-has", text: "Any known allergies?", type: "boolean" }
    ]
  },
  {
    id: "allergy-review",
    url: "https://example.org/fhir/Questionnaire/allergy-review",
    version: "1.0.0",
    title: "Allergy Review",
    description: "Focused review of medication and environmental allergies.",
    status: "active",
    items: [
      { linkId: "allergy-has", text: "Any known allergies?", type: "boolean", required: true },
      { linkId: "allergy-substance", text: "Allergy substance", type: "string" },
      { linkId: "allergy-reaction", text: "Reaction or symptom", type: "string" },
      { linkId: "allergy-onset", text: "Approximate onset date", type: "date" }
    ]
  },
  {
    id: "pre-visit-screening",
    url: "https://example.org/fhir/Questionnaire/pre-visit-screening",
    version: "1.0.0",
    title: "Pre-Visit Screening",
    description: "Quick screening before a scheduled clinical encounter.",
    status: "active",
    items: [
      { linkId: "visit-reason", text: "Reason for visit", type: "text", required: true },
      { linkId: "fever", text: "Fever in the last 48 hours?", type: "boolean" },
      { linkId: "pain-score", text: "Pain score from 0 to 10", type: "integer" },
      { linkId: "smoking-status", text: "Smoking status", type: "choice", options: smokingOptions }
    ]
  }
];
