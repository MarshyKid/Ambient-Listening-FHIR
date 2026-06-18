# Ambient Listening to FHIR Resources — Planning Document

**Status:** Draft v1 (design/planning)
**Audience:** Implementer (you + Codex), reviewers, demo stakeholders
**Goal:** A convincing student/intern demo that captures a nurse–patient conversation, extracts structured answers, and writes valid FHIR resources to an InterSystems IRIS for Health FHIR repository — architected so it can grow into a real SMART on FHIR app.

---

## 0. Quick validation of your core FHIR question

Your instinct is **correct**, and it's the single most important modeling decision in the project:

- **`Questionnaire`** is the *reusable form/template* (the definition). It lists the questions, their `linkId`s, types, and allowed answers. You author it **once** and reuse it across every patient. It is a *definitional* resource (like a blank PDF form).
- **`QuestionnaireResponse`** is the *filled-in instance* for one patient at one encounter. It references the `Questionnaire`, the `Patient` (subject), the `Encounter`, and the `Practitioner` (author), and carries the actual answers. You create **one per conversation**.

So: **one `Questionnaire` template → many `QuestionnaireResponse` instances.** The app reads the `Questionnaire` to know what to ask/extract, and writes a `QuestionnaireResponse` (plus optionally `AllergyIntolerance`, `Observation`, etc.) per encounter. The rest of this document is built on that model.

---

## 1. Product overview

**Purpose.** "Ambient Listening to FHIR" turns a natural nurse–patient conversation into structured, standards-compliant clinical data with minimal manual typing. The nurse talks to the patient using a standard intake/screening form; the app captures the conversation (pasted transcript in the MVP, audio later), extracts the answers, maps them to the form's questions, and produces FHIR resources the nurse reviews and confirms before saving.

**Target users.** Primarily clinic **nurses** doing structured intake/screening (e.g., admission questionnaire, allergy review, pre-visit screening). Secondary: clinical informatics staff who author questionnaires and review data quality.

**Clinical setting.** Outpatient clinic intake desk or exam room. The nurse follows a known questionnaire while conversing, rather than reading questions robotically. The app reduces double-entry (talk *and* type) and structures free-text into coded FHIR.

**Demo value.**
- Shows a clean path from *unstructured speech* → *structured FHIR*, which is a hot topic (ambient clinical documentation).
- Demonstrates correct FHIR modeling (`Questionnaire` vs `QuestionnaireResponse`, linked clinical resources).
- Demonstrates **safe** LLM use: structured intermediate output + validation + human confirmation, not "LLM emits FHIR blindly."
- Demonstrates real interoperability by writing to InterSystems IRIS for Health.
- Has a credible growth story: audio, MRN scan, and SMART on FHIR launch are clearly scoped follow-ons.

**Explicit non-goals (for the demo).** Not a medical device. Not a diagnosis engine. Not autonomous — the nurse always confirms before any write. No production-grade PHI compliance (documented as demo shortcuts).

---

## 2. Main user stories

Format: *As a [role], I want [capability], so that [value]. (Acceptance criteria.)*

**Patient selection / creation**
- As a nurse, I want to search and select an existing patient, so that the encounter is attached to the right record. *(AC: search by name/DOB/MRN returns matches; selecting one sets the active patient context.)*
- As a nurse, I want to create a new patient with minimal fields, so that I can proceed when the patient isn't in the system yet. *(AC: name + DOB + sex + MRN creates a valid `Patient`; the new patient becomes active.)*
- *(Future)* As a nurse, I want to scan an MRN barcode/QR, so that the app finds or creates the patient automatically. *(AC: scanning resolves to exactly one patient or offers a create flow.)*

**Questionnaire choice**
- As a nurse, I want to pick a questionnaire type from a list, so that the app knows which form to fill. *(AC: list shows available `Questionnaire`s by title; selection loads its items.)*
- *(Future)* As a nurse, I want the app to detect the questionnaire type from the conversation, so that I don't have to pick. *(AC: app proposes a type with a confidence indicator and lets me override.)*

**Transcript input**
- As a nurse, I want to paste a conversation transcript, so that the app can extract answers without audio setup. *(AC: pasted text is accepted, length-validated, and tied to the active patient + questionnaire.)*

**Audio recording (future)**
- As a nurse, I want to record the conversation in-app, so that I don't need an external transcript. *(AC: record → transcribe → identical downstream flow as pasted text.)*

**Answer extraction**
- As a nurse, I want the app to extract answers mapped to each question, so that I don't transcribe manually. *(AC: each answered question shows an extracted value, a confidence level, and the supporting quote from the transcript.)*

**Review / edit**
- As a nurse, I want to review, edit, accept, or reject each extracted answer and each proposed clinical resource, so that nothing wrong is saved. *(AC: every field is editable; uncertain/low-confidence items are flagged; I must explicitly confirm.)*

**Saving FHIR**
- As a nurse, I want to save confirmed data as FHIR resources, so that it lands in the clinical record. *(AC: a `QuestionnaireResponse` plus confirmed clinical resources are written atomically to IRIS and I get a success confirmation with resource IDs.)*

**SMART on FHIR launch (future)**
- As a nurse, I want the app to launch from my EHR with the patient already in context, so that I skip manual selection. *(AC: SMART launch provides patient + practitioner + a scoped access token; the app skips login and patient-pick.)*

---

## 3. MVP scope vs future scope

Be strict: ship the smallest thing that demonstrates the end-to-end "speech → reviewed FHIR" loop.

