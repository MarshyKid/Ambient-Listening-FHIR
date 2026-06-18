# Ambient FHIR Demo Backend

FastAPI backend for Phase 1/2 of the Ambient Listening to FHIR Resources demo.

This backend connects to an InterSystems IRIS for Health FHIR R4 repository through the FHIR REST API. It intentionally returns both raw FHIR data for demo panels and flattened data for normal UI rendering.

## Setup

```bash
cd backend
uv sync
cp .env.example .env
uv run uvicorn app.main:app --reload
```

Without `uv`:

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install fastapi "uvicorn[standard]" httpx pydantic pydantic-settings python-dotenv
copy .env.example .env
uvicorn app.main:app --reload
```

API docs are available at:

```text
http://127.0.0.1:8000/docs
```

## Environment

Configure `.env`:

```env
FHIR_BASE_URL=https://localhost:8443/csp/healthshare/demo/fhir/r4
FHIR_USERNAME=...
FHIR_PASSWORD=...
FHIR_VERIFY_SSL=false
FHIR_MRN_SYSTEM=http://example.org/fhir/mrn
FHIR_STAFF_SYSTEM=http://example.org/staff-id
QUESTIONNAIRE_CANONICAL_BASE=http://example.org/fhir/Questionnaire
DEFAULT_PRACTITIONER_IDENTIFIER=nurse-1
ALLOWED_ORIGINS=http://localhost:5173
FHIR_TIMEOUT_SECONDS=10
ENABLE_FHIR_VALIDATE=false
```

`FHIR_BASE_URL` and `QUESTIONNAIRE_CANONICAL_BASE` are normalized without trailing slashes. `FHIR_VERIFY_SSL=false` supports local self-signed IRIS HTTPS certificates.

## Seed FHIR Resources

The seed script does not depend on stable logical IDs. IRIS owns logical IDs.

```bash
cd backend
uv run python scripts/seed_fhir.py
```

It seeds or verifies:

- Questionnaires by canonical `Questionnaire.url`
- Practitioner by `FHIR_STAFF_SYSTEM|nurse-1`
- Sample patient by MRN conditional create

Example output:

```text
general-intake -> Questionnaire/17
allergy-review -> Questionnaire/18
pre-visit-screening -> Questionnaire/19
nurse-1 -> Practitioner/22
MRN1001 -> Patient/3
```

## Smoke Tests

```bash
curl http://127.0.0.1:8000/api/health
curl http://127.0.0.1:8000/api/health/fhir
curl http://127.0.0.1:8000/api/patients
curl "http://127.0.0.1:8000/api/patients?mrn=MRN1001"
curl http://127.0.0.1:8000/api/questionnaires
curl http://127.0.0.1:8000/api/questionnaires/17
```

The list endpoints also accept a URL-encoded FHIR search URL for demo panels:

```bash
curl "http://127.0.0.1:8000/api/patients?requestUrl=https%3A%2F%2Flocalhost%3A8443%2Fcsp%2Fhealthshare%2Fdemo%2Ffhir%2Fr4%2FPatient%3F_count%3D10"
curl "http://127.0.0.1:8000/api/questionnaires?requestUrl=https%3A%2F%2Flocalhost%3A8443%2Fcsp%2Fhealthshare%2Fdemo%2Ffhir%2Fr4%2FQuestionnaire%3Fstatus%3Dactive"
```

`requestUrl` must target the configured `FHIR_BASE_URL` and the matching FHIR search endpoint. The backend still applies its configured IRIS authentication; the frontend should never send credentials in the URL.

Create a patient:

```bash
curl -X POST http://127.0.0.1:8000/api/patients ^
  -H "Content-Type: application/json" ^
  -d "{\"mrn\":\"MRN2001\",\"given\":[\"Alex\"],\"family\":\"Rivera\",\"gender\":\"unknown\",\"birthDate\":\"1990-01-01\"}"
```

Create a questionnaire from app-level fields:

```bash
curl -X POST http://127.0.0.1:8000/api/questionnaires ^
  -H "Content-Type: application/json" ^
  -d "{\"slug\":\"demo-intake\",\"version\":\"1.0.0\",\"title\":\"Demo Intake\",\"description\":\"Created by the demo backend\",\"status\":\"active\",\"items\":[{\"linkId\":\"reason\",\"text\":\"Reason for visit\",\"type\":\"text\",\"required\":true},{\"linkId\":\"smoking-status\",\"text\":\"Smoking status\",\"type\":\"choice\",\"options\":[{\"system\":\"http://snomed.info/sct\",\"code\":\"266919005\",\"display\":\"Never smoked\"},{\"system\":\"http://snomed.info/sct\",\"code\":\"8517006\",\"display\":\"Former smoker\"}]}]}"
```

The backend builds the FHIR `Questionnaire.url` as `QUESTIONNAIRE_CANONICAL_BASE + "/" + slug` and uses conditional create by canonical URL. It does not accept a raw FHIR Questionnaire write body and does not submit a client-owned FHIR logical `id`.

Save a reviewed response:

```bash
curl -X POST http://127.0.0.1:8000/api/save ^
  -H "Content-Type: application/json" ^
  -d "{\"patientId\":\"3\",\"questionnaireId\":\"17\",\"practitionerId\":\"nurse-1\",\"answers\":[{\"linkId\":\"allergy-has\",\"valueType\":\"boolean\",\"value\":true}],\"acceptedSuggestions\":[{\"type\":\"AllergyIntolerance\",\"fields\":{\"substance\":\"Penicillin\",\"reaction\":\"rash\"}}]}"
```

## ID Model

- IRIS assigns numeric/server-owned FHIR logical IDs on create.
- The frontend should use actual FHIR IDs returned by this backend, such as `Patient/3` and `Questionnaire/17`.
- Questionnaire `slug` is derived from the final path segment of `Questionnaire.url` and is display/business meaning only.
- Save flows read `Questionnaire/{actualId}` and never use `slug` as a lookup key.
- Practitioner IDs sent by the frontend are app-level staff identifiers for now, for example `nurse-1`; the backend resolves them with `Practitioner.identifier = FHIR_STAFF_SYSTEM|nurse-1` and uses the actual returned `Practitioner.id` in FHIR references.

## Demo Response Pattern

Search/list endpoints return:

- `requestUrl`
- `status`
- `statusText`
- raw FHIR `bundle`
- flattened UI objects such as `patients` or `questionnaires`

Detail endpoints return:

- `requestUrl`
- `status`
- `statusText`
- raw FHIR `resource`
- flattened UI object such as `questionnaire`

The raw FHIR fields are intentionally present for local demo panels.

Warning: raw demo fields expose `requestUrl`, FHIR `Bundle.link.url`, FHIR `entry.fullUrl`, and therefore the IRIS base URL. This is acceptable for localhost demos only. Do not use this unchanged against production or private IRIS hosts without redacting, proxying, or hiding those URLs.

## Deferred

This phase intentionally does not implement real AI extraction, real audio transcription, Auth0, SMART on FHIR, frontend rewrites, Observation creation, Condition creation, MedicationStatement creation, FHIR SDC, nested/repeating questionnaires, or raw FHIR write endpoints.
