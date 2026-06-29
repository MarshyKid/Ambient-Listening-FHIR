import { useEffect, useMemo, useState } from "react";
import { getIntakeDetail, queryIntakes } from "../api/intakes";
import type { IntakeDetailResult, IntakeQueryResult, IntakeSummary } from "../types";
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
  const [selectedIntake, setSelectedIntake] = useState<IntakeSummary | null>(null);
  const [detailResult, setDetailResult] = useState<IntakeDetailResult | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

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

  async function openIntake(intake: IntakeSummary) {
    setSelectedIntake(intake);
    setDetailResult(null);
    setDetailError(null);
    setDetailLoading(true);

    try {
      const result = await getIntakeDetail(intake.questionnaireResponseId);
      setDetailResult(result);
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : "Unable to load intake detail.");
    } finally {
      setDetailLoading(false);
    }
  }

  function closeIntakeDrawer() {
    setSelectedIntake(null);
    setDetailResult(null);
    setDetailError(null);
    setDetailLoading(false);
  }

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
            <button
              key={intake.id || intake.questionnaireResponseId}
              className={`intake-table-row ${
                selectedIntake?.questionnaireResponseId === intake.questionnaireResponseId ? "selected" : ""
              }`}
              type="button"
              role="row"
              onClick={() => void openIntake(intake)}
            >
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

      {selectedIntake && (
        <IntakeDetailDrawer
          summary={selectedIntake}
          detail={detailResult}
          loading={detailLoading}
          error={detailError}
          onClose={closeIntakeDrawer}
        />
      )}
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

interface IntakeDetailDrawerProps {
  summary: IntakeSummary;
  detail: IntakeDetailResult | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}

function IntakeDetailDrawer({ summary, detail, loading, error, onClose }: IntakeDetailDrawerProps) {
  const [showFhirDetails, setShowFhirDetails] = useState(false);
  const intake = detail?.intake ?? summary;
  const questionnaireResponse = detail?.questionnaireResponse ?? null;
  const questionnaireItems = questionnaireResourceItems(detail?.questionnaire);
  const responseItemsByLinkId = useMemo(() => responseItemsByLinkIdMap(questionnaireResponse), [questionnaireResponse]);
  const patientLine = patientContextLine(detail?.patient, intake);
  const questionnaireLabel = questionnaireTitle(detail?.questionnaire, intake);
  const author = practitionerDisplay(detail?.practitioner);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="intake-detail-backdrop" onClick={onClose}>
      <aside
        className="intake-detail-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="intake-detail-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="intake-detail-header">
          <div className="intake-detail-titlebar">
            <div>
              <p className="page-label">Saved intake</p>
              <h2 id="intake-detail-title">{intake.patientName || "Unknown Patient"}</h2>
              <span className="intake-detail-subtitle">{patientLine}</span>
            </div>
            <button className="secondary-button" type="button" onClick={onClose}>
              Close
            </button>
          </div>

          <div className="intake-detail-meta">
            <div>
              <span>Questionnaire</span>
              <strong>{questionnaireLabel}</strong>
            </div>
            <div>
              <span>Authored</span>
              <strong className="mono">{formatAuthoredDateTime(intake.authored)}</strong>
            </div>
            <div>
              <span>By</span>
              <strong>{author || "Not recorded"}</strong>
            </div>
            <div>
              <span>Status</span>
              <strong className={`intake-status-pill ${statusClass(intake.status)}`}>{statusLabel(intake.status)}</strong>
            </div>
          </div>
        </header>

        <div className="intake-detail-ribbon">
          <span>Read-only - saved clinical record</span>
          <label className="questionnaire-fhir-toggle">
            <input type="checkbox" checked={showFhirDetails} onChange={(event) => setShowFhirDetails(event.target.checked)} />
            <span className="questionnaire-fhir-toggle-track" aria-hidden="true" />
            <span>Show FHIR detail</span>
          </label>
        </div>

        <div className="intake-detail-body">
          {loading ? (
            <p className="questionnaire-drawer-state">Loading intake detail...</p>
          ) : error ? (
            <div className="questionnaire-drawer-state error">
              <p>Unable to load intake detail.</p>
              <span>{error}</span>
            </div>
          ) : detail && questionnaireResponse ? (
            <>
              <section className="intake-detail-section">
                <h3>Captured answers</h3>
                {questionnaireItems.length > 0 ? (
                  <div className="intake-answer-list">
                    {questionnaireItems.map((item, index) => (
                      <IntakeQuestionnaireItem
                        key={`${item.linkId}:${index}`}
                        item={item}
                        responseItemsByLinkId={responseItemsByLinkId}
                        showFhirDetails={showFhirDetails}
                      />
                    ))}
                  </div>
                ) : (
                  <FallbackResponseItems resource={questionnaireResponse} showFhirDetails={showFhirDetails} />
                )}
              </section>

              <section className="intake-detail-section">
                <h3>Also recorded in this encounter</h3>
                <RelatedResources detail={detail} />
              </section>

              <section className="intake-detail-section">
                <h3>Under the hood</h3>
                <RawResourcePanels detail={detail} />
              </section>
            </>
          ) : (
            <p className="questionnaire-drawer-state">Intake detail is not available.</p>
          )}
        </div>
      </aside>
    </div>
  );
}

