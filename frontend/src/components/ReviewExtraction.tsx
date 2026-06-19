import { useState, type ChangeEvent } from "react";
import type { ChoiceOption, ClinicalSuggestion, ExtractedAnswer, ExtractedValue, PatientSummary, Questionnaire, QuestionnaireItem } from "../types";
import { buildQuestionnaireResponsePreview } from "../mock/mockApi";
import { flattenAnswerableItems, hasAnswerValue, manualEntryEvidence } from "../utils/questionnaireItems";
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

type ReviewFilter = "all" | "unanswered" | "answered";

interface ReviewSection {
  id: string;
  title: string;
  items: QuestionnaireItem[];
}

function isChoice(value: ExtractedValue): value is ChoiceOption {
  return Boolean(value && typeof value === "object" && "code" in value);
}

function displayValue(value: ExtractedValue) {
  if (value === null || value === undefined) return "";
  if (isChoice(value)) return value.display;
  return String(value);
}

function hasExtractionMetadata(answer: ExtractedAnswer) {
  return answer.confidence > 0 || (answer.evidence.trim().length > 0 && answer.evidence !== manualEntryEvidence);
}

function getReviewSections(items: QuestionnaireItem[]): ReviewSection[] {
  const sections: ReviewSection[] = [];
  const fallbackItems: QuestionnaireItem[] = [];

  items.forEach((item) => {
    if (item.type === "group") {
      sections.push({
        id: item.linkId,
        title: item.text,
        items: flattenAnswerableItems(item.items ?? [])
      });
      return;
    }
    fallbackItems.push(item);
  });

  if (fallbackItems.length > 0) {
    sections.unshift({
      id: "questionnaire-items",
      title: "Questionnaire Items",
      items: fallbackItems
    });
  }

  return sections.filter((section) => section.items.length > 0);
}

function ReviewSummaryBar({
  answeredCount,
  unansweredCount,
  filter,
  onFilterChange
}: {
  answeredCount: number;
  unansweredCount: number;
  filter: ReviewFilter;
  onFilterChange: (filter: ReviewFilter) => void;
}) {
  const filters: ReviewFilter[] = ["all", "unanswered", "answered"];

  return (
    <div className="review-summary-bar">
      <strong>
        {answeredCount} answered - {unansweredCount} unanswered
      </strong>
      <div className="filter-chip-row" aria-label="Review filters">
        {filters.map((nextFilter) => (
          <button
            key={nextFilter}
            type="button"
            className={`filter-chip ${filter === nextFilter ? "selected" : ""}`}
            onClick={() => onFilterChange(nextFilter)}
          >
            {nextFilter === "all" ? "All" : nextFilter === "unanswered" ? "Unanswered" : "Answered"}
          </button>
        ))}
      </div>
    </div>
  );
}

function FhirPreviewPanel({
  requestUrl,
  responseBody,
  answeredItemCount,
  onRequestUrlChange
}: {
  requestUrl: string;
  responseBody: string;
  answeredItemCount: number;
  onRequestUrlChange: (requestUrl: string) => void;
}) {
  return (
    <div className="fhir-query-panel post-preview-panel secondary-demo-panel">
      <div className="query-panel-header">
        <div>
          <p className="eyebrow">Demo</p>
          <h2>FHIR QuestionnaireResponse</h2>
        </div>
        <span className="query-status post">POST - Preview only - {answeredItemCount} answered items</span>
      </div>

      <label className="request-field">
        Request URL
        <div className="request-row post-preview">
          <input value={requestUrl} onChange={(event) => onRequestUrlChange(event.target.value)} spellCheck={false} />
          <span className="method-badge post">POST</span>
        </div>
      </label>

      <details className="raw-response">
        <summary>Raw FHIR request body</summary>
        <pre>{responseBody}</pre>
      </details>
    </div>
  );
}