### MVP / demo (build first)
- Manual nurse "login" can be a hardcoded/mock practitioner — no real auth.
- Manual patient **search + create** against IRIS (`Patient`).
- A small set (2–3) of hand-authored `Questionnaire` templates loaded into IRIS (or seeded locally).
- **Paste transcript** input only.
- LLM extraction → **intermediate JSON** (not FHIR) with confidence + evidence quotes.
- Deterministic backend mapping of JSON → `QuestionnaireResponse`.
- Nurse **review/edit** screen.
- Save `QuestionnaireResponse` (+ `Encounter`) to IRIS via a transaction `Bundle`.
- Read back saved resources for the patient.

### V1
- Real authentication (Auth0 OIDC) replacing the mock practitioner; map to a `Practitioner`.
- **Suggested clinical resources**: from the same extraction, propose `AllergyIntolerance` / `Observation` / `Condition` / `MedicationStatement` as *draft* cards the nurse accepts or rejects.
- Questionnaire **auto-detection** offered alongside manual selection.
- Coded answers (SNOMED/LOINC/RxNorm lookups for common items) instead of plain text where feasible.
- Better validation: FHIR profile/structure validation before save; reject-on-invalid with clear errors.

### V2 / future
- **Audio recording + transcription** (Whisper or cloud STT), then the existing pipeline.
- **MRN scan** (barcode/QR) for patient resolve-or-create.
- **SMART on FHIR launch** (EHR-launched, patient/practitioner in context, scoped tokens).
- Speaker diarization (who said what) to improve extraction.
- Audit trail surfaced in-app; configurable questionnaire authoring UI.
- Terminology service integration for robust coding.

**Rule of thumb:** anything that isn't required to show *"pasted conversation becomes reviewed FHIR in IRIS"* is deferred.

---

## 4. Recommended architecture

A thin React SPA, a Python (FastAPI) backend-for-frontend that owns *all* FHIR and LLM logic, IRIS as the FHIR store, and the LLM behind the backend so no PHI or keys touch the browser.

```
                        ┌──────────────────────────────────────────────┐
                        │                Browser (Nurse)                │
                        │  React SPA (Vite)                             │
                        │  - Patient search/create UI                  │
                        │  - Questionnaire picker                      │
                        │  - Transcript paste / (future) recorder      │
                        │  - Extraction review & edit                  │
                        │  - Save confirmation                         │
                        └───────────────┬──────────────────────────────┘
                                        │ HTTPS (JSON, app's own API — NOT raw FHIR)
                                        ▼
        ┌───────────────────────────────────────────────────────────────────────┐
        │                      Backend / BFF (FastAPI, Python)                    │
        │                                                                         │
        │  Auth layer (mock now → Auth0 OIDC → SMART on FHIR later)               │
        │                                                                         │
        │  ┌─────────────┐  ┌──────────────────┐  ┌──────────────────────────┐   │
        │  │ Patient svc │  │ Questionnaire svc│  │ Extraction orchestrator  │   │
        │  │ (CRUD/search│  │ (load templates, │  │ - build prompt           │   │
        │  │  via FHIR)  │  │  list/get)       │  │ - call LLM               │   │
        │  └─────┬───────┘  └────────┬─────────┘  │ - validate JSON (schema) │   │
        │        │                   │            │ - map JSON → FHIR (det.) │   │
        │        │                   │            └───────────┬──────────────┘   │
        │        │                   │                        │                  │
        │  ┌─────┴───────────────────┴────────────────────────┴──────────────┐  │
        │  │            FHIR client + validator + Bundle builder              │  │
        │  └───────────────────────────────┬─────────────────────────────────┘  │
        └──────────────────────────────────┼──────────────────────────────────-─┘
                  │ LLM API (HTTPS)         │ FHIR REST (HTTPS)
                  ▼                         ▼
       ┌────────────────────┐   ┌────────────────────────────────────────────┐
       │  LLM provider      │   │  InterSystems IRIS for Health              │
       │  (Claude/OpenAI/   │   │  FHIR R4 repository (/fhir/r4)             │
       │   local model)     │   │  - Patient, Questionnaire,                │
       │  structured output │   │    QuestionnaireResponse, Encounter,      │
       └────────────────────┘   │    AllergyIntolerance, Observation, ...   │
                                └────────────────────────────────────────────┘

   (Future) ┌────────────────────┐         (Future) ┌────────────────────────┐
            │ Speech-to-text svc │                  │ Auth0 / EHR SMART auth │
            │ (Whisper / cloud)  │                  │ server (token + ctx)   │
            └────────────────────┘                  └────────────────────────┘
```

**Why a backend-for-frontend (BFF) instead of the SPA talking to IRIS directly?**
- Keeps **LLM keys and FHIR credentials server-side**.
- Lets you expose a *small, task-shaped API* to the frontend and keep messy FHIR/LLM logic in one place.
- Single point for validation, audit logging, and the deterministic JSON→FHIR conversion.
- Makes the SMART-on-FHIR migration localized: only the auth layer + how the backend obtains the FHIR token changes.

**Component responsibilities**
- **Frontend:** UI + workflow state only. Never builds FHIR, never calls the LLM, never holds FHIR/LLM secrets.
- **Backend (BFF):** owns FHIR access, LLM orchestration, JSON-schema validation, JSON→FHIR mapping, FHIR validation, audit.
- **IRIS FHIR repo:** system of record; CRUD + search; optional server-side `$validate`.
- **AI extraction service:** logically a module in the backend (one orchestrator), not a separate deployable for the demo.
- **Transcription (future):** isolated service/module; output is plain transcript text that re-enters the same pipeline.
- **Auth (future):** Auth0 for OIDC login; later SMART on FHIR for EHR launch + scoped FHIR tokens.

