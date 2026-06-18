import { useEffect, useState } from "react";
import type { Questionnaire, QuestionnaireQueryResult, QuestionnaireSummary } from "../types";
import { getQuestionnaire, queryQuestionnairesFhir } from "../mock/mockApi";

const defaultQuestionnaireRequestUrl = "http://localhost:8080/csp/healthshare/demo/fhir/r4/Questionnaire?_count=10";

interface QuestionnaireSelectionProps {
  selectedQuestionnaire: Questionnaire | null;
  onSelectQuestionnaire: (questionnaire: Questionnaire) => void;
  onContinue: () => void;
}

export default function QuestionnaireSelection({
  selectedQuestionnaire,
  onSelectQuestionnaire,
  onContinue
}: QuestionnaireSelectionProps) {
  const [requestUrl, setRequestUrl] = useState(defaultQuestionnaireRequestUrl);
  const [queryResult, setQueryResult] = useState<QuestionnaireQueryResult | null>(null);
  const [questionnaires, setQuestionnaires] = useState<QuestionnaireSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectingId, setSelectingId] = useState<string | null>(null);

  async function runQuery(nextRequestUrl = requestUrl) {
    setLoading(true);
    setQuestionnaires([]);
    const result = await queryQuestionnairesFhir(nextRequestUrl);
    setQueryResult(result);
    setQuestionnaires(result.questionnaires);
    setLoading(false);
  }

  useEffect(() => {
    void runQuery(defaultQuestionnaireRequestUrl);
    // Initial mock FHIR query only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSelect(id: string) {
    setSelectingId(id);
    try {
      const questionnaire = await getQuestionnaire(id);
      onSelectQuestionnaire(questionnaire);
    } finally {
      setSelectingId(null);
    }
  }

  const responseBody = queryResult ? JSON.stringify(queryResult.bundle, null, 2) : "";
  const statusText = queryResult
    ? `GET · ${queryResult.status} ${queryResult.statusText} · Bundle · ${queryResult.bundle.total} entries`
    : "GET · waiting";

  return (
    <section className="screen">
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

        {queryResult?.error && <p className="query-error">{queryResult.error}</p>}

        {queryResult && (
          <details className="raw-response">
            <summary>Raw FHIR response</summary>
            <pre>{responseBody}</pre>
          </details>
        )}
      </div>

      <div className="screen-header">
        <div>
          <p className="eyebrow">Step 2</p>
          <h1>Select Questionnaire</h1>
        </div>
      </div>

      <div className="card-grid">
        {loading ? (
          <p className="muted">Loading questionnaires...</p>
        ) : (
          questionnaires.map((questionnaire) => (
            <button
              key={questionnaire.id}
              type="button"
              className={`questionnaire-card ${selectedQuestionnaire?.id === questionnaire.id ? "selected" : ""}`}
              onClick={() => void handleSelect(questionnaire.id)}
            >
              <span className="status-pill">{questionnaire.status}</span>
              <strong>{questionnaire.title}</strong>
              <span>Version {questionnaire.version}</span>
              <p>{questionnaire.description}</p>
              <span>{questionnaire.itemCount} items</span>
              {selectingId === questionnaire.id && <span className="muted">Selecting...</span>}
            </button>
          ))
        )}
      </div>

      <div className="footer-actions">
        <button className="primary-button" type="button" onClick={onContinue} disabled={!selectedQuestionnaire}>
          Continue to Conversation
        </button>
      </div>
    </section>
  );
}