function ReviewQuestionRow({
  item,
  answer,
  onValueChange
}: {
  item: QuestionnaireItem;
  answer: ExtractedAnswer;
  onValueChange: (item: QuestionnaireItem, event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
}) {
  const isAnswered = hasAnswerValue(answer.value);
  const showExtractionMetadata = hasExtractionMetadata(answer);

  function renderInput() {
    if (item.type === "text") {
      return <textarea value={displayValue(answer.value)} onChange={(event) => onValueChange(item, event)} />;
    }
    if (item.type === "boolean") {
      return (
        <select value={answer.value === null ? "" : String(answer.value)} onChange={(event) => onValueChange(item, event)}>
          <option value="">Unanswered</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      );
    }
    if (item.type === "choice") {
      return (
        <select value={isChoice(answer.value) ? answer.value.code : ""} onChange={(event) => onValueChange(item, event)}>
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
        onChange={(event) => onValueChange(item, event)}
      />
    );
  }

  return (
    <article className={`review-question-row ${isAnswered ? "answered" : ""}`}>
      <div className="review-question-main">
        <div>
          <h3>{item.text}</h3>
          <div className="question-meta">
            <span>{item.type}</span>
            {item.required && <span>required</span>}
            <span>{item.linkId}</span>
          </div>
        </div>
        <span className={`answer-state ${isAnswered ? "answered" : ""}`}>{isAnswered ? "Answered" : "Unanswered"}</span>
      </div>

      <label>
        <span className="sr-only">Reviewed value for {item.text}</span>
        {renderInput()}
      </label>

      {showExtractionMetadata && (
        <div className="extraction-metadata">
          {answer.confidence > 0 && <ConfidenceBadge confidence={answer.confidence} />}
          {answer.evidence !== manualEntryEvidence && (
            <div className="evidence">
              <span>Evidence</span>
              <q>{answer.evidence}</q>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function ReviewSectionAccordion({
  section,
  answersByLinkId,
  filter,
  onValueChange
}: {
  section: ReviewSection;
  answersByLinkId: Map<string, ExtractedAnswer>;
  filter: ReviewFilter;
  onValueChange: (item: QuestionnaireItem, event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
}) {
  const sectionItems = section.items
    .map((item) => ({ item, answer: answersByLinkId.get(item.linkId) }))
    .filter((entry): entry is { item: QuestionnaireItem; answer: ExtractedAnswer } => Boolean(entry.answer));
  const answeredCount = sectionItems.filter((entry) => hasAnswerValue(entry.answer.value)).length;
  const visibleItems = sectionItems.filter((entry) => {
    if (filter === "answered") return hasAnswerValue(entry.answer.value);
    if (filter === "unanswered") return !hasAnswerValue(entry.answer.value);
    return true;
  });

  if (visibleItems.length === 0) return null;

  return (
    <details className="review-section" open>
      <summary>
        <span>{section.title}</span>
        <span className="section-progress">
          {answeredCount} / {sectionItems.length} answered
        </span>
      </summary>
      <div className="review-question-list">
        {visibleItems.map(({ item, answer }) => (
          <ReviewQuestionRow key={item.linkId} item={item} answer={answer} onValueChange={onValueChange} />
        ))}
      </div>
    </details>
  );
}

function ClinicalSuggestionsPanel({
  suggestions,
  onSuggestionChange,
  onSuggestionFieldChange
}: {
  suggestions: ClinicalSuggestion[];
  onSuggestionChange: (id: string, patch: Partial<ClinicalSuggestion>) => void;
  onSuggestionFieldChange: (id: string, field: string, value: string) => void;
}) {
  return (
    <section className="card section-card clinical-suggestions-panel">
      <h2>Clinical Suggestions</h2>
      {suggestions.length === 0 ? (
        <p className="muted compact-empty">No clinical suggestions generated.</p>
      ) : (
        <div className="suggestion-list">
          {suggestions.map((suggestion) => (
            <article key={suggestion.id} className={`suggestion-card ${suggestion.accepted ? "selected" : ""}`}>
              <div className="review-card-header">
                <div>
                  <h3>{suggestion.resourceType}</h3>
                  <p>{suggestion.summary}</p>
                  {suggestion.confidence >= 0.85 && <span className="recommended-pill">Recommended to review</span>}
                </div>
                {suggestion.confidence > 0 && <ConfidenceBadge confidence={suggestion.confidence} />}
              </div>

              <div className="field-grid">
                {Object.entries(suggestion.fields).map(([field, value]) => (
                  <label key={field}>
                    {field}
                    <input value={value} onChange={(event) => onSuggestionFieldChange(suggestion.id, field, event.target.value)} />
                  </label>
                ))}
              </div>

              {suggestion.evidence.trim().length > 0 && (
                <div className="evidence">
                  <span>Evidence</span>
                  <q>{suggestion.evidence}</q>
                </div>
              )}

              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={suggestion.accepted}
                  onChange={(event) => onSuggestionChange(suggestion.id, { accepted: event.target.checked })}
                />
                Accept suggestion
              </label>
            </article>
          ))}
        </div>
      )}
    </section>
  );
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
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const answersByLinkId = new Map(answers.map((answer) => [answer.linkId, answer]));
  const answeredCount = answers.filter((answer) => hasAnswerValue(answer.value)).length;
  const unansweredCount = answers.length - answeredCount;
  const sections = getReviewSections(questionnaire.items);
  const questionnaireResponsePreview = buildQuestionnaireResponsePreview({
    requestUrl,
    patient,
    questionnaire,
    answers
  });
  const responseBody = JSON.stringify(questionnaireResponsePreview.resource, null, 2);

  function updateAnswer(linkId: string, patch: Partial<ExtractedAnswer>) {
    onAnswersChange(answers.map((answer) => (answer.linkId === linkId ? { ...answer, ...patch } : answer)));
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

    updateAnswer(item.linkId, {
      value,
      status: hasAnswerValue(value) ? "accepted" : "unanswered"
    });
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

  return (
    <section className="screen">
      <div className="screen-header">
        <div>
          <p className="eyebrow">Step 4</p>
          <h1>Manual Review</h1>
        </div>
      </div>

      <ReviewSummaryBar answeredCount={answeredCount} unansweredCount={unansweredCount} filter={filter} onFilterChange={setFilter} />

      <div className="review-layout">
        {sections.map((section) => (
          <ReviewSectionAccordion
            key={`${filter}-${section.id}`}
            section={section}
            answersByLinkId={answersByLinkId}
            filter={filter}
            onValueChange={handleValueChange}
          />
        ))}
      </div>

      <ClinicalSuggestionsPanel
        suggestions={clinicalSuggestions}
        onSuggestionChange={updateSuggestion}
        onSuggestionFieldChange={updateSuggestionField}
      />

      <FhirPreviewPanel
        requestUrl={requestUrl}
        responseBody={responseBody}
        answeredItemCount={questionnaireResponsePreview.answeredItemCount}
        onRequestUrlChange={setRequestUrl}
      />

      <div className="footer-actions">
        {answeredCount === 0 && (
          <span className="continue-helper zero-answer-warning">
            No answers have been entered. Saving will create an empty QuestionnaireResponse for this questionnaire.
          </span>
        )}
        <button className="primary-button" type="button" onClick={onContinue}>
          Continue to Save ({answeredCount} answered)
        </button>
      </div>
    </section>
  );
}
