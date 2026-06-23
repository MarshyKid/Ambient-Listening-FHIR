import { useEffect, useState } from "react";
import { getFhirHealthStatus, type FhirHealthStatus } from "../api/health";
import { listActiveQuestionnaires } from "../api/questionnaires";

interface HomePageProps {
  onStartNewIntake: () => void;
  onOpenIntakes: () => void;
  onOpenQuestionnaires: () => void;
}

const recentIntakes = [
  {
    patient: "Stewart Paucek",
    mrn: "MRN1042",
    form: "Triage Allergy Assessment - v1",
    when: "2 min ago",
    status: "saved"
  },
  {
    patient: "Sydney Murazik",
    mrn: "MRN1039",
    form: "Comprehensive Admission Triage - v1",
    when: "14 min ago",
    status: "saved"
  },
  {
    patient: "Jane Doe",
    mrn: "MRN1001",
    form: "General Intake - v1.0.0",
    when: "1 hr ago",
    status: "saved"
  }
];

export default function HomePage({ onStartNewIntake, onOpenIntakes, onOpenQuestionnaires }: HomePageProps) {
  const [healthStatus, setHealthStatus] = useState<FhirHealthStatus | null>(null);
  const [isHealthLoading, setIsHealthLoading] = useState(true);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [questionnaireCount, setQuestionnaireCount] = useState<number | null>(null);
  const [isQuestionnaireCountLoading, setIsQuestionnaireCountLoading] = useState(true);

  useEffect(() => {
    let ignore = false;

    async function loadHealthStatus() {
      try {
        const status = await getFhirHealthStatus();
        if (!ignore) {
          setHealthStatus(status);
          setHealthError(null);
        }
      } catch (error) {
        if (!ignore) {
          setHealthStatus(null);
          setHealthError(error instanceof Error ? error.message : "Unable to reach backend or FHIR repository.");
        }
      } finally {
        if (!ignore) {
          setIsHealthLoading(false);
        }
      }
    }

    async function loadQuestionnaireCount() {
      try {
        const questionnaires = await listActiveQuestionnaires();
        if (!ignore) {
          setQuestionnaireCount(questionnaires.length);
        }
      } catch {
        if (!ignore) {
          setQuestionnaireCount(null);
        }
      } finally {
        if (!ignore) {
          setIsQuestionnaireCountLoading(false);
        }
      }
    }

    loadHealthStatus();
    loadQuestionnaireCount();

    return () => {
      ignore = true;
    };
  }, []);

  const healthIsOk = Boolean(healthStatus?.connected && healthStatus.isExpectedVersion);
  const statusDotClass = isHealthLoading ? "pending" : healthIsOk ? "ok" : "error";
  const connectionLabel = isHealthLoading ? "Checking..." : healthStatus?.connected ? "Connected" : "Disconnected";
  const versionLabel = isHealthLoading ? "Checking..." : formatFhirVersion(healthStatus);
  const healthMessage = healthError ?? healthStatus?.message ?? null;
  const questionnaireCountLabel = isQuestionnaireCountLoading
    ? "Checking..."
    : questionnaireCount === null
      ? "Unavailable"
      : `${questionnaireCount} active`;

  return (
    <>
      <section className="status-strip" aria-label="System status">
        <div className="status-cell">
          <span className="status-key">IRIS connection</span>
          <span className="status-value">
            <span className={`dot ${statusDotClass}`} />
            {connectionLabel}
          </span>
        </div>
        <div className="status-cell">
          <span className="status-key">FHIR version</span>
          <span className="status-value">
            <span className={`dot ${statusDotClass}`} />
            {versionLabel}
          </span>
        </div>
        <div className="status-cell">
          <span className="status-key">Questionnaires</span>
          <span className="status-value">{questionnaireCountLabel}</span>
        </div>
        <div className="status-cell">
          <span className="status-key">Saved today</span>
          <span className="status-value">Demo data</span>
        </div>
      </section>
      {!isHealthLoading && !healthIsOk && (
        <p className="status-helper">{healthMessage || "Unable to reach backend or FHIR repository."}</p>
      )}

      <section className="launch-modes" aria-label="Workspace actions">
        <button className="launch-card primary" type="button" onClick={onStartNewIntake}>
          <span className="launch-label">Do intake</span>
          <strong>Start new intake</strong>
          <span>Select a patient, choose a questionnaire, capture the conversation, review the extracted answers, and save.</span>
          <span className="launch-cta">
            Begin <span aria-hidden="true">-&gt;</span>
          </span>
          <span className="launch-flow">Patient -&gt; Questionnaire -&gt; Conversation -&gt; Review -&gt; Save</span>
        </button>

        <button className="launch-card" type="button" onClick={onOpenQuestionnaires}>
          <span className="launch-label">Configure</span>
          <strong>Questionnaires</strong>
          <span>Author new intake forms and version existing ones. Live preview shows the nurse view and generated FHIR.</span>
          <span className="launch-cta">
            Manage <span aria-hidden="true">-&gt;</span>
          </span>
          <span className="launch-meta">{questionnaireCountLabel} - drafts coming soon</span>
        </button>
      </section>

      <div className="home-section-heading">
        <p>Recent intakes</p>
        <button type="button" onClick={onOpenIntakes}>
          View all intakes -&gt;
        </button>
      </div>

      <section className="intake-feed" aria-label="Recent intakes">
        {recentIntakes.map((intake) => (
          <button key={`${intake.patient}-${intake.mrn}`} className="intake-feed-item" type="button" onClick={onOpenIntakes}>
            <span className="feed-person">
              {intake.patient} <span className="mono">- {intake.mrn}</span>
            </span>
            <span className="feed-form">{intake.form}</span>
            <span className="feed-when">
              {intake.when} <span className="feed-tag saved">{intake.status}</span>
            </span>
          </button>
        ))}
      </section>

      <p className="app-footnote">Demo environment - synthetic patients only - no real PHI</p>
    </>
  );
}

function formatFhirVersion(status: FhirHealthStatus | null): string {
  if (!status?.connected) return "Unknown";
  if (!status.fhirVersion) return "Unknown";
  const release = status.fhirRelease && status.fhirRelease !== "unknown" ? status.fhirRelease : "FHIR";
  return `${release} \u00b7 ${status.fhirVersion}`;
}
