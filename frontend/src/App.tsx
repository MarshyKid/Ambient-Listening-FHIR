import { useState } from "react";
import type { AppView } from "./appView";
import AppShell from "./components/AppShell";
import HomePage from "./components/HomePage";
import IntakesPage from "./components/IntakesPage";
import NewIntakeWizard from "./components/NewIntakeWizard";
import PlaceholderPage from "./components/PlaceholderPage";

export default function App() {
  const [appView, setAppView] = useState<AppView>("home");
  const [newIntakeKey, setNewIntakeKey] = useState(0);

  function startNewIntake() {
    setNewIntakeKey((key) => key + 1);
    setAppView("new-intake");
  }

  return (
    <div className="app-frame">
      <AppShell activeView={appView} onNavigate={setAppView} />

      <main className="app-shell">
        {appView === "home" && (
          <HomePage
            onStartNewIntake={startNewIntake}
            onOpenIntakes={() => setAppView("intakes")}
            onOpenQuestionnaires={() => setAppView("questionnaires")}
          />
        )}

        {appView === "intakes" && <IntakesPage onStartNewIntake={startNewIntake} />}

        {appView === "questionnaires" && (
          <PlaceholderPage eyebrow="Library" title="Questionnaire Library" text="Questionnaire management coming soon." />
        )}

        {appView === "new-intake" && <NewIntakeWizard key={newIntakeKey} />}
      </main>
    </div>
  );
}
