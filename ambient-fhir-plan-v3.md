# Ambient Listening to FHIR Resources — Planning Document v3

**Status:** Revised planning draft (v3)
**Target FHIR version:** **R4 (4.0.1).** Every example in this document is R4. Some are *not* valid in R5 (see §0.1). Confirm your IRIS endpoint's version before Phase 1.
**Goal:** Build a practical demo app that captures a nurse–patient conversation, extracts structured answers, maps them to a FHIR `Questionnaire`, creates a reviewed `QuestionnaireResponse`, and saves valid FHIR resources into an InterSystems IRIS for Health FHIR repository — architected to grow into a real SMART on FHIR app.

> **Changes from v2 (the things to read first):**
> - **§0.1 FHIR version is now pinned to R4** and the R4-only examples are flagged.
> - **§0.2 Identifier resolution** spells out the logical-id vs canonical-url vs version problem and exactly how the backend resolves it.
> - **§7.x / §10 Transaction Bundle mechanics** are back, with `urn:uuid:` fullUrls and per-entry `request` blocks shown concretely.
> - **Choice answers** now correctly map to `answerCoding` (not `answerString`).
> - **PHI-to-LLM** framing corrected: the transcript itself is PHI; name-stripping is marginal.
> - **Evidence matching** tightened: exact normalized match for auto-accept; fuzzy only to flag-for-review.
> - **`/api/extract`** fixed so `autoDetect` and `questionnaireId` aren't contradictory.
> - **AllergyIntolerance** example now `unconfirmed`, matching the rule.
> - **Patient create** now uses conditional create to avoid duplicate demo data.
> - **SMART scopes** note `user/*` vs `patient/*` depending on cross-patient vs launched-patient context.

---

## 0. Core FHIR model

The most important modeling decision is:

* `Questionnaire` = the reusable form/template.
* `QuestionnaireResponse` = the filled-in response for one patient encounter.

The app should not create a new `Questionnaire` every time the nurse speaks to a patient. It reads an existing `Questionnaire`, extracts answers from the conversation, and creates a new `QuestionnaireResponse`.

```text
One Questionnaire template
        ↓
Many QuestionnaireResponse instances
        ↓
Each linked to one Patient, one Encounter, and one Practitioner/Nurse
```

The app may also create `AllergyIntolerance`, `Observation`, `Condition`, or `MedicationStatement`, but these are **nurse-reviewed suggestions, never automatic AI writes.**

### 0.1 FHIR version (READ THIS)

**Build against FHIR R4 (4.0.1).** IRIS for Health can be configured for R4 or R5 depending on the release, and a few resources differ in ways that will break copy-pasted JSON:

| Field | R4 (this doc) | R5 (do not assume) |
|---|---|---|
| `Encounter.class` | single `Coding` | `CodeableConcept` (`0..*`) |
| `MedicationStatement` → Encounter link | `context` | `encounter` |
| `MedicationStatement.informationSource` | `0..1` | `0..*` |

**Action:** the first acceptance criterion in Phase 1 is "confirm the IRIS FHIR endpoint reports R4 via its CapabilityStatement (`GET /metadata`)." If it's R5, adjust the three fields above before writing any builder code. Don't guess — check the server.

### 0.2 The three-identifier problem (resolve this before Phase 2)

A questionnaire has **three** distinct identifiers, and mixing them up causes `QuestionnaireResponse`s that point at a questionnaire that won't resolve:

1. **Logical id** — IRIS's server-assigned id, e.g. `Questionnaire/3` (used in REST URLs).
2. **Canonical url** — the stable `Questionnaire.url`, e.g. `http://example.org/fhir/Questionnaire/general-intake` (used in `QuestionnaireResponse.questionnaire`).
3. **Version** — `Questionnaire.version`, e.g. `1.0.0` (appended to the canonical as `|1.0.0`).

**Resolution rule (deterministic, backend-owned):**

```text
Frontend always sends the QUESTIONNAIRE LOGICAL ID (or a short app-key that maps to it).
Backend GETs the Questionnaire by id, reads `url` + `version`, and constructs:
    QuestionnaireResponse.questionnaire = `${url}|${version}`
The frontend NEVER constructs the canonical itself.
```

This keeps a single source of truth (the stored `Questionnaire`) and means the saved response always references a resolvable, versioned canonical. Throughout the API in §10, `questionnaireId` = **logical id / app-key**, and the canonical is derived server-side at save time.

### 0.3 Reference style inside a save

`Patient/123` already exists, so it's referenced normally. But `Encounter`, `QuestionnaireResponse`, and any clinical resources are **all created in the same transaction** and reference each other before they have server ids. That requires **`urn:uuid:` placeholders** — see §7.10 for the concrete bundle.

---

## 1. Product overview

**Purpose.** Convert a natural nurse–patient intake conversation into structured FHIR. The nurse asks questions from a clinical questionnaire; instead of typing every answer, they paste (later: record) the conversation. The app extracts answers, maps them to questionnaire items, shows the supporting transcript evidence, lets the nurse review/edit, then saves confirmed data as FHIR.

**Target users.** Primary: clinic **nurse** doing intake, pre-visit screening, allergy review, or structured questionnaire collection. Secondary: clinical informatics staff, FHIR developers, demo stakeholders interested in ambient documentation.

**Clinical setting.** Outpatient clinic / intake workflow, nurse speaking with a patient before the main consult.

