import { useEffect, useMemo, useState } from "react";
import { defaultQuestionnaireSearchUrl, queryQuestionnairesFhir } from "../api/questionnaires";
import type { QuestionnaireQueryResult, QuestionnaireSummary } from "../types";

export default function QuestionnairesPage() {
  const [requestUrl, setRequestUrl] = useState(defaultQuestionnaireSearchUrl);
  const [queryResult, setQueryResult] = useState<QuestionnaireQueryResult | null>(null);
  const [questionnaires, setQuestionnaires] = useState<QuestionnaireSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  async function runQuery(nextRequestUrl = requestUrl) {
    setLoading(true);
    const result = await queryQuestionnairesFhir(nextRequestUrl);
    setQueryResult(result);
    setQuestionnaires(result.questionnaires);
    setSelectedId((current) => (current && result.questionnaires.some((questionnaire) => questionnaire.id === current) ? current : null));
    setLoading(false);
  }

  useEffect(() => {
    void runQuery(defaultQuestionnaireSearchUrl);
    // Initial questionnaire workspace query only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedQuestionnaire = useMemo(
    () => questionnaires.find((questionnaire) => questionnaire.id === selectedId) ?? null,
    [questionnaires, selectedId]
  );
  const selectedRawResource = selectedQuestionnaire ? rawQuestionnaireResource(queryResult, selectedQuestionnaire.id) : null;
  const responseBody = queryResult ? JSON.stringify(queryResult.bundle, null, 2) : "";
  const statusText = queryResult
    ? `${queryResult.status} ${queryResult.statusText} - Bundle - ${queryResult.bundle.total} entries`
    : "waiting";

  return (
    <section className="screen">
      <div className="pagehead questionnaire-workspace-head">
        <div>
          <p className="page-label">Configure</p>
          <h1>Questionnaires</h1>
        </div>
        <div className="questionnaire-workspace-actions">
          <span className="questionnaire-builder-note">Builder coming soon. Seeded FHIR Questionnaires are listed here for now.</span>
          <button className="primary-button" type="button" disabled title="Builder coming soon">
            + New questionnaire
          </button>
        </div>
      </div>

      <div className="questionnaire-table" role="table" aria-label="Questionnaires">
        {!loading && questionnaires.length > 0 && (
          <div className="questionnaire-table-head" role="row">
            <span role="columnheader">Title</span>
            <span role="columnheader">FHIR ID</span>
            <span role="columnheader">Version</span>
            <span role="columnheader">Status</span>
            <span role="columnheader">Questions</span>
            <span role="columnheader">Action</span>
          </div>
        )}

        {loading ? (
          <p className="muted questionnaire-empty">Loading questionnaires...</p>
        ) : queryResult?.error ? (
          <div className="questionnaire-empty">
            <p>Unable to load questionnaires.</p>
          </div>
        ) : questionnaires.length === 0 ? (
          <div className="questionnaire-empty">
            <p>No questionnaires found.</p>
          </div>
        ) : (
          questionnaires.map((questionnaire) => (
            <div key={questionnaire.id} className="questionnaire-row" role="row">
              <span className="questionnaire-title-cell" role="cell">
                <span className="mobile-label">Title</span>
                <strong>{questionnaire.title || "Untitled questionnaire"}</strong>
                <span className="questionnaire-muted">{questionnaire.description}</span>
              </span>
              <span className="questionnaire-meta-cell" role="cell">
                <span className="mobile-label">Slug / FHIR ID</span>
                {questionnaireSlug(questionnaire)}
              </span>
              <span className="questionnaire-meta-cell" role="cell">
                <span className="mobile-label">Version</span>
                {formatVersion(questionnaire.version)}
              </span>
              <span role="cell">
                <span className="mobile-label">Status</span>
                <span className={`questionnaire-status-badge ${questionnaireStatusClass(questionnaire.status)}`}>{questionnaire.status}</span>
              </span>
              <span className="questionnaire-meta-cell" role="cell">
                <span className="mobile-label">Questions</span>
                {itemCountText(questionnaire.itemCount)}
              </span>
              <span className="questionnaire-action-cell" role="cell">
                <button className="link-button" type="button" onClick={() => setSelectedId(questionnaire.id)}>
                  View
                </button>
                <span className="questionnaire-muted">{questionnaire.status === "active" ? "Available for intake" : "Read-only for now"}</span>
              </span>
            </div>
          ))
        )}
      </div>

      {selectedQuestionnaire && (
        <section className="questionnaire-detail-panel" aria-label="Selected questionnaire detail">
          <div className="questionnaire-detail-header">
            <div>
              <p className="page-label">Selected questionnaire</p>
              <h2>{selectedQuestionnaire.title || "Untitled questionnaire"}</h2>
            </div>
            <button className="secondary-button" type="button" onClick={() => setSelectedId(null)}>
              Close
            </button>
          </div>

          <dl className="questionnaire-detail-grid">
            <div>
              <dt>FHIR ID</dt>
              <dd>{selectedQuestionnaire.id}</dd>
            </div>
            <div>
              <dt>Slug</dt>
              <dd>{questionnaireSlug(selectedQuestionnaire)}</dd>
            </div>
            <div>
              <dt>Version</dt>
              <dd>{formatVersion(selectedQuestionnaire.version)}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{selectedQuestionnaire.status}</dd>
            </div>
            <div>
              <dt>Items</dt>
              <dd>{itemCountText(selectedQuestionnaire.itemCount)}</dd>
            </div>
            <div>
              <dt>URL</dt>
              <dd>{selectedQuestionnaire.url || "No canonical URL"}</dd>
            </div>
          </dl>

          {selectedRawResource && (
            <details className="raw-response">
              <summary>Raw FHIR Questionnaire resource</summary>
              <pre>{JSON.stringify(selectedRawResource, null, 2)}</pre>
            </details>
          )}
        </section>
      )}

      <details className="intake-demo-panel questionnaire-demo-panel">
        <summary>
          <span className="intake-demo-lead">
            <span className="intake-demo-kicker">Demo</span>
            <span className="intake-demo-title">FHIR Questionnaire search</span>
            <span className={`intake-demo-badge ${queryResult?.status === 200 ? "ok" : queryResult ? "warn" : ""}`}>{statusText}</span>
          </span>
          <span className="intake-demo-caret">show</span>
        </summary>

        <div className="intake-demo-inner">
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
      </details>

      <p className="app-footnote">
        Questionnaires are treated as versioned templates. Once responses exist, structural edits should create a new version so saved
        QuestionnaireResponses remain interpretable.
      </p>
    </section>
  );
}

function questionnaireSlug(questionnaire: QuestionnaireSummary): string {
  const path = safeUrlPath(questionnaire.url).replace(/\/$/, "");
  const parts = path.split("/").filter(Boolean);
  const slug = parts.length ? parts[parts.length - 1] : "";
  return slug || questionnaire.id;
}

function safeUrlPath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

function formatVersion(version: string): string {
  return version ? `v${version}` : "Unversioned";
}

function itemCountText(itemCount: number): string {
  return itemCount === 1 ? "1 item" : `${itemCount} items`;
}

function questionnaireStatusClass(status: QuestionnaireSummary["status"]): string {
  if (status === "active") return "active";
  if (status === "draft") return "draft";
  if (status === "retired") return "retired";
  return "unknown";
}

function rawQuestionnaireResource(result: QuestionnaireQueryResult | null, questionnaireId: string): Record<string, unknown> | null {
  const resource = result?.bundle.entry?.find((entry) => entry.resource?.resourceType === "Questionnaire" && entry.resource.id === questionnaireId)
    ?.resource;
  return resource && resource.resourceType === "Questionnaire" ? (resource as unknown as Record<string, unknown>) : null;
}
