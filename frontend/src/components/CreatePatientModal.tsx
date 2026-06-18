import { FormEvent, useState } from "react";
import type { CreatePatientInput, Gender, PatientSummary } from "../types";
import { createPatient } from "../mock/mockApi";

interface CreatePatientModalProps {
  onClose: () => void;
  onCreated: (patient: PatientSummary) => void;
}

const emptyForm: CreatePatientInput = {
  mrn: "",
  givenName: "",
  familyName: "",
  gender: "unknown",
  birthDate: ""
};

export default function CreatePatientModal({ onClose, onCreated }: CreatePatientModalProps) {
  const [form, setForm] = useState<CreatePatientInput>(emptyForm);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");

    if (!form.mrn.trim()) {
      setError("MRN is required.");
      return;
    }
    if (!form.givenName.trim() && !form.familyName.trim()) {
      setError("Given name or family name is required.");
      return;
    }
    if (!form.gender) {
      setError("Gender is required.");
      return;
    }
    if (!form.birthDate) {
      setError("Birth date is required.");
      return;
    }

    setSaving(true);
    try {
      const patient = await createPatient(form);
      onCreated(patient);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="create-patient-title">
        <div className="modal-header">
          <h2 id="create-patient-title">Create Patient</h2>
          <button className="ghost-button" type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <form className="form-grid" onSubmit={handleSubmit}>
          <label>
            MRN
            <input value={form.mrn} onChange={(event) => setForm({ ...form, mrn: event.target.value })} />
          </label>
          <label>
            Given name
            <input value={form.givenName} onChange={(event) => setForm({ ...form, givenName: event.target.value })} />
          </label>
          <label>
            Family name
            <input value={form.familyName} onChange={(event) => setForm({ ...form, familyName: event.target.value })} />
          </label>
          <label>
            Gender
            <select value={form.gender} onChange={(event) => setForm({ ...form, gender: event.target.value as Gender })}>
              <option value="unknown">Unknown</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>
            Birth date
            <input type="date" value={form.birthDate} onChange={(event) => setForm({ ...form, birthDate: event.target.value })} />
          </label>

          {error && <p className="form-error">{error}</p>}

          <div className="button-row">
            <button className="secondary-button" type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="primary-button" type="submit" disabled={saving}>
              {saving ? "Creating..." : "Create & Select"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
