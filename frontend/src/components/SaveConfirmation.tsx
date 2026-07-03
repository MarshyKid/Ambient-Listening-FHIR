import { useState } from "react";
import { BackendApiError, buildBackendSaveRequest, saveToBackend } from "../api/save";
import type { ClinicalSuggestion, EncounterClassCode, EncounterDraft, ExtractedAnswer, PatientSummary, Questionnaire, SaveResult } from "../types";
import { hasAnswerValue } from "../utils/questionnaireItems";

interface SaveConfirmationProps {
  patient: PatientSummary;
  questionnaire: Questionnaire;
  encounter: EncounterDraft;
  answers: ExtractedAnswer[];
  clinicalSuggestions: ClinicalSuggestion[];
  saveResult: SaveResult | null;
  onSaved: (result: SaveResult) => void;
}

interface SaveErrorState {
  message: string;
  raw: unknown;
}

interface TransactionEntry {
  resource?: {
    resourceType?: string;
    [key: string]: unknown;
  };
}

export default function SaveConfirmation({
  patient,
  questionnaire,
  encounter,
  answers,
  clinicalSuggestions,
  saveResult,
  onSaved
}: SaveConfirmationProps) {
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<SaveErrorState | null>(null);
  const answeredAnswers = answers.filter((answer) => hasAnswerValue(answer.value)).length;
  const unansweredAnswers = answers.length - answeredAnswers;
  const allergyResources = clinicalSuggestions.filter((suggestion) => suggestion.accepted && suggestion.resourceType === "AllergyIntolerance").length;
  const willCreateAllergy = allergyResources > 0;

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const payload = buildBackendSaveRequest({
        patient,
        questionnaire,
        encounter,
        answers,
        clinicalSuggestions
      });
      const result = await saveToBackend(payload);
      onSaved(result);
    } catch (error) {
      if (error instanceof BackendApiError) {
        setSaveError({ message: error.message, raw: error.raw });
      } else {
        setSaveError({
          message: error instanceof Error ? error.message : "Save failed.",
          raw: error
        });
      }
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
            <span>Encounter</span>
            <strong>{encounterStatusLabel(encounter.status)}</strong>
            <small>
              {encounterClassLabel(encounter.classCode)} - starts {formatEncounterStart(encounter.periodStart)}
            </small>
          </div>
          <div>
            <span>Answered items</span>
            <strong>{answeredAnswers}</strong>
          </div>
          <div>
            <span>Unanswered items</span>
            <strong>{unansweredAnswers}</strong>
          </div>
          <div>
            <span>AllergyIntolerance resources</span>
            <strong>{allergyResources}</strong>
          </div>
        </div>

        <div className="resource-preview">
          <h2>This will create</h2>
          <ul className="plain-list">
            <li>1 Encounter</li>
            <li>1 QuestionnaireResponse</li>
            {willCreateAllergy && <li>{allergyResources} AllergyIntolerance</li>}
          </ul>
        </div>

        {!saveResult && (
          <button className="primary-button" type="button" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save to FHIR"}
          </button>
        )}
      </div>

      {saveError && (
        <div className="card error-card">
          <span className="error-pill">Save failed</span>
          <h2>FHIR save failed</h2>
          <p>{saveError.message}</p>
          {saveError.raw !== undefined && (
            <details className="raw-response">
              <summary>Raw error details</summary>
              <pre>{JSON.stringify(saveError.raw, null, 2)}</pre>
            </details>
          )}
        </div>
      )}

      {saveResult && <SaveSuccess saveResult={saveResult} />}
    </section>
  );
}

function encounterStatusLabel(status: EncounterDraft["status"]) {
  if (status === "in-progress") return "In progress";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function encounterClassLabel(classCode: EncounterClassCode) {
  if (classCode === "AMB") return "Ambulatory";
  if (classCode === "EMER") return "Emergency";
  if (classCode === "IMP") return "Inpatient";
  return "Observation";
}

function formatEncounterStart(value: string) {
  if (!value) return "not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function SaveSuccess({ saveResult }: { saveResult: SaveResult }) {
  const encounters = getResourcesFromTransactionBundle(saveResult.transactionBundle, "Encounter");
  const questionnaireResponses = getResourcesFromTransactionBundle(saveResult.transactionBundle, "QuestionnaireResponse");
  const allergies = getResourcesFromTransactionBundle(saveResult.transactionBundle, "AllergyIntolerance");

  return (
    <>
      <div className="card success-card">
        <span className="success-pill">Saved</span>
        <h2>Save successful</h2>
        <div className="created-resource-list">
          {saveResult.createdResources.map((resource) => (
            <div key={`${resource.resourceType}-${resource.id}`} className="created-resource">
              <strong>{resource.resourceType}</strong>
              <code>
                {resource.resourceType}/{resource.id}
              </code>
            </div>
          ))}
        </div>
      </div>

      <section className="card section-card raw-fhir-panels">
        <h2>Raw FHIR Panels</h2>
        {encounters.map((resource, index) => (
          <RawPanel key={`encounter-${index}`} title="Raw Encounter Request" data={resource} />
        ))}
        {questionnaireResponses.map((resource, index) => (
          <RawPanel key={`questionnaire-response-${index}`} title="Raw QuestionnaireResponse Request" data={resource} />
        ))}
        {allergies.map((resource, index) => (
          <RawPanel key={`allergy-${index}`} title="Raw AllergyIntolerance Request" data={resource} />
        ))}
        <RawPanel title="Raw transaction Bundle request" data={saveResult.transactionBundle} />
        <RawPanel title="Raw transaction response" data={saveResult.responseBundle} />
      </section>
    </>
  );
}

function RawPanel({ title, data }: { title: string; data: unknown }) {
  return (
    <details className="raw-response">
      <summary>{title}</summary>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </details>
  );
}

function getResourcesFromTransactionBundle(bundle: Record<string, unknown>, resourceType: string): Array<Record<string, unknown>> {
  const entries = Array.isArray(bundle.entry) ? (bundle.entry as TransactionEntry[]) : [];
  return entries.flatMap((entry) => {
    if (entry.resource?.resourceType === resourceType) {
      return [entry.resource as Record<string, unknown>];
    }
    return [];
  });
}