---

## 5. Detailed data flow

### 5.1 MVP — pasted transcript (the spine of the app)

1. **Patient context.** Nurse searches IRIS (`GET /Patient?...`) or creates one (`POST /Patient`). Backend returns a normalized patient summary; frontend stores `patientId`.
2. **Questionnaire selection.** Nurse picks a type; backend `GET /Questionnaire/{id}` and returns the item list (linkIds, text, types).
3. **Transcript input.** Nurse pastes text; frontend `POST /extract` with `{patientId, questionnaireId, transcript}`.
4. **Extraction.** Backend loads the questionnaire items, builds a prompt embedding those items + the transcript, calls the LLM, and requests **intermediate JSON** (per-`linkId` answers with `value`, `confidence`, `evidence`).
5. **Validation.** Backend validates the JSON against a Pydantic/JSON schema: every `linkId` must exist in the questionnaire; value types must match the item type; unknown linkIds dropped; missing answers marked `unanswered`.
6. **FHIR draft generation.** Backend deterministically builds a **draft** `QuestionnaireResponse` (`status: in-progress`) + optional draft clinical resources, *in memory* (not yet saved). Returns the draft + per-field confidence + evidence to the frontend.
7. **Nurse review.** Nurse edits/accepts/rejects each answer and each suggested resource.
8. **Save.** Frontend `POST /save` with the confirmed payload. Backend re-validates, sets `QuestionnaireResponse.status: completed`, assembles a **transaction `Bundle`**, and `POST`s it to IRIS so everything commits atomically. Backend returns created resource IDs.
9. **Read back.** Frontend can `GET /patients/{id}/resources` to show what was saved.

### 5.2 Future — audio flow
Same as above, but step 3 becomes: nurse records → audio uploaded to backend → transcription service returns text → text enters the pipeline at step 4. Everything downstream is unchanged. (Design tip: make the transcript the *only* interface to extraction so audio is a drop-in front end.)

### 5.3 Future — MRN scan flow
Replaces/augments step 1: scanner yields an MRN string → backend `GET /Patient?identifier={system}|{mrn}`. If exactly one match → set context. If none → open create flow pre-filled with the MRN identifier. If multiple → disambiguation list (data-quality edge case to log).

### 5.4 Future — SMART on FHIR launch flow
Replaces steps 1–2's auth and patient pick: EHR launches the app with a `launch` token + `iss` (FHIR base URL). App completes the SMART OAuth handshake, receives an access token scoped to the launch (e.g., `patient/*.read`, `patient/QuestionnaireResponse.write`), plus `patient` and `fhirUser` context. The app **skips login and patient selection**, using the in-context patient and the practitioner from `fhirUser`. The backend now calls IRIS using the SMART-issued token rather than a service account.

---

## 6. FHIR resource design

All R4. References below use relative form (`Patient/123`) for transaction bundles; within a bundle use `urn:uuid:` placeholders so resources can reference each other before they have server IDs.

### `Patient`
- **Created:** when the nurse creates a new patient (MVP) or via MRN create (future).
- **Read:** patient search/select; resolving MRN.
- **Links:** the subject/anchor for everything else.
- **Demo fields:** `identifier` (MRN with a system URL), `name`, `gender`, `birthDate`. Optionally `telecom`/`address`.
- **Gotchas:** MRN must be an `identifier` with a **system** (e.g., `http://clinic.example.org/mrn`) + value, not just a loose string. For search use `identifier=system|value`. Don't put MRN in `id` (that's the server's logical id).

### `Questionnaire`
- **Created:** authored ahead of time (seed data); not created during an encounter.
- **Read:** to list types and to drive extraction + mapping.
- **Links:** referenced by `QuestionnaireResponse.questionnaire` via its **canonical URL** (the `url` field) or by reference.
- **Demo fields:** `url` (canonical, stable), `version`, `name`, `title`, `status` (`active`), `item[]` each with `linkId`, `text`, `type` (`string`, `boolean`, `choice`, `integer`, `date`, `group`…), and `answerOption` for choice items.
- **Gotchas:** keep `linkId`s **stable and meaningful** (e.g., `allergy-has`, `allergy-substance`) — they are the contract between extraction and FHIR. Version your questionnaires; if you change items, bump `version` so old responses still validate against the right definition.

### `QuestionnaireResponse`
- **Created:** one per conversation. Draft as `in-progress`, saved as `completed`.
- **Read:** to show history; to render past intakes.
- **Links:** `questionnaire` → `Questionnaire` (canonical), `subject` → `Patient`, `encounter` → `Encounter`, `author` → `Practitioner` (the nurse), optional `source` → Patient.
- **Demo fields:** `status`, `questionnaire`, `subject`, `encounter`, `authored` (timestamp), `author`, `item[]` mirroring questionnaire `linkId`s with `answer[]`.
- **Gotchas:** each `item.answer` must use the value type matching the questionnaire item type (`answerString`, `answerBoolean`, `answerCoding`, `answerInteger`…). `linkId`s must match the `Questionnaire` exactly. Don't invent linkIds. Unanswered questions can be omitted or included without an answer — be consistent (recommendation: omit, and track "unanswered" only in your app's review UI).

