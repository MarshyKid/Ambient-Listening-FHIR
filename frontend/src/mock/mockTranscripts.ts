import type { SampleTranscript } from "../types";

export const mockTranscripts: SampleTranscript[] = [
  {
    id: "triage-allergy-penicillin",
    label: "Allergy assessment: penicillin rash",
    questionnaireId: "70146",
    transcript:
      "Nurse: Does the patient have any known allergies or drug adverse reactions? Patient: Yes, I have a penicillin allergy. Nurse: What type of allergy is that? Patient: Medication. Nurse: What symptoms did you have? Patient: I got hives and a red rash on my chest and arms. Nurse: How severe was it? Patient: Moderate. I did not need an epinephrine shot, but I was told not to take penicillin again."
  },
  {
    id: "triage-chief-complaint-chest-pain",
    label: "Chief complaint: chest pressure",
    questionnaireId: "70147",
    transcript:
      "Nurse: What is the primary reason for your hospital visit today? Patient: I came in because of chest pressure and shortness of breath. Nurse: When did this primary symptom start? Patient: It started today, June 22, 2026, at about 6:30 in the morning. Nurse: Rate your current pain level from 0, none, to 10, worst possible. Patient: Right now it is a 7 out of 10."
  },
  {
    id: "triage-infection-screening",
    label: "Infection screening: fever and exposure",
    questionnaireId: "70148",
    transcript:
      "Nurse: Have you had a fever or chills in the last 48 hours? Patient: Yes, I had chills last night and a fever this morning. Nurse: Do you have a new cough, shortness of breath, or sore throat? Patient: Yes, I have a new cough and I feel a little short of breath. Nurse: Have you traveled outside the country in the past 14 days? Patient: No, I have not traveled outside the country. Nurse: Have you been in close contact with anyone diagnosed with a contagious illness? Patient: Yes, my roommate tested positive for flu two days ago."
  },
  {
    id: "triage-fall-safety-risk",
    label: "Fall risk: recent fall with cane",
    questionnaireId: "70149",
    transcript:
      "Nurse: Have you fallen in the past 3 months? Patient: Yes, I fell in my bathroom about three weeks ago. Nurse: Do you require an assistive device, like a walker, cane, or wheelchair, to walk? Patient: Yes, I use a cane when I walk. Nurse: Is the patient confused, disoriented, or lethargic? Patient: No, I feel alert and I know where I am."
  },
  {
    id: "triage-critical-history",
    label: "Medical history: diabetes and blood thinner",
    questionnaireId: "70150",
    transcript:
      "Nurse: Do you have a history of any high-risk conditions like Diabetes, Hypertension, Heart Disease, Stroke, or None? Patient: I have Diabetes and Hypertension. Nurse: Are you currently taking any blood thinners, for example Aspirin, Warfarin, or Eliquis? Patient: Yes, I take Eliquis every day. Nurse: If applicable, is there any chance you are currently pregnant? Patient: No, there is no chance I am pregnant."
  },
  {
    id: "triage-social-psychological-risk",
    label: "Social risk: safe at home",
    questionnaireId: "70151",
    transcript:
      "Nurse: Do you feel safe at home? Patient: Yes, I feel safe at home. Nurse: Have you had thoughts of hurting yourself or others recently? Patient: No, I have not had thoughts of hurting myself or anyone else."
  },
  {
    id: "triage-comprehensive-admission",
    label: "Comprehensive triage: full admission",
    questionnaireId: "70152",
    transcript:
      "Nurse: Does the patient have any known allergies or drug adverse reactions? Patient: Yes, I am allergic to shellfish. Nurse: What type of allergy is that? Patient: Food. Nurse: What reaction symptoms do you get? Patient: My lips swell and I get hives. Nurse: How severe is it? Patient: Severe / Anaphylactic. Nurse: What is the primary reason for your hospital visit today? Patient: I came in for severe abdominal pain with vomiting. Nurse: When did this primary symptom start? Patient: It started on June 22, 2026, around 2:15 in the morning. Nurse: Rate your current pain level from 0 to 10. Patient: It is an 8 out of 10. Nurse: Have you had a fever or chills in the last 48 hours? Patient: Yes, chills overnight. Nurse: Do you have a new cough, shortness of breath, or sore throat? Patient: No, none of those. Nurse: Have you traveled outside the country in the past 14 days? Patient: No. Nurse: Have you been in close contact with anyone diagnosed with a contagious illness? Patient: No known contact. Nurse: Have you fallen in the past 3 months? Patient: No, I have not fallen. Nurse: Do you require an assistive device to walk? Patient: No, I walk without a cane or walker. Nurse: Is the patient confused, disoriented, or lethargic? Patient: No, I am alert. Nurse: Do you have a history of any high-risk conditions? Patient: Hypertension. Nurse: Are you currently taking any blood thinners such as Aspirin, Warfarin, or Eliquis? Patient: No, I am not taking blood thinners. Nurse: Is there any chance you are currently pregnant? Patient: No. Nurse: Do you feel safe at home? Patient: Yes. Nurse: Have you had thoughts of hurting yourself or others recently? Patient: No."
  }
];
