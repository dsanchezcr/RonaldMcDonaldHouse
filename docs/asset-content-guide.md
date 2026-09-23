# Approved asset and content guide

## Current asset locations

- Header logo: `public/assets/Ronald_McDonald_House_Logo.svg`
- Favicon: `public/assets/favicon.png`
- Catalog card templates: `public/assets/templates/*.jpg`

The app maps catalog design IDs in `src/config.ts` to `public/assets/templates/${id}.jpg`.

## Replace assets

1. Obtain written authorization and original exports from the source presentation. Do not screenshot, redraw, recolor, distort, or reconstruct the logo/templates.
2. Export each card at its approved 16:9 source ratio, optimize without visual changes, and place files under `public/assets/templates/`.
3. Update paths/descriptions in `src/config.ts` if filenames or titles change; use unique files, titles, and owner-approved meaningful alt text.
4. Replace `public/assets/Ronald_McDonald_House_Logo.svg` only with an approved logo image while preserving proportions, clear space, and approved background.
5. Test thumbnails and 1600×900 Canvas output at 200% zoom, with long/accented messages and safe contrast panels.

## Add or remove catalog entries

Edit the configuration-backed catalog only after content/brand/accessibility approval. IDs must be stable, non-personal, and unique. Every entry needs title, description, source path, readable text color, and panel color. Never allow volunteer uploads in this release.

## Configurable content

Event title/date/duration/activity, tracking URL, limits, consent version, AI flags, footer, languages, origins, retention, model endpoints/deployments, thresholds, telemetry, and catalog location are configuration. Changes require the relevant event, brand/legal, privacy/security, accessibility, or Responsible AI owner.
