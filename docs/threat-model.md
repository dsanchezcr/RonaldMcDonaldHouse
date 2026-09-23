# Threat model

## Assets and trust boundaries

Assets are volunteer messages, generated/approved images, submitted cards, model endpoints, storage, and operational availability. Trust boundaries exist between browser/API, API/AI, API/Blob, GitHub/Azure, and operators/production data. Browser input, headers, filenames, metadata, model output, and generated images are untrusted.

## Key threats and controls

| Threat | Controls | Residual action |
|---|---|---|
| Storage credential theft | No browser credential; Function-only storage connection string; private container; HTTPS-only storage | Store secrets only in approved settings/Key Vault references; rotate keys; review operator access |
| Path/container injection | Server-fixed container/path; UUID submission IDs; metadata allowlists | Pen-test encoded/multipart variants |
| Malicious or polyglot upload | MIME/size/magic checks; Sharp decode with pixel limit; JPEG re-encode strips metadata | Keep Sharp patched; malware-test corpus |
| Duplicate/replay | Client lock plus distributed hashed idempotency marker | Configure edge replay/abuse policy |
| DoS/cost abuse | Request/body/pixel limits, concurrency limits, per-instance rate limit, AI regeneration limit | Production WAF/Front Door rate limiting required |
| PII/medical/unsafe content | Client UX checks repeated server-side; Content Safety hook; no body logging | Human review/incident process; tune multilingual rules |
| Prompt injection/model leakage | Fixed system instructions, allowlisted action/schema, output projection, no raw internals | Red-team configured deployments |
| Unsafe generated image | Fixed constraints and prompt moderation | Approved image-output moderation is a go-live blocker |
| XSS/data exfiltration | React escaping, CSP, no third-party analytics, restrictive permissions/referrer policy | Validate deployed headers |
| Telemetry privacy leakage | No request/body/name/message/prompt/image logging; IP masking | Audit App Insights and platform logs |
| Supply-chain compromise | Lockfiles, CI, dependency/security review, environment approvals, OIDC | Enable Dependabot and branch protection |
| Service key leakage | No keys in browser code, logs, docs, or telemetry; keys passed as secure deployment parameters or GitHub secrets | Rotate exposed keys immediately; prefer Key Vault references for production |

## Abuse cases

Test malformed multipart bodies, decompression/pixel bombs, EXIF payloads, spoofed MIME, path values, unsupported languages, oversized text, contact details, medical promises, hate/sexual/violent/self-harm content, fundraising, prompt injection, unsafe image prompts, model schema deviation, simultaneous replay, forged origins, and direct API calls.

## Data retention and deletion

Cards and idempotency markers are private and deleted by the event-owner-approved lifecycle value. Telemetry retention uses the approved configuration. Operators must document legal hold/deletion procedures and verify lifecycle execution before production.
