import { useEffect, useState } from "react";
import { fhirBaseUrl } from "../api/config";
import type { PatientQueryResult, PatientSummary } from "../types";
import { queryPatientsFhir } from "../api/patients";
import CreatePatientModal from "./CreatePatientModal";

const defaultPatientRequestUrl = `${fhirBaseUrl}/Patient?_lastUpdated=gt2026-07-01&_count=10`;

interface PatientSelectionProps {
  selectedPatient: PatientSummary | null;
  onSelectPatient: (patient: PatientSummary) => void;
  onContinue: () => void;
}

function formatGender(gender: PatientSummary["gender"]) {
  return gender.charAt(0).toUpperCase() + gender.slice(1);
}

function resultCountText(count: number) {
  if (count === 0) return "No patients found";
  if (count === 1) return "1 patient found";
  return `${count} patients found`;
}

export default function PatientSelection({ selectedPatient, onSelectPatient, onContinue }: PatientSelectionProps) {
  const [query, setQuery] = useState("");
  const [requestUrl, setRequestUrl] = useState(defaultPatientRequestUrl);
  const [queryResult, setQueryResult] = useState<PatientQueryResult | null>(null);
  const [patients, setPatients] = useState<PatientSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  async function runQuery(nextRequestUrl = requestUrl) {
    setLoading(true);
    setPatients([]);
    const result = await queryPatientsFhir(nextRequestUrl);
    setQueryResult(result);
    setPatients(result.patients);
    setLoading(false);
  }

  useEffect(() => {
    void runQuery(defaultPatientRequestUrl);
    // Initial patient query only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSearchChange(nextQuery: string) {
    setQuery(nextQuery);
  }

  function handleCreated(patient: PatientSummary) {
    onSelectPatient(patient);
    setQuery("");
    setShowCreate(false);
    void runQuery();
  }

  const normalizedFilter = query.trim().toLowerCase();
  const filteredPatients = normalizedFilter
    ? patients.filter((patient) => patient.name.toLowerCase().includes(normalizedFilter) || patient.mrn.toLowerCase().includes(normalizedFilter))
    : patients;
  const responseBody = queryResult ? JSON.stringify(queryResult.bundle, null, 2) : "";
  const statusText = queryResult
    ? `GET · ${queryResult.status} ${queryResult.statusText} · Bundle · ${queryResult.bundle.total} entries`
    : "GET · waiting";

  return (
    <section className="screen">
      <div className="fhir-query-panel">
        <div className="query-panel-header">
          <div>
            <p className="eyebrow">Demo</p>
            <h2>FHIR Patient Search</h2>
          </div>
          <span className={`query-status ${queryResult?.status === 200 ? "ok" : queryResult ? "warn" : ""}`}>{statusText}</span>
        </div>

        <label className="request-field">
          Request URL
          <div className="request-row">
            <input value={requestUrl} onChange={(event) => setRequestUrl(event.target.value)} spellCheck={false} />
            <button className="secondary-button" type="button" onClick={() => void runQuery()} disabled={loading}>
              {loading ? "Querying..." : "Query"}
            </button>
          </div>
        </label>

        {queryResult?.error && <p className="query-error">{queryResult.error}</p>}

        {queryResult && (
          <details className="raw-response">
            <summary>Raw FHIR response</summary>
            <pre>{responseBody}</pre>
          </details>
        )}
      </div>

      <div className="screen-header">
        <div>
          <p className="eyebrow">Step 1</p>
          <h1>Select Patient</h1>
        </div>
        <button className="secondary-button" type="button" onClick={() => setShowCreate(true)}>
          Create Patient
        </button>
      </div>

      <label className="search-field">
        <input value={query} onChange={(event) => handleSearchChange(event.target.value)} placeholder="Search by name or MRN" />
      </label>

      <div className="patient-results">
        {!loading && <p className="result-count">{resultCountText(filteredPatients.length)}</p>}

        {loading ? (
          <p className="muted">Searching patients...</p>
        ) : (
          <div className="patient-list" role="table" aria-label="Patients">
            {filteredPatients.length > 0 && (
              <div className="patient-list-header" role="row">
                <span role="columnheader">Name</span>
                <span role="columnheader">MRN</span>
                <span role="columnheader">Gender</span>
                <span role="columnheader">DOB</span>
                <span role="columnheader">Action</span>
              </div>
            )}

            {filteredPatients.map((patient) => {
              const isSelected = selectedPatient?.id === patient.id;

              return (
                <button
                  key={patient.id}
                  type="button"
                  className={`patient-row ${isSelected ? "selected" : ""}`}
                  onClick={() => onSelectPatient(patient)}
                  role="row"
                >
                  <span className="patient-cell patient-name" role="cell">
                    <span className="mobile-label">Name</span>
                    <strong>{patient.name}</strong>
                  </span>
                  <span className="patient-cell" role="cell">
                    <span className="mobile-label">MRN</span>
                    {patient.mrn}
                  </span>
                  <span className="patient-cell" role="cell">
                    <span className="mobile-label">Gender</span>
                    {formatGender(patient.gender)}
                  </span>
                  <span className="patient-cell" role="cell">
                    <span className="mobile-label">DOB</span>
                    {patient.birthDate}
                  </span>
                  <span className="patient-cell patient-action-cell" role="cell">
                    <span className="mobile-label">Action</span>
                    <span className={isSelected ? "selected-pill" : "select-action"}>{isSelected ? "Selected" : "Select"}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="footer-actions">
        {!selectedPatient && <span className="continue-helper">Select a patient to continue.</span>}
        <button className="primary-button" type="button" onClick={onContinue} disabled={!selectedPatient}>
          Continue to Questionnaire
        </button>
      </div>

      {showCreate && <CreatePatientModal onClose={() => setShowCreate(false)} onCreated={handleCreated} />}
    </section>
  );
}
