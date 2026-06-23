import type { AppView } from "../appView";

interface AppShellProps {
  activeView: AppView;
  onNavigate: (view: AppView) => void;
}

export default function AppShell({ activeView, onNavigate }: AppShellProps) {
  const intakeIsActive = activeView === "intakes" || activeView === "new-intake";

  return (
    <header className="top-shell">
      <button className="brand" type="button" aria-label="Ambient FHIR home" onClick={() => onNavigate("home")}>
        <span className="brand-mark" />
        Ambient FHIR
      </button>

      <nav className="top-nav" aria-label="Primary">
        <button
          type="button"
          aria-current={intakeIsActive ? "page" : undefined}
          onClick={() => onNavigate("intakes")}
        >
          Intake
        </button>
        <button
          type="button"
          aria-current={activeView === "questionnaires" ? "page" : undefined}
          onClick={() => onNavigate("questionnaires")}
        >
          Questionnaires
        </button>
      </nav>

      <span className="top-shell-spacer" />
      <div className="whoami">
        <span className="avatar">JD</span>
        Jane Doe - RN
      </div>
    </header>
  );
}
