import { useEffect, useState } from "react";
import type { ExtractionResult, PatientSummary, Questionnaire, SampleTranscript } from "../types";
import { extractTranscript, listSampleTranscripts } from "../mock/mockApi";

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

  async function handleExtract() {
    setExtracting(true);
    try {
      const result = await extractTranscript({
        patientId: patient.id,
        questionnaireId: questionnaire.id,
        transcript
      });
      onExtracted(result);
    } finally {
      setExtracting(false);
    }
  }

  return (
    <section className="screen">
      <div className="screen-header">
        <div>
          <p className="eyebrow">Step 3</p>
          <h1>Conversation</h1>
        </div>
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
        <button className="primary-button" type="button" onClick={handleExtract} disabled={!transcript.trim() || extracting}>
          {extracting ? "Extracting..." : "Extract Answers"}
        </button>
      </div>
    </section>
  );
}