**Demo value.** Shows unstructured conversation → structured FHIR; correct `Questionnaire`/`QuestionnaireResponse` use; safe AI extraction via intermediate JSON; human review before write-back; IRIS for Health as the repository; a credible path to SMART on FHIR, MRN scanning, and audio.

**Non-goals (demo).** Not a diagnosis engine, not a medical device, not autonomous documentation, not production PHI handling, not a replacement for nurse review. The AI assists the nurse; it is never the author of record.

---

## 2. Operating modes

Plan around three modes; build them in order.

### Mode 1 — MVP standalone demo, no real auth (build first)
Nurse = mock/seeded `Practitioner`. App manually selects/creates patients. Backend talks to IRIS with configured dev credentials.
```text
Open app → select/create patient → choose questionnaire → paste transcript → extract → review → save to IRIS
```

### Mode 2 — Standalone SMART on FHIR / OIDC app
A SMART app can be standalone (not EHR-launched). The nurse opens it directly; the app runs an OAuth/SMART authorization flow against the auth server, then typically still searches/selects the patient manually.
```text
Open app directly → authorize → search/select patient → choose questionnaire → extract → review → save
```
Because the nurse searches **across** patients here, this is the **`user/*`** scope case (see §2.1).

### Mode 3 — EHR-launched SMART on FHIR app
Launched from an EHR/launcher; the launch supplies FHIR base URL/issuer, launch token, patient context, practitioner via `fhirUser`, possibly encounter.
```text
Launch from EHR → SMART OAuth → patient/practitioner context received → skip patient selection → choose questionnaire → extract → review → save
```
Here there's a **single launched patient**, which leans toward **`patient/*`** scopes (see §2.1). Don't create/select patients manually by default — the EHR already supplied context.

### 2.1 Scope model — `user/*` vs `patient/*`
The scope prefix depends on whether the app needs cross-patient access or is bound to one launched patient:
- **`user/*`** — clinician-level access across many patients. Use for **standalone provider mode** where the nurse searches patients. Example:
  ```text
  openid fhirUser
  user/Patient.read
  user/Questionnaire.read
  user/QuestionnaireResponse.write
  user/Encounter.write
  user/AllergyIntolerance.write
  ```
- **`patient/*`** — access bound to the single launched patient. Use for **EHR-launched mode**. Example: `launch openid fhirUser patient/Questionnaire.read patient/QuestionnaireResponse.write patient/AllergyIntolerance.write`.

Request least privilege: only `.write` the resource types you actually create. Exact strings depend on the auth server.

### 2.2 Auth0 positioning
Auth0 is useful for a standalone OIDC demo before full SMART. But **Auth0 login alone does not make the app SMART on FHIR** — SMART needs the SMART authorization flow, FHIR scopes, server metadata, and (for Mode 3) launch context. Treat Auth0 as a **later** auth layer, not part of MVP.

---

## 3. Main user stories

### Patient selection & creation
*As a nurse, I want to search a patient by name/DOB/MRN so I attach the conversation to the right record.*
AC: search returns summaries (name, gender, DOB, MRN); selecting sets active patient.

*As a nurse, I want to create a new patient if none exists so I can continue intake.*
AC: form requires name, birthDate, gender, MRN; MRN stored as `Patient.identifier` (not `id`); **create is conditional** (no duplicate on repeat — see §10); new patient becomes active.

### MRN scanning (future)
*As a nurse, I want to scan an MRN barcode/QR so lookup is faster.*
AC: scanned MRN searches `Patient.identifier`; exactly one match → select; none → open create form prefilled with MRN; multiple → nurse disambiguates; **never silently create from MRN alone.**

### Questionnaire selection
*As a nurse, I want to choose a questionnaire type so the app knows what to extract.*
AC: app lists active `Questionnaire`s; nurse selects one before extraction (MVP); app loads `linkId`, text, type, answer options.

### Transcript input
*As a nurse, I want to paste a transcript so the app can extract answers.*
AC: textarea accepts paste; app validates patient + questionnaire selected; transcript goes to **backend**, not directly to the LLM.

### Audio recording (future)
*As a nurse, I want to record the conversation so I don't paste text.*
AC: explicit start/stop; recording indicator; transcript from audio enters the **same** pipeline; consent/recording notice in production-like design.

### AI extraction
*As a nurse, I want answers extracted so I don't enter every one.*
AC: each answer maps to a valid `linkId`, has confidence + evidence; unanswered shown separately; low-confidence flagged; **AI output never saved directly.**

### Review & save
*As a nurse, I want to review/edit before saving so wrong data isn't written.*
AC: nurse can edit/accept/reject/mark-unanswered; accept/reject clinical suggestions; backend **rebuilds** FHIR from confirmed app-level data; frontend never sends raw FHIR; save writes a transaction `Bundle` to IRIS.

---

## 4. MVP scope vs future scope

### MVP / demo
Demonstrate only: `Pasted conversation → extracted answers → nurse review → valid QuestionnaireResponse in IRIS`.
Includes: React frontend; Python backend; manual patient search/create (conditional); seeded mock `Practitioner`; seeded `Questionnaire`s; manual questionnaire selection; pasted transcript; LLM → intermediate JSON; deterministic JSON→FHIR; nurse review; save `Encounter` + `QuestionnaireResponse` as a transaction `Bundle`; read-back.
Excludes: audio, MRN scan, SMART launch, Auth0, auto-detection, terminology service, bulk clinical-resource creation, audit dashboard.

### V1
Suggested `AllergyIntolerance` first; better validation; optional questionnaire auto-detection; Auth0 or standalone SMART login; basic audit logging; clearer FHIR validation/errors.

