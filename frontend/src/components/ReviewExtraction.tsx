import { useState, type ChangeEvent } from "react";
import type {
  ClinicalSuggestion,
  EncounterClassCode,
  EncounterDraft,
  ExtractedAnswer,
  ExtractedValue,
  PatientSummary,
  Questionnaire,
  QuestionnaireItem,
  ReconcileResponse,
  ReconciliationActivity,
  ReconciliationFinding
} from "../types";
import { buildQuestionnaireResponsePreview } from "../mock/mockApi";
import { flattenAnswerableItems, hasAnswerValue, manualEntryEvidence } from "../utils/questionnaireItems";
import { choiceOptionDisplay, choiceOptionInputValue, choiceOptionKey, selectedChoiceInputValue } from "../utils/choiceOptions";
import ConfidenceBadge from "./ConfidenceBadge";
import { defaultQuestionnaireResponseUrl } from "../api/questionnaires";
import { normalizeFhirDateTime } from "../utils/fhirDateTime";

interface ReviewExtractionProps {
  patient: PatientSummary;
  questionnaire: Questionnaire;
  answers: ExtractedAnswer[];
  clinicalSuggestions: ClinicalSuggestion[];
  encounterDraft: EncounterDraft | null;
  reconciliationResult: ReconcileResponse | null;
  reconciliationLoading: boolean;
  reconciliationError: string | null;
  onAnswersChange: (answers: ExtractedAnswer[]) => void;
  onSuggestionsChange: (suggestions: ClinicalSuggestion[]) => void;
  onEncounterChange: (encounter: EncounterDraft | null) => void;
  onContinue: () => void;
}

type ReviewFilter = "all" | "unanswered" | "answered";

interface ReviewSection {
  id: string;
  title: string;
  items: QuestionnaireItem[];
}

function displayValue(value: ExtractedValue) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && "display" in value) return value.display;
  return String(value);
}

function hasExtractionMetadata(answer: ExtractedAnswer) {
  return answer.confidence > 0 || (answer.evidence.trim().length > 0 && answer.evidence !== manualEntryEvidence);
}

function clinicalResourceSource(suggestion: ClinicalSuggestion) {
  return suggestion.source ?? "ai";
}

function clinicalResourceHasRequiredSubstance(suggestion: ClinicalSuggestion) {
  return suggestion.fields.substance?.trim().length > 0;
}

function isInvalidAllergyResource(suggestion: ClinicalSuggestion) {
  if (suggestion.resourceType !== "AllergyIntolerance") return false;
  const source = clinicalResourceSource(suggestion);
  return (source === "manual" || suggestion.accepted) && !clinicalResourceHasRequiredSubstance(suggestion);
}

const encounterClassLabels: Record<EncounterClassCode, string> = {
  AMB: "ambulatory",
  EMER: "emergency",
  IMP: "inpatient encounter",
  OBSENC: "observation encounter"
};

function isInvalidEncounterDraft(encounter: EncounterDraft | null) {
  return !encounter || encounter.periodStart.trim().length === 0;
}

function buildEncounterPreview(patient: PatientSummary, encounter: EncounterDraft | null) {
  if (!encounter) return null;
  const resource: Record<string, unknown> = {
    resourceType: "Encounter",
    status: encounter.status,
    class: {
      system: "http://terminology.hl7.org/CodeSystem/v3-ActCode",
      code: encounter.classCode,
      display: encounterClassLabels[encounter.classCode]
    },
    subject: {
      reference: `Patient/${patient.id}`,
      display: patient.name
    },
    period: {
      start: encounter.periodStart.trim() ? normalizeFhirDateTime(encounter.periodStart) : ""
    }
  };

  if (encounter.reasonText.trim()) {
    resource.reasonCode = [{ text: encounter.reasonText.trim() }];
  }

  return resource;
}

