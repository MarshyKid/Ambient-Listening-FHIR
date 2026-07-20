# Ambient Listening to FHIR Resources

A clinical intake demo that converts a nurse–patient conversation into structured, reviewable FHIR data.

The application uses a React frontend, a FastAPI backend, Auth0 for OAuth login, OpenAI for optional AI-assisted extraction and recommendations, and an InterSystems IRIS for Health FHIR R4 repository as the clinical system of record.

The nurse remains in control throughout the workflow: AI-generated answers, clinical suggestions, reconciliation findings, and proposed FHIR resources must be reviewed before anything is saved.

## Demo Video

> Replace with demo video.

[Watch the demo video](PASTE_DEMO_VIDEO_URL_HERE)

Suggested demo flow:

1. Start the IRIS FHIR Docker environment.
2. Start the FastAPI backend and React frontend.
3. Sign in through Auth0.
4. Select a patient.
5. Review the patient summary and recommended Questionnaires.
6. Select a Questionnaire and provide or load a sample transcript.
7. Run extraction and review the generated answers.
8. Run reconciliation against existing allergy and medication records.
9. Review the proposed FHIR resources.
10. Save the reviewed intake to IRIS as a FHIR transaction.

## Main Features

- Auth0-based OAuth login.
- Patient search and selection from IRIS FHIR.
- Patient summary from existing FHIR records.
- AI-assisted Questionnaire recommendations with deterministic fallback.
- Questionnaire browsing and Questionnaire builder.
- Conversation-to-Questionnaire answer extraction.
- Suggested clinical resource extraction.
- Reconciliation against existing `AllergyIntolerance` and `MedicationStatement` records.
- Nurse review before any FHIR write.
- Transactional creation of reviewed FHIR resources in IRIS.

## Architecture

The frontend communicates with the FastAPI backend. The backend is responsible for authentication, FHIR access, AI calls, validation, reconciliation, and FHIR writes.

## Repository Structure

```text
.
├── backend/          FastAPI backend
├── frontend/         React + Vite frontend
├── Dockerfhir/       Dockerized IRIS for Health FHIR environment
├── fhir-seed/        Development FHIR seed resources and REST requests
└── README.md
```