### V2 / future
Audio + STT; MRN scan; EHR-launched SMART; `Observation`/`Condition`/`MedicationStatement` suggestions; `Provenance`/`AuditEvent`; terminology service; FHIR SDC alignment; configurable questionnaire authoring.

---

## 5. Recommended architecture

Thin frontend + backend-for-frontend (BFF). The backend owns **all** FHIR and LLM logic and the only write path.

```text
┌──────────────────────────────────────┐
│ Browser / React App                  │
│ - patient search/create              │
│ - questionnaire picker               │
│ - transcript input                   │
│ - extraction review UI               │
│ - save confirmation                  │
└──────────────────┬───────────────────┘
                   │ App JSON API (NOT raw FHIR)
                   ▼
┌──────────────────────────────────────┐
│ Python Backend / BFF (FastAPI)       │
│ - auth context (mock → Auth0 → SMART)│
│ - patient service                    │
│ - questionnaire service              │
│ - extraction orchestrator            │
│ - intermediate-JSON validation       │
│ - deterministic FHIR builder         │
│ - canonical resolver (§0.2)          │
│ - transaction Bundle builder (§0.3)  │
│ - IRIS FHIR client + $validate       │
│ - audit/provenance service           │
└───────────────┬──────────────┬───────┘
                │              │
   LLM API      │              │  FHIR REST (R4)
                ▼              ▼
┌──────────────────────┐   ┌────────────────────────────┐
│ LLM Provider         │   │ InterSystems IRIS for Health│
│ - structured output  │   │ FHIR R4 Repository          │
└──────────────────────┘   │ Patient, Questionnaire,     │
                           │ QuestionnaireResponse,      │
                           │ Encounter, AllergyIntol.,   │
                           │ Observation, Condition,     │
                           │ MedicationStatement         │
                           └────────────────────────────┘
```

**Why the frontend never touches IRIS directly:** avoids exposing FHIR credentials/tokens, keeps FHIR logic in one place, centralizes validation, and makes the SMART/auth migration a localized change. The frontend sends confirmed **app-level** data; the backend **rebuilds** FHIR deterministically.

---

## 6. Detailed data flow

### 6.1 MVP pasted-transcript flow
```text
1.  Nurse opens app.
2.  Nurse searches or creates Patient (conditional create).
3.  Nurse selects Questionnaire (by logical id / app-key).
4.  Nurse pastes transcript.
5.  Frontend → backend: { patientId, questionnaireId, transcript }.
6.  Backend GETs the Questionnaire from IRIS (also reads url + version).
7.  Backend calls LLM with transcript + questionnaire items.
8.  LLM returns intermediate JSON.
9.  Backend validates JSON: schema; linkIds exist; value types match;
    choice values map to answerOptions; evidence present; confidence present.
10. Backend returns draft extraction (saves nothing).
11. Nurse reviews/edits answers and clinical suggestions.
12. Nurse confirms save.
13. Frontend → backend: confirmed app-level answers + acceptedSuggestions.
14. Backend resolves canonical (§0.2), builds Encounter + QuestionnaireResponse
    (+ accepted clinical resources) with urn:uuid refs (§0.3).
15. Backend POSTs ONE transaction Bundle to IRIS.
16. Backend returns created resource IDs.
17. Frontend shows success + saved-resource summary.
```

### 6.2 Future audio flow
```text
1. Nurse records.  2. Audio → backend.  3. Backend transcribes → text.
4. Text enters the SAME extraction flow as pasted transcript.
```
Rule: **audio changes only the input step.** Everything after transcription reuses the transcript pipeline.

### 6.3 Future MRN scan flow
```text
1. Scan → MRN.  2. Backend Patient?identifier=system|mrn.
3. one → select.  4. none → create form prefilled with MRN.
5. many → disambiguation list.   Never silently create.
```

### 6.4 Standalone SMART flow
```text
1. Open app.  2. SMART/OAuth authorize.  3. Authenticate (user/* scopes).
4. Receive access token.  5. Search/select patient.  6. Continue.
```

### 6.5 EHR-launched SMART flow
```text
1. Launch from EHR.  2. Receive launch context.  3. SMART OAuth (patient/* scopes).
4. Receive patient/practitioner context.  5. Skip patient selection.  6. Continue.
```

---

## 7. FHIR resource design (R4)

### 7.1 Patient
Subject of the intake. Created when nurse creates manually, or (future) MRN scan finds none and nurse completes the form. Read when searching or resolving SMART patient context.
```json
{
  "resourceType": "Patient",
  "identifier": [
    { "system": "http://example.org/fhir/mrn", "value": "MRN12345" }
  ],
  "name": [ { "given": ["Jane"], "family": "Doe" } ],
  "gender": "female",
  "birthDate": "1980-01-01"
}
```
Gotchas: MRN goes in `identifier` (with a **system**), never `id`; search via `identifier=system|value`; **create conditionally** (§10) so repeat demos don't duplicate patients.

