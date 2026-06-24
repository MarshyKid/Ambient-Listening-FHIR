import { useEffect, useMemo, useState } from "react";
import {
  defaultQuestionnaireSearchUrl,
  getQuestionnaireDetail,
  queryQuestionnairesFhir,
  type QuestionnaireDetailViewResult
} from "../api/questionnaires";
import { choiceOptionDisplay, choiceOptionKey } from "../utils/choiceOptions";
import { countGroups, flattenAnswerableItems } from "../utils/questionnaireItems";
import type { ChoiceOption, Questionnaire, QuestionnaireItem, QuestionnaireQueryResult, QuestionnaireSummary } from "../types";

export default function QuestionnairesPage() {
  const [requestUrl, setRequestUrl] = useState(defaultQuestionnaireSearchUrl);
  const [queryResult, setQueryResult] = useState<QuestionnaireQueryResult | null>(null);
  const [questionnaires, setQuestionnaires] = useState<QuestionnaireSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailResult, setDetailResult] = useState<QuestionnaireDetailViewResult | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

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

  useEffect(() => {
    if (!selectedId) {
      setDetailResult(null);
      setDetailError(null);
      setDetailLoading(false);
      return;
    }

    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);
    setDetailResult(null);

    getQuestionnaireDetail(selectedId)
      .then((result) => {
        if (cancelled) return;
        setDetailResult(result);
      })
      .catch((error) => {
        if (cancelled) return;
        setDetailError(error instanceof Error ? error.message : "Questionnaire detail request failed.");
      })
      .finally(() => {
        if (cancelled) return;
        setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedId(null);
      }
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedId]);

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
            <div key={questionnaire.id} className={`questionnaire-row ${selectedId === questionnaire.id ? "selected" : ""}`} role="row">
              <span className="questionnaire-title-cell" role="cell">
                <span className="mobile-label">Title</span>
                <strong>{questionnaire.title || "Untitled questionnaire"}</strong>
                <span className="questionnaire-muted">{questionnaire.description}</span>
              </span>
              <span className="questionnaire-meta-cell" role="cell">
                <span className="mobile-label">FHIR ID</span>
                {questionnaire.id}
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
              </span>
            </div>
          ))
        )}
      </div>

      {selectedQuestionnaire && (
        <QuestionnaireDrawer
          summary={selectedQuestionnaire}
          detailResult={detailResult}
          loading={detailLoading}
          error={detailError}
          onClose={() => setSelectedId(null)}
        />
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

    </section>
  );
}

interface QuestionnaireDrawerProps {
  summary: QuestionnaireSummary;
  detailResult: QuestionnaireDetailViewResult | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}

