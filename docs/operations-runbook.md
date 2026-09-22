# Operations and rollback runbook

## Deploy

1. Approve all readiness items and create separate development, test, and production GitHub environments.
2. Configure environment variables documented in `.env.example`, `api/local.settings.example.json`, and `infra/main.bicep`. Never store values in source.
3. Use workload identity federation for Azure login. Grant the deployment identity only required resource-group roles.
4. Run CI, deploy development, execute manual accessibility/security/failure tests, then promote the same commit through test and production approvals.
5. Verify health, restrictive headers/CORS, private container access, managed-identity upload, lifecycle policy, telemetry redaction, and the exact Giving Portal URL.

## Monitoring

Alert on availability, Function 5xx/429/latency, storage failures/throttling, AI/Content Safety failures, and unusual submission volume. Dashboards must use counts, timings, status, and generated request/submission IDs only—not content. Confirm IP masking and approved retention.

## Incident response

Disable AI independently with flags/endpoints. For upload abuse or privacy risk, disable the Function/link or restrict ingress while preserving the static guidance/download experience. Do not inspect card content unless authorized by the approved incident process. Record only privacy-safe incident facts and notify security/privacy/event owners.

## Rollback

1. Disable optional AI flags first if the issue is AI-specific.
2. Redeploy the last known-good immutable artifact/commit through the production environment approval; do not rewrite branch history.
3. If infrastructure caused the issue, restore the last approved Bicep parameters/template. Never delete the storage account during application rollback.
4. Validate health, upload, idempotency, CORS, retention, and monitoring.
5. Reconcile cards/idempotency markers created during the incident under the approved retention/deletion process.

## Storage outage

The browser retains the generated Blob for download and retry during the active page session. Tell users to download first; never claim submission succeeded without a server response. Restore service, verify health and Blob RBAC, then retry with the same idempotency key.
