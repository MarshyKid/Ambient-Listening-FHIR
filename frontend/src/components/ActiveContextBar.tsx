import type { ExtractedAnswer, PatientSummary, Questionnaire } from "../types";

interface ActiveContextBarProps {
  patient: PatientSummary | null;
  questionnaire: Questionnaire | null;
  answers: ExtractedAnswer[];
}

function countStatus(answers: ExtractedAnswer[], status: ExtractedAnswer["status"]) {
  return answers.filter((answer) => answer.status === status).length;
}

function formatGender(gender: PatientSummary["gender"]) {
  return gender.charAt(0).toUpperCase() + gender.slice(1);
}

export default function ActiveContextBar({ patient, questionnaire, answers }: ActiveContextBarProps) {
  if (!patient) return null;

  const extracted = countStatus(answers, "extracted");
  const edited = countStatus(answers, "edited");
  const unanswered = countStatus(answers, "unanswered");
  const hasReviewedValues = extracted + edited > 0;

  return (
    <section className="active-context-bar" aria-label="Active workflow context">
      <div className="context-field">
        <span className="context-key">Patient</span>
        <span className="context-value">
          {patient.name}{" "}
          <span className="mono">
            · {patient.mrn} · {formatGender(patient.gender)} · {patient.birthDate}
          </span>
        </span>
      </div>

      <div className="context-field">
        <span className="context-key">Questionnaire</span>
        {questionnaire ? (
          <span className="context-value">
            {questionnaire.title} <span className="mono">· v{questionnaire.version}</span>
          </span>
        ) : (
          <span className="context-value muted">Not selected yet</span>
        )}
      </div>

      <div className="context-field">
        <span className="context-key">Extraction</span>
        {hasReviewedValues ? (
          <span className="context-value context-chips">
            <span className="context-chip ok">{extracted} AI-filled</span>
            <span className="context-chip ok">{edited} edited</span>
            <span className="context-chip zero">{unanswered} unanswered</span>
          </span>
        ) : (
          <span className="context-value muted">Not extracted yet</span>
        )}
      </div>
    </section>
  );
}