function makeManualAllergyIntolerance(): ClinicalSuggestion {
  const id =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`;
  return {
    id: `manual-allergy-${id}`,
    resourceType: "AllergyIntolerance",
    source: "manual",
    summary: "Manual AllergyIntolerance",
    confidence: 0,
    evidence: "Manual entry",
    fields: {
      substance: "",
      reaction: ""
    },
    accepted: true
  };
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

function ConsistencyCheckBanner({
  result,
  loading,
  error
}: {
  result: ReconcileResponse | null;
  loading: boolean;
  error: string | null;
}) {
  const toCheckCount = result?.findings.filter((finding) => finding.classification === "duplicate" || finding.classification === "contradiction").length ?? 0;
  const novelCount = result?.findings.filter((finding) => finding.classification === "novel").length ?? 0;

  if (loading) {
    return (
      <section className="consistency-banner checking">
        <div>
          <p className="eyebrow">Consistency check</p>
          <h2>Checking patient record...</h2>
          <p>Comparing the extracted draft with this patient&apos;s existing FHIR records.</p>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="consistency-banner warning">
        <div>
          <p className="eyebrow">Consistency check</p>
          <h2>Could not check existing record</h2>
          <p>Review extracted items manually. {error}</p>
        </div>
      </section>
    );
  }

  if (!result) {
    return null;
  }

  return (
    <section className="consistency-banner">
      <div className="consistency-banner-head">
        <div>
          <p className="eyebrow">Consistency check</p>
          <h2>Checked against this patient&apos;s record</h2>
        </div>
        <div className="consistency-summary">
          <span className={`consistency-count ${toCheckCount > 0 ? "warn" : ""}`}>{toCheckCount} to check</span>
          <span className="consistency-separator">·</span>
          <span className="consistency-count new">{novelCount} new</span>
        </div>
      </div>

      <details className="consistency-trail">
        <summary>What the assistant checked</summary>
        <div className="consistency-trail-list">
          {result.activityTrail.map((activity) => (
            <ConsistencyActivityStep key={`${activity.step}:${activity.message}`} activity={activity} />
          ))}
        </div>
      </details>

      {result.findings.length === 0 && <p className="consistency-empty">No duplicate, conflict, or new-record findings were flagged.</p>}
    </section>
  );
}

function ConsistencyActivityStep({ activity }: { activity: ReconciliationActivity }) {
  return (
    <div className={`consistency-step ${activity.status}`}>
      <span aria-hidden="true">{activity.status === "completed" ? "✓" : activity.status === "failed" ? "!" : "·"}</span>
      <span>{activity.message}</span>
    </div>
  );
}

function ReconciliationFindingInline({ findings }: { findings: ReconciliationFinding[] }) {
  if (findings.length === 0) {
    return null;
  }

  return (
    <div className="reconciliation-finding-list">
      {findings.map((finding, index) => (
        <article key={`${finding.classification}:${finding.domain}:${index}`} className={`reconciliation-finding ${finding.classification}`}>
          <div className="reconciliation-finding-head">
            <strong>{finding.summary}</strong>
            <div className="reconciliation-tag-group">
              <span className={`reconciliation-tag ${finding.classification}`}>{findingLabel(finding.classification)}</span>
              <span className={`reconciliation-source-badge ${findingSourceClass(finding.source)}`}>
                {findingSourceLabel(finding.source)}
              </span>
            </div>
          </div>
          <p>{finding.rationale}</p>
          {finding.draftEvidence && (
            <div className="reconciliation-evidence">
              <span>Draft evidence</span>
              <q>{finding.draftEvidence}</q>
            </div>
          )}
          {finding.existingResourceRefs.length > 0 && (
            <div className="reconciliation-citations">
              <span>On file</span>
              {finding.existingResourceRefs.map((reference) => (
                <code key={reference}>{reference}</code>
              ))}
            </div>
          )}
          {finding.recommendation && <p className="reconciliation-recommendation">{finding.recommendation}</p>}
        </article>
      ))}
    </div>
  );
}

function findingLabel(classification: ReconciliationFinding["classification"]) {
  if (classification === "duplicate") return "Already on file";
  if (classification === "contradiction") return "Conflicts with record";
  return "New";
}

function findingSourceLabel(source: ReconciliationFinding["source"]) {
  if (source === "llm_semantic") return "AI semantic";
  if (source === "deterministic") return "Rule-based";
  return "Record check";
}

function findingSourceClass(source: ReconciliationFinding["source"]) {
  if (source === "llm_semantic") return "llm";
  if (source === "deterministic") return "deterministic";
  return "unknown";
}

function findingsByAnswerLinkId(findings: ReconciliationFinding[]): Map<string, ReconciliationFinding[]> {
  const map = new Map<string, ReconciliationFinding[]>();
  findings.forEach((finding) => {
    if (finding.targetKind !== "answer" || !finding.targetLinkId) return;
    const list = map.get(finding.targetLinkId) ?? [];
    list.push(finding);
    map.set(finding.targetLinkId, list);
  });
  return map;
}

function findingsByClinicalSuggestionIndex(findings: ReconciliationFinding[]): Map<number, ReconciliationFinding[]> {
  const map = new Map<number, ReconciliationFinding[]>();
  findings.forEach((finding) => {
    if (finding.targetKind !== "clinicalSuggestion" || finding.targetClinicalSuggestionIndex === null || finding.targetClinicalSuggestionIndex === undefined) {
      return;
    }
    const list = map.get(finding.targetClinicalSuggestionIndex) ?? [];
    list.push(finding);
    map.set(finding.targetClinicalSuggestionIndex, list);
  });
  return map;
}

function ReviewQuestionRow({
  item,
  answer,
  findings,
  onValueChange
}: {
  item: QuestionnaireItem;
  answer: ExtractedAnswer;
  findings: ReconciliationFinding[];
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
        <select value={selectedChoiceInputValue(answer.value, item.options)} onChange={(event) => onValueChange(item, event)}>
          <option value="">Unanswered</option>
          {item.options?.map((option, index) => (
            <option key={choiceOptionKey(option, index)} value={choiceOptionInputValue(option)}>
              {choiceOptionDisplay(option)}
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

      <ReconciliationFindingInline findings={findings} />
    </article>
  );
}

function ReviewSectionAccordion({
  section,
  answersByLinkId,
  findingsByLinkId,
  filter,
  onValueChange
}: {
  section: ReviewSection;
  answersByLinkId: Map<string, ExtractedAnswer>;
  findingsByLinkId: Map<string, ReconciliationFinding[]>;
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
          <ReviewQuestionRow
            key={item.linkId}
            item={item}
            answer={answer}
            findings={findingsByLinkId.get(item.linkId) ?? []}
            onValueChange={onValueChange}
          />
        ))}
      </div>
    </details>
  );
}

function EncounterReviewPanel({
  patient,
  encounter,
  onEncounterChange
}: {
  patient: PatientSummary;
  encounter: EncounterDraft | null;
  onEncounterChange: (encounter: EncounterDraft | null) => void;
}) {
  const preview = buildEncounterPreview(patient, encounter);
  const hasInvalidEncounter = isInvalidEncounterDraft(encounter);

  function updateEncounter(patch: Partial<EncounterDraft>) {
    if (!encounter) {
      onEncounterChange({
        status: "in-progress",
        classCode: "AMB",
        periodStart: "",
        reasonText: "",
        ...patch
      });
      return;
    }
    onEncounterChange({ ...encounter, ...patch });
  }

  return (
    <section className="card section-card encounter-review-panel">
      <div className="review-card-header">
        <div>
          <h2>Encounter</h2>
          <p className="muted compact-empty">Review the Encounter that will be created with this intake. End date is omitted while the encounter is in progress.</p>
        </div>
      </div>

      {hasInvalidEncounter && <p className="query-error">Encounter start date and time is required before saving.</p>}

      <div className="field-grid">
        <label>
          Status
          <select value={encounter?.status ?? "in-progress"} onChange={(event) => updateEncounter({ status: event.target.value as EncounterDraft["status"] })}>
            <option value="planned">Planned</option>
            <option value="in-progress">In progress</option>
            <option value="finished">Finished</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>

        <label>
          Class
          <select value={encounter?.classCode ?? "AMB"} onChange={(event) => updateEncounter({ classCode: event.target.value as EncounterClassCode })}>
            <option value="AMB">Ambulatory</option>
            <option value="EMER">Emergency</option>
            <option value="IMP">Inpatient</option>
            <option value="OBSENC">Observation</option>
          </select>
        </label>

        <label>
          Start date and time
          <input
            type="datetime-local"
            value={encounter?.periodStart ?? ""}
            aria-invalid={hasInvalidEncounter}
            onChange={(event) => updateEncounter({ periodStart: event.target.value })}
          />
        </label>

        <label>
          Reason
          <input
            value={encounter?.reasonText ?? ""}
            placeholder="Optional reason for encounter"
            onChange={(event) => updateEncounter({ reasonText: event.target.value })}
          />
        </label>
      </div>

      <details className="raw-response">
        <summary>FHIR Encounter preview</summary>
        <pre>{preview ? JSON.stringify(preview, null, 2) : "Encounter is missing."}</pre>
      </details>
    </section>
  );
}

function ClinicalSuggestionsPanel({
  suggestions,
  findingsBySuggestionIndex,
  onSuggestionChange,
  onSuggestionFieldChange,
  onAddManualAllergy,
  onRemoveManualSuggestion,
  hasInvalidAllergyResource
}: {
  suggestions: ClinicalSuggestion[];
  findingsBySuggestionIndex: Map<number, ReconciliationFinding[]>;
  onSuggestionChange: (id: string, patch: Partial<ClinicalSuggestion>) => void;
  onSuggestionFieldChange: (id: string, field: string, value: string) => void;
  onAddManualAllergy: () => void;
  onRemoveManualSuggestion: (id: string) => void;
  hasInvalidAllergyResource: boolean;
}) {
  return (
    <section className="card section-card clinical-suggestions-panel">
      <div className="review-card-header">
        <div>
          <h2>Additional Clinical Resources</h2>
          <p className="muted compact-empty">Add resources to create during save, or accept AI-suggested resources.</p>
        </div>
        <button className="secondary-button" type="button" onClick={onAddManualAllergy}>
          + Add AllergyIntolerance
        </button>
      </div>
      {hasInvalidAllergyResource && <p className="query-error">Substance is required for AllergyIntolerance resources.</p>}
      {suggestions.length === 0 ? (
        <p className="muted compact-empty">No clinical resources added.</p>
      ) : (
        <div className="suggestion-list">
          {suggestions.map((suggestion, index) => {
            const source = clinicalResourceSource(suggestion);
            const isManual = source === "manual";
            const isInvalid = isInvalidAllergyResource(suggestion);
            return (
              <article key={suggestion.id} className={`suggestion-card ${suggestion.accepted ? "selected" : ""}`}>
                <div className="review-card-header">
                  <div>
                    <h3>{suggestion.resourceType}</h3>
                    <p>{suggestion.summary}</p>
                    <span className="recommended-pill">{isManual ? "Manually added" : "AI suggested"}</span>
                    {!isManual && suggestion.confidence >= 0.85 && <span className="recommended-pill">Recommended to review</span>}
                  </div>
                  {!isManual && suggestion.confidence > 0 && <ConfidenceBadge confidence={suggestion.confidence} />}
                </div>

                <div className="field-grid">
                  <label>
                    Substance
                    <input
                      value={suggestion.fields.substance ?? ""}
                      aria-invalid={isInvalid}
                      onChange={(event) => onSuggestionFieldChange(suggestion.id, "substance", event.target.value)}
                    />
                  </label>
                  <label>
                    Reaction
                    <input
                      value={suggestion.fields.reaction ?? ""}
                      onChange={(event) => onSuggestionFieldChange(suggestion.id, "reaction", event.target.value)}
                    />
                  </label>
                </div>

                {!isManual && suggestion.evidence.trim().length > 0 && (
                  <div className="evidence">
                    <span>Evidence</span>
                    <q>{suggestion.evidence}</q>
                  </div>
                )}

                <ReconciliationFindingInline findings={findingsBySuggestionIndex.get(index) ?? []} />

                {isManual ? (
                  <button className="secondary-button" type="button" onClick={() => onRemoveManualSuggestion(suggestion.id)}>
                    Remove
                  </button>
                ) : (
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={suggestion.accepted}
                      onChange={(event) => onSuggestionChange(suggestion.id, { accepted: event.target.checked })}
                    />
                    Accept suggestion
                  </label>
                )}
              </article>
            );
          })}
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
  encounterDraft,
  reconciliationResult,
  reconciliationLoading,
  reconciliationError,
  onAnswersChange,
  onSuggestionsChange,
  onEncounterChange,
  onContinue
}: ReviewExtractionProps) {
  const [requestUrl, setRequestUrl] = useState(defaultQuestionnaireResponseUrl);
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const answersByLinkId = new Map(answers.map((answer) => [answer.linkId, answer]));
  const findingsByLinkId = findingsByAnswerLinkId(reconciliationResult?.findings ?? []);
  const findingsBySuggestionIndex = findingsByClinicalSuggestionIndex(reconciliationResult?.findings ?? []);
  const answeredCount = answers.filter((answer) => hasAnswerValue(answer.value)).length;
  const unansweredCount = answers.length - answeredCount;
  const hasInvalidAllergyResource = clinicalSuggestions.some(isInvalidAllergyResource);
  const hasInvalidEncounter = isInvalidEncounterDraft(encounterDraft);
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
      value = item.options?.find((option) => choiceOptionInputValue(option) === raw) ?? null;
    }

    updateAnswer(item.linkId, {
      value,
      status: hasAnswerValue(value) ? "edited" : "unanswered"
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

  function addManualAllergy() {
    onSuggestionsChange([...clinicalSuggestions, makeManualAllergyIntolerance()]);
  }

  function removeManualSuggestion(id: string) {
    onSuggestionsChange(clinicalSuggestions.filter((suggestion) => !(suggestion.id === id && clinicalResourceSource(suggestion) === "manual")));
  }

  return (
    <section className="screen">
      <div className="screen-header">
        <div>
          <p className="eyebrow">Step 4</p>
          <h1>Manual Review</h1>
          <p className="muted">
            AI-extracted answers are pre-filled below. Review and edit any values before continuing. Continuing to Save confirms the values shown.
          </p>
        </div>
      </div>

      <ReviewSummaryBar answeredCount={answeredCount} unansweredCount={unansweredCount} filter={filter} onFilterChange={setFilter} />

      <ConsistencyCheckBanner result={reconciliationResult} loading={reconciliationLoading} error={reconciliationError} />

      <div className="review-layout">
        {sections.map((section) => (
          <ReviewSectionAccordion
            key={`${filter}-${section.id}`}
            section={section}
            answersByLinkId={answersByLinkId}
            findingsByLinkId={findingsByLinkId}
            filter={filter}
            onValueChange={handleValueChange}
          />
        ))}
      </div>

      <ClinicalSuggestionsPanel
        suggestions={clinicalSuggestions}
        findingsBySuggestionIndex={findingsBySuggestionIndex}
        onSuggestionChange={updateSuggestion}
        onSuggestionFieldChange={updateSuggestionField}
        onAddManualAllergy={addManualAllergy}
        onRemoveManualSuggestion={removeManualSuggestion}
        hasInvalidAllergyResource={hasInvalidAllergyResource}
      />

      <EncounterReviewPanel patient={patient} encounter={encounterDraft} onEncounterChange={onEncounterChange} />

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
        {hasInvalidAllergyResource && (
          <span className="continue-helper zero-answer-warning">Substance is required for AllergyIntolerance resources.</span>
        )}
        {hasInvalidEncounter && (
          <span className="continue-helper zero-answer-warning">Encounter start date and time is required before saving.</span>
        )}
        <button className="primary-button" type="button" onClick={onContinue} disabled={hasInvalidAllergyResource || hasInvalidEncounter}>
          Continue to Save ({answeredCount} answered)
        </button>
      </div>
    </section>
  );
}