### `Practitioner`
- **Created:** seeded for the nurse in MVP (mock). Later created/linked from the auth identity.
- **Read:** to set `author`/`recorder`/`performer`.
- **Links:** referenced as `author` (QuestionnaireResponse), `recorder` (AllergyIntolerance), `performer` (Observation), `asserter`/`recorder` (Condition).
- **Demo fields:** `identifier`, `name`. (A `PractitionerRole` is the "correct" way to express the nurse's role at an org, but it's optional for the demo.)
- **Gotchas:** in SMART context you get the practitioner from `fhirUser`; don't create duplicates — search by identifier first.

### `Encounter`
- **Created:** one per conversation/visit, created alongside the `QuestionnaireResponse` (it groups the clinical data captured in this visit).
- **Read:** to contextualize resources by visit.
- **Links:** `subject` → `Patient`; referenced by `QuestionnaireResponse.encounter`, `Observation.encounter`, `Condition.encounter`, `AllergyIntolerance.encounter`.
- **Demo fields:** `status` (`finished` after the intake), `class` (e.g., `AMB` ambulatory), `subject`, `period`.
- **Gotchas:** keep it minimal but present — it's the glue that ties the visit's resources together. In SMART launch you may already have an encounter in context; reuse it instead of creating one.

### `AllergyIntolerance` (suggested, V1)
- **Created:** when the transcript clearly states an allergy and the nurse confirms.
- **Links:** `patient` → Patient, `recorder` → Practitioner, `encounter` → Encounter.
- **Demo fields:** `clinicalStatus` (`active`), `verificationStatus` (`confirmed`/`unconfirmed`), `code` (substance, ideally SNOMED/RxNorm; free-text `code.text` acceptable for demo), `reaction.manifestation`, optional `criticality`.
- **Gotchas:** `clinicalStatus`/`verificationStatus` are required-ish for usability and are CodeableConcepts from specific value sets. Default `verificationStatus` to `unconfirmed` for AI-suggested allergies until the nurse confirms — then `confirmed`. "No known allergies" is *not* an `AllergyIntolerance`; represent it differently (a flag/Observation or the questionnaire answer), don't create an allergy resource for the absence.

### `Observation` (suggested, V1)
- **Created:** for measurable/statable findings mentioned (e.g., "BP was 140/90", smoking status, pain score).
- **Links:** `subject` → Patient, `encounter` → Encounter, `performer` → Practitioner.
- **Demo fields:** `status` (`final` or `preliminary`), `category`, `code` (LOINC), `value[x]` (Quantity/CodeableConcept/string), `effectiveDateTime`.
- **Gotchas:** `code` + `value[x]` type must be coherent (a numeric vital → `valueQuantity` with UCUM unit). For AI-derived values prefer `status: preliminary` until confirmed. Don't fabricate numbers — only create an Observation when the transcript actually contains the value (evidence quote required).