interface RawQuestionnaireItem {
  linkId: string;
  text?: string;
  type?: string;
  item?: RawQuestionnaireItem[];
}

type RawResponseItem = Record<string, unknown>;

function IntakeQuestionnaireItem({
  item,
  responseItemsByLinkId,
  showFhirDetails
}: {
  item: RawQuestionnaireItem;
  responseItemsByLinkId: Map<string, RawResponseItem>;
  showFhirDetails: boolean;
}) {
  if (item.type === "group") {
    return (
      <section className="intake-answer-group">
        <div className="intake-answer-group-header">
          <span>{item.text || "Untitled group"}</span>
          {showFhirDetails && <FhirBadges item={item} responseItem={responseItemsByLinkId.get(item.linkId)} />}
        </div>
        <div className="intake-answer-group-items">
          {(item.item ?? []).length > 0 ? (
            item.item?.map((child, index) => (
              <IntakeQuestionnaireItem
                key={`${child.linkId}:${index}`}
                item={child}
                responseItemsByLinkId={responseItemsByLinkId}
                showFhirDetails={showFhirDetails}
              />
            ))
          ) : (
            <p className="intake-answer-empty">No nested questions.</p>
          )}
        </div>
      </section>
    );
  }

  return (
    <AnswerRow
      question={item.text || item.linkId || "Untitled question"}
      item={item}
      responseItem={responseItemsByLinkId.get(item.linkId)}
      showFhirDetails={showFhirDetails}
    />
  );
}

function FallbackResponseItems({ resource, showFhirDetails }: { resource: Record<string, unknown>; showFhirDetails: boolean }) {
  const items = rawArray(resource.item).filter(isRecord);
  if (!items.length) {
    return <p className="questionnaire-drawer-state">No captured answers were found.</p>;
  }

  return (
    <div className="intake-answer-list">
      {items.map((item, index) => (
        <FallbackResponseItem key={`${stringField(item, "linkId")}:${index}`} item={item} showFhirDetails={showFhirDetails} />
      ))}
    </div>
  );
}

function FallbackResponseItem({ item, showFhirDetails }: { item: RawResponseItem; showFhirDetails: boolean }) {
  const nested = rawArray(item.item).filter(isRecord);
  const linkId = stringField(item, "linkId");
  if (nested.length > 0) {
    return (
      <section className="intake-answer-group">
        <div className="intake-answer-group-header">
          <span>{stringField(item, "text") || linkId || "Untitled group"}</span>
          {showFhirDetails && <FhirBadges item={{ linkId, type: "group" }} responseItem={item} />}
        </div>
        <div className="intake-answer-group-items">
          {nested.map((child, index) => (
            <FallbackResponseItem key={`${stringField(child, "linkId")}:${index}`} item={child} showFhirDetails={showFhirDetails} />
          ))}
        </div>
      </section>
    );
  }

  return (
    <AnswerRow
      question={stringField(item, "text") || linkId || "Untitled question"}
      item={{ linkId, type: "answered" }}
      responseItem={item}
      showFhirDetails={showFhirDetails}
    />
  );
}

function AnswerRow({
  question,
  item,
  responseItem,
  showFhirDetails
}: {
  question: string;
  item: RawQuestionnaireItem;
  responseItem?: RawResponseItem;
  showFhirDetails: boolean;
}) {
  const answer = answerDisplay(responseItem);
  return (
    <article className="intake-answer-row">
      <div className="intake-answer-question">{question}</div>
      <div className={`intake-answer-value ${answer.empty ? "empty" : ""}`}>
        {!answer.empty && <span aria-hidden="true">✓</span>}
        {answer.label}
      </div>
      {showFhirDetails && <FhirBadges item={item} responseItem={responseItem} />}
    </article>
  );
}