### 7.2 Questionnaire
Reusable template; seeded into IRIS before the demo. Read when listing types, extracting, and validating linkIds/types.
```json
{
  "resourceType": "Questionnaire",
  "url": "http://example.org/fhir/Questionnaire/general-intake",
  "version": "1.0.0",
  "name": "GeneralIntake",
  "title": "General Intake Questionnaire",
  "status": "active",
  "item": [
    { "linkId": "allergy-has", "text": "Do you have any allergies?", "type": "boolean" },
    { "linkId": "smoking-status", "text": "What is your smoking status?", "type": "choice",
      "answerOption": [
        { "valueCoding": { "system": "http://snomed.info/sct", "code": "266919005", "display": "Never smoked" } },
        { "valueCoding": { "system": "http://snomed.info/sct", "code": "8517006",  "display": "Former smoker" } },
        { "valueCoding": { "system": "http://snomed.info/sct", "code": "77176002", "display": "Current smoker" } }
      ]
    }
  ]
}
```
Gotchas: `url` stable/canonical; bump `version` on change; `linkId`s are the contract across questionnaire, extraction, review UI, and response. **`choice` items define `answerOption.valueCoding`** — the response must echo one of these as `answerCoding` (see §7.3, §8).

### 7.3 QuestionnaireResponse
Filled response for one conversation. Created on nurse confirm.
```json
{
  "resourceType": "QuestionnaireResponse",
  "status": "completed",
  "questionnaire": "http://example.org/fhir/Questionnaire/general-intake|1.0.0",
  "subject":   { "reference": "Patient/123" },
  "encounter": { "reference": "urn:uuid:enc-1" },
  "authored":  "2026-06-17T09:30:00+08:00",
  "author":    { "reference": "Practitioner/789" },
  "item": [
    { "linkId": "allergy-has", "answer": [ { "valueBoolean": true } ] },
    { "linkId": "smoking-status",
      "answer": [ { "valueCoding": {
        "system": "http://snomed.info/sct", "code": "8517006", "display": "Former smoker"
      } } ] }
  ]
}
```
Gotchas:
- `questionnaire` = **canonical URL with version**, derived server-side (§0.2).
- `item.linkId` must match the questionnaire exactly.
- **Answer type must match item type:** boolean→`valueBoolean`, string→`valueString`, integer→`valueInteger`, date→`valueDate`, **choice→`valueCoding`** (the matched `answerOption`, *not* a free string).
- Unanswered items may be omitted from the saved response while still shown in the review UI.
- In a save bundle, `encounter` references the Encounter's `urn:uuid:` (it has no server id yet) — see §7.10.

### 7.4 Practitioner
Nurse/clinician. Seeded mock for MVP; later mapped from Auth0/SMART identity. Read to set `author`/`recorder`/`performer`.
```json
{
  "resourceType": "Practitioner",
  "identifier": [ { "system": "http://example.org/staff-id", "value": "NURSE001" } ],
  "name": [ { "given": ["Nora"], "family": "Tan" } ]
}
```
Gotchas: in SMART, practitioner comes from `fhirUser`; search by identifier before creating to avoid duplicates.

### 7.5 Encounter
The intake visit. Created on save unless SMART supplies one.
```json
{
  "resourceType": "Encounter",
  "status": "finished",
  "class": { "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode", "code": "AMB", "display": "ambulatory" },
  "subject": { "reference": "Patient/123" },
  "period":  { "start": "2026-06-17T09:00:00+08:00", "end": "2026-06-17T09:15:00+08:00" }
}
```
Gotchas: **`class` is a single `Coding` in R4** (this example); in R5 it's `CodeableConcept` (§0.1). In EHR-launch mode, reuse the launch encounter. The encounter is the glue tying the response and suggestions to one visit.

### 7.6 AllergyIntolerance (first clinical suggestion, V1)
Created when the transcript clearly states an allergy **and** the nurse confirms.
```json
{
  "resourceType": "AllergyIntolerance",
  "clinicalStatus": { "coding": [ { "system": "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical", "code": "active" } ] },
  "verificationStatus": { "coding": [ { "system": "http://terminology.hl7.org/CodeSystem/allergyintolerance-verification", "code": "unconfirmed" } ] },
  "code": { "text": "Penicillin" },
  "patient":   { "reference": "Patient/123" },
  "encounter": { "reference": "urn:uuid:enc-1" },
  "recorder":  { "reference": "Practitioner/789" }
}
```
Gotchas: **default `verificationStatus` to `unconfirmed`** for AI-suggested allergies (the nurse can promote to `confirmed`) — note the example now matches this rule. Never create an allergy for "no known allergies." Free-text `code.text` is fine for the demo; SNOMED/RxNorm coding later.

### 7.7 Observation (later)
Measured/reported findings (pain score, smoking status as observation, BP, temp, height/weight). Created when clearly present and confirmed. Gotchas: never fabricate values; numeric → `valueQuantity` with UCUM unit; AI-derived → `status: preliminary` until confirmed; defer until after AllergyIntolerance.

### 7.8 Condition (later)
Patient-reported problems/diagnoses. Created when clearly mentioned and confirmed. Gotchas: self-report ≠ clinician diagnosis → `verificationStatus: unconfirmed`, consider `asserter: Patient`; don't create from vague statements.

