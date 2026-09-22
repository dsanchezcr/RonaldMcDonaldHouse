# Approved asset and content guide

## Replace assets

1. Obtain written authorization and original exports from the source presentation. Do not screenshot, redraw, recolor, distort, or reconstruct the logo/templates.
2. Export each card at its approved 16:9 source ratio, optimize without visual changes, and place files under `public/assets/templates/`.
3. Replace the placeholder paths/descriptions in `src/config.ts`; use unique files, titles, and owner-approved meaningful alt text.
4. Replace the header placeholder with the approved logo image while preserving proportions, clear space, and approved background.
5. Remove `public/assets/catalog-placeholder.svg` and the visible placeholder warning only after review.
6. Test thumbnail and 1600×900 Canvas output at 200% zoom, with long/RTL/accented messages and safe contrast panels.

## Add or remove catalog entries

Edit the configuration-backed catalog only after content/brand/accessibility approval. IDs must be stable, non-personal, and unique. Every entry needs title, description, source path, readable text color, and panel color. Never allow volunteer uploads in this release.

## Configurable content

Event title/date/duration/activity, tracking URL, limits, consent version, AI flags, footer, languages, origins, retention, model endpoints/deployments, thresholds, telemetry, and catalog location are configuration. Changes require the relevant event, brand/legal, privacy/security, accessibility, or Responsible AI owner.
