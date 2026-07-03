import { useEffect, useMemo, useState } from "react";
import type {
  InformationGap,
  IntakeQuestionnaireRecommendation,
  IntakeRecommendationResponse,
  PatientRecordFact,
  PatientSummary,
  Questionnaire,
  QuestionnaireQueryResult,
  QuestionnaireSummary
} from "../types";
import { getIntakeRecommendations } from "../api/intakeRecommendations";
import { defaultQuestionnaireSearchUrl, getQuestionnaire, queryQuestionnairesFhir } from "../api/questionnaires";

interface QuestionnaireSelectionProps {
  patient: PatientSummary;
  selectedQuestionnaire: Questionnaire | null;
  onSelectQuestionnaire: (questionnaire: Questionnaire) => void;
  onContinue: () => void;
}

export default function QuestionnaireSelection({
  patient,
  selectedQuestionnaire,
  onSelectQuestionnaire,
  onContinue
}: QuestionnaireSelectionProps) {
  const [requestUrl, setRequestUrl] = useState(defaultQuestionnaireSearchUrl);
  const [queryResult, setQueryResult] = useState<QuestionnaireQueryResult | null>(null);
  const [questionnaires, setQuestionnaires] = useState<QuestionnaireSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [selectionError, setSelectionError] = useState("");
  const [recommendations, setRecommendations] = useState<IntakeRecommendationResponse | null>(null);
  const [recommendationLoading, setRecommendationLoading] = useState(false);
  const [recommendationError, setRecommendationError] = useState("");
  const [showSourceRefs, setShowSourceRefs] = useState(false);
  const [recommendedFirst, setRecommendedFirst] = useState(true);

  async function runQuery(nextRequestUrl = requestUrl) {
    setLoading(true);
    setSelectionError("");
    setRecommendationError("");
    setRecommendations(null);
    setQuestionnaires([]);
    const result = await queryQuestionnairesFhir(nextRequestUrl);
    setQueryResult(result);
    setQuestionnaires(result.questionnaires);
    setLoading(false);
    if (result.questionnaires.length > 0 && !result.error) {
      void runRecommendation(result.questionnaires);
    }
  }

  async function runRecommendation(nextQuestionnaires: QuestionnaireSummary[]) {
    setRecommendationLoading(true);
    setRecommendationError("");
    try {
      const result = await getIntakeRecommendations({
        patientId: patient.id,
        questionnaires: nextQuestionnaires
      });
      setRecommendations(result);
    } catch (error) {
      setRecommendationError(error instanceof Error ? error.message : "AI recommendations unavailable.");
    } finally {
      setRecommendationLoading(false);
    }
  }

  useEffect(() => {
    void runQuery(defaultQuestionnaireSearchUrl);
    // Initial questionnaire query only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient.id]);

  async function handleSelect(id: string) {
    setSelectingId(id);
    setSelectionError("");
    try {
      const questionnaire = await getQuestionnaire(id);
      onSelectQuestionnaire(questionnaire);
    } catch (error) {
      setSelectionError(error instanceof Error ? error.message : "Questionnaire selection failed.");
    } finally {
      setSelectingId(null);
    }
  }

  const recommendationById = useMemo(() => {
    return new Map((recommendations?.recommendations ?? []).map((recommendation) => [recommendation.questionnaireId, recommendation]));
  }, [recommendations]);

  const sortedQuestionnaires = useMemo(() => {
    if (!recommendedFirst) return questionnaires;
    return [...questionnaires].sort((left, right) => {
      const leftRecommended = recommendationById.has(left.id) ? 0 : 1;
      const rightRecommended = recommendationById.has(right.id) ? 0 : 1;
      return leftRecommended - rightRecommended;
    });
  }, [questionnaires, recommendationById, recommendedFirst]);

  const responseBody = queryResult ? JSON.stringify(queryResult.bundle, null, 2) : "";
  const statusText = queryResult
    ? `GET - ${queryResult.status} ${queryResult.statusText} - Bundle - ${queryResult.bundle.total} entries`
    : "GET - waiting";

  const bundleEntryCount = queryResult?.bundle.entry?.length ?? 0;
  const hasUnmappedBundleResources = !loading && bundleEntryCount > 0 && questionnaires.length === 0 && !queryResult?.error;

  return (
    <section className="screen questionnaire-selection-screen">
      <div className="fhir-query-panel">
        <div className="query-panel-header">
          <div>
            <p className="eyebrow">Demo</p>
            <h2>FHIR Questionnaire Search</h2>
          </div>
          <span className={`query-status ${queryResult?.status === 200 ? "ok" : queryResult ? "warn" : ""}`}>{statusText}</span>
        </div>

        <label className="request-field">
          Request URL
          <div className="request-row">
            <input value={requestUrl} onChange={(event) => setRequestUrl(event.target.value)} spellCheck={false} />
            <button className="secondary-button" type="button" onClick={() => void runQuery()} disabled={loading}>
              {loading ? "Querying..." : "Query"}
            </button>
          </div>
        </label>

        {(queryResult?.error || selectionError) && <p className="query-error">{queryResult?.error || selectionError}</p>}

        {queryResult && (
          <details className="raw-response">
            <summary>Raw FHIR response</summary>
            <pre>{responseBody}</pre>
          </details>
        )}
      </div>

      <IntakeRecommendationPanel
        recommendations={recommendations}
        loading={recommendationLoading}
        error={recommendationError}
        showSourceRefs={showSourceRefs}
        onToggleSourceRefs={() => setShowSourceRefs((value) => !value)}
      />

      <div className="screen-header questionnaire-selection-header">
        <div>
          <p className="eyebrow">Step 2</p>
          <h1>Select Questionnaire</h1>
        </div>
        <div className="questionnaire-sort-control">
          <span>Recommended questionnaires are pinned first</span>
          <button
            className={`filter-chip ${recommendedFirst ? "selected" : ""}`}
            type="button"
            onClick={() => setRecommendedFirst((value) => !value)}
          >
            {recommendedFirst ? "Recommended first" : "Original order"}
          </button>
        </div>
      </div>

      <div className="card-grid questionnaire-recommendation-grid">
        {loading ? (
          <p className="muted">Loading questionnaires...</p>
        ) : hasUnmappedBundleResources ? (
          <p className="muted">FHIR Bundle returned resources, but none could be mapped to questionnaire cards.</p>
        ) : questionnaires.length === 0 ? (
          <p className="muted">No questionnaires found.</p>
        ) : (
          sortedQuestionnaires.map((questionnaire) => (
            <QuestionnaireCard
              key={questionnaire.id}
              questionnaire={questionnaire}
              selected={selectedQuestionnaire?.id === questionnaire.id}
              selecting={selectingId === questionnaire.id}
              recommendation={recommendationById.get(questionnaire.id)}
              showSourceRefs={showSourceRefs}
              onSelect={() => void handleSelect(questionnaire.id)}
            />
          ))
        )}
      </div>

      <div className="footer-actions questionnaire-selection-bar">
        <div className="selection-copy">
          {selectedQuestionnaire ? (
            <>
              <strong>{selectedQuestionnaire.title}</strong> selected. You can still choose another questionnaire.
            </>
          ) : (
            <>
              <strong>No questionnaire selected.</strong> AI recommendations are optional.
            </>
          )}
        </div>
        <button className="primary-button" type="button" onClick={onContinue} disabled={!selectedQuestionnaire}>
          Continue to Conversation
        </button>
      </div>
    </section>
  );
}

function IntakeRecommendationPanel({
  recommendations,
  loading,
  error,
  showSourceRefs,
  onToggleSourceRefs
}: {
  recommendations: IntakeRecommendationResponse | null;
  loading: boolean;
  error: string;
  showSourceRefs: boolean;
  onToggleSourceRefs: () => void;
}) {
  if (loading) {
    return (
      <section className="recommendation-summary-card checking">
        <p className="eyebrow">AI patient context</p>
        <h2>Checking patient record...</h2>
        <p className="muted">Using approved patient-scoped FHIR reads to prepare questionnaire recommendations.</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="recommendation-summary-card warning">
        <p className="eyebrow">AI patient context</p>
        <h2>AI recommendations unavailable</h2>
        <p className="muted">You can still choose a questionnaire manually. {error}</p>
      </section>
    );
  }

  if (!recommendations) {
    return null;
  }

  return (
    <>
      <p className="section-kicker">AI patient context</p>
      <section className="recommendation-summary-card">
        <div className="recommendation-summary-top">
          <div>
            <div className="recommendation-summary-title">
              Patient summary
              <span className="ai-pill">AI assisted - read only</span>
            </div>
            <p>{recommendations.overview}</p>
          </div>
          <button className="secondary-button" type="button" onClick={onToggleSourceRefs}>
            {showSourceRefs ? "Hide source refs" : "Show source refs"}
          </button>
        </div>

        <div className="recommendation-summary-grid">
          <SummaryStat title="Active conditions" facts={recommendations.summary.activeConditions} emptyText="No active conditions found in checked records." showSourceRefs={showSourceRefs} />
          <SummaryStat title="Current medications" facts={recommendations.summary.currentMedications} emptyText="No current medications found in checked records." showSourceRefs={showSourceRefs} />
          <SummaryStat title="Known allergies" facts={recommendations.summary.knownAllergies} emptyText="No active allergies found in checked records." showSourceRefs={showSourceRefs} />
          <GapStat gaps={recommendations.summary.informationGaps} showSourceRefs={showSourceRefs} />
        </div>

        <div className="recommendation-note">
          <strong>Recommendation:</strong>
          <span>{recommendationNote(recommendations.recommendations)}</span>
        </div>

        <p className="recommendation-records-checked">
          Checked {recommendations.recordsChecked.conditionCount} conditions, {recommendations.recordsChecked.medicationStatementCount} medication statements,{" "}
          {recommendations.recordsChecked.allergyIntoleranceCount} allergies, {recommendations.recordsChecked.questionnaireResponseCount} questionnaire
          responses, and {recommendations.recordsChecked.questionnaireCount} questionnaire candidates.
        </p>

        {recommendations.warnings.length > 0 && (
          <div className="recommendation-warnings">
            {recommendations.warnings.map((warning) => (
              <span key={warning}>{warning}</span>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function SummaryStat({
  title,
  facts,
  emptyText,
  showSourceRefs
}: {
  title: string;
  facts: PatientRecordFact[];
  emptyText: string;
  showSourceRefs: boolean;
}) {
  return (
    <div className="recommendation-summary-stat">
      <span>{title}</span>
      <p>{facts.length ? facts.map((fact) => `${fact.display}${fact.status ? ` (${fact.status})` : ""}`).join(", ") : emptyText}</p>
      {showSourceRefs && facts.length > 0 && <code>{facts.map((fact) => fact.resourceRef).join(", ")}</code>}
    </div>
  );
}

function GapStat({ gaps, showSourceRefs }: { gaps: InformationGap[]; showSourceRefs: boolean }) {
  return (
    <div className="recommendation-summary-stat">
      <span>Information gaps</span>
      <p>{gaps.length ? gaps.map((gap) => gap.message).join(" ") : "No information gaps were flagged from checked records."}</p>
      {showSourceRefs && gaps.some((gap) => gap.evidenceRefs.length > 0) && (
        <code>{gaps.flatMap((gap) => gap.evidenceRefs).join(", ")}</code>
      )}
    </div>
  );
}

function QuestionnaireCard({
  questionnaire,
  selected,
  selecting,
  recommendation,
  showSourceRefs,
  onSelect
}: {
  questionnaire: QuestionnaireSummary;
  selected: boolean;
  selecting: boolean;
  recommendation?: IntakeQuestionnaireRecommendation;
  showSourceRefs: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`questionnaire-card ${recommendation ? "recommended" : ""} ${selected ? "selected" : ""}`}
      onClick={onSelect}
    >
      {recommendation && <span className="recommendation-ribbon">AI recommended</span>}
      <span className="status-pill">{questionnaire.status}</span>
      <strong>{questionnaire.title}</strong>
      <span>Version {questionnaire.version || "Unversioned"}</span>
      <p>{questionnaire.description}</p>
      <span>{questionnaire.itemCount} items</span>
      {recommendation && (
        <div className="questionnaire-reason">
          <span>Why</span>
          <p>{recommendation.reason}</p>
          <small>{Math.round(recommendation.confidence * 100)}% confidence</small>
          {showSourceRefs && recommendation.evidenceRefs.length > 0 && <code>{recommendation.evidenceRefs.join(", ")}</code>}
        </div>
      )}
      {selecting && <span className="muted">Selecting...</span>}
    </button>
  );
}

function recommendationNote(recommendations: IntakeQuestionnaireRecommendation[]) {
  if (recommendations.length === 0) {
    return "No questionnaire recommendations returned. Choose any active questionnaire manually.";
  }
  const names = recommendations.map((recommendation) => recommendation.title);
  if (names.length === 1) {
    return `Start with ${names[0]} if it fits this visit.`;
  }
  return `Start with ${names[0]}, then consider ${names.slice(1).join(" or ")} if broader follow-up is needed.`;
}