function FhirBadges({ item, responseItem }: { item: RawQuestionnaireItem; responseItem?: RawResponseItem }) {
  const coding = firstCodingAnswer(responseItem);
  return (
    <div className="intake-answer-badges">
      {item.type && <span>{item.type}</span>}
      {item.linkId && <span>linkId {item.linkId}</span>}
      {coding?.code && <span>{coding.code}</span>}
      {coding?.system && <span>{coding.system}</span>}
    </div>
  );
}

function RelatedResources({ detail }: { detail: IntakeDetailResult }) {
  const hasEncounter = Boolean(detail.encounter);
  const allergies = detail.allergyIntolerances ?? [];

  if (!hasEncounter && allergies.length === 0) {
    return <p className="questionnaire-drawer-state">No related Encounter or AllergyIntolerance resources were returned.</p>;
  }

  return (
    <div className="intake-related-list">
      {allergies.map((allergy, index) => (
        <article className="intake-related-card" key={`${resourceId(allergy)}:${index}`}>
          <span className="intake-related-icon">!</span>
          <div>
            <div className="intake-related-type">AllergyIntolerance</div>
            <div className="intake-related-title">{allergySubstance(allergy)}</div>
            <div className="intake-related-detail">{allergyDetail(allergy)}</div>
          </div>
          <span className="intake-related-badge">{allergyVerification(allergy)}</span>
        </article>
      ))}

      {detail.encounter && (
        <article className="intake-related-card">
          <span className="intake-related-icon">◇</span>
          <div>
            <div className="intake-related-type">Encounter</div>
            <div className="intake-related-title">{encounterTitle(detail.encounter)}</div>
            <div className="intake-related-detail">{encounterDetail(detail.encounter)}</div>
          </div>
        </article>
      )}
    </div>
  );
}

function RawResourcePanels({ detail }: { detail: IntakeDetailResult }) {
  return (
    <div className="intake-raw-list">
      <details className="raw-response">
        <summary>Raw FHIR QuestionnaireResponse</summary>
        <pre>{JSON.stringify(detail.questionnaireResponse, null, 2)}</pre>
      </details>
      {detail.patient && (
        <details className="raw-response">
          <summary>Raw FHIR Patient</summary>
          <pre>{JSON.stringify(detail.patient, null, 2)}</pre>
        </details>
      )}
      {detail.questionnaire && (
        <details className="raw-response">
          <summary>Raw FHIR Questionnaire</summary>
          <pre>{JSON.stringify(detail.questionnaire, null, 2)}</pre>
        </details>
      )}
      {detail.encounter && (
        <details className="raw-response">
          <summary>Raw FHIR Encounter</summary>
          <pre>{JSON.stringify(detail.encounter, null, 2)}</pre>
        </details>
      )}
      {detail.practitioner && (
        <details className="raw-response">
          <summary>Raw FHIR Practitioner</summary>
          <pre>{JSON.stringify(detail.practitioner, null, 2)}</pre>
        </details>
      )}
      {detail.allergyIntolerances.map((allergy, index) => (
        <details className="raw-response" key={`${resourceId(allergy)}:${index}`}>
          <summary>Raw FHIR AllergyIntolerance {index + 1}</summary>
          <pre>{JSON.stringify(allergy, null, 2)}</pre>
        </details>
      ))}
    </div>
  );
}

function questionnaireResourceItems(resource: Record<string, unknown> | null | undefined): RawQuestionnaireItem[] {
  return rawArray(resource?.item).map(normalizeQuestionnaireItem).filter((item): item is RawQuestionnaireItem => Boolean(item));
}

function normalizeQuestionnaireItem(value: unknown): RawQuestionnaireItem | null {
  if (!isRecord(value)) return null;
  const linkId = stringField(value, "linkId");
  if (!linkId) return null;
  return {
    linkId,
    text: stringField(value, "text"),
    type: stringField(value, "type"),
    item: rawArray(value.item).map(normalizeQuestionnaireItem).filter((item): item is RawQuestionnaireItem => Boolean(item))
  };
}

function responseItemsByLinkIdMap(resource: Record<string, unknown> | null): Map<string, RawResponseItem> {
  const map = new Map<string, RawResponseItem>();
  collectResponseItems(rawArray(resource?.item), map);
  return map;
}