### 7.9 MedicationStatement (later)
Patient-reported medication use ("I take metformin twice a day").
**Use `MedicationStatement`, not `MedicationRequest`** — the latter is a prescription/order authored by a prescriber, wrong semantics for ambient intake. Gotchas: keep as nurse-confirmed suggestion; in R4 the Encounter link is **`context`** (in R5 it's `encounter`, §0.1); set `informationSource: Patient`.

### 7.10 The save transaction Bundle (concrete)
All new resources for one encounter go in **one** `Bundle` of `type: transaction`. New resources use `urn:uuid:` `fullUrl`s so they can reference each other before they have server ids; existing resources (Patient, Practitioner) use normal references. Each entry carries a `request` with `method: POST`.
```json
{
  "resourceType": "Bundle",
  "type": "transaction",
  "entry": [
    {
      "fullUrl": "urn:uuid:enc-1",
      "resource": { "resourceType": "Encounter", "status": "finished",
        "class": { "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode", "code": "AMB" },
        "subject": { "reference": "Patient/123" } },
      "request": { "method": "POST", "url": "Encounter" }
    },
    {
      "fullUrl": "urn:uuid:qr-1",
      "resource": { "resourceType": "QuestionnaireResponse", "status": "completed",
        "questionnaire": "http://example.org/fhir/Questionnaire/general-intake|1.0.0",
        "subject": { "reference": "Patient/123" },
        "encounter": { "reference": "urn:uuid:enc-1" },
        "author": { "reference": "Practitioner/789" },
        "item": [ { "linkId": "allergy-has", "answer": [ { "valueBoolean": true } ] } ] },
      "request": { "method": "POST", "url": "QuestionnaireResponse" }
    },
    {
      "fullUrl": "urn:uuid:allergy-1",
      "resource": { "resourceType": "AllergyIntolerance",
        "verificationStatus": { "coding": [ { "system": "http://terminology.hl7.org/CodeSystem/allergyintolerance-verification", "code": "unconfirmed" } ] },
        "code": { "text": "Penicillin" },
        "patient": { "reference": "Patient/123" },
        "encounter": { "reference": "urn:uuid:enc-1" },
        "recorder": { "reference": "Practitioner/789" } },
      "request": { "method": "POST", "url": "AllergyIntolerance" }
    }
  ]
}
```
On success IRIS returns a response Bundle mapping each `urn:uuid:` to its assigned id. The whole bundle commits atomically — no orphaned response, no dangling reference. (For Patient conditional create, an entry can use `request.method: POST` with `ifNoneExist: "identifier=http://example.org/fhir/mrn|MRN12345"`.)

---

## 8. Questionnaire handling

**Storage.** Store templates as real `Questionnaire` resources in IRIS; keep source JSON in the repo too:
```text
/fhir-seed/questionnaires/general-intake.json
/fhir-seed/questionnaires/allergy-review.json
/fhir-seed/questionnaires/pre-visit-screening.json
```

**MVP item types only:** `string`, `text`, `boolean`, `choice`, `integer`, `date`.
**Avoid in MVP:** nested repeating groups, complex `enableWhen`, calculated expressions, dynamic value sets, SDC extraction definitions, multi-page rendering. (Don't turn this into a questionnaire engine.)

**linkId strategy.** Stable, readable: `allergy-has`, `allergy-substance`, `smoking-status`, `pain-score`. Avoid `q1`, `item-0`. The `linkId` joins `Questionnaire.item` ↔ LLM output ↔ review UI ↔ `QuestionnaireResponse.item`.

**Choice mapping (important).** The LLM returns a plain string/label for a `choice` answer; the **backend** maps it to the matching `answerOption.valueCoding` and emits `answer.valueCoding`. If no option matches, mark the item **needs-review** rather than inventing a coding. Never store a free `valueString` for a `choice` item.

**Unanswered (app working model):**
```json
{ "linkId": "smoking-status", "answered": false, "value": null, "reason": "not mentioned" }
```
Omit from the saved `QuestionnaireResponse`; keep visible in the review UI.

**Uncertain answers:** carry `confidence`, `evidence`, `reviewStatus`.
```json
{ "linkId": "allergy-substance", "value": "Penicillin", "confidence": 0.72,
  "evidence": "I think it was penicillin that gave me a rash", "reviewStatus": "needs-review" }
```
Low confidence doesn't block; it **requires** nurse confirmation.

**Multiple types.** MVP: nurse selects. Future: app detects type + confidence, nurse overrides. Never silently choose a type.

**SDC (future).** FHIR Structured Data Capture fits questionnaire population/extraction; align later, not in MVP.

---

## 9. AI / LLM extraction design

**Core principle: never have the LLM emit raw FHIR.** Two stages:
```text
Stage 1: LLM → strict intermediate JSON.
Stage 2: Backend validates JSON → deterministically builds FHIR.
```
The LLM understands language; the backend owns clinical structure.

**Intermediate JSON.** Note `questionnaireId` is the **logical id / app-key**; the backend derives the canonical (§0.2).
```json
{
  "questionnaireId": "general-intake",
  "answers": [
    { "linkId": "allergy-has", "answered": true, "valueType": "boolean", "value": true,
      "confidence": 0.95, "evidence": "Yes, I am allergic to penicillin." },
    { "linkId": "smoking-status", "answered": true, "valueType": "choice", "value": "Former smoker",
      "confidence": 0.88, "evidence": "I quit smoking about five years ago." }
  ],
  "clinicalSuggestions": [
    { "type": "AllergyIntolerance", "action": "suggest-create", "confidence": 0.92,
      "evidence": "I am allergic to penicillin. It gives me a rash.",
      "fields": { "substance": "Penicillin", "reaction": "rash" } }
  ],
  "unanswered": [ { "linkId": "pain-score", "reason": "not mentioned in transcript" } ]
}
```

**Validation rules (backend).**
1. JSON parses. 2. Matches Pydantic schema. 3. `questionnaireId` matches the selected one. 4. Every `linkId` exists in the questionnaire. 5. `valueType` matches the item type. 6. For `choice`, `value` maps to an `answerOption` (else needs-review). 7. Evidence present for every answered item. 8. Evidence verifies against transcript (see below). 9. No clinical suggestion is auto-accepted.

**Evidence checking (tightened).** The provenance guarantee is only as strong as this check, so:
- Prompt the LLM to quote **verbatim** from the transcript.
- Do **normalized exact** matching (lowercase + collapse whitespace) for anything eligible for **auto-accept**. If it doesn't exactly match, it cannot be auto-accepted.
- Use **fuzzy matching only to flag-for-review**, never to auto-accept. If evidence can't be found even fuzzily, downgrade to needs-review or drop.
This keeps auto-accepted answers genuinely grounded while still surfacing near-misses to the nurse.

**Hallucination prevention.** Intermediate JSON; `linkId` whitelist; verbatim-evidence requirement + exact-match gate; "if not stated, mark unanswered" prompt; deterministic mapping; FHIR validation; nurse confirmation.

**Clinical suggestions.** MVP: questionnaire answers only. First suggestion: `AllergyIntolerance`. Later: `Observation`, `Condition`, `MedicationStatement`. Always separate cards, off-by-default when low confidence, editable, accept/reject, saved only on confirm.

**PHI note (corrected).** See §12 — don't over-claim "PHI minimization" here: the **transcript is itself PHI**.

---

## 10. Backend API design

All frontend calls go to the app backend (base path `/api`), never to IRIS. Throughout, `questionnaireId` = **logical id / app-key** (§0.2).

### GET /api/patients — search
`GET /api/patients?query=jane` | `?mrn=MRN12345` | `?birthDate=1980-01-01`
```json
{ "patients": [ { "id": "123", "mrn": "MRN12345", "name": "Jane Doe", "gender": "female", "birthDate": "1980-01-01" } ] }
```

### POST /api/patients — create (conditional)
Request:
```json
{ "mrn": "MRN12345", "given": ["Jane"], "family": "Doe", "gender": "female", "birthDate": "1980-01-01" }
```
Response:
```json
{ "id": "123", "mrn": "MRN12345", "name": "Jane Doe", "gender": "female", "birthDate": "1980-01-01", "created": true }
```
Notes: backend issues a **conditional create** — `POST /Patient` with header `If-None-Exist: identifier=http://example.org/fhir/mrn|MRN12345`. If a patient with that MRN exists, IRIS returns it instead of duplicating (`"created": false`). Keeps repeated demo runs clean.

### GET /api/patients/by-mrn/{mrn} — future scanner
```json
{ "matchType": "single",   "patient": { "id": "123", "mrn": "MRN12345", "name": "Jane Doe" } }
{ "matchType": "none",     "createHint": { "mrn": "MRN99999" } }
{ "matchType": "multiple", "patients": [] }
```

### GET /api/questionnaires — list
```json
{ "questionnaires": [ { "id": "general-intake", "url": "http://example.org/fhir/Questionnaire/general-intake", "version": "1.0.0", "title": "General Intake", "status": "active", "itemCount": 8 } ] }
```

### GET /api/questionnaires/{id} — UI-friendly form
```json
{ "id": "general-intake", "url": "http://example.org/fhir/Questionnaire/general-intake", "version": "1.0.0", "title": "General Intake",
  "items": [
    { "linkId": "allergy-has", "text": "Do you have any allergies?", "type": "boolean" },
    { "linkId": "smoking-status", "text": "What is your smoking status?", "type": "choice",
      "options": [ { "code": "266919005", "display": "Never smoked" }, { "code": "8517006", "display": "Former smoker" }, { "code": "77176002", "display": "Current smoker" } ] }
  ] }
```

### POST /api/extract — extract (saves nothing)
Request (note: `questionnaireId` is optional **only** when `autoDetect` is true):
```json
{ "patientId": "123", "questionnaireId": "general-intake", "autoDetect": false,
  "transcript": "Nurse: Any allergies? Patient: Yes, penicillin." }
```
- If `autoDetect: false` → `questionnaireId` is **required**; extraction runs against it.
- If `autoDetect: true` → `questionnaireId` may be omitted; the response includes a `detectedType` the nurse must confirm before a second extraction call. (Detection and extraction are separate steps so the two aren't contradictory.)

Response:
```json
{
  "detectedType": null,
  "answers": [
    { "linkId": "allergy-has", "question": "Do you have any allergies?", "answered": true,
      "value": true, "valueType": "boolean", "confidence": 0.95, "evidence": "Yes, penicillin.", "reviewStatus": "accepted" }
  ],
  "unanswered": [],
  "clinicalSuggestions": [
    { "type": "AllergyIntolerance", "summary": "Penicillin allergy", "confidence": 0.92,
      "evidence": "Yes, penicillin.", "fields": { "substance": "Penicillin" }, "defaultSelected": false }
  ]
}
```

### POST /api/save — save confirmed (app-level, not raw FHIR)
Request:
```json
{
  "patientId": "123",
  "practitionerId": "nurse-1",
  "questionnaireId": "general-intake",
  "answers": [
    { "linkId": "allergy-has", "valueType": "boolean", "value": true },
    { "linkId": "smoking-status", "valueType": "choice", "value": "8517006" }
  ],
  "acceptedSuggestions": [
    { "type": "AllergyIntolerance", "fields": { "substance": "Penicillin", "reaction": "rash" } }
  ]
}
```
Response:
```json
{ "encounterId": "456", "questionnaireResponseId": "789",
  "createdResources": [
    { "resourceType": "Encounter", "id": "456" },
    { "resourceType": "QuestionnaireResponse", "id": "789" },
    { "resourceType": "AllergyIntolerance", "id": "101" } ] }
```
Backend behavior: re-fetch questionnaire → **resolve canonical (§0.2)** → re-validate answers (incl. choice→coding mapping) → build resources → assemble **transaction Bundle with urn:uuid refs (§0.3/§7.10)** → optional `$validate` → POST to IRIS → return ids.

### GET /api/patients/{id}/resources — read-back
```json
{ "questionnaireResponses": [], "allergies": [], "observations": [], "conditions": [], "medications": [] }
```

### Future endpoints
`POST /api/transcribe`, `GET /api/smart/launch`, `GET /api/smart/callback`, `POST /api/auth/logout`, `GET /api/me`.

---

## 11. Frontend screen design

Stepper: `Patient → Questionnaire → Conversation → Review → Save`.

1. **Patient selection** — search (name/DOB/MRN), result cards, select, create modal, (future) scan MRN.
2. **Questionnaire selection** — questionnaire cards (title, description, version), selected summary, (future) auto-detect toggle.
3. **Conversation input** — large textarea + sample-transcript loader + Extract (MVP); record button + indicator + status (future).
4. **Review** (the main demo screen) — per question: text, extracted value, editable input, confidence badge, evidence quote, accept/reject/unanswered. Clinical suggestions as separate cards below (type, fields, confidence, evidence, accept/reject), **off by default** when low confidence.
5. **Save confirmation** — before: "This will create: 1 Encounter, 1 QuestionnaireResponse, 1 AllergyIntolerance"; after: success, created resource IDs, link to view saved resources.

Design notes: one primary action per screen; show evidence wherever AI touched data; make "unanswered" and "low-confidence" visually loud; never pre-check a suggestion the nurse hasn't seen.

---

## 12. Security and privacy

**Demo assumptions.** Synthetic patients only; no real PHI; mock practitioner acceptable; no production-compliance claims.

**PHI and the LLM — be honest about the limits.** The biggest misconception to avoid: the **transcript itself is PHI** (the clinical content of a patient conversation). Stripping name/MRN/DOB before the LLM call reduces *re-identification* risk at the margin but does **not** make the call low-PHI — you're still sending the sensitive payload. The real protections are:
- a provider endpoint with **no-training / zero-retention** terms (ideally under a BAA), or
- a **local model** (e.g., Ollama / on-prem) so the transcript never leaves your environment.
Do also avoid sending identifiers you don't need and avoid logging full transcripts in plaintext — but don't present those as the primary safeguard.

**LLM must not:** write to IRIS; emit final FHIR for saving; infer unsupported clinical facts; create diagnoses automatically.
**LLM should:** extract candidate answers; give confidence + evidence; mark unanswered when not stated.

**Audit (demo minimum):** timestamp, patient id, practitioner id, questionnaire id, resources created, save result, transcript **hash** (not the text). Future FHIR-native: `Provenance` (link created resources to nurse + app + timestamp, optionally transcript hash as `entity`) and `AuditEvent`.

**Auth.** MVP: mock practitioner. Later: Auth0 / standalone SMART (`user/*` scopes). Future: EHR-launched SMART (`patient/*` scopes). See §2.1.

**Write safety.** Explicit nurse confirmation before any write; no raw AI output saved; **never trust frontend raw FHIR** — backend always rebuilds and validates before saving.

---

## 13. Technical stack recommendation

**Frontend: React + Vite.** JavaScript is acceptable to start given your comfort; the backend carries the validation burden. Move to TypeScript when the extraction/review payload shapes stabilize (they're structured and easy to mishandle untyped).

**Backend: Python + FastAPI.** Pydantic validates the intermediate JSON; auto OpenAPI docs; clean async for LLM/FHIR calls; Codex-friendly.

**FHIR repository: InterSystems IRIS for Health, FHIR R4**, over the FHIR REST API. **Confirm R4 via `/metadata` first (§0.1).**

**FHIR modeling in code.** Start with hand-built dicts + helper builders for speed; add `fhir.resources` (typed R4 models) for validation once structure stabilizes. Either way, the **canonical resolver** and **bundle builder** are backend-owned helpers, not frontend concerns.

**LLM.** Hosted API first for quality; abstract behind `llm/extractor.py` so you can swap to a local model (Ollama) / Azure OpenAI / Claude / other. The provider choice also drives your PHI story (§12).

**Speech-to-text (future):** Whisper / faster-whisper; browser recording + backend transcription.

**Repo structure:**
```text
ambient-fhir-demo/
  frontend/ src/ { components, pages, api, mock }
  backend/  app/ { main.py, routers, services, schemas, fhir, llm, audit }
  fhir-seed/ { questionnaires, patients, practitioners, transcripts }
  docs/ { planning.md, api.md, fhir-mapping.md }
```

---

## 14. Implementation roadmap

### Phase 0 — Mock click-through
Deliverables: React stepper; mock patients, questionnaires, extraction, save.
**AC:** complete the full flow with no backend.

### Phase 1 — IRIS Patient + Questionnaire integration
Deliverables: backend connects to IRIS; seed `Questionnaire`s + mock `Practitioner`; patient search; **conditional** patient create; questionnaire list/get.
**AC (do these in order):**
1. **`GET /metadata` confirms FHIR R4** (else adjust per §0.1 before proceeding).
2. App searches/creates a real `Patient`; repeating create with the same MRN does **not** duplicate.
3. App lists real `Questionnaire`s from IRIS and can read one's `url` + `version`.

### Phase 2 — Manual QuestionnaireResponse save (no AI)
Deliverables: render questionnaire fields; nurse fills answers; backend resolves canonical (§0.2), builds `Encounter` + `QuestionnaireResponse`, writes a **transaction Bundle with urn:uuid refs (§7.10)**.
**AC:** manual answers save to IRIS; saved `QuestionnaireResponse` references correct patient, encounter, practitioner, and the **versioned canonical**; choice answers stored as `valueCoding`; the encounter↔response reference resolves (no dangling urn).

### Phase 3 — AI transcript extraction
Deliverables: `/api/extract`; prompt from questionnaire items; intermediate JSON + Pydantic validation; evidence/confidence display; review/edit wired to the Phase-2 save path.
**AC:** transcript extracts correct answers; unsupported answers → unanswered/flagged; **auto-accepted answers pass exact normalized evidence match**; nurse edits reflected in the saved response.

### Phase 4 — First clinical suggestion: AllergyIntolerance
Deliverables: allergy extraction; suggestion card; nurse accept/reject; backend builds `AllergyIntolerance` (`unconfirmed`) only when accepted, in the **same** transaction bundle.
**AC:** penicillin transcript yields a suggested allergy; rejected → not saved; accepted → saved atomically with the response; a no-allergy transcript creates **no** allergy.

### Phase 5 — Hardening & validation
Deliverables: IRIS error handling; optional `$validate`; readable validation errors; basic audit log; read-back screen.
**AC:** invalid saves fail clearly; successful saves show ids; demo repeats cleanly.

### Phase 6 — Audio transcription
Deliverables: browser recording; upload; Whisper/STT; transcript into existing pipeline.
**AC:** recorded audio → transcript → extract → save through the same path.

### Phase 7 — MRN scanning
Deliverables: scanner UI; MRN parse; `identifier` search; resolve/create/disambiguate.
**AC:** known MRN selects; unknown opens prefilled create; multiple → disambiguation.

### Phase 8 — Auth / SMART on FHIR
- **8A Auth0 / OIDC:** login → map to `Practitioner` → backend uses authenticated context.
- **8B Standalone SMART:** app starts SMART auth from its own URL (`user/*` scopes) → token → manual patient select.
- **8C EHR-launched SMART:** receive launch context (`patient/*` scopes) → patient/practitioner supplied → skip selection.
**AC:** runs as standalone authenticated SMART-style app; later runs from a SMART launcher with patient context.

---

## 15. Risks, unknowns, and design decisions

1. **Manual vs auto questionnaire selection** → Manual first; auto-detect later as a separate, confirm-required step (so it never conflicts with a passed `questionnaireId`).
2. **MRN creation risk** → scan → search → if none, prefill create; never auto-create silently.
3. **Clinical resource creation risk** → suggestion-only, nurse-confirmed; start with `AllergyIntolerance`.
4. **AI hallucination** → intermediate JSON + verbatim evidence + exact-match auto-accept gate + linkId whitelist + backend validation + nurse review.
5. **FHIR validation complexity** → layered: LLM JSON schema → app validation → FHIR builder validation → optional IRIS `$validate` → transaction Bundle.
6. **FHIR version drift (NEW)** → pin R4; verify `/metadata`; the `Encounter.class` / `MedicationStatement.context` differences (§0.1) are the ones that bite.
7. **Identifier resolution (NEW)** → frontend sends logical id/app-key; backend derives versioned canonical at save time (§0.2). Don't let the frontend build canonicals.
8. **Bundle reference integrity (NEW)** → new resources reference each other via `urn:uuid:` in a `type: transaction` bundle (§7.10); verify references resolve in Phase 2.
9. **PHI to LLM (clarified)** → the transcript is PHI; rely on no-training/zero-retention terms or a local model, not name-stripping, as the real control.
10. **SMART complexity** → make auth context a replaceable module from day one. The app only ever asks: *Who is the practitioner? Who is the patient? Which FHIR token/client do I use?* Scope shape (`user/*` vs `patient/*`) follows the mode (§2.1).
11. **Questionnaire complexity** → restrict MVP item types; avoid SDC/enableWhen until the core flow works.
12. **Frontend trust boundary** → frontend sends reviewed app-level answers; backend rebuilds FHIR; never trust frontend raw FHIR.

---

## 16. Minimal seed data checklist

- 3 synthetic patients.
- 1 mock nurse `Practitioner`.
- 2–3 `Questionnaire`s: General Intake, Allergy Review, Pre-Visit Screening (each with stable `linkId`s and proper `answerOption.valueCoding` on choice items).
- Sample transcripts: (a) complete answers; (b) missing answers; (c) allergy mentioned; (d) low-confidence/ambiguous answer (to demo review); (e) **no allergy** (to prove no false `AllergyIntolerance`).

---

## 17. Recommended first build order

```text
1.  Mock UI click-through.
2.  Backend connection to IRIS + confirm R4 via /metadata.
3.  Seed Questionnaire and Practitioner.
4.  Patient search / conditional create.
5.  Canonical resolver + transaction-Bundle builder (the two pieces of plumbing).
6.  Manual QuestionnaireResponse save (verify references resolve).
7.  Pasted transcript extraction.
8.  Review/edit screen.
9.  Save extracted QuestionnaireResponse.
10. AllergyIntolerance suggestion.
11. Audio / MRN / auth only after the above works.
```

Building the **canonical resolver** and **bundle builder** early (step 5) is deliberate: they're the two pieces v2 left implicit, and every later phase depends on them.