The Docker environment under `Dockerfhir/` is based on the external SecureDockerFHIR project by `pjamiesointersystems` (https://github.com/pjamiesointersystems/securedockerfhir).

# Setup Guide

## 1. Prerequisites

Install:

- Git
- Docker Desktop
- Python 3.11 or later
- [uv](https://docs.astral.sh/uv/) for Python dependency management
- Node.js and npm
- Visual Studio Code
- VS Code REST Client extension, for running `fhir-seed/seed.http`
- An Auth0 tenant and application
- An OpenAI API key only when AI features are enabled

Confirm the main tools are available:

```bash
git --version
docker --version
python --version
uv --version
node --version
npm --version
```

## 2. Clone the Repository

```bash
git clone https://github.com/MarshyKid/Ambient-Listening-FHIR
cd Ambient-Listening-FHIR
```

## 3. Start InterSystems IRIS FHIR

The repository includes the IRIS FHIR Docker environment under `Dockerfhir/`.

```bash
cd Dockerfhir
docker compose build
docker compose up -d
```

Check that the containers are running:

```bash
docker ps
```

Expected local endpoints:

| Service | URL |
|---|---|
| IRIS Management Portal | `http://localhost:8080/csp/sys/UtilHome.csp` |
| FHIR R4 base URL over HTTP | `http://localhost:8080/csp/healthshare/demo/fhir/r4` |
| FHIR R4 base URL over HTTPS | `https://localhost:8443/csp/healthshare/demo/fhir/r4` |
| FHIR CapabilityStatement | `https://localhost:8443/csp/healthshare/demo/fhir/r4/metadata` |

Default development credentials provided by the Docker environment:

```text
Username: _SYSTEM
Password: ISCDEMO
```

These credentials are for local development only.

To inspect logs:

```bash
docker logs irisfhir
docker logs webserver
```

To stop the environment:

```bash
docker compose down
```

## 4. Verify the FHIR Endpoint

Run the following in fhir-seed/seed.http:

```text
GET http://localhost:8080/csp/healthshare/demo/fhir/r4/metadata
Authorization: BASIC _SYSTEM ISCDEMO
Content-Type: application/fhir+json
Accept: */*
```

You should receive a CapabilityStatement 200 OK Response.

## 5. Seed Development FHIR Data

Seed resources are located under:

```text
fhir-seed/
├── practitioners/
│   └── nurse-1.json
├── questionnaires/
│   └── questionnaire-bundle.json
└── seed.http
```

Open `fhir-seed/seed.http` in Visual Studio Code and run the requests using the REST Client extension.

The file currently:

1. checks the FHIR metadata endpoint;
2. creates the demo nurse Practitioner; and
3. posts the Questionnaire transaction Bundle.

The transaction Bundle is posted to the FHIR base URL:

```http
POST http://localhost:8080/csp/healthshare/demo/fhir/r4
```

The checked-in seed request uses local Basic authentication:

```http
Authorization: Basic _SYSTEM ISCDEMO
```

This is acceptable only for the local Docker environment. When Basic authentication is disabled, replace it with an OAuth bearer token:

```http
Authorization: Bearer {{accessToken}}
```

After seeding, verify:

```http
GET http://localhost:8080/csp/healthshare/demo/fhir/r4/Practitioner
GET http://localhost:8080/csp/healthshare/demo/fhir/r4/Questionnaire
```

## 6. Configure Auth0

### 6.1 Create an Auth0 API

Create an API in Auth0 with an identifier matching the backend's FHIR audience exactly:

```text
https://localhost:8443/csp/healthshare/demo/fhir/r4
```

The identifier must match `FHIR_BASE_URL`.

### 6.2 Create an Auth0 Application

Use a **Regular Web Application** for the FastAPI server-side OAuth flow.

Configure:

| Auth0 setting | Development value |
|---|---|
| Allowed Callback URLs | `http://localhost:8000/api/auth/callback` |
| Allowed Logout URLs | `http://localhost:5173` |

The current backend callback redirects to `http://localhost:5173/`, so the frontend should run on port `5173` unless the callback code is updated.

### 6.3 Configure IRIS to Trust Auth0 Tokens

Configure the IRIS FHIR server to accept JWT access tokens issued by the Auth0 tenant.

The configuration must align on:

- Auth0 issuer/domain
- Auth0 signing keys or JWKS
- API audience
- permitted FHIR scopes
- token signature and expiry validation

The current development backend requests:

```text
openid profile email user/*.*
```

`user/*.*` is broad and is suitable only for the current controlled demo. Use least-privilege resource scopes for production.

## 7. Configure the Backend

Move to the backend folder:

```bash
cd backend
```

Copy the example environment file:

### Windows PowerShell

```powershell
Copy-Item .env.example .env
```

### macOS or Linux

```bash
cp .env.example .env
```

Update `backend/.env`:

```env
# IRIS FHIR
FHIR_BASE_URL=https://localhost:8443/csp/healthshare/demo/fhir/r4
FHIR_USERNAME=
FHIR_PASSWORD=
FHIR_VERIFY_SSL=false
FHIR_MRN_SYSTEM=http://example.org/fhir/mrn
FHIR_STAFF_SYSTEM=http://example.org/staff-id
QUESTIONNAIRE_CANONICAL_BASE=http://example.org/fhir/Questionnaire
DEFAULT_PRACTITIONER_IDENTIFIER=nurse-1
FHIR_TIMEOUT_SECONDS=10
ENABLE_FHIR_VALIDATE=false

# Frontend and backend URLs
APP_BASE_URL=http://localhost:8000
FRONTEND_BASE_URL=http://localhost:5173
ALLOWED_ORIGINS=http://localhost:5173

# Auth0
AUTH0_DOMAIN=YOUR_AUTH0_DOMAIN
AUTH0_CLIENT_ID=YOUR_AUTH0_CLIENT_ID
AUTH0_CLIENT_SECRET=YOUR_AUTH0_CLIENT_SECRET
AUTH0_SECRET=REPLACE_WITH_A_LONG_RANDOM_SECRET

# AI
LLM_PROVIDER=mock
LLM_MODEL=gpt-5.4-mini
OPENAI_API_KEY=
LLM_TIMEOUT_SECONDS=45
LLM_RECONCILIATION_PLANNER_ENABLED=true
LLM_RECONCILIATION_SEMANTIC_COMPARE_ENABLED=true
LLM_INTAKE_RECOMMENDATION_ENABLED=true
DEFAULT_CLINICAL_TIMEZONE=Asia/Singapore
```

Generate a local cookie-encryption secret (shown below), or copy paste from Auth0 Quickstart:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Paste the result into `AUTH0_SECRET`.

Do not commit `backend/.env`.

### OAuth versus Basic Authentication

When a user signs in, the backend obtains the Auth0 access token and uses it for FHIR requests.

Leave these blank when OAuth is used:

```env
FHIR_USERNAME=
FHIR_PASSWORD=
```

Only populate them for local Basic-auth testing.

## 8. Install and Run the Backend

Using `uv`:

```bash
cd backend
uv sync
uv run uvicorn app.main:app --port 8000
```

Backend URLs:

| Purpose | URL |
|---|---|
| Health endpoint | `http://localhost:8000/api/health` |
| Swagger API documentation | `http://localhost:8000/docs` |
| Auth0 login | `http://localhost:8000/api/auth/login` |

Keep this terminal running.

## 9. Configure and Run the Frontend

Open a second terminal:

```bash
cd frontend
```

Copy the frontend environment file:

### Windows PowerShell

```powershell
Copy-Item .env.example .env
```

### macOS or Linux

```bash
cp .env.example .env
```

Confirm `frontend/.env` contains:

```env
VITE_API_BASE_URL=http://localhost:8000
VITE_DEFAULT_PRACTITIONER_IDENTIFIER=nurse-1
```

Install dependencies and run Vite:

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:5173
```

## 10. Enable/Disable AI Features

The application can run with deterministic or mock behaviour while AI features are disabled.

The AI Features are enabled by default. To disable the OpenAI-backed features, update `backend/.env`:

```env
LLM_PROVIDER=openai
OPENAI_API_KEY=YOUR_OPENAI_API_KEY
LLM_INTAKE_RECOMMENDATION_ENABLED=false
LLM_RECONCILIATION_PLANNER_ENABLED=false
LLM_RECONCILIATION_SEMANTIC_COMPARE_ENABLED=false
```

Restart the backend after changing environment variables.

## 11. Verify the Complete Flow

Use this checklist:

1. `docker ps` shows the IRIS and web gateway containers.
2. The FHIR `/metadata` endpoint responds.
3. Seed Questionnaires and the demo Practitioner.
4. FastAPI starts on port `8000`.
5. Vite starts on port `5173`.
6. Clicking the frontend login button redirects to Auth0 when not authenticated.
7. Auth0 redirects back to `/api/auth/callback`.
8. The frontend loads patients and Questionnaires through the backend.
9. A Questionnaire can be selected.
10. Extraction produces reviewable answers.
11. Reconciliation checks existing patient records.
12. Saving creates reviewed FHIR resources in IRIS.

## Troubleshooting

### Docker port conflict

Check whether ports `8080`, `8443`, `1972`, `52773`, or `7038` are already in use.

```bash
docker ps
```

Stop the conflicting container or change the host-side port mapping in `Dockerfhir/docker-compose.yaml`.

### Apache 404

The FHIR endpoint must include the complete web application path:

```text
/csp/healthshare/demo/fhir/r4
```

### Certificate verification failure

For the local self-signed certificate:

```env
FHIR_VERIFY_SSL=false
```

A stronger local setup is to import the Docker environment's certificate into the operating system trust store and then set:

```env
FHIR_VERIFY_SSL=true
```

### Auth0 callback mismatch

Ensure the Auth0 callback is exactly:

```text
http://localhost:8000/api/auth/callback
```

The scheme, hostname, port, and path must all match.

### Login succeeds but FHIR calls return 401

Check:

- `AUTH0_DOMAIN`
- `AUTH0_CLIENT_ID`
- `AUTH0_CLIENT_SECRET`
- `AUTH0_SECRET`
- `FHIR_BASE_URL`
- Auth0 API audience
- IRIS issuer/JWKS configuration
- access-token expiry

### FHIR calls return 403

The token is valid but does not have sufficient FHIR permission. Check the requested scopes and the IRIS OAuth scope mapping.

### Browser blocks frontend API calls

Confirm:

```env
ALLOWED_ORIGINS=http://localhost:5173
VITE_API_BASE_URL=http://localhost:8000
```

Restart the backend after editing `backend/.env`.

### Patient or Questionnaire lists are empty

Run `fhir-seed/seed.http` again and verify the resources directly through the FHIR API.

### AI features do not run

Check:

```env
LLM_PROVIDER=openai
OPENAI_API_KEY=...
```

and enable the relevant feature flags. Restart the backend afterward.

## Security Notes

This repository is a local development and demonstration environment.

Before production use:

- replace broad FHIR scopes with least-privilege scopes;
- use trusted TLS certificates;
- remove development credentials;
- store secrets in a secret manager;
- disable Basic authentication;
- avoid exposing raw FHIR server URLs;
- add production-grade audit logging;
- configure secure cookies and HTTPS;
- review all AI data-sharing and clinical governance requirements.

## Acknowledgements

The local IRIS FHIR Docker environment is based on the DockerFHIR project maintained by `pjamiesointersystems`.