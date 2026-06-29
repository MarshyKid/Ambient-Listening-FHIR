import { useMemo, useState } from "react";
import ConversationInput from "./ConversationInput";
import ActiveContextBar from "./ActiveContextBar";
import PatientSelection from "./PatientSelection";
import QuestionnaireSelection from "./QuestionnaireSelection";
import ReviewExtraction from "./ReviewExtraction";
import SaveConfirmation from "./SaveConfirmation";
import Stepper from "./Stepper";
import type { ClinicalSuggestion, ExtractedAnswer, ExtractionResult, PatientSummary, Questionnaire, ReconcileResponse, SaveResult } from "../types";
import { reconcileDraft } from "../api/reconcile";

const steps = ["Patient", "Questionnaire", "Conversation", "Review", "Save"];

export default function NewIntakeWizard() {
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedPatient, setSelectedPatient] = useState<PatientSummary | null>(null);
  const [selectedQuestionnaire, setSelectedQuestionnaire] = useState<Questionnaire | null>(null);
  const [transcript, setTranscript] = useState("");
  const [reviewedAnswers, setReviewedAnswers] = useState<ExtractedAnswer[]>([]);
  const [clinicalSuggestions, setClinicalSuggestions] = useState<ClinicalSuggestion[]>([]);
  const [reconciliationResult, setReconciliationResult] = useState<ReconcileResponse | null>(null);
  const [reconciliationLoading, setReconciliationLoading] = useState(false);
  const [reconciliationError, setReconciliationError] = useState<string | null>(null);
  const [saveResult, setSaveResult] = useState<SaveResult | null>(null);

  const hasExtraction = reviewedAnswers.length > 0;

  const maxReachableStep = useMemo(() => {
    if (saveResult) return 4;
    if (hasExtraction) return Math.max(currentStep, 3);
    if (selectedPatient && selectedQuestionnaire && transcript.trim()) return Math.max(currentStep, 2);
    if (selectedPatient && selectedQuestionnaire) return 2;
    if (selectedPatient) return 1;
    return 0;
  }, [currentStep, hasExtraction, saveResult, selectedPatient, selectedQuestionnaire, transcript]);

  function clearFromPatient() {
    setSelectedQuestionnaire(null);
    setTranscript("");
    setReviewedAnswers([]);
    setClinicalSuggestions([]);
    setReconciliationResult(null);
    setReconciliationLoading(false);
    setReconciliationError(null);
    setSaveResult(null);
  }

  function clearFromQuestionnaire() {
    setTranscript("");
    setReviewedAnswers([]);
    setClinicalSuggestions([]);
    setReconciliationResult(null);
    setReconciliationLoading(false);
    setReconciliationError(null);
    setSaveResult(null);
  }

  function clearFromTranscript() {
    setReviewedAnswers([]);
    setClinicalSuggestions([]);
    setReconciliationResult(null);
    setReconciliationLoading(false);
    setReconciliationError(null);
    setSaveResult(null);
  }

  function handleSelectPatient(patient: PatientSummary) {
    if (selectedPatient?.id !== patient.id) {
      clearFromPatient();
    }
    setSelectedPatient(patient);
  }

  function handleSelectQuestionnaire(questionnaire: Questionnaire) {
    if (selectedQuestionnaire?.id !== questionnaire.id) {
      clearFromQuestionnaire();
    }
    setSelectedQuestionnaire(questionnaire);
  }

  function handleTranscriptChange(nextTranscript: string) {
    if (hasExtraction || saveResult) {
      clearFromTranscript();
    }
    setTranscript(nextTranscript);
  }

  async function handleExtracted(result: ExtractionResult) {
    const nextAnswers = [...result.answers, ...result.unanswered];
    const nextSuggestions = result.clinicalSuggestions;
    setReviewedAnswers(nextAnswers);
    setClinicalSuggestions(nextSuggestions);
    setReconciliationResult(null);
    setReconciliationError(null);
    setSaveResult(null);
    setCurrentStep(3);

    if (!selectedPatient || !selectedQuestionnaire) {
      return;
    }

    setReconciliationLoading(true);
    try {
      const reconciliation = await reconcileDraft({
        patient: selectedPatient,
        questionnaire: selectedQuestionnaire,
        answers: nextAnswers,
        clinicalSuggestions: nextSuggestions
      });
      setReconciliationResult(reconciliation);
    } catch (error) {
      setReconciliationError(error instanceof Error ? error.message : "Could not check existing record.");
    } finally {
      setReconciliationLoading(false);
    }
  }

  function handleStepClick(step: number) {
    if (step <= currentStep && step <= maxReachableStep) {
      setCurrentStep(step);
    }
  }

  return (
    <>
      <ActiveContextBar patient={selectedPatient} questionnaire={selectedQuestionnaire} answers={reviewedAnswers} />
      <Stepper steps={steps} currentStep={currentStep} onStepClick={handleStepClick} />

      {currentStep === 0 && (
        <PatientSelection
          selectedPatient={selectedPatient}
          onSelectPatient={handleSelectPatient}
          onContinue={() => selectedPatient && setCurrentStep(1)}
        />
      )}

      {currentStep === 1 && selectedPatient && (
        <QuestionnaireSelection
          selectedQuestionnaire={selectedQuestionnaire}
          onSelectQuestionnaire={handleSelectQuestionnaire}
          onContinue={() => selectedQuestionnaire && setCurrentStep(2)}
        />
      )}

      {currentStep === 2 && selectedPatient && selectedQuestionnaire && (
        <ConversationInput
          patient={selectedPatient}
          questionnaire={selectedQuestionnaire}
          transcript={transcript}
          onTranscriptChange={handleTranscriptChange}
          onExtracted={handleExtracted}
        />
      )}

      {currentStep === 3 && selectedPatient && selectedQuestionnaire && hasExtraction && (
        <ReviewExtraction
          patient={selectedPatient}
          questionnaire={selectedQuestionnaire}
          answers={reviewedAnswers}
          clinicalSuggestions={clinicalSuggestions}
          reconciliationResult={reconciliationResult}
          reconciliationLoading={reconciliationLoading}
          reconciliationError={reconciliationError}
          onAnswersChange={(answers) => {
            setReviewedAnswers(answers);
            setSaveResult(null);
          }}
          onSuggestionsChange={(suggestions) => {
            setClinicalSuggestions(suggestions);
            setSaveResult(null);
          }}
          onContinue={() => setCurrentStep(4)}
        />
      )}

      {currentStep === 4 && selectedPatient && selectedQuestionnaire && hasExtraction && (
        <SaveConfirmation
          patient={selectedPatient}
          questionnaire={selectedQuestionnaire}
          answers={reviewedAnswers}
          clinicalSuggestions={clinicalSuggestions}
          saveResult={saveResult}
          onSaved={setSaveResult}
        />
      )}
    </>
  );
}
