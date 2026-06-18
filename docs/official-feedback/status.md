# Official Feedback — Status

Snapshot of where the `official-feedback` branch is. Updated whenever a feedback batch ships. Read this first before continuing work on this branch.

---

## Mission

Process Tina's feedback on the **Answer Engine Optimization** section of the Avenue Z reporting platform. All changes must:

1. Match Tina's literal ask. No silent reinterpretation.
2. Apply universally to every current and future AEO client (no per-client conditionals).
3. Use the **Glean Chat API** for any LLM inference. No Vertex/Gemini, OpenAI, Anthropic direct, etc.
4. Avoid em-dashes and AI-tell punctuation in any copy I write.
5. Be documented per item in `feedback-log.md` with verbatim ask, decisions, and risks so Paul (or future-Thomas) can pick up cold.

---

## Branch

- Branch: `official-feedback`
- Base: `main`
- Origin: `https://github.com/Avenue-Z/avenue-z-reporting-v2`

---

## Shipped — FB log

| FB ID | What it was | Commit | Status |
|---|---|---|---|
| **FB-001** | Tina — consistent header across all 4 AEO tabs. Shared `<SectionHeader>` component, applied universally. Overview gets Sparkles + new copy. PR Influence gets Megaphone + new copy. Content Impact unchanged (the reference). Technical Performance icon color flipped yellow → green for consistency. | `7097a19` | ✅ done |
| **FB-002** | Tina — AEO Overview tab redesign batch (5 sub-items a–e). | `ae8fc06` | ✅ done |
| ↳ 002a | Removed the "What changed" pills (`<PeriodRibbon />`) | | ✅ |
| ↳ 002b | Swapped the 3 KPI cards. Visibility / Citation Share / AI Referral Traffic. Citation Share is truth-grounded for both Peec and Profound: sum of citations attributed to client's own domain ÷ total tracked-domain citations. | | ✅ |
| ↳ 002c | New Executive Synopsis card at top of Overview. Calls Glean Chat (was Vertex Gemini at first ship, migrated in FB-003). Cached 1h per (client, dateRange, provider). | | ✅ |
| ↳ 002d | Added `Snapshot KPIs` eyebrow heading above the KPI grid | | ✅ |
| ↳ 002e | Moved `<VisibilityChart>` to render after the KPI grid (matches Tina's mockup vertical order) | | ✅ |
| **FB-003** | Thomas — Glean-only LLM rule. Migrated FB-002c synopsis from Vertex Gemini to Glean Chat API. Added reusable `gleanChat()` helper to `lib/glean.ts`. Cache version bumped `v1` → `v2-glean`. | `e33ed66` | ✅ done |
| **FB-004** | Tina — added vertical axis to the AEO Overview visibility trend chart. 5 percent-tick labels computed from existing `CHART_MAX`, aligned to the 5 existing gridlines. X-axis row gets a matching spacer so bars stay aligned to date labels. | `da74c23` | ✅ done |
| **FB-005** | Tina — disambiguated "Google" in the AEO Model Breakdown. Investigation against live Peec API revealed Gemini data was silently being bucketed into "Google" (Peec channel id `google-2` = gemini-scraper). Fix: pull `model_id` dimension, prefer `row.model.id` over `row.model_channel.id` in `normalizeSource`, add display label map (`Google` → `Google AI Overview`). After fix, the breakdown shows Gemini and Google AI Overview as separate truthful rows. | `6142968` | ✅ done |
| **FB-006** | Tina — Biggest Winners / Biggest Losers side-by-side cards on AEO Overview between Model Breakdown and Leaderboard. Computes per-prompt rank delta from real Peec data (current vs prior period). Symmetrical, scroll-bounded (`max-h-[400px]`), hides when empty (Profound, brand-new projects). | `PENDING` | ✅ done |

Full per-item decision logs (verbatim ask, what was unambiguous, every inferred decision, what was out of scope, files touched, risks) live in [feedback-log.md](feedback-log.md).

One-line SHA lookup in [changelog.md](changelog.md).

---

## Working rules established during this branch

1. **One user message = one FB group.** Multiple changes in one message become sub-items inside that group (`FB-NNN-a`, `b`, `c`). Easier to track for Tina and Paul.
2. **One commit per group.** Sub-items ship together, get reverted together if needed.
3. **No "—" em-dashes in copy I write.** Use periods or commas.
4. **Decisions over questions.** Make the call, document why. Only ask Thomas when truly blocked (e.g. data the codebase cannot answer for me).
5. **Show receipts.** Every claim of "done" is backed by a file:line reference, a commit SHA, or a verification output.
6. **Truth-grounded data.** No proxies, no derivations that ship wrong numbers. If a metric is not computable for a provider, the card shows `--` with an honest tooltip, never an invented value.
7. **Glean Chat API only** for any LLM inference. See `lib/glean.ts` `gleanChat()` for the canonical pattern.
8. **Universal across clients by construction.** Edit shared components/data layers. No per-client conditionals. New clients inherit changes automatically.

---

## Files added on this branch

| Path | Purpose |
|---|---|
| `components/report-sections/peec-ai/section-header.tsx` | Canonical AEO section header (FB-001) |
| `components/report-sections/peec-ai/overview-synopsis.tsx` | Executive Synopsis RSC at top of Overview (FB-002c) |
| `lib/peec/synopsis.ts` | Glean-backed synopsis generator with cache + JSON extractor (FB-002c, FB-003) |
| `docs/official-feedback/feedback-log.md` | Source of truth for every FB item with decision log |
| `docs/official-feedback/changelog.md` | Terse SHA-keyed lookup |
| `docs/official-feedback/status.md` | This file |
| `docs/official-feedback/handoff.md` | Cold-start prompt to give a new chat after compaction |

---

## Operational requirements (production)

These must be set in Vercel for everything to render real data:

| Var | Needed for | Value |
|---|---|---|
| `GLEAN_INSTANCE` | Executive Synopsis | `avenuez` |
| `GLEAN_API_TOKEN` | Executive Synopsis | rotate before going live, set Sensitive=on |
| `GLEAN_ACT_AS` | Executive Synopsis | `thomas.chang@avenuez.com` (optional, defaults to that) |
| `clients.domain` populated in DB | Citation Share KPI | one row per client — without it the card shows `--` |
| `clients.ga4_property_id` populated | AI Referral Traffic KPI | already true for current clients |

If any of these are missing the affected card or synopsis falls back gracefully. Other metrics on the page are unaffected.

---

## What's NOT done (deliberately out of scope)

| Item | Why deferred |
|---|---|
| Migrate `lib/bigquery/gemini.ts` (Fun Spot conversational summary) to Glean | Different feature, different code path. Should be a separate FB item when we get to Fun Spot. |
| Refactor `app/api/glean/meeting-brief/route.ts` to use the new `gleanChat()` helper | Working endpoint, cleanup not requested. Out of scope for FB-003. |
| Scrub em-dashes from existing tooltips/comments/strings across the codebase | Not requested. Per-fix scrubbing applied only on lines I was editing for a Tina item. |
| The `period-ribbon.tsx` component file (now unused) | Left in repo for trivial revert if Tina ever wants the pills back. |

---

## Next batches

Awaiting Tina's next piece of feedback. When it arrives:

- It becomes **FB-004**.
- If it contains multiple sub-asks, they become `FB-004-a`, `b`, `c` (etc.).
- One combined commit per group.
- Update this file + `feedback-log.md` + `changelog.md` on close.
