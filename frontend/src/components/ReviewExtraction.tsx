import { useState, type ChangeEvent } from "react";
import type { ChoiceOption, ClinicalSuggestion, ExtractedAnswer, ExtractedValue, PatientSummary, Questionnaire, QuestionnaireItem, ReviewStatus } from "../types";
import { buildQuestionnaireResponsePreview } from "../mock/mockApi";
import ConfidenceBadge from "./ConfidenceBadge";

interface ReviewExtractionProps {
  patient: PatientSummary;
  questionnaire: Questionnaire;
  answers: ExtractedAnswer[];
  clinicalSuggestions: ClinicalSuggestion[];
  onAnswersChange: (answers: ExtractedAnswer[]) => void;
  onSuggestionsChange: (suggestions: ClinicalSuggestion[]) => void;
  onContinue: () => void;
}

function isChoice(value: ExtractedValue): value is ChoiceOption {
  return Boolean(value && typeof value === "object" && "code" in value);
}

function displayValue(value: ExtractedValue) {
  if (value === null || value === undefined) return "";
  if (isChoice(value)) return value.display;
  return String(value);
}

export default function ReviewExtraction({
  patient,
  questionnaire,
  answers,
  clinicalSuggestions,
  onAnswersChange,
  onSuggestionsChange,
  onContinue
}: ReviewExtractionProps) {
  const [requestUrl, setRequestUrl] = useState("http://localhost:8080/csp/healthshare/demo/fhir/r4/QuestionnaireResponse");

  function updateAnswer(linkId: string, patch: Partial<ExtractedAnswer>) {
    onAnswersChange(answers.map((answer) => (answer.linkId === linkId ? { ...answer, ...patch } : answer)));
  }

  function hasReviewedValue(value: ExtractedValue) {
    if (value === null || value === undefined) return false;
    if (typeof value === "string") return value.trim().length > 0;
    return true;
  }

  function handleValueChange(item: QuestionnaireItem, event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    const raw = event.target.value;
    let value: ExtractedValue = raw;

    if (item.type === "integer") {
      value = raw === "" ? null : Number(raw);
    }
    if (item.type === "boolean") {
      value = raw === "" ? null : raw === "true";
    }
    if (item.type === "choice") {
      value = item.options?.find((option) => option.code === raw) ?? null;
    }

    const existing = byLinkId.get(item.linkId);
    const nextStatus =
      !existing || existing.status === "unanswered" || !hasReviewedValue(value)
        ? hasReviewedValue(value)
          ? "needs-review"
          : "unanswered"
        : existing.status;
    updateAnswer(item.linkId, { value, status: nextStatus });
  }

  function renderInput(item: QuestionnaireItem, answer: ExtractedAnswer) {
    if (item.type === "group") {
      return null;
    }
    if (item.type === "text") {
      return <textarea value={displayValue(answer.value)} onChange={(event) => handleValueChange(item, event)} />;
    }
    if (item.type === "boolean") {
      return (
        <select value={answer.value === null ? "" : String(answer.value)} onChange={(event) => handleValueChange(item, event)}>
          <option value="">Unanswered</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      );
    }
    if (item.type === "choice") {
      return (
        <select value={isChoice(answer.value) ? answer.value.code : ""} onChange={(event) => handleValueChange(item, event)}>
          <option value="">Unanswered</option>
          {item.options?.map((option) => (
            <option key={option.code} value={option.code}>
              {option.display}
            </option>
          ))}
        </select>
      );
    }

    return (
      <input
        type={item.type === "date" ? "date" : item.type === "dateTime" ? "datetime-local" : item.type === "integer" ? "number" : "text"}
        value={displayValue(answer.value)}
        onChange={(event) => handleValueChange(item, event)}
      />
    );
  }

  function renderQuestionnaireItem(item: QuestionnaireItem) {
    if (item.type === "group") {
      return (
        <section key={item.linkId} className="review-group">
          <div className="review-card-header">
            <div>
              <h2>{item.text}</h2>
              <span className="link-id">{item.linkId}</span>
            </div>
          </div>
          {(item.items ?? []).map(renderQuestionnaireItem)}
        </section>
      );
    }

    const answer = byLinkId.get(item.linkId);
    if (!answer) return null;

    return (
      <article key={item.linkId} className={`review-card ${answer.status === "unanswered" ? "unanswered" : ""}`}>
        <div className="review-card-header">
          <div>
            <h2>{item.text}</h2>
            <span className="link-id">{item.linkId}</span>
          </div>
          <ConfidenceBadge confidence={answer.confidence} />
        </div>

        <label>
          Reviewed value
          {renderInput(item, answer)}
        </label>

        <div className="evidence">
          <span>Evidence</span>
          <q>{answer.evidence}</q>
        </div>

        <label>
          Review status
          <select
            value={answer.status}
            onChange={(event) => updateAnswer(answer.linkId, { status: event.target.value as ReviewStatus })}
          >
            <option value="accepted">Accepted</option>
            <option value="needs-review">Needs review</option>
            <option value="rejected">Rejected</option>
            <option value="unanswered">Unanswered</option>
          </select>
        </label>
      </article>
    );
  }

  function updateSuggestion(id: string, patch: Partial<ClinicalSuggestion>) {
    onSuggestionsChange(clinicalSuggestions.map((suggestion) => (suggestion.id === id ? { ...suggestion, ...patch } : suggestion)));
  }

  function updateSuggestionField(id: string, field: string, value: string) {
    onSuggestionsChange(
      clinicalSuggestions.map((suggestion) =>
        suggestion.id === id ? { ...suggestion, fields: { ...suggestion.fields, [field]: value } } : suggestion
      )
    );
  }

  const byLinkId = new Map(answers.map((answer) => [answer.linkId, answer]));
  const unanswered = answers.filter((answer) => answer.status === "unanswered");
  const questionnaireResponsePreview = buildQuestionnaireResponsePreview({
    requestUrl,
    patient,
    questionnaire,
    answers
  });
  const responseBody = JSON.stringify(questionnaireResponsePreview.resource, null, 2);

  return (
    <section className="screen">
      <div className="screen-header">
        <div>
          <p className="eyebrow">Step 4</p>
          <h1>Review Extraction</h1>
        </div>
      </div>

      <div className="fhir-query-panel post-preview-panel">
        <div className="query-panel-header">
          <div>
            <p className="eyebrow">Demo</p>
            <h2>FHIR QuestionnaireResponse Create</h2>
          </div>
          <span className="query-status post">
            POST · Preview only · QuestionnaireResponse · {questionnaireResponsePreview.answeredItemCount} answered items
          </span>
        </div>

        <label className="request-field">
          Request URL
          <div className="request-row post-preview">
            <input value={requestUrl} onChange={(event) => setRequestUrl(event.target.value)} spellCheck={false} />
            <span className="method-badge post">POST</span>
          </div>
        </label>

        <details className="raw-response">
          <summary>Raw FHIR request body</summary>
          <pre>{responseBody}</pre>
        </details>
      </div>

      <div className="review-layout">
        {questionnaire.items.map(renderQuestionnaireItem)}
      </div>

      <section className="card section-card">
        <h2>Unanswered Items</h2>
        {unanswered.length === 0 ? (
          <p className="muted">No unanswered items.</p>
        ) : (
          <ul className="plain-list">
            {unanswered.map((answer) => (
              <li key={answer.linkId}>{answer.questionText}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="card section-card">
        <h2>Clinical Suggestions</h2>
        {clinicalSuggestions.length === 0 ? (
          <p className="muted">No clinical suggestions were generated.</p>
        ) : (
          <div className="suggestion-list">
            {clinicalSuggestions.map((suggestion) => (
              <article key={suggestion.id} className={`suggestion-card ${suggestion.accepted ? "selected" : ""}`}>
                <div className="review-card-header">
                  <div>
                    <h3>{suggestion.resourceType}</h3>
                    <p>{suggestion.summary}</p>
                    {suggestion.confidence >= 0.85 && <span className="recommended-pill">Recommended to review</span>}
                  </div>
                  <ConfidenceBadge confidence={suggestion.confidence} />
                </div>

                <div className="field-grid">
                  {Object.entries(suggestion.fields).map(([field, value]) => (
                    <label key={field}>
                      {field}
                      <input value={value} onChange={(event) => updateSuggestionField(suggestion.id, field, event.target.value)} />
                    </label>
                  ))}
                </div>

                <div className="evidence">
                  <span>Evidence</span>
                  <q>{suggestion.evidence}</q>
                </div>

                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={suggestion.accepted}
                    onChange={(event) => updateSuggestion(suggestion.id, { accepted: event.target.checked })}
                  />
                  Accept suggestion
                </label>
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="footer-actions">
        <button className="primary-button" type="button" onClick={onContinue}>
          Continue to Save
        </button>
      </div>
    </section>
  );
}
