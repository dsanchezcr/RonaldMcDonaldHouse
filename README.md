# Words of Encouragement eCard

An anonymous, accessible eCard experience for the Americas SE&O & EPS GIVE Campaign 2026. Volunteers select approved artwork or optionally generate a background with Microsoft AI, write and optionally AI-review a supportive message, render a 1600×900 JPG locally, submit it through a managed Static Web Apps API, and then open the Microsoft Giving Portal.

## Architecture

```text
Browser (React + Canvas)
  ├─ approved catalog remains usable without AI
  ├─ POST /api/review-message ─┐
  ├─ POST /api/generate-background ─┐
  ├─ POST /api/moderate-image ────── Azure Static Web Apps managed Functions ─ Azure OpenAI / Content Safety (server-side keys)
  └─ POST /api/submit-card ─────────┘                                             └─ private Blob container (server-side storage key)
Azure Static Web Apps ─ managed /api Functions
Application Insights ─ privacy-safe operational telemetry; no request bodies
```

- **Web:** React 19, TypeScript, Vite, semantic HTML, responsive CSS, Canvas JPG export.
- **API:** Node 22 Azure Functions v4. The browser receives no Azure credentials.
- **Storage:** private Blob container; server-generated paths; JPEG decode/re-encode strips metadata; distributed Blob idempotency markers.
- **AI:** optional Azure OpenAI endpoints authenticated with server-side keys; fixed prompts; Azure AI Content Safety text/image hooks; in-repo image moderation endpoint for generated backgrounds.
- **Infrastructure:** Bicep for Static Web Apps, Storage, Log Analytics, Application Insights, app settings, configurable retention, HTTPS/TLS settings, and restricted CORS.
- **Delivery:** GitHub Actions validates every push/PR, deploys production automatically after `main` succeeds, and creates Static Web Apps preview environments for pull requests.

## UX and component hierarchy

The single-page sequence is Header → Welcome → How it works → Design or AI background → Message composer and live preview → Optional AI review → Final checks → JPG/download/submission → Confirmation → Volunteer tracking → Privacy/footer. On narrow screens the editor and preview stack vertically. Native controls provide keyboard access; live regions announce async states.

```text
App
├─ Header / Hero / HowItWorks
├─ DesignGallery / AiBackgroundPanel / ImageModeration
├─ MessageComposer
├─ CardPreview / FormattingControls
├─ AiReviewPanel
├─ ConsentChecks / ExportActions
├─ Confirmation
└─ VolunteerTracking / Privacy / Footer
```

## API contracts

All errors return a friendly `message` and never expose internal rules, model output, credentials, paths, or blob URLs.

- `POST /api/review-message`: `{ message, language, action }` → `{ status, safetyClassification, detectedConcerns, suggestedRevision?, explanation, requestId }`.
- `POST /api/generate-background`: `{ description, stylePreset, locale }` → `{ status, imageDataUrl, accessibleDescription, requestId }`. Input constraints and rate limits are server controlled.
- `POST /api/moderate-image`: `{ imageBase64, checks }`, header `x-api-key` → `{ safe, accessibleDescription?, requestId }`.
- `POST /api/submit-card`: multipart `card`, `languageCode`, `designSource`, `consentVersion`; header `Idempotency-Key` → `{ success, submissionId, submittedUtc }`.
- `GET /api/health` → `{ status: "healthy" }`.

## Local development

Prerequisites: Node.js 22 and Azure Functions Core Tools v4. Azurite is optional for offline storage testing; the preferred development path uses the same Azure Storage, Azure OpenAI, and Content Safety resources as the cloud deployment.

For the complete Windows setup, Azure AI resource creation, key configuration, deployment, and verification workflow, see [Local development and Azure setup](docs/local-azure-setup.md).

```bash
npm ci
npm ci --prefix api
cp .env.example .env.local
cp api/local.settings.example.json api/local.settings.json
npm run start --prefix api
npm run dev
```

For Azure-backed local testing, set `AzureWebJobsStorage`, `STORAGE_CONNECTION_STRING`, `AI_API_KEY`, `CONTENT_SAFETY_KEY`, `IMAGE_MODERATION_KEY`, and the endpoint values in ignored `api/local.settings.json`. Use `http://localhost:7071/api/moderate-image` for `IMAGE_MODERATION_ENDPOINT` while Functions runs locally. Never copy storage or AI keys into front-end variables.

## Build and test

```bash
npm run check
npm run check:api
npm run test:e2e       # after: npx playwright install chromium
az bicep build --file infra/main.bicep
```

Focused tests cover message/PII validation, character limits, RTL handling, non-identifying filenames, text wrapping, component states, metadata allowlists, and server-side safety checks. See [Accessibility checklist](docs/accessibility-checklist.md) for required manual testing.

## Data flow and privacy

Card composition remains in browser memory until submission. Review sends only message/language to the review endpoint; generation sends only the design prompt. Generated images are checked by the server-side moderation endpoint before returning to the browser. Submission sends a re-rendered JPEG and allowlisted metadata. The Function validates request type/size, decodes and re-encodes the JPEG, generates its ID/path, and writes it with a server-side storage connection string. No message, name, prompt, image, request body, direct URL, raw IP, or service key is logged. Rate-limit keys are one-way daily hashes held only in function memory.