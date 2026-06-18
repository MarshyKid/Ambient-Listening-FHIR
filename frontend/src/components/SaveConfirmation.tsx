import { useState } from "react";
import type { ClinicalSuggestion, ExtractedAnswer, PatientSummary, Questionnaire, SaveResult } from "../types";
import { saveConfirmedResources } from "../mock/mockApi";

interface SaveConfirmationProps {
  patient: PatientSummary;
  questionnaire: Questionnaire;
  answers: ExtractedAnswer[];
  clinicalSuggestions: ClinicalSuggestion[];
  saveResult: SaveResult | null;
  onSaved: (result: SaveResult) => void;
}

export default function SaveConfirmation({
  patient,
  questionnaire,
  answers,
  clinicalSuggestions,
  saveResult,
  onSaved
}: SaveConfirmationProps) {
  const [saving, setSaving] = useState(false);
  const acceptedAnswers = answers.filter((answer) => answer.status === "accepted").length;
  const notAcceptedAnswers = answers.length - acceptedAnswers;
  const acceptedSuggestions = clinicalSuggestions.filter((suggestion) => suggestion.accepted).length;
  const willCreateAllergy = clinicalSuggestions.some((suggestion) => suggestion.resourceType === "AllergyIntolerance" && suggestion.accepted);

  async function handleSave() {
    setSaving(true);
    try {
      const result = await saveConfirmedResources({
        patientId: patient.id,
        questionnaireId: questionnaire.id,
        answers,
        clinicalSuggestions
      });
      onSaved(result);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="screen">
      <div className="screen-header">
        <div>
          <p className="eyebrow">Step 5</p>
          <h1>Save Confirmation</h1>
        </div>
      </div>

      <div className="card save-summary">
        <div className="summary-grid">
          <div>
            <span>Patient</span>
            <strong>{patient.name}</strong>
            <small>{patient.mrn}</small>
          </div>
          <div>
            <span>Questionnaire</span>
            <strong>{questionnaire.title}</strong>
            <small>Version {questionnaire.version}</small>
          </div>
          <div>
            <span>Accepted answers</span>
            <strong>{acceptedAnswers}</strong>
          </div>
          <div>
            <span>Unanswered/rejected/needs review</span>
            <strong>{notAcceptedAnswers}</strong>
          </div>
          <div>
            <span>Accepted clinical suggestions</span>
            <strong>{acceptedSuggestions}</strong>
          </div>
        </div>

        <div className="resource-preview">
          <h2>This will create</h2>
          <ul className="plain-list">
            <li>1 Encounter</li>
            <li>1 QuestionnaireResponse</li>
            {willCreateAllergy && <li>1 AllergyIntolerance</li>}
          </ul>
        </div>

        {!saveResult && (
          <button className="primary-button" type="button" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Confirm & Save"}
          </button>
        )}
      </div>

      {saveResult && (
        <div className="card success-card">
          <span className="success-pill">Saved</span>
          <h2>Mock resources created</h2>
          <div className="created-resource-list">
            {saveResult.createdResources.map((resource) => (
              <div key={`${resource.resourceType}-${resource.id}`} className="created-resource">
                <strong>{resource.resourceType}</strong>
                <code>{resource.id}</code>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
