# Ambient Listening to FHIR Resources

A clinical intake demo that converts a nurse–patient conversation into structured, reviewable FHIR data.

The application uses a React frontend, a FastAPI backend, Auth0 for OAuth login, OpenAI for optional AI-assisted extraction and recommendations, and an InterSystems IRIS for Health FHIR R4 repository as the clinical system of record.

The nurse remains in control throughout the workflow: AI-generated answers, clinical suggestions, reconciliation findings, and proposed FHIR resources must be reviewed before anything is saved.

## Demo Video

[![Watch demo video](https://img.youtube.com/vi/I0hH32RTxXQ/hqdefault.jpg)](https://youtu.be/I0hH32RTxXQ)

## Main Features

- Auth0-based OAuth login.
- Patient search and selection from IRIS FHIR.
- Patient summary from existing FHIR records.
- AI-assisted Questionnaire recommendations with deterministic fallback.
- Questionnaire browsing and Questionnaire builder.
- Conversation-to-Questionnaire answer extraction.
- Suggested clinical resource extraction.
- Reconciliation against existing `AllergyIntolerance` and `MedicationStatement` records.
- OpenAI-backed embedding generation for indexed FHIR resources in IRIS.
- Optional patient-scoped IRIS vector retrieval as supporting reconciliation evidence, with FHIR-only fallback when vector search is unavailable.
- Nurse review before any FHIR write.
- Transactional creation of reviewed FHIR resources in IRIS.

## Architecture
<img width="1009" height="978" alt="Ambient FHIR C4 Model (level 2) drawio" src="https://github.com/user-attachments/assets/f7d08105-daa4-40ae-9f89-4152e33aaf14" />
<img width="1392" height="1091" alt="C4 L3 Overview" src="https://github.com/user-attachments/assets/001fbac1-628e-44e0-9bff-082998821af9" />
<img width="1036" height="1041" alt="Ambient FHIR C4 Model L3 (Reconciliation Workflow) drawio (4)" src="https://github.com/user-attachments/assets/ad9f3a36-4554-47c3-ba1c-1f500df1c093" />

The frontend communicates with the FastAPI backend. The backend is responsible for authentication, FHIR access, AI calls, validation, reconciliation, and FHIR writes.

FHIR writes are also routed through an IRIS interoperability production that saves supported resources to the FHIR repository and creates searchable embeddings. During reconciliation, the backend can call a separate patient-scoped IRIS vector-search endpoint and include the returned top-K matches as supporting evidence. FHIR-server records remain authoritative, and reconciliation continues with FHIR data alone if vector retrieval fails.

## Repository Structure

```text
.
├── backend/          FastAPI backend
├── frontend/         React + Vite frontend
├── Dockerfhir/       Dockerized IRIS for Health FHIR environment
├── fhir-seed/        Development FHIR seed resources and REST requests
├── src/              Exported IRIS ObjectScript classes and production definitions
└── README.md
```

The Docker environment under `Dockerfhir/` is based on the external SecureDockerFHIR project by `pjamiesointersystems` (https://github.com/pjamiesointersystems/securedockerfhir).

# Setup Guide

## 1. Prerequisites

Install:

- Git
- Docker Desktop
- Python 3.11
- [uv](https://docs.astral.sh/uv/) for Python dependency management
- Node.js and npm
- Visual Studio Code
- VS Code REST Client extension, for running `fhir-seed/seed.http`
- An Auth0 tenant and application
- An OpenAI API key only when AI features are enabled
- An OpenAI API key for the IRIS embedding configuration when vector indexing and vector search are enabled

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
| IRIS vector-search ping | `http://localhost:8080/csp/demo/ambient-vector/ping` |
| IRIS vector-search endpoint | `http://localhost:8080/csp/demo/ambient-vector/search` |

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

### 3.1 Create the Local IRIS Demo User (Skip 3.1 - 3.6 if not using Vector Search)

Sign in to the Management Portal using the initial Docker credentials:

```text
Username: _SYSTEM
Password: ISCDEMO
```

Go to:

```text
System Administration
→ Security
→ Users
→ Create New User
```

Create the local demo user with:

```text
Username: irisuser
Password: irisuser
Enabled: Yes
```

For the simplest local demo setup, assign the `%All` role to `irisuser`. This gives the account sufficient access to import and compile classes, run the interoperability production, execute the vector SQL, and authenticate to the custom REST endpoint.

`irisuser` / `irisuser` is intentionally a local development credential. Change it and replace `%All` with least-privilege roles before using the project outside the isolated demo environment.

### 3.2 Import the IRIS Source from `src/`

The `src/` folder contains the exported ObjectScript classes, message classes, business services, business processes, business operations, REST dispatch class, and production definition required by the IRIS side of the demo.

Copy or paste the contents of `src/` into the `DEMO` namespace of the running IRIS instance.

Using the Management Portal:

```text
System Explorer
→ Classes
→ Change namespace to DEMO
→ Import
```

Select all exported `.cls` files under `src/`, import them, and compile all imported classes. The imported source includes the vector components, such as:

```text
demodb.bo.OpenAIVectorize
demodb.bp.VectorSearchOperation
demodb.bs.VectorSearchService
demodb.rest.VectorSearchAPI
demodb.msg.VectorSearchRequest
demodb.msg.VectorSearchResponse
demodb.msg.VectorSearchResult
```

It also includes the FHIR interoperability production and its supporting classes. After importing an updated class, restart the affected production component or restart the production so that the latest compiled version is used.

### 3.3 Create the OpenAI SSL/TLS Configuration

The IRIS OpenAI embedding class requires an outbound SSL/TLS configuration.

Go to:

```text
System Administration
→ Security
→ SSL/TLS Configurations
→ Create New Configuration
```

Create a client configuration named:

```text
llm_ssl
```

Enable the configuration and use the container's trusted CA settings for outbound HTTPS. The embedding configuration created in the next step refers to this name exactly.

### 3.4 Run the IRIS Vector Search SQL Setup

Open:

```text
System Explorer
→ SQL
```

Select the `DEMO` namespace. Run the statements below in order. Run the `CREATE` statements once; skip an object if it already exists.

First, check whether the OpenAI embedding configuration already exists:

```sql
SELECT Name, EmbeddingClass, VectorLength, Description
FROM %Embedding.Config
WHERE Name = 'ambient-fhir-openai';
```

When no row is returned, insert the configuration below. Replace `YOUR_OPENAI_API_KEY` locally before executing it. Never commit the completed statement, the API key, or an export of this configuration.

```sql
INSERT INTO %Embedding.Config (
    Name,
    Configuration,
    EmbeddingClass,
    VectorLength,
    Description
)
VALUES (
    'ambient-fhir-openai',
    '{"apiKey":"YOUR_OPENAI_API_KEY","sslConfig":"llm_ssl","modelName":"text-embedding-3-small"}',
    '%Embedding.OpenAI',
    1536,
    'OpenAI embeddings for the Ambient FHIR demo'
);
```

When the configuration already exists and only its local credentials or settings need to be replaced, run this instead of the `INSERT`:

```sql
UPDATE %Embedding.Config
SET Configuration = '{"apiKey":"YOUR_OPENAI_API_KEY","sslConfig":"llm_ssl","modelName":"text-embedding-3-small"}',
    EmbeddingClass = '%Embedding.OpenAI',
    VectorLength = 1536,
    Description = 'OpenAI embeddings for the Ambient FHIR demo'
WHERE Name = 'ambient-fhir-openai';
```

Create the application schema:

```sql
CREATE SCHEMA AmbientFHIR;
```

Create the vector store:

```sql
CREATE TABLE AmbientFHIR.VectorStore (
    VectorId BIGINT IDENTITY PRIMARY KEY,
    PatientId VARCHAR(256),
    ResourceType VARCHAR(64) NOT NULL,
    ResourceId VARCHAR(256) NOT NULL,
    VersionId VARCHAR(128),
    SearchText VARCHAR(32000) NOT NULL,
    SearchEmbedding EMBEDDING('ambient-fhir-openai', 'SearchText'),
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (ResourceType, ResourceId)
);
```

Create indexes for the patient-scoped lookup and resource filtering used by the demo:

```sql
CREATE INDEX IX_VectorStore_Patient
ON AmbientFHIR.VectorStore (PatientId);
```

```sql
CREATE INDEX IX_VectorStore_PatientType
ON AmbientFHIR.VectorStore (PatientId, ResourceType);
```

Grant the local demo user explicit access to the table and embedding function:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE
ON AmbientFHIR.VectorStore
TO irisuser;
```

```sql
GRANT %USE_EMBEDDING TO irisuser;
```

The explicit grants are useful if the broad `%All` role is later removed from the local user.

Verify that IRIS can generate an embedding:

```sql
SELECT EMBEDDING(
    'The patient reports a penicillin allergy with hives and a red rash.',
    'ambient-fhir-openai'
) AS QueryEmbedding;
```

Verify the vector table:

```sql
SELECT TOP 10
    VectorId,
    PatientId,
    ResourceType,
    ResourceId,
    VersionId,
    SearchText,
    CreatedAt,
    UpdatedAt
FROM AmbientFHIR.VectorStore
ORDER BY VectorId DESC;
```

After at least one supported FHIR resource has been written and indexed, test patient-scoped similarity search. Replace the patient reference with an indexed patient:

```sql
SELECT TOP 5
    ResourceType,
    ResourceId,
    VersionId,
    SearchText,
    VECTOR_COSINE(
        SearchEmbedding,
        EMBEDDING(
            'The patient reports a penicillin allergy with hives and a red rash.',
            'ambient-fhir-openai'
        )
    ) AS Similarity
FROM AmbientFHIR.VectorStore
WHERE PatientId = 'Patient/P20260500002'
ORDER BY Similarity DESC;
```

### 3.5 Configure and Start the IRIS Production

Go to:

```text
Interoperability
→ Configure
→ Production
```

Open the production imported from `src/`, enable the required components, and start the production.

The write-time flow should include the FHIR service, repository operation, and OpenAI vectorisation operation. Bundle transactions may be saved to the FHIR repository without being vectorised for this demo.

The retrieval-time flow should include:

```text
Vector Search API Service
→ demodb.bp.VectorSearchOperation
→ patient-scoped SQL vector search
```

The configured adapterless Business Service item must be named exactly:

```text
Vector Search API Service
```

The REST dispatch class uses this production item name when it invokes the vector-search workflow.

### 3.6 Create the IRIS Vector Search Web Application

Go to:

```text
System Administration
→ Security
→ Applications
→ Web Applications
→ Create New Web Application
```

Configure:

```text
Name: /csp/demo/ambient-vector
Namespace: DEMO
Dispatch Class: demodb.rest.VectorSearchAPI
Enabled: Yes
Authentication: Password
```

The `/csp` prefix is required by the included Docker Web Gateway configuration.

Test the dispatch route:

```bash
curl -u irisuser:irisuser http://localhost:8080/csp/demo/ambient-vector/ping
```

Test patient-scoped vector search:

```bash
curl -u irisuser:irisuser \
  -X POST \
  http://localhost:8080/csp/demo/ambient-vector/search \
  -H "Content-Type: application/json" \
  -d '{
    "patientReference": "Patient/P20260500002",
    "query": "The patient reports a penicillin allergy with hives and a red rash.",
    "topK": 5
  }'
```

On Windows Command Prompt, the equivalent request is:

```bat
curl -u irisuser:irisuser ^
  -X POST ^
  http://localhost:8080/csp/demo/ambient-vector/search ^
  -H "Content-Type: application/json" ^
  -d "{\"patientReference\":\"Patient/P20260500002\",\"query\":\"The patient reports a penicillin allergy with hives and a red rash.\",\"topK\":5}"
```

A successful response has this shape:

```json
{
  "patientReference": "Patient/P20260500002",
  "query": "The patient reports a penicillin allergy with hives and a red rash.",
  "resultCount": 1,
  "results": [
    {
      "resourceType": "AllergyIntolerance",
      "resourceId": "example-id",
      "versionId": "1",
      "searchText": "Recorded penicillin allergy with hives and a red rash.",
      "similarity": 0.88
    }
  ]
}
```

A patient with no indexed matches should return `resultCount: 0` and an empty `results` array rather than fail.

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

### 6.1 Create an Auth0 Application

Go to Applications->Applications to create a new application. Use a **Regular Web Application** for the FastAPI server-side OAuth flow.

Configure:

| Auth0 setting | Development value |
|---|---|
| Allowed Callback URLs | `http://localhost:8000/api/auth/callback` |
| Allowed Logout URLs | `http://localhost:5173` |

The current backend callback redirects to `http://localhost:5173/`, so the frontend should run on port `5173` unless the callback code is updated.

### 6.2 Create an Auth0 API

Create an API (Applications -> API) in Auth0 with an identifier matching the backend's FHIR audience exactly:

```text
https://localhost:8443/csp/healthshare/demo/fhir/r4
```

The identifier must match `FHIR_BASE_URL`.

Add in the relevant permissions under the permissions tab. For this demo, just add `user/*.*` for all fhir resources read & write access.
Grant the permission to the Auth0 Application just created.

### 6.3 Create Auth0 User
Go to User Management->Users and create a new user

### 6.4 Configure IRIS to Trust Auth0 Tokens

Configure the IRIS FHIR server using the built in `OAuth FHIR Client Quickstart`:
| Step | Description |
|---|---|
| 1. Create or Choose FHIR Server | Use an Existing FHIR Server |
| 2. Select FHIR Server | Namespace: DEMO, URL: /csp/healthshare/demo/fhir/r4 |
| 3. Select OAuth Server Type | Select External OAuth Server |
| 4. Configure OAuth Server | Issuer Endpoint: https://<your Auth0 domain> |
| 5. Confirm Actions | Click Confirm |

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

### Windows PowerShell / Cmd Prompt

```powershell
Copy-Item .env.example .env
```
```Command Prompt
copy .env.example .env
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
ENABLE_FHIR_VALIDATE=true

# IRIS vector search
IRIS_VECTOR_SEARCH_URL=http://localhost:8080/csp/demo/ambient-vector/search
IRIS_VECTOR_SEARCH_USERNAME=irisuser
IRIS_VECTOR_SEARCH_PASSWORD=irisuser
IRIS_VECTOR_SEARCH_TOP_K=5
IRIS_VECTOR_SEARCH_TIMEOUT_SECONDS=5

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
LLM_PROVIDER=openai
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

The backend `OPENAI_API_KEY` is used by FastAPI for the enabled AI extraction, recommendation, and reconciliation features. The separate OpenAI key stored locally in IRIS `%Embedding.Config` is used by `%Embedding.OpenAI` for resource indexing and vector-search query embeddings. The two values may be the same development key, but neither should be committed.

### OAuth versus Basic Authentication

When a user signs in, the backend obtains the Auth0 access token and uses it for FHIR requests.

Leave these blank when OAuth is used:

```env
FHIR_USERNAME=
FHIR_PASSWORD=
```

Only populate them for local Basic-auth testing.

The vector-search endpoint uses separate local Basic authentication settings:

```env
IRIS_VECTOR_SEARCH_USERNAME=irisuser
IRIS_VECTOR_SEARCH_PASSWORD=irisuser
```

These credentials are sent only to the custom IRIS vector-search web application. The backend does not forward the user's FHIR bearer token to that endpoint.

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

### Windows PowerShell / Cmd Prompt

```powershell
Copy-Item .env.example .env
```
```Command Prompt
copy .env.example .env
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

When semantic reconciliation and the IRIS vector-search settings are enabled, the backend deterministically converts the reviewed Questionnaire responses and proposed clinical data into a patient-scoped search query. IRIS returns top-K indexed matches as supporting evidence. Vector retrieval is fail-open: an IRIS timeout, HTTP error, invalid response, or zero-result response does not prevent the existing FHIR-based reconciliation from completing.

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
13. Supported single-resource FHIR writes create or update rows in `AmbientFHIR.VectorStore`.
14. The vector-search endpoint returns patient-scoped top-K matches.
15. Reconciliation displays vector evidence when available and still completes with FHIR data when vector search fails.

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

### Vector-search endpoint returns Apache 404

Use the complete Web Gateway application path:

```text
http://localhost:8080/csp/demo/ambient-vector/search
```

Calling `/ambient-vector/search` without the `/csp/demo` prefix is not routed by the included Apache/Web Gateway configuration.

### Vector search returns HTTP 500

Check:

```text
Interoperability
→ View
→ Event Log
```

and:

```text
Interoperability
→ View
→ Messages
```

Common causes include:

- the production or `Vector Search API Service` is not enabled;
- `ambient-fhir-openai` is missing or contains an invalid API key;
- the `llm_ssl` SSL/TLS configuration is missing;
- the vector table was not created in the `DEMO` namespace;
- `VectorSearchRequest.Query`, `VectorSearchResponse.Query`, or `VectorSearchResult.SearchText` still has the default `MAXLEN=50` instead of the larger lengths defined in `src/`;
- the OpenAI embedding request timed out or was rejected.

### Vector search returns no matches

Confirm that the patient reference matches the stored format exactly:

```sql
SELECT DISTINCT PatientId
FROM AmbientFHIR.VectorStore;
```

The demo expects values such as:

```text
Patient/P20260500002
```

Then check that the patient has indexed rows:

```sql
SELECT PatientId, COUNT(*) AS ResourceCount
FROM AmbientFHIR.VectorStore
WHERE PatientId = 'Patient/P20260500002'
GROUP BY PatientId;
```

A valid vector request with no indexed resources should return HTTP `200` with `resultCount: 0`.

## Security Notes

This repository is a local development and demonstration environment.

Before production use:

- replace broad FHIR scopes with least-privilege scopes;
- use trusted TLS certificates;
- remove development credentials;
- replace the local `irisuser` / `irisuser` credential and remove its `%All` role;
- never commit the OpenAI key stored in `%Embedding.Config` or an IRIS export containing it;
- store secrets in a secret manager;
- disable Basic authentication;
- avoid exposing raw FHIR server URLs;
- add production-grade audit logging;
- configure secure cookies and HTTPS;
- review all AI data-sharing and clinical governance requirements.

## Acknowledgements

The local IRIS FHIR Docker environment is based on the DockerFHIR project maintained by `pjamiesointersystems`.