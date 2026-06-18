# Feedback Changelog

Terse one-line entries of what shipped. Lookup table to answer "did we already fix this?"

Format: `FB-NNN | <date> | <commit-sha> | <verification> | <one-line summary>`

Verification codes: `a` = reasoning only, `b` = ran dev server + clicked through, `c` = user-eyeballed.

---

FB-001 | 2026-06-17 | 7097a19 | a | Unified AEO section header across all 4 tabs via shared SectionHeader component (Overview + PR Influence get the treatment, Content Impact unchanged, Technical Performance shifted yellow to green).
FB-002 | 2026-06-17 | ae8fc06 | a | AEO Overview tab redesign: removed what-changed pills (002a), swapped 3 KPI cards to Visibility / Citation Share / AI Referral Traffic with truth-grounded Citation Share math for both Peec and Profound (002b), added Vertex Gemini exec synopsis at top (002c — superseded by FB-003), added Snapshot KPIs eyebrow (002d), reordered trend chart below KPI grid (002e).
FB-003 | 2026-06-17 | e33ed66 | a | Migrated FB-002c synopsis from Vertex Gemini to Glean Chat API (project-wide Glean-only rule). Added gleanChat() helper to lib/glean.ts; surgical swap in lib/peec/synopsis.ts; cache version bumped to v2-glean; zero render-layer changes. lib/bigquery/gemini.ts (Fun Spot) still on Vertex, flagged as a future migration item.
FB-004 | 2026-06-18 | da74c23 | a | Added vertical axis to AEO Overview VisibilityChart. Five tick labels (integer % with % suffix) computed from existing CHART_MAX, aligned to the 5 existing gridlines. X-axis date row gets a matching w-9 spacer to preserve bar/label alignment. One file: components/report-sections/peec-ai/visibility-chart.tsx. Truth-grounded scale (no nice-rounding).
FB-005 | 2026-06-18 | 6142968 | b | Disambiguated "Google" in AEO Model Breakdown — discovered via live Peec API probe that Gemini data was being silently bucketed into the "Google" row (model_channel.id `google-2` = gemini-scraper, did not match "gemini" substring, fell into "google"). Fix: added model_id dimension to /reports/brands and /reports/domains queries; inverted normalizeSource read priority to prefer row.model.id (friendly scraper id like "gemini-scraper") over row.model_channel.id (channel id like "google-2"). Added MODEL_DISPLAY_LABELS map; "Google" canonical id now displays as "Google AI Overview". Verified end-to-end: before = 3 rows with merged Google bucket, after = 4 rows with separate Gemini + Google AI Overview. AI Mode add-on still lumps into Google bucket, flagged as future work.
