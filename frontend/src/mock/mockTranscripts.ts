import type { SampleTranscript } from "../types";

export const mockTranscripts: SampleTranscript[] = [
  {
    id: "complete-general-intake",
    label: "Complete general intake",
    questionnaireId: "general-intake",
    transcript:
      "Nurse: What brings you in today? Patient: I have had a dry cough and some fatigue for about a week. Nurse: Any current medications? Patient: I take lisinopril 10 milligrams daily and vitamin D. Nurse: Do you smoke? Patient: I quit smoking about five years ago, so I am a former smoker. Nurse: Any pain today? Patient: My pain is about a 3 out of 10. Nurse: Any allergies? Patient: No known allergies."
  },
  {
    id: "penicillin-allergy",
    label: "Penicillin allergy with rash",
    questionnaireId: "allergy-review",
    transcript:
      "Nurse: Do you have any allergies we should know about? Patient: Yes, I am allergic to penicillin. Nurse: What happened when you took it? Patient: I developed a red rash across my chest and arms. Nurse: Do you remember when this started? Patient: It was years ago, maybe in childhood."
  },
  {
    id: "missing-ambiguous",
    label: "Missing and ambiguous answers",
    transcript:
      "Nurse: What brings you in? Patient: I just have not been feeling right and wanted to get checked. Nurse: Any medicines? Patient: There may be one for blood pressure, but I do not remember the name. Nurse: Any pain? Patient: It comes and goes, not sure how to rate it."
  },
  {
    id: "no-known-allergies",
    label: "No known allergies",
    questionnaireId: "allergy-review",
    transcript:
      "Nurse: Do you have any allergies to medicines, foods, or latex? Patient: No known allergies. Nurse: Have you ever had a rash, swelling, or trouble breathing after a medication? Patient: No, nothing like that."
  }
];