### `Condition` (suggested, V1)
- **Created:** when the patient reports a diagnosis/problem ("I'm diabetic").
- **Links:** `subject` → Patient, `encounter` → Encounter, `recorder`/`asserter` → Practitioner (or Patient as asserter, since it's self-reported).
- **Demo fields:** `clinicalStatus`, `verificationStatus`, `code` (SNOMED/ICD-10), `category` (e.g., `problem-list-item`).
- **Gotchas:** patient self-report ≠ clinician diagnosis. Set `verificationStatus: unconfirmed` and consider `asserter` = Patient. Be conservative; this is exactly where AI over-eagerness causes harm.

### `MedicationStatement` vs `MedicationRequest`
- **Recommendation: `MedicationStatement`.** Ambient capture records *what the patient says they take* ("I take metformin twice a day"). That is a **statement of usage**, which is precisely `MedicationStatement`. `MedicationRequest` is an **order/prescription** authored by a prescriber — wrong semantics for a nurse intake and a higher-stakes write.
- **Created:** when the patient reports current/past medication use and the nurse confirms.
- **Links:** `subject` → Patient, `context` → Encounter, optional `informationSource` → Patient.
- **Demo fields:** `status` (`active`/`completed`), `medicationCodeableConcept` (RxNorm or free-text for demo), `subject`, `dosage` (free-text dosage acceptable), `effective[x]`.
- **Gotchas:** don't emit a `MedicationRequest` from AI extraction — you'd be implying a prescription. Keep medication data as `MedicationStatement` with `informationSource: Patient`.

**Cross-cutting gotcha — saving atomically:** write everything for one encounter in a single **transaction `Bundle`** (`type: transaction`) with `urn:uuid:` fullUrls so intra-bundle references resolve. Either all resources land or none do, avoiding orphaned responses.

---

## 7. Questionnaire handling

**Storage.** Author each questionnaire as a JSON `Questionnaire` resource. Two viable approaches:
- **Recommended:** load them **into IRIS** (`PUT /Questionnaire/{id}` or POST) so they're first-class FHIR and discoverable via search. The app lists them with `GET /Questionnaire?status=active`.
- **Simplest for Phase 0:** keep them as local seed files the backend serves, then migrate into IRIS in Phase 1. Keep the *same* JSON either way.

Give each a stable canonical `url` and a `version`.

**Using `item.linkId`.** The `linkId` is the join key across the whole system:
- It identifies each question in the `Questionnaire`.
- The LLM is told to return answers keyed by `linkId`.
- The backend builds `QuestionnaireResponse.item[].linkId` from it.
Choose human-readable, stable ids (`smoking-status`, `allergy-substance`) — not array indexes.

**Mapping extracted answers → items.** The backend, not the LLM, owns this:
1. Load the questionnaire's items into a lookup `{linkId: itemDefinition}`.
2. For each answer the LLM returned, check the `linkId` exists; drop unknown ones.
3. Coerce/validate the value to the item's `type` (e.g., "yes"/"no" → boolean; choice text → matching `answerOption`).
4. Emit `QuestionnaireResponse.item` with the type-correct `answer[x]`.

**Unanswered questions.** Mark them explicitly in the app's working model (`status: unanswered`) so the review UI can highlight gaps ("3 of 12 questions had no answer in the transcript"). In the saved `QuestionnaireResponse`, omit them (cleaner) rather than storing empty answers. Never let the LLM guess an answer for a question the transcript doesn't cover — absence is a valid, important result.

**Uncertain answers.** Carry a `confidence` per answer plus an `evidence` quote. In review, anything below a threshold (say 0.7) is visually flagged and defaults to "needs nurse confirmation." Low confidence does **not** block — it just demands a human decision.

**Multiple questionnaire types.** Because everything is keyed off the loaded `Questionnaire`, supporting a new type = adding a new `Questionnaire` resource. No code changes. The extraction prompt is generated *from* the questionnaire items, so it adapts automatically. (Auto-detection in V1 just chooses *which* questionnaire to load.)

---

## 8. AI/LLM extraction design

**Core principle — do NOT have the LLM emit FHIR directly.** Raw FHIR from an LLM is risky: it can hallucinate structure, invent codes, drop required fields, or fabricate clinical values, and it's hard to validate intent. Instead use a **two-stage** design:

> **Stage 1 (LLM):** transcript + questionnaire items → constrained **intermediate JSON** (answers, confidence, evidence).
> **Stage 2 (deterministic backend):** validate that JSON, then build FHIR in code.

This gives you: schema-checkable output, a place to enforce "no evidence → no answer," type coercion you control, and a clean audit of *why* each FHIR field exists. The LLM does language understanding; **your code owns clinical structure.**

### 8.1 Suggested intermediate JSON schema

```jsonc
{
  "questionnaireId": "intake-general",          // echoed back, must match request
  "detectedType": {                              // only used in auto-detect mode
    "questionnaireId": "intake-general",
    "confidence": 0.0                            // 0..1
  },
  "answers": [
    {
      "linkId": "smoking-status",                // MUST exist in the questionnaire
      "valueType": "choice",                     // string|boolean|integer|date|choice
      "value": "former-smoker",                  // raw value; backend coerces/codes
      "confidence": 0.0,                          // 0..1
      "evidence": "I quit smoking about 5 years ago",  // verbatim transcript quote
      "answered": true                            // false => no info found
    }
  ],
  "clinicalSuggestions": [                        // V1; optional in MVP
    {
      "resourceType": "AllergyIntolerance",
      "summary": "Penicillin allergy, rash",
      "fields": { "substance": "penicillin", "reaction": "rash" },
      "confidence": 0.0,
      "evidence": "I'm allergic to penicillin, it gives me a rash"
    }
  ],
  "notes": "free-text model commentary (ignored by mapper, kept for audit)"
}
```

Enforce this with a strict JSON schema / Pydantic model and use the provider's **structured-output / JSON mode** so you get parseable JSON every call.

### 8.2 Confidence scores
- Required on every answer and suggestion (0–1).
- Backend defines thresholds: `>=0.85` auto-accept-eligible (still nurse-confirmed before save), `0.5–0.85` flag, `<0.5` treat as "uncertain, default-off."
- Confidence influences UI defaults only — it never auto-writes.

### 8.3 Evidence quotes (anti-hallucination backbone)
- Every `answered: true` answer and every clinical suggestion **must** include a verbatim `evidence` span from the transcript.
- Backend **rejects** answers whose `evidence` string isn't actually a substring of the transcript (cheap, powerful hallucination check). On failure, downgrade to "uncertain" or drop.
- Evidence is shown in the review UI so the nurse sees *where* each value came from.

### 8.4 Handling uncertain answers
- `answered: false` → mark question unanswered, never fabricate.
- Low confidence → flagged, defaults to needs-confirmation, not auto-selected.
- Conflicting statements in transcript → backend can keep the highest-confidence one and surface the conflict note in review.

### 8.5 Questionnaire type detection (V1)
- Two-call or single-call options:
  - **Manual mode (MVP):** skip detection; questionnaire chosen by nurse.
  - **Auto mode (V1):** first call classifies the transcript against the list of available questionnaire titles/descriptions → returns `detectedType` + confidence. App shows "Detected: General Intake (0.82) — change?" Nurse can override. Then the normal extraction runs against the chosen questionnaire.
- Always allow override. Never silently commit to a detected type.

### 8.6 Extraction validation (backend)
Pipeline before anything reaches the nurse:
1. JSON parses & matches schema (else retry once, then error).
2. `questionnaireId` matches the request.
3. Every `linkId` exists in the loaded questionnaire (drop unknown).
4. `valueType` matches the item type; coerce or flag mismatches.
5. Evidence substring check against transcript.
6. Build draft FHIR; run FHIR structural validation (and optionally IRIS `$validate`) — but do **not** save.

### 8.7 Hallucination prevention (summary of techniques)
- Intermediate JSON, not FHIR.
- Mandatory evidence quotes + substring verification.
- Whitelist of valid `linkId`s injected into the prompt; reject others.
- "If not stated, return answered=false" instruction, reinforced by validation.
- Deterministic coding/value mapping in code (LLM doesn't pick codes for the demo; it returns plain values, your code maps).
- Conservative defaults: AI-suggested clinical resources start `unconfirmed`/`preliminary` and off-by-default in review.

### 8.8 Nurse review step (non-negotiable gate)
- Nothing is written to IRIS without explicit nurse confirmation.
- Review screen shows: each question, extracted value (editable), confidence badge, evidence quote, and accept/reject. Suggested clinical resources are separate cards the nurse opts into.
- Only confirmed items are assembled into the save bundle.

---

## 9. Backend API design

These are the app's **own** task-shaped endpoints (the frontend never calls IRIS directly). JSON in/out. Prefix `/api`. Auth header omitted in MVP, added later.

### `GET /api/patients`
- **Method/URL:** `GET /api/patients?query=smith&birthdate=1980-01-01`
- **Request:** query params (name, birthdate, or `mrn`).
- **Response:** `{ "patients": [ { "id", "name", "gender", "birthDate", "mrn" } ] }`
- **Notes:** backend translates to IRIS `GET /Patient?...`; returns a flattened summary, not raw FHIR.

### `POST /api/patients`
- **URL:** `POST /api/patients`
- **Request:** `{ "name": {"given":["Jane"],"family":"Doe"}, "gender":"female", "birthDate":"1980-01-01", "mrn":"MRN123" }`
- **Response:** `{ "id":"...", "mrn":"MRN123", ... }`
- **Notes:** builds a `Patient` (MRN as `identifier` with system), POSTs to IRIS, returns the created summary.

### `GET /api/patients/by-mrn/{mrn}` *(future MRN scan)*
- **Response:** one patient summary, or `404` with a create hint.
- **Notes:** `GET /Patient?identifier={system}|{mrn}`; handles 0/1/many.

### `GET /api/questionnaires`
- **Response:** `{ "questionnaires": [ { "id","url","title","version","itemCount" } ] }`
- **Notes:** `GET /Questionnaire?status=active`.

### `GET /api/questionnaires/{id}`
- **Response:** the questionnaire with its `item[]` (linkId, text, type, options) in a UI-friendly shape.
- **Notes:** used to render the form and to drive extraction.

### `POST /api/extract`
- **Request:** `{ "patientId":"...", "questionnaireId":"...", "transcript":"...", "autoDetect": false }`
- **Response:** `{ "draftResponse": {...}, "answers":[{ "linkId","value","confidence","evidence","answered" }], "suggestions":[...], "unanswered":["linkId",...], "detectedType": {...}|null }`
- **Notes:** runs the Stage-1 LLM call + Stage-2 validation; **returns a draft, saves nothing**. If `autoDetect`, may return a detected type for confirmation.

### `POST /api/draft` *(optional split)*
- **Notes:** if you separate "extract" (LLM) from "build draft FHIR," this turns confirmed/edited answers into a draft `QuestionnaireResponse` + draft clinical resources without saving. For the demo you can fold this into `/extract`.

### `POST /api/save`
- **Request:** the nurse-confirmed payload: `{ "patientId","practitionerId","questionnaireId","answers":[...confirmed...], "acceptedSuggestions":[...] }`
- **Response:** `{ "encounterId","questionnaireResponseId","createdResources":[{ "resourceType","id" }] }`
- **Notes:** backend re-validates, builds a **transaction Bundle** (Encounter + QuestionnaireResponse + accepted clinical resources with `urn:uuid:` refs), POSTs to IRIS, returns IDs. This is the only write path.

### `GET /api/patients/{id}/resources`
- **Response:** `{ "questionnaireResponses":[...], "allergies":[...], "observations":[...], "conditions":[...], "medications":[...] }`
- **Notes:** convenience reads for the "what was saved" view (`GET /QuestionnaireResponse?subject=Patient/{id}`, etc.).

*(Future)* `POST /api/transcribe` (audio → text), SMART endpoints `/api/smart/launch` + `/api/smart/callback`.

---

## 10. Frontend screen design

Keep it linear and demo-friendly: a top stepper (Patient → Questionnaire → Conversation → Review → Saved) makes the flow obvious to an audience.

1. **Patient selection screen.** Search box (name/DOB/MRN) → results list → "Select." A "+ New patient" button opens the create modal. Shows active patient as a pinned header once chosen.
2. **Create patient modal.** Minimal fields (given/family name, DOB, sex, MRN). Validates and creates, then sets active patient.
3. **Questionnaire selection screen.** Cards/list of available questionnaires with title + short description. (V1: an "Auto-detect from conversation" toggle.)
4. **Transcript / audio input screen.** Big textarea for paste + char count; primary "Extract" button. (Future: a record button + waveform; same Extract afterward.) Active patient + chosen questionnaire shown for context.
5. **Extraction results / review & edit screen** (the centerpiece). For each question: question text, extracted value (editable control matching the type), a **confidence badge** (green/amber/red), and the **evidence quote** (collapsible). Unanswered questions grouped/flagged. Below: **Suggested clinical resources** as separate accept/reject cards (allergy, observation, condition, medication), each with evidence and editable fields, **off by default** when low-confidence. A clear count: "9 answered, 3 unanswered, 2 suggestions."
6. **Save confirmation screen.** Summary of exactly what will be written ("1 QuestionnaireResponse, 1 Encounter, 1 AllergyIntolerance"), a final "Confirm & Save," then a success state with resource IDs and a "View saved resources" link.

Design notes: one primary action per screen; show provenance (evidence) everywhere AI touched data; make "unanswered" and "low-confidence" visually loud; never pre-check a clinical resource the nurse hasn't looked at.

---

## 11. Security and privacy considerations

Be explicit about **what's a demo shortcut vs what production needs**, so reviewers see you understand the difference.

**PHI handling.**
- *Demo:* synthetic patients only; no real PHI. Document this loudly.
- *Production:* TLS everywhere, encryption at rest, least-privilege access to IRIS, no PHI in logs.

**Minimizing PHI to the LLM.**
- Send the **transcript + questionnaire items** to the LLM, but **do not** send patient identifiers (name, MRN, DOB) unless needed. The extraction doesn't need to know who the patient is.
- *Production hardening:* consider de-identification/pseudonymization of the transcript before LLM, a no-training/zero-retention LLM endpoint, and a BAA with the provider. Local models (e.g., an on-prem LLM) remove third-party exposure entirely.

**Audit logs.**
- Log every extraction and every write: who (practitioner), when, patient, questionnaire, which resources created, and the confirmation event. Store the transcript hash + the evidence used. (FHIR `AuditEvent` is the "proper" resource; a simple app-side audit table is fine for the demo.)

**Role-based access.**
- *Demo:* single "nurse" role.
- *Production:* RBAC mapped to scopes; only authorized roles can write clinical resources; separate read vs write.

**SMART on FHIR scopes (future).**
- Request least-privilege scopes, e.g. `launch`, `openid fhirUser`, `patient/Patient.read`, `patient/Questionnaire.read`, `patient/QuestionnaireResponse.write`, and narrowly `patient/AllergyIntolerance.write` etc. only for resources you actually create.
- Patient-context scopes (`patient/*`) keep access bound to the launched patient.

**Auth0 (later).**
- Use Auth0 for OIDC login in V1 (before full SMART). Map the Auth0 identity → a `Practitioner` (search by identifier, create if missing). The backend exchanges/validates tokens; the SPA never holds FHIR credentials.
- Migration to SMART: Auth0 can act as the OIDC layer, but EHR-launched SMART tokens come from the EHR's authorization server; keep the token-acquisition code isolated so you can swap it.

**Nurse confirmation before write.** The hard gate: no resource is written without explicit per-encounter confirmation. AI output is always a *draft*. This is both a safety control and a great demo talking point.

**Demo-only shortcuts (call these out in the README):** mock practitioner, no real auth, synthetic data, free-text codes instead of full terminology binding, service-account FHIR access, simplified audit. Each maps to a clear production upgrade.

---

## 12. Technical stack recommendation

**Recommended combination:**

- **Frontend: React + Vite + TypeScript**, a lightweight component lib (e.g., shadcn/ui or Chakra). TypeScript pays off because the extraction/review payloads are structured and error-prone to handle untyped.
- **Backend: Python + FastAPI.** Choose **FastAPI over Flask** because:
  - **Pydantic** is exactly the tool for validating the intermediate extraction JSON — your Stage-2 validation is basically Pydantic models.
  - Native **async** suits calling the LLM and IRIS concurrently.
  - Auto-generated **OpenAPI/Swagger** docs make the API self-demoing and Codex-friendly.
  - Clean typing aligns with the structured pipeline.
- **FHIR store: InterSystems IRIS for Health FHIR repository** (R4), accessed over its FHIR REST API. Use a thin FHIR client (the `fhir.resources` Python package gives you typed R4 models + validation, which pairs nicely with the deterministic JSON→FHIR step). The community edition of IRIS for Health is sufficient for a demo.
- **LLM extraction: hosted API with structured-output/JSON mode** for the demo (fastest path, best quality). Keep the provider behind an interface so you can swap to a **local model** (e.g., via Ollama) for the privacy story or offline demos.
- **Speech-to-text (later): Whisper** — local `faster-whisper` for privacy, or a hosted STT for speed. Isolated behind `/api/transcribe` so it's a drop-in.
- **Auth (later): Auth0** for OIDC, then SMART on FHIR for EHR launch.

**Why this is the right call for a student/demo:** one language (Python) for all the tricky logic, strong validation primitives, typed FHIR models, a frontend that's easy to demo and that Codex generates well, and clean seams (LLM interface, FHIR client, auth layer) so every "future" feature is a localized change rather than a rewrite.

**Repo shape (suggestion):**
```
/frontend   (React/Vite/TS)
/backend    (FastAPI: routers/, services/, fhir/, llm/, schemas/, audit/)
/fhir-seed  (Questionnaire JSON, sample Patients, sample transcripts)
/docs       (this plan, API docs, demo script)
```

---

## 13. Implementation roadmap

Each phase ships something demoable. Acceptance criteria are concrete and testable.

### Phase 0 — Mock data / prototype
- **Deliverables:** React skeleton with the 6 screens wired to **mocked** backend responses; hardcoded sample patient, one `Questionnaire`, one sample transcript; fake extraction returning canned JSON; the full click-through works end to end with no real services.
- **Acceptance:** you can walk the entire flow (select patient → pick questionnaire → paste transcript → see extracted answers → review → "save" success) using only mocks.

### Phase 1 — FHIR Patient + Questionnaire + QuestionnaireResponse (no AI yet)
- **Deliverables:** backend talks to IRIS; real patient search/create; real questionnaire list/get from seeded `Questionnaire`s; nurse manually fills answers; backend builds and saves a real `QuestionnaireResponse` (+ `Encounter`) as a transaction Bundle; read-back view.
- **Acceptance:** a manually-entered intake persists to IRIS and is retrievable; the saved `QuestionnaireResponse` validates (correct linkIds, types, references to Patient/Encounter/Practitioner).

### Phase 2 — AI transcript extraction
- **Deliverables:** `/api/extract` calls the LLM with questionnaire items + transcript, returns intermediate JSON; Stage-2 validation (schema, linkId whitelist, type coercion, evidence substring check); review screen shows values + confidence + evidence; confirmed answers feed the same save path as Phase 1.
- **Acceptance:** pasting a realistic transcript produces correctly-mapped answers with evidence quotes; fabricated/unsupported answers are rejected or flagged; unanswered questions are surfaced; nurse edits flow through to a valid saved `QuestionnaireResponse`.

### Phase 3 — IRIS FHIR repository integration (hardening) + suggested clinical resources
- **Deliverables:** robust IRIS error handling; transaction-bundle saves; optional `$validate`; V1 **suggested** `AllergyIntolerance`/`Observation`/`Condition`/`MedicationStatement` as accept/reject cards with conservative defaults.
- **Acceptance:** an encounter writes a QuestionnaireResponse plus any nurse-accepted clinical resources atomically; rejecting a suggestion omits it; invalid bundles fail cleanly with a readable error.

### Phase 4 — Audio transcription
- **Deliverables:** in-app recording → `/api/transcribe` (Whisper) → transcript flows into the existing pipeline.
- **Acceptance:** a recorded snippet yields a transcript that produces the same extraction quality as pasting; UI handles record/stop/processing states.

### Phase 5 — MRN scanning
- **Deliverables:** barcode/QR scan in the patient screen → resolve-or-create by MRN identifier.
- **Acceptance:** scanning a known MRN sets the patient context; an unknown MRN opens a pre-filled create flow; multiple matches are disambiguated.

### Phase 6 — SMART on FHIR OAuth / Auth0
- **Deliverables:** Auth0 OIDC login mapping to a `Practitioner`; then SMART EHR-launch handshake providing patient + practitioner context + scoped FHIR token; backend uses the SMART token for IRIS.
- **Acceptance:** app launches in a SMART sandbox (e.g., a SMART launcher pointed at IRIS) with patient pre-selected; writes succeed using launch-scoped tokens; login/patient-pick screens are bypassed when launched.

---

## 14. Risks, unknowns, and design decisions

The decisions you actually need to make, with a recommendation for each.

1. **Questionnaire selected first vs auto-detected.**
   - *Trade-off:* manual = simpler, deterministic, fewer failure modes; auto = slicker but adds a classification step that can be wrong.
   - **Recommendation:** manual-first for MVP; add auto-detect as an *optional, override-able* mode in V1. Never let detection silently decide.

2. **How to represent MRN.**
   - **Recommendation:** as a `Patient.identifier` with an explicit `system` URL (e.g., `http://clinic.example.org/mrn`) + value. Search with `identifier=system|value`. Don't overload the FHIR logical `id`.

3. **Auto-create clinical resources vs suggest-only.**
   - *Risk:* auto-creating `Condition`/`AllergyIntolerance` from AI is the highest-harm path (wrong clinical record).
   - **Recommendation:** **suggest-only, nurse-confirmed, off-by-default for low confidence.** AI-suggested resources default to `unconfirmed`/`preliminary`. This is both safer and a strong demo narrative.

4. **Avoiding incorrect AI clinical data.**
   - **Recommendation:** the layered defenses from §8 — intermediate JSON (not FHIR), mandatory evidence quotes with substring verification, linkId whitelist, "no evidence → unanswered," deterministic mapping in code, conservative statuses, and the hard nurse-confirmation gate. Treat the LLM as a *drafting assistant*, not an author of record.

5. **How to structure FHIR validation.**
   - **Recommendation:** validate in layers — (a) app JSON schema/Pydantic on extraction output, (b) typed FHIR model validation (`fhir.resources`) when building resources, (c) optional IRIS `$validate` before save, (d) atomic transaction Bundle so partial/invalid writes can't happen. Fail with readable errors surfaced to the nurse.

6. **How SMART launch changes patient/practitioner selection.**
   - *Impact:* in SMART mode the EHR supplies patient + practitioner context and a scoped token, so the login and patient-selection screens are **skipped**, and the backend stops using a service account.
   - **Recommendation:** isolate "how we get the FHIR token and the active patient/practitioner" behind one module from day one, so flipping to SMART touches only that seam. Keep a non-SMART (manual) path for standalone demos.

**Other unknowns to track:** IRIS FHIR endpoint specifics and auth for your install; whether you need terminology coding now or free-text is acceptable for the demo (recommend free-text first, code later); LLM provider's data-retention terms (drives the local-model decision); transcript quality/diarization for the audio phase; and how you'll generate realistic sample transcripts for the demo (write 3–4 good ones per questionnaire).

---

### Appendix A — Minimal demo seed checklist
- 2–3 `Questionnaire` resources (e.g., General Intake, Allergy Review, Pre-visit Screening) with stable `linkId`s.
- 3–5 synthetic `Patient`s in IRIS.
- 1 mock `Practitioner` (the nurse).
- 3–4 realistic sample transcripts per questionnaire (including ones with allergies/conditions/meds to show suggestions, and ones with missing answers to show "unanswered" handling).
- A 3-minute demo script following the stepper.

### Appendix B — "Save" transaction Bundle sketch
A single `Bundle` (`type: transaction`) containing: `Encounter` (urn:uuid:enc), `QuestionnaireResponse` (refs urn:uuid:enc + Patient + Practitioner), and any accepted `AllergyIntolerance` / `Observation` / `Condition` / `MedicationStatement` (each ref'ing Patient + urn:uuid:enc). POST to the IRIS FHIR base. All-or-nothing commit; response Bundle returns the assigned IDs.
