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
  return (
    <>
      <section className="status-strip" aria-label="System status">
        <div className="status-cell">
          <span className="status-key">IRIS connection</span>
          <span className="status-value">
            <span className="dot ok" />
            Connected
          </span>
        </div>
        <div className="status-cell">
          <span className="status-key">FHIR version</span>
          <span className="status-value">
            <span className="dot ok" />
            R4 - 4.0.1
          </span>
        </div>
        <div className="status-cell">
          <span className="status-key">Questionnaires</span>
          <span className="status-value">7 active</span>
        </div>
        <div className="status-cell">
          <span className="status-key">Saved today</span>
          <span className="status-value">7 responses</span>
        </div>
      </section>

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
          <span className="launch-meta">7 active - drafts coming soon</span>
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
