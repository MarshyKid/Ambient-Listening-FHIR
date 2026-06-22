import { useEffect, useState } from "react";
import type { ExtractionResult, PatientSummary, Questionnaire, QuestionnaireItem, SampleTranscript } from "../types";
import { extractFromTranscript } from "../api/extract";
import { listSampleTranscripts } from "../mock/mockApi";
import { buildManualReviewResult, countGroups, flattenAnswerableItems } from "../utils/questionnaireItems";

interface ConversationInputProps {
  patient: PatientSummary;
  questionnaire: Questionnaire;
  transcript: string;
  onTranscriptChange: (transcript: string) => void;
  onExtracted: (result: ExtractionResult) => void;
}

export default function ConversationInput({
  patient,
  questionnaire,
  transcript,
  onTranscriptChange,
  onExtracted
}: ConversationInputProps) {
  const [samples, setSamples] = useState<SampleTranscript[]>([]);
  const [sampleId, setSampleId] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const answerableItems = flattenAnswerableItems(questionnaire.items);
  const groupCount = countGroups(questionnaire.items);
  const hasTranscript = transcript.trim().length > 0;

  useEffect(() => {
    let cancelled = false;
    listSampleTranscripts().then((results) => {
      if (!cancelled) {
        setSamples(results);
        setSampleId(results.find((sample) => sample.questionnaireId === questionnaire.id)?.id ?? results[0]?.id ?? "");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [questionnaire.id]);

  function loadSample() {
    const sample = samples.find((item) => item.id === sampleId);
    if (sample) {
      onTranscriptChange(sample.transcript);
    }
  }

  function handleStartManualReview() {
    onExtracted(buildManualReviewResult(questionnaire));
  }

  async function handleExtractTranscript() {
    setExtracting(true);
    setExtractError(null);
    try {
      const result = await extractFromTranscript({ questionnaire, transcript });
      onExtracted(result);
    } catch (error) {
      setExtractError(error instanceof Error ? error.message : "Extraction failed.");
    } finally {
      setExtracting(false);
    }
  }

  function renderQuestionnaireOutline(items: QuestionnaireItem[]) {
    return (
      <ul className="plain-list">
        {items.map((item) => (
          <li key={item.linkId}>
            <strong>{item.text}</strong>{" "}
            <span className="mono">
              {item.type}
              {item.required ? " · required" : ""}
            </span>
            {item.type === "group" && item.items && renderQuestionnaireOutline(item.items)}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <section className="screen">
      <div className="screen-header">
        <div>
          <p className="eyebrow">Step 3</p>
          <h1>Conversation</h1>
        </div>
      </div>

      <div className="fhir-query-panel">
        <div className="query-panel-header">
          <div>
            <p className="eyebrow">Demo</p>
            <h2>Questionnaire Details</h2>
          </div>
          <span className="query-status">
            Questionnaire - {answerableItems.length} answerable items
            {groupCount > 0 ? ` - ${groupCount} groups` : ""}
          </span>
        </div>

        <details className="raw-response">
          <summary>Questionnaire questions</summary>
          <div className="raw-response-content">
            <h2>{questionnaire.title}</h2>
            <p className="muted">Version {questionnaire.version}</p>
            {renderQuestionnaireOutline(questionnaire.items)}
          </div>
        </details>
      </div>

      <div className="card">
        <div className="sample-row">
          <label>
            Sample transcript
            <select value={sampleId} onChange={(event) => setSampleId(event.target.value)}>
              {samples.map((sample) => (
                <option key={sample.id} value={sample.id}>
                  {sample.label}
                </option>
              ))}
            </select>
          </label>
          <button className="secondary-button" type="button" onClick={loadSample} disabled={!sampleId}>
            Load Sample
          </button>
        </div>

        <label className="textarea-label">
          Transcript
          <textarea
            value={transcript}
            onChange={(event) => onTranscriptChange(event.target.value)}
            placeholder="Paste or type a nurse-patient conversation transcript..."
          />
        </label>
      </div>

      <div className="footer-actions">
        {answerableItems.length === 0 && <span className="continue-helper">This questionnaire has no answerable items.</span>}
        {answerableItems.length > 0 && !hasTranscript && <span className="continue-helper">Extraction needs transcript text.</span>}
        {extractError && <span className="query-error">{extractError}</span>}
        <button className="secondary-button" type="button" onClick={handleStartManualReview} disabled={answerableItems.length === 0 || extracting}>
          Start Manual Review
        </button>
        <button
          className="primary-button"
          type="button"
          onClick={() => void handleExtractTranscript()}
          disabled={answerableItems.length === 0 || !hasTranscript || extracting}
        >
          {extracting ? "Extracting..." : "Extract & Review"}
        </button>
      </div>
    </section>
  );
}
