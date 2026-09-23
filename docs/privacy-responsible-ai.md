# Privacy and Responsible AI review

## Privacy checklist

- [ ] Anonymous access and no identity fields are confirmed.
- [ ] No family/child data is requested; content does not imply a specific recipient.
- [ ] Data inventory contains only card JPG plus language, design source, consent version, event/version, and timestamp.
- [ ] Message, optional first name, prompt, image, contact details, request bodies, and raw IP are excluded from metadata/telemetry.
- [ ] No advertising cookies, fingerprinting, third-party analytics, or behavioral tracking.
- [ ] Purpose, access, retention, deletion, incident response, and data residency have owner approval.
- [ ] CORS origins, platform logs, Application Insights sampling/IP masking, support access, and backups are reviewed.
- [ ] Notice/consent/footer wording is legally approved and localized where required.

## Responsible AI checklist

- [ ] AI is visibly labeled optional and the approved-template workflow works while disabled.
- [ ] Server-side keys authenticate all model/Content Safety calls; no browser model credential; keys are stored only in approved app settings, GitHub secrets, or Key Vault references and rotated.
- [ ] Approved models, deployments, regions, languages, prompts, thresholds, and evaluation sets are documented.
- [ ] Text input is checked for PII, medical content, outcome promises, solicitation, harassment, hate, sexual, violence, self-harm, discrimination, and injection.
- [ ] Suggestions preserve meaning/language, make minimal edits, explain concerns, and require explicit acceptance.
- [ ] Unsupported multilingual review is transparently unavailable, never presented as completed.
- [ ] Image prompts receive fixed constraints; prompt and image moderation reject text, logos, characters, identifiable people, and distressing/medical imagery.
- [ ] Generation attempts and cost are limited; blocked/unavailable messages are nonjudgmental.
- [ ] Model output is parsed through an allowlisted contract; raw safety internals/system prompts are not returned.
- [ ] Human review is required for revised text, generated image, final card, and submission.
- [ ] Red-team results, quality/safety metrics, monitoring, rollback, and incident ownership are approved.
