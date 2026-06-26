import { useState, useEffect } from "react";
import type { AppView } from "./appView";
import { getAuthMe, login, type AuthMeResponse } from "./api/auth";
import AppShell from "./components/AppShell";
import HomePage from "./components/HomePage";
import IntakesPage from "./components/IntakesPage";
import NewIntakeWizard from "./components/NewIntakeWizard";
import QuestionnaireBuilderPage from "./components/QuestionnaireBuilderPage";
import QuestionnairesPage from "./components/QuestionnairesPage";

export default function App() {
  const [appView, setAppView] = useState<AppView>("home");
  const [newIntakeKey, setNewIntakeKey] = useState(0);

  const [auth, setAuth] = useState<AuthMeResponse | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function loadAuth() {
      setAuthLoading(true);
      try {
        const result = await getAuthMe();
        if (!cancelled) {
          setAuth(result);
        }
      } finally {
        if (!cancelled) {
          setAuthLoading(false);
        }
      }
    }

    void loadAuth();

    return () => {
      cancelled = true;
    };
  }, []);

  function startNewIntake() {
    setNewIntakeKey((key) => key + 1);
    setAppView("new-intake");
  }

  if (authLoading) {
    return (
      <div className="app-frame">
        <main className="app-shell">
          <section className="screen">
            <div className="card">
              <h1>Checking login...</h1>
            </div>
          </section>
        </main>
      </div>
    );
  }

  if (!auth?.authenticated) {
    return (
      <div className="app-frame">
        <main className="app-shell">
          <section className="screen">
            <div className="card">
              <h1>Connect to FHIR</h1>
              <p>Please log in</p>
              <button className="primary-button" type="button" onClick={login}>
                Login with Auth0
              </button>
            </div>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="app-frame">
      <AppShell activeView={appView} onNavigate={setAppView} user={auth.user} />

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