function QuestionnaireDrawer({ summary, detailResult, loading, error, onClose }: QuestionnaireDrawerProps) {
  const [showFhirDetails, setShowFhirDetails] = useState(false);
  const questionnaire = detailResult?.questionnaire;
  const title = questionnaire?.title || summary.title || "Untitled questionnaire";
  const status = questionnaire?.status ?? summary.status;
  const resource = detailResult?.resource;
  const rawItemsByLinkId = useMemo(() => rawQuestionnaireItemsByLinkId(resource), [resource]);

  return (
    <div className="questionnaire-drawer-backdrop" onClick={onClose}>
      <aside
        className="questionnaire-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="questionnaire-drawer-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="questionnaire-drawer-header">
          <div className="questionnaire-drawer-titlebar">
            <div>
              <p className="page-label">Selected questionnaire</p>
              <h2 id="questionnaire-drawer-title">{title}</h2>
              <span className={`questionnaire-status-badge ${questionnaireStatusClass(status)}`}>{status}</span>
            </div>
            <button className="secondary-button" type="button" onClick={onClose}>
              Close
            </button>
          </div>
          <label className="questionnaire-fhir-toggle">
            <input type="checkbox" checked={showFhirDetails} onChange={(event) => setShowFhirDetails(event.target.checked)} />
            <span className="questionnaire-fhir-toggle-track" aria-hidden="true" />
            <span>Show FHIR detail</span>
          </label>
        </header>

        <div className="questionnaire-drawer-body">
          {loading ? (
            <p className="questionnaire-drawer-state">Loading questionnaire details...</p>
          ) : error ? (
            <div className="questionnaire-drawer-state error">
              <p>Unable to load questionnaire details.</p>
              <span>{error}</span>
            </div>
          ) : questionnaire ? (
            <>
              <section className="questionnaire-drawer-section">
                <h3>Questions</h3>
                <p className="questionnaire-preview-caption">
                  Read-only preview of what this form asks - {itemCountText(flattenAnswerableItems(questionnaire.items).length)} -{" "}
                  {groupCountText(countGroups(questionnaire.items))}
                </p>
                {questionnaire.items.length > 0 ? (
                  <div className="questionnaire-question-list">
                    {questionnaire.items.map((item, index) => (
                      <QuestionnaireQuestionCard
                        key={`${item.linkId}:${index}`}
                        item={item}
                        rawItemsByLinkId={rawItemsByLinkId}
                        showFhirDetails={showFhirDetails}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="questionnaire-drawer-state">Question details are not available.</p>
                )}
              </section>

              <section className="questionnaire-drawer-section">
                <h3>Metadata</h3>
                <QuestionnaireMetadata questionnaire={questionnaire} />
              </section>

              {resource !== undefined && (
                <details className="raw-response">
                  <summary>Raw FHIR Questionnaire resource</summary>
                  <pre>{JSON.stringify(resource, null, 2)}</pre>
                </details>
              )}
            </>
          ) : (
            <p className="questionnaire-drawer-state">Question details are not available.</p>
          )}
        </div>
      </aside>
    </div>
  );
}

interface QuestionnaireQuestionCardProps {
  item: QuestionnaireItem;
  rawItemsByLinkId: Map<string, unknown>;
  showFhirDetails: boolean;
}

function QuestionnaireQuestionCard({ item, rawItemsByLinkId, showFhirDetails }: QuestionnaireQuestionCardProps) {
  const isGroup = item.type === "group";
  const rawItem = rawItemsByLinkId.get(item.linkId);

  if (isGroup) {
    return (
      <section className="questionnaire-question-group">
        <div className="questionnaire-group-header">
          <div className="questionnaire-question-text">{item.text || "Untitled group"}</div>
          {showFhirDetails && <QuestionnaireFhirDetails item={item} rawItem={rawItem} />}
        </div>
        <div className="questionnaire-group-items">
          {item.items && item.items.length > 0 ? (
            item.items.map((child, index) => (
              <QuestionnaireQuestionCard
                key={`${child.linkId}:${index}`}
                item={child}
                rawItemsByLinkId={rawItemsByLinkId}
                showFhirDetails={showFhirDetails}
              />
            ))
          ) : (
            <p className="questionnaire-answer-placeholder">No nested questions.</p>
          )}
        </div>
      </section>
    );
  }

  return (
    <article className="questionnaire-question-row">
      <div className="questionnaire-question-text">{item.text || "Untitled item"}</div>
      {showFhirDetails && <QuestionnaireFhirDetails item={item} rawItem={rawItem} />}
      <QuestionnaireAnswerPreview item={item} />
    </article>
  );
}

function QuestionnaireFhirDetails({ item, rawItem }: { item: QuestionnaireItem; rawItem: unknown }) {
  const required = item.required || rawItemRequired(rawItem);

  return (
    <div className="questionnaire-question-fhir">
      <div className="questionnaire-question-meta">
        <span>{item.type}</span>
        {required && <span>required</span>}
        <span>linkId {item.linkId}</span>
      </div>

      {rawItem !== undefined && (
        <details className="questionnaire-item-fhir-detail">
          <summary>FHIR item detail</summary>
          <pre>{JSON.stringify(rawItem, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}

function QuestionnaireAnswerPreview({ item }: { item: QuestionnaireItem }) {
  if (item.type === "choice") {
    return item.options && item.options.length > 0 ? (
      <ul className="questionnaire-answer-preview questionnaire-option-list">
        {item.options.map((option, index) => (
          <li key={choiceOptionKey(option, index)}>{choiceOptionLabel(option)}</li>
        ))}
      </ul>
    ) : (
      <p className="questionnaire-answer-placeholder">No options available.</p>
    );
  }

  if (item.type === "boolean") {
    return (
      <div className="questionnaire-answer-preview questionnaire-boolean-preview" aria-label="Read-only boolean answer preview">
        <span>Yes</span>
        <span>No</span>
      </div>
    );
  }

  return <p className="questionnaire-answer-placeholder">{answerPlaceholder(item.type)}</p>;
}

function QuestionnaireMetadata({ questionnaire }: { questionnaire: Questionnaire }) {
  const canonicalUrl = realCanonicalUrl(questionnaire.url, questionnaire.id);

  return (
    <dl className="questionnaire-metadata-grid">
      <div>
        <dt>FHIR ID</dt>
        <dd>{questionnaire.id}</dd>
      </div>
      {canonicalUrl && (
        <div>
          <dt>Canonical URL</dt>
          <dd>{canonicalUrl}</dd>
        </div>
      )}
      <div>
        <dt>Version</dt>
        <dd>{formatVersion(questionnaire.version)}</dd>
      </div>
      <div>
        <dt>Status</dt>
        <dd>{questionnaire.status}</dd>
      </div>
      <div>
        <dt>Items</dt>
        <dd>{itemCountText(flattenAnswerableItems(questionnaire.items).length)}</dd>
      </div>
    </dl>
  );
}

function choiceOptionLabel(option: ChoiceOption): string {
  return choiceOptionDisplay(option);
}

function answerPlaceholder(type: QuestionnaireItem["type"]): string {
  if (type === "integer") return "Number answer";
  if (type === "date") return "Date answer";
  if (type === "dateTime") return "Date/time answer";
  if (type === "text") return "Long text answer";
  return "Text answer";
}

function realCanonicalUrl(url: string, id: string): string | null {
  if (!url || url === id || /^\d+$/.test(url)) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol && parsed.host ? url : null;
  } catch {
    return null;
  }
}

function formatVersion(version: string): string {
  return version ? `v${version}` : "Unversioned";
}

function itemCountText(itemCount: number): string {
  return itemCount === 1 ? "1 item" : `${itemCount} items`;
}

function groupCountText(groupCount: number): string {
  return groupCount === 1 ? "1 group" : `${groupCount} groups`;
}

function rawQuestionnaireItemsByLinkId(resource: unknown): Map<string, unknown> {
  const byLinkId = new Map<string, unknown>();
  if (!resource || typeof resource !== "object") return byLinkId;
  const items = (resource as { item?: unknown }).item;
  collectRawQuestionnaireItems(items, byLinkId);
  return byLinkId;
}

function collectRawQuestionnaireItems(items: unknown, byLinkId: Map<string, unknown>) {
  if (!Array.isArray(items)) return;
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const record = item as { linkId?: unknown; item?: unknown };
    if (typeof record.linkId === "string") {
      byLinkId.set(record.linkId, item);
    }
    collectRawQuestionnaireItems(record.item, byLinkId);
  }
}

function rawItemRequired(rawItem: unknown): boolean {
  return Boolean(rawItem && typeof rawItem === "object" && (rawItem as { required?: unknown }).required === true);
}

function questionnaireStatusClass(status: QuestionnaireSummary["status"]): string {
  if (status === "active") return "active";
  if (status === "draft") return "draft";
  if (status === "retired") return "retired";
  return "unknown";
}
