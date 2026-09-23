# Words of Encouragement eCard

An anonymous, accessible eCard experience for the Americas SE&O & EPS GIVE Campaign 2026. Volunteers select approved artwork, write and optionally AI-review a supportive message, render a 1600×900 JPG locally, submit it through an Azure Function, and then open the Microsoft Giving Portal.

> **Not production-ready until approvals are complete.** The repository intentionally contains no Ronald McDonald House logo or eCard artwork. Replace the conspicuous placeholders with event-owner-supplied approved assets and complete every item in [Readiness checklist](#readiness-checklist).

## Architecture

```text
Browser (React + Canvas)
  ├─ approved catalog remains usable without AI
  ├─ POST /api/review-message ─┐
  ├─ POST /api/generate-background ─ Azure Functions ─ Foundry/Content Safety (server-side keys)
  └─ POST /api/submit-card ───┘       └─ private Blob container (server-side storage key)
Azure Static Web Apps ─ managed /api Functions
Application Insights ─ privacy-safe operational telemetry; no request bodies
```

- **Web:** React 19, TypeScript, Vite, semantic HTML, responsive CSS, Canvas JPG export.
- **API:** Node 22 Azure Functions v4. The browser receives no Azure credentials.
- **Storage:** private Blob container; server-generated paths; JPEG decode/re-encode strips metadata; distributed Blob idempotency markers.
- **AI:** optional Foundry/Azure OpenAI endpoints authenticated with server-side keys; fixed prompts and Azure AI Content Safety hooks.
- **Infrastructure:** Bicep with server-side keys, configurable retention, linked API, HTTPS/TLS settings, and restricted CORS.
- **Delivery:** GitHub Actions CI plus manually approved environment deployment using OIDC.

## UX and component hierarchy

The single-page sequence is Header → Welcome → How it works → Design gallery → Message composer and live preview → Optional AI review → Final checks → JPG/download/submission → Confirmation → Volunteer tracking → Privacy/footer. On narrow screens the editor and preview stack vertically. Native controls provide keyboard access; live regions announce async states.

```text
App
├─ Header / Hero / HowItWorks
├─ DesignGallery / AiBackgroundPanel
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
- `POST /api/submit-card`: multipart `card`, `languageCode`, `designSource`, `consentVersion`; header `Idempotency-Key` → `{ success, submissionId, submittedUtc }`.
- `GET /api/health` → `{ status: "healthy" }`.

## Local development

Prerequisites: Node.js 22, Azure Functions Core Tools v4, Azurite.

For the complete Windows setup, Azure AI resource creation, key configuration, deployment, and verification workflow, see [Local development and Azure setup](docs/local-azure-setup.md).

```bash
npm ci
npm ci --prefix api
cp .env.example .env.local
cp api/local.settings.example.json api/local.settings.json
azurite --silent --location .azurite
npm run start --prefix api
npm run dev
```

The production storage path uses a Function-only storage connection string. Azurite is a local-only exception; never copy emulator or production credentials into front-end variables.

## Build and test

```bash
npm run check
npm run check:api
npm run test:e2e       # after: npx playwright install chromium
az bicep build --file infra/main.bicep
```

Focused tests cover message/PII validation, character limits, RTL handling, non-identifying filenames, text wrapping, component states, metadata allowlists, and server-side safety checks. See [Accessibility checklist](docs/accessibility-checklist.md) for required manual testing.

## Data flow and privacy

Card composition remains in browser memory until submission. Review sends only message/language to the review endpoint; generation sends only the design prompt. Submission sends a re-rendered JPEG and allowlisted metadata. The Function validates request type/size, decodes and re-encodes the JPEG, generates its ID/path, and writes it with a server-side storage connection string. No message, name, prompt, image, request body, direct URL, raw IP, or service key is logged. Rate-limit keys are one-way daily hashes held only in function memory.

## Assumptions and owner approvals

1. Event owners will provide approved logo and six exported 16:9 template files plus verified alt text.
2. Brand/legal owners will approve footer text, catalog descriptions, writing guidance, event details, and whether religious statements are allowed.
3. Privacy/security owners will approve retention days, telemetry retention/sampling, allowed origins, Front Door/WAF or equivalent edge abuse controls, and anonymous access.
4. Responsible AI owners will approve model deployments, supported languages, safety thresholds, prompts, image-output moderation, retry limits, and whether image payloads may be returned to the browser.
5. Azure owners will approve regions, resource names/SKUs, key storage/rotation, networking, and production monitoring.
6. Event owners will confirm the consent version and the Giving Portal guidance.

## Readiness checklist

- [ ] Replace `/public/assets/catalog-placeholder.svg` and header placeholder with approved, undistorted assets.
- [ ] Enter approved legal text, retention, origins, consent version, resource names, AI deployment names, and thresholds.
- [ ] Confirm Content Safety is mandatory whenever either AI feature is enabled.
- [ ] Validate generated images for text/logos/people/distressing imagery with an approved image moderation service.
- [ ] Complete privacy, threat-model, accessibility, Responsible AI, and brand/legal reviews.
- [ ] Run unit/component/integration/E2E suites and the manual 200% zoom, keyboard, screen-reader, RTL, high-contrast, and mobile checks.
- [ ] Test Azurite and a non-production Azure environment, including duplicate upload, storage outage, AI outage, CORS, rate limiting, and rollback.
- [ ] Configure GitHub environment approvals, OIDC variables, deployment token, monitoring alerts, retention policy, WAF/rate limiting, and operational ownership.
- [ ] Obtain final go-live approval; do not present the app as an official Ronald McDonald House service without authorization.

More detail: [Threat model](docs/threat-model.md), [privacy and Responsible AI](docs/privacy-responsible-ai.md), [operations runbook](docs/operations-runbook.md), and [asset/content guide](docs/asset-content-guide.md).
