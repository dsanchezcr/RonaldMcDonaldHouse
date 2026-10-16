# Operations and rollback runbook

## Deploy

1. Approve all readiness items and configure GitHub `production` and optional `staging` environments.
2. Configure variables and secrets documented in `.env.example`, `api/local.settings.example.json`, and `infra/main.bicep`. Never store values in source.
3. Provision or update Azure resources through reviewed Bicep only when infrastructure changes are required.
4. Provision Function App infrastructure through a reviewed Bicep deployment before the first code deployment; do not place Azure service keys in GitHub workflow files.
5. For app-only changes, let GitHub Actions build/test first, deploy the dedicated Function App from `main` through OIDC, then deploy the static frontend. Every same-repository pull request gets its own frontend preview automatically after validation. Fork PRs run validation only. Preview API calls use the shared backend and require the exact preview origin in platform CORS and `ALLOWED_ORIGINS`.
6. Verify the Function App `/api/health` endpoint, restrictive headers/CORS, private container access, server-side key upload, lifecycle policy, telemetry redaction, AI review/generation behavior, moderation failures, and the exact Giving Portal URL.

## Pull-request preview checks

1. Confirm `validate` passed. `deploy-preview` should run for opened, synchronized, or reopened same-repository PRs; it intentionally skips fork PRs and PR closure events.
2. Open the preview URL from the PR deployment comment, workflow summary, or `preview-pr-<number>` environment. The deployment job must fail if no URL is returned or the page cannot be reached.
3. If an older workflow revision skips the preview because of `ENABLE_PR_PREVIEWS`, set that repository variable to `true` before rerunning it. The current workflow has no opt-in gate.
4. If Azure refuses to create a preview, check that pre-production environments are enabled and the hosting plan has capacity. Closing a PR runs `close-preview` independently of validation to remove its Azure environment.
5. Verify API preflight requests from the exact preview origin. Frontend deployment success does not prove that CORS is configured or that PR API changes are deployed. Never use real family or volunteer information in preview testing.

## Monitoring

Alert on availability, Function 5xx/429/latency, storage failures/throttling, AI/Content Safety failures, and unusual submission volume. Dashboards must use counts, timings, status, and generated request/submission IDs only—not content. Confirm IP masking and approved retention.

## Incident response

Disable AI independently with the server-side `AI_REVIEW_ENABLED=false` and `AI_IMAGE_ENABLED=false` settings. Frontend `VITE_` flags only control the UI and require a rebuild. For upload abuse or privacy risk, disable the Function/link or restrict ingress while preserving the static guidance/download experience. In-memory rate limits are per-instance and are not a substitute for managed ingress quotas and abuse protection. Do not inspect card content unless authorized by the approved incident process. Record only privacy-safe incident facts and notify security/privacy/event owners.

For language upgrades, update `SUPPORTED_LANGUAGES` to include `en,es,fr,pt-BR,it,ja,zh-CN,ko,nl,de` (plus any retained aliases). Verify review, generation, and submission metadata for each enabled language. Use human review before distributing submitted cards: local regular-expression screening is primarily English and AI review remains optional.

## Rollback

1. Disable optional AI flags first if the issue is AI-specific.
2. Redeploy the last known-good immutable artifact/commit through the production environment approval; deploy the Function App before the frontend and do not rewrite branch history.
3. If infrastructure caused the issue, restore the last approved Bicep parameters/template. Never delete the storage account during application rollback.
4. Validate health, upload, idempotency, CORS, retention, and monitoring.
5. Reconcile cards/idempotency markers created during the incident under the approved retention/deletion process.

## Storage outage

The browser retains the generated Blob for download and retry during the active page session. Tell users to download first; never claim submission succeeded without a server response. Restore service, verify health and Blob key access, then retry with the same idempotency key.
