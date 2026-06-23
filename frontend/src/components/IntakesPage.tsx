import { useEffect, useMemo, useState } from "react";
import { queryIntakes } from "../api/intakes";
import type { IntakeQueryResult, IntakeSummary } from "../types";
import { formatAuthoredDateTime, isToday, normalizedStatus, sortIntakesNewestFirst, statusClass, statusLabel } from "../utils/intakes";

type IntakeFilter = "all" | "completed" | "in-progress" | "today";

interface IntakesPageProps {
  onStartNewIntake: () => void;
}

const filters: Array<{ id: IntakeFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "completed", label: "Completed" },
  { id: "in-progress", label: "In progress" },
  { id: "today", label: "Today" }
];

export default function IntakesPage({ onStartNewIntake }: IntakesPageProps) {
  const [requestUrl, setRequestUrl] = useState("");
  const [queryResult, setQueryResult] = useState<IntakeQueryResult | null>(null);
  const [intakes, setIntakes] = useState<IntakeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<IntakeFilter>("all");

  async function runQuery(nextRequestUrl = requestUrl) {
    setLoading(true);
    const result = await queryIntakes(nextRequestUrl);
    setQueryResult(result);
    setIntakes(result.intakes);
    setLoading(false);
  }

  useEffect(() => {
    void runQuery("");
    // Initial intake query only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleIntakes = useMemo(() => sortIntakesNewestFirst(filterIntakes(intakes, activeFilter)), [activeFilter, intakes]);
  const totalCount = bundleTotal(queryResult?.bundle);
  const responseBody = queryResult?.bundle ? JSON.stringify(queryResult.bundle, null, 2) : "";
  const statusText = queryResult
    ? `${queryResult.status} ${queryResult.statusText} - Bundle - ${totalCount} entries`
    : "waiting";
  const countText = loading ? "Loading intakes..." : resultCountText(visibleIntakes.length, totalCount);
  const qrSummary = qrIdsSummary(intakes);

  return (
    <section className="screen">
      <div className="pagehead intakes-pagehead">
        <div>
          <p className="page-label">Workspace</p>
          <h1>Intakes</h1>
        </div>
        <div className="intakes-page-actions">
          <span className="intake-count">{countText}</span>
          <button className="primary-button" type="button" onClick={onStartNewIntake}>
            + Start new intake
          </button>
        </div>
      </div>

      <div className="intake-filters" role="group" aria-label="Filter intakes">
        {filters.map((filter) => (
          <button
            key={filter.id}
            className={`intake-chip ${activeFilter === filter.id ? "on" : ""}`}
            type="button"
            onClick={() => setActiveFilter(filter.id)}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div className="intake-table" role="table" aria-label="Intakes">
        {!loading && visibleIntakes.length > 0 && (
          <div className="intake-table-head" role="row">
            <span role="columnheader">Patient</span>
            <span role="columnheader">Questionnaire</span>
            <span role="columnheader">Authored</span>
            <span role="columnheader">Status</span>
            <span role="columnheader" aria-label="Open" />
          </div>
        )}

        {loading ? (
          <p className="muted intake-empty">Loading saved intakes...</p>
        ) : visibleIntakes.length === 0 ? (
          <div className="intake-empty">
            <p>{intakes.length === 0 ? "No saved intakes found." : "No intakes match this filter."}</p>
          </div>
        ) : (
          visibleIntakes.map((intake) => (
            <button key={intake.id || intake.questionnaireResponseId} className="intake-table-row" type="button" role="row">
              <span className="intake-patient-block" role="cell">
                <span className="mobile-label">Patient</span>
                <span className="intake-patient-main">
                  <span className="intake-patient-name">{intake.patientName || "Unknown Patient"}</span>
                  <span className="intake-mrn">{intake.patientMrn || "MRN unavailable"}</span>
                </span>
              </span>
              <span className="intake-questionnaire-block" role="cell">
                <span className="mobile-label">Questionnaire</span>
                <span className="intake-questionnaire-main">
                  <span className="intake-questionnaire-title">{intake.questionnaireTitle || "Unknown questionnaire"}</span>
                  {intake.questionnaire && <span className="intake-questionnaire-ref">{intake.questionnaire}</span>}
                </span>
              </span>
              <span className="intake-when" role="cell">
                <span className="mobile-label">Authored</span>
                {formatAuthoredDateTime(intake.authored)}
              </span>
              <span role="cell">
                <span className="mobile-label">Status</span>
                <span className={`intake-status-pill ${statusClass(intake.status)}`}>{statusLabel(intake.status)}</span>
              </span>
              <span className="intake-row-chev" aria-hidden="true">
                &gt;
              </span>
            </button>
          ))
        )}
      </div>

      <details className="intake-demo-panel">
        <summary>
          <span className="intake-demo-lead">
            <span className="intake-demo-kicker">Demo</span>
            <span className="intake-demo-title">FHIR QuestionnaireResponse search</span>
            <span className={`intake-demo-badge ${queryResult?.status === 200 ? "ok" : queryResult ? "warn" : ""}`}>{statusText}</span>
          </span>
          <span className="intake-demo-caret">show</span>
        </summary>

        <div className="intake-demo-inner">
          <label className="request-field">
            Request URL
            <div className="request-row">
              <input
                value={requestUrl}
                onChange={(event) => setRequestUrl(event.target.value)}
                placeholder={queryResult?.requestUrl || "Optional FHIR QuestionnaireResponse search URL"}
                spellCheck={false}
              />
              <button className="secondary-button" type="button" onClick={() => void runQuery()} disabled={loading}>
                {loading ? "Querying..." : "Query"}
              </button>
            </div>
          </label>

          {queryResult?.error && <p className="query-error">{queryResult.error}</p>}

          {queryResult?.bundle && (
            <details className="raw-response">
              <summary>Raw FHIR response{qrSummary ? ` - ${qrSummary}` : ""}</summary>
              <pre>{responseBody}</pre>
            </details>
          )}
        </div>
      </details>

      <p className="app-footnote">
        {countText} - resolved from QuestionnaireResponse with Patient/Questionnaire display fields - synthetic data only
      </p>
    </section>
  );
}

function filterIntakes(intakes: IntakeSummary[], filter: IntakeFilter): IntakeSummary[] {
  if (filter === "all") return intakes;
  if (filter === "completed") return intakes.filter((intake) => normalizedStatus(intake.status) === "completed");
  if (filter === "in-progress") return intakes.filter((intake) => normalizedStatus(intake.status) === "in-progress");
  return intakes.filter((intake) => isToday(intake.authored));
}

function resultCountText(visibleCount: number, totalCount: number): string {
  if (totalCount > 0) return `${visibleCount} of ${totalCount}`;
  if (visibleCount === 0) return "No intakes";
  if (visibleCount === 1) return "1 intake";
  return `${visibleCount} intakes`;
}

function bundleTotal(bundle: Record<string, unknown> | null | undefined): number {
  return typeof bundle?.total === "number" ? bundle.total : 0;
}

function qrIdsSummary(intakes: IntakeSummary[]): string {
  const ids = intakes.map((intake) => intake.questionnaireResponseId).filter(Boolean);
  if (!ids.length) return "";
  if (ids.length === 1) return `QR/${ids[0]}`;
  return `QR/${ids[0]} + ${ids.length - 1} more`;
}
