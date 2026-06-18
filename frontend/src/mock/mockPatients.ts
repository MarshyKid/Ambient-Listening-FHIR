import type { PatientSummary } from "../types";

export const mockPatients: PatientSummary[] = [
  {
    id: "patient-001",
    mrn: "MRN1001",
    name: "Jane Doe",
    gender: "female",
    birthDate: "1980-01-01"
  },
  {
    id: "patient-002",
    mrn: "MRN1002",
    name: "Michael Tan",
    gender: "male",
    birthDate: "1972-08-14"
  },
  {
    id: "patient-003",
    mrn: "MRN1003",
    name: "Aisha Rahman",
    gender: "female",
    birthDate: "1991-05-22"
  }
];
