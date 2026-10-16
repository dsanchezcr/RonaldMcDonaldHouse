# Words of Encouragement eCard

An anonymous, accessible, multilingual eCard experience. Volunteers select approved artwork or optionally generate a background with Microsoft AI, write and optionally AI-review a supportive message, render a 1600×900 JPG locally, and submit it through a dedicated Azure Function App API. Organizers can optionally configure an event and volunteer-tracking link.

## License and artwork

Source code and documentation are available under the [MIT License](LICENSE).
**The MIT license does not cover the branded artwork in `public/assets`, including logos, icons, and card templates.** The repository owner has confirmed permission to distribute those assets with this project. Their respective owners retain copyright and trademark rights; this is not a general grant to reuse or rebrand them. Obtain appropriate permission before redistributing or using that artwork outside the approved scope.

## Languages

The complete interface and suggested card messages support English (`en`), Spanish (`es`), French (`fr`), Brazilian Portuguese (`pt-BR`), Italian (`it`), Japanese (`ja`), Simplified Chinese (`zh-CN`), Korean (`ko`), Dutch (`nl`), and German (`de`).

- The initial app language follows the browser's preferred supported language, falling back to English.
- Changing **App language** also sets **Message language**. The message language can then be changed independently; existing writing is never silently translated.
- Non-English cards offer the two text-free catalog designs (butterflies and heart), plus optional AI backgrounds. Switching away from English clears a selected design with embedded English text and requires a compatible selection. All six original designs remain available for English.
- Preview/export wraps Unicode text, including unspaced Japanese/Chinese and grapheme clusters, and reduces font size as needed to fit the panel. Messages that cannot fit are rejected, not clipped. Rendering uses installed system fonts; check font coverage on supported devices.
- The API allowlist is configured with `SUPPORTED_LANGUAGES` (Bicep: `supportedLanguages`). Update existing deployments to include all ten codes above. Legacy API codes `pt`, `zh`, `ar`, and `he` remain accepted by default.
- Fixed UI, validation, and service-error messages are translated. Organizer-supplied event/footer overrides and user/model content are not automatically translated. Leave optional text overrides blank to use translated defaults.
- Local content rules are only a basic, primarily English screening aid, not comprehensive multilingual moderation. AI is optional; review cards under the organizer's approved human moderation process before distributing them.

## Architecture

```text
Browser (React + Canvas)
  ├─ approved catalog remains usable without AI
  ├─ POST <Function App>/api/review-message ─┐
  ├─ POST <Function App>/api/generate-background ─┐
  ├─ POST <Function App>/api/moderate-image ────── Linux Flex Consumption Function App ─ Azure OpenAI / Content Safety (server-side keys)
  └─ POST <Function App>/api/submit-card ─────────┘                                  └─ private Blob container (server-side storage key)
Azure Static Web Apps ─ React frontend
Application Insights ─ privacy-safe operational telemetry; no request bodies
```

- **Web:** React 19, TypeScript, Vite, semantic HTML, responsive CSS, Canvas JPG export.
- **API:** Node 22 Azure Functions v4. The browser receives no Azure credentials.
- **Storage:** private Blob container; server-generated paths; JPEG decode/re-encode strips metadata; distributed Blob idempotency markers.
- **AI:** optional Azure OpenAI endpoints authenticated with server-side keys; fixed prompts; Azure AI Content Safety text/image hooks; in-repo image moderation endpoint for generated backgrounds.
- **Infrastructure:** Bicep for Static Web Apps, Linux Flex Consumption Function App, Storage, Log Analytics, Application Insights, app settings, configurable retention, HTTPS/TLS settings, and restricted CORS.
- **Delivery:** GitHub Actions validates every push/PR, deploys the Function App through Azure OIDC after `main` succeeds, then deploys the static frontend. Every same-repository PR automatically receives its own Static Web Apps frontend preview after validation succeeds. Updates reuse that PR's URL; closing or merging the PR removes the Azure preview. Fork PRs receive validation without deployment secrets.

### Pull-request previews

The `deploy-preview` check verifies that the deployed page responds successfully. Its URL appears in the PR deployment comment, the workflow summary, and the `preview-pr-<number>` GitHub environment. Deploy and cleanup jobs share a per-PR concurrency group; a newer update or closure cancels an older in-progress job without affecting other PRs.