function collectResponseItems(items: unknown[], map: Map<string, RawResponseItem>) {
  for (const item of items) {
    if (!isRecord(item)) continue;
    const linkId = stringField(item, "linkId");
    if (linkId) map.set(linkId, item);
    collectResponseItems(rawArray(item.item), map);
  }
}

function answerDisplay(item: RawResponseItem | undefined): { label: string; empty: boolean } {
  const answer = rawArray(item?.answer)[0];
  if (!isRecord(answer)) return { label: "Not answered", empty: true };

  if ("valueBoolean" in answer) return { label: answer.valueBoolean ? "Yes" : "No", empty: false };
  if ("valueString" in answer) return { label: String(answer.valueString), empty: false };
  if ("valueInteger" in answer) return { label: String(answer.valueInteger), empty: false };
  if ("valueDate" in answer) return { label: String(answer.valueDate), empty: false };
  if ("valueDateTime" in answer) return { label: formatAuthoredDateTime(String(answer.valueDateTime)), empty: false };
  if (isRecord(answer.valueCoding)) {
    return {
      label: stringField(answer.valueCoding, "display") || stringField(answer.valueCoding, "code") || "Coded answer",
      empty: false
    };
  }

  return { label: JSON.stringify(answer), empty: false };
}

function firstCodingAnswer(item: RawResponseItem | undefined): { system?: string; code?: string } | null {
  const answer = rawArray(item?.answer)[0];
  if (!isRecord(answer) || !isRecord(answer.valueCoding)) return null;
  return {
    system: stringField(answer.valueCoding, "system"),
    code: stringField(answer.valueCoding, "code")
  };
}

function patientContextLine(patient: Record<string, unknown> | null | undefined, intake: IntakeSummary): string {
  const parts = [intake.patientMrn || "MRN unavailable", stringField(patient, "gender"), stringField(patient, "birthDate")].filter(Boolean);
  return parts.join(" · ");
}

function questionnaireTitle(resource: Record<string, unknown> | null | undefined, intake: IntakeSummary): string {
  const title = stringField(resource, "title") || stringField(resource, "name") || intake.questionnaireTitle || intake.questionnaire || "Unknown questionnaire";
  const version = stringField(resource, "version");
  return version ? `${title} · v${version}` : title;
}

function practitionerDisplay(resource: Record<string, unknown> | null | undefined): string {
  const name = rawArray(resource?.name)[0];
  if (!isRecord(name)) return "";
  const text = stringField(name, "text");
  if (text) return text;
  const given = rawArray(name.given).map(String).join(" ");
  const family = stringField(name, "family");
  return [given, family].filter(Boolean).join(" ");
}

function allergySubstance(resource: Record<string, unknown>): string {
  const code = isRecord(resource.code) ? resource.code : {};
  return stringField(code, "text") || resourceId(resource) || "AllergyIntolerance";
}

function allergyDetail(resource: Record<string, unknown>): string {
  const reactions = rawArray(resource.reaction)
    .flatMap((reaction) => (isRecord(reaction) ? rawArray(reaction.manifestation) : []))
    .map((manifestation) => (isRecord(manifestation) ? stringField(manifestation, "text") : ""))
    .filter(Boolean);
  return reactions.length > 0 ? `Reaction: ${reactions.join(", ")}` : "Reaction not recorded";
}

function allergyVerification(resource: Record<string, unknown>): string {
  const verification = isRecord(resource.verificationStatus) ? rawArray(resource.verificationStatus.coding)[0] : null;
  return isRecord(verification) ? stringField(verification, "code") || "unconfirmed" : "unconfirmed";
}

function encounterTitle(resource: Record<string, unknown>): string {
  const encounterClass = isRecord(resource.class) ? resource.class : {};
  const display = stringField(encounterClass, "display") || stringField(encounterClass, "code") || "Encounter";
  const status = stringField(resource, "status");
  return status ? `${display} · ${status}` : display;
}

function encounterDetail(resource: Record<string, unknown>): string {
  const period = isRecord(resource.period) ? resource.period : {};
  const start = stringField(period, "start");
  return start ? formatAuthoredDateTime(start) : "Encounter period not recorded";
}

function resourceId(resource: Record<string, unknown>): string {
  return stringField(resource, "id");
}

function rawArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringField(resource: unknown, field: string): string {
  return isRecord(resource) && typeof resource[field] === "string" ? resource[field] : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
