import { useMemo, useState } from "react";
import ConversationInput from "./ConversationInput";
import ActiveContextBar from "./ActiveContextBar";
import PatientSelection from "./PatientSelection";
import QuestionnaireSelection from "./QuestionnaireSelection";
import ReviewExtraction from "./ReviewExtraction";
import SaveConfirmation from "./SaveConfirmation";
import Stepper from "./Stepper";
import type { ClinicalSuggestion, ExtractedAnswer, ExtractionResult, PatientSummary, Questionnaire, SaveResult } from "../types";

const steps = ["Patient", "Questionnaire", "Conversation", "Review", "Save"];

export default function NewIntakeWizard() {
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedPatient, setSelectedPatient] = useState<PatientSummary | null>(null);
  const [selectedQuestionnaire, setSelectedQuestionnaire] = useState<Questionnaire | null>(null);
  const [transcript, setTranscript] = useState("");
  const [reviewedAnswers, setReviewedAnswers] = useState<ExtractedAnswer[]>([]);
  const [clinicalSuggestions, setClinicalSuggestions] = useState<ClinicalSuggestion[]>([]);
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
    setSaveResult(null);
  }

  function clearFromQuestionnaire() {
    setTranscript("");
    setReviewedAnswers([]);
    setClinicalSuggestions([]);
    setSaveResult(null);
  }

  function clearFromTranscript() {
    setReviewedAnswers([]);
    setClinicalSuggestions([]);
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

  function handleExtracted(result: ExtractionResult) {
    setReviewedAnswers([...result.answers, ...result.unanswered]);
    setClinicalSuggestions(result.clinicalSuggestions);
    setSaveResult(null);
    setCurrentStep(3);
  }

  function handleStepClick(step: number) {
    if (step <= currentStep && step <= maxReachableStep) {
      setCurrentStep(step);
    }
  }

  return (
    <>
      <Stepper steps={steps} currentStep={currentStep} onStepClick={handleStepClick} />
      <ActiveContextBar patient={selectedPatient} questionnaire={selectedQuestionnaire} answers={reviewedAnswers} />

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