The preview uses the existing `VITE_API_BASE_URL`: **only the frontend is isolated**. API changes are tested in CI but are not deployed from PR branches, and preview submissions go to the shared backend/storage. Use non-sensitive test content. Configure each preview's exact origin in the shared Function App's CORS allowlist before testing API flows. Pre-production environments are enabled for all Bicep environments; the hosting plan's concurrent preview quota still applies.

No `ENABLE_PR_PREVIEWS` variable is required by the current workflow. Older workflow revisions with that gate need the variable set to `true` when rerun.

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

Prerequisites: Node.js 22.22.2+ (22 LTS) or 24.15.0+ (24 LTS), and Azure Functions Core Tools v4. Azurite is optional for offline storage testing; the preferred development path uses the same Azure Storage, Azure OpenAI, and Content Safety resources as the cloud deployment.

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

For a deployed frontend, set `VITE_API_BASE_URL` to the HTTPS Function App origin, for example `https://<function-app-name>.azurewebsites.net`. Leave it empty for local Vite proxy development.

The production workflow uses GitHub OIDC to deploy the dedicated Function App. Configure `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, and `AZURE_SUBSCRIPTION_ID` as repository secrets, plus `AZURE_FUNCTIONAPP_NAME` and `VITE_API_BASE_URL` as repository variables. See [Local development and Azure setup](docs/local-azure-setup.md) for the Bicep outputs and scope.

## Configuration and public-release safety

- All `VITE_` settings are public build-time configuration, not a secret store. Event title/date/time/duration, activity name, tracking link and legal footer have no deployment-specific source defaults; configure them using [.env.example](.env.example) or the matching GitHub variables. An empty tracking URL hides the tracking section.
- `npm run build` generates the output Static Web Apps CSP from `VITE_API_BASE_URL`. Only that HTTPS origin is added to `connect-src`; no particular deployment hostname or wildcard is shipped in the source policy. Deploy the built `dist` directory, not unprocessed source configuration.
- API keys, storage connection strings, and moderation keys belong in ignored `api/local.settings.json`, protected Azure app settings, or Key Vault references. Never put them in the frontend or commit real deployment parameter files.
- Server-side `AI_REVIEW_ENABLED` and `AI_IMAGE_ENABLED` must explicitly be `true` to make upstream AI calls. Frontend flags alone do not authorize them. Existing local settings must add these flags when enabling AI.
- `EVENT_ID` and `BLOB_PATH_PREFIX` control non-personal event metadata and storage layout. Defaults are generic. Set explicit values on existing deployments to preserve their storage prefix and matching retention policy.
- Bicep requires an explicit `githubRepository` in `owner/repository` form. Confirm the exact owner/repository, protect the GitHub `production` environment with required reviewers and allowed deployment branches, and review the generated OIDC subject before deployment. Explicitly allow approved preview origins; unrelated Static Web Apps origins are not trusted.
- Local environment files and Azurite data are ignored and removed from tracking. Ignoring a file does not erase historical copies. The release review found no genuine credentials in the 22 reachable commits inspected; this is not a guarantee about unfetched branches, hosted logs/artifacts, or live service settings. Contributor email addresses remain in Git history.
- Before changing repository visibility, review GitHub Actions artifacts/logs and contributor publication consent, retain evidence of artwork permission, and enable GitHub secret scanning/push protection and dependency alerts where available. Rotate any credential if a later scan finds an exposure; deleting it from the current tree is not sufficient.
- Publishing source is not an abuse-control boundary for the anonymous API. In-memory throttling is best-effort and per-instance; use managed ingress quotas/abuse protection and budget alerts appropriate for a publicly accessible deployment.

## Build and test

```bash
npm run check
npm run check:api
npm run test:e2e       # after: npx playwright install chromium webkit
az bicep build --file infra/main.bicep
```

Focused tests cover all ten translation catalogs, browser language matching, UI/card language selection, Unicode wrapping and fitting, message/PII validation, character limits, RTL helpers, non-identifying filenames, API metadata allowlists, generated CSP, and server-side AI disablement. Manually check keyboard navigation, screen-reader language announcements, zoom, and system-font coverage before a public event.

## Data flow and privacy

Card composition remains in browser memory until submission. Review sends only message/language to the review endpoint; generation sends only the design prompt. Generated images are checked by the server-side moderation endpoint before returning to the browser. Submission sends a re-rendered JPEG and allowlisted metadata. The Function validates request type/size, decodes and re-encodes the JPEG, generates its ID/path, and writes it with a server-side storage connection string. No message, name, prompt, image, request body, direct URL, raw IP, or service key is logged. Rate-limit keys are one-way daily hashes held only in function memory.