import { useState } from "react";
import type { AppView } from "./appView";
import AppShell from "./components/AppShell";
import HomePage from "./components/HomePage";
import IntakesPage from "./components/IntakesPage";
import NewIntakeWizard from "./components/NewIntakeWizard";
import QuestionnaireBuilderPage from "./components/QuestionnaireBuilderPage";
import QuestionnairesPage from "./components/QuestionnairesPage";

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
          <QuestionnairesPage onCreateQuestionnaire={() => setAppView("questionnaire-builder")} />
        )}

        {appView === "questionnaire-builder" && (
          <QuestionnaireBuilderPage
            onBack={() => setAppView("questionnaires")}
            onSaved={() => setAppView("questionnaires")}
          />
        )}

        {appView === "new-intake" && <NewIntakeWizard key={newIntakeKey} />}
      </main>
    </div>
  );
}
