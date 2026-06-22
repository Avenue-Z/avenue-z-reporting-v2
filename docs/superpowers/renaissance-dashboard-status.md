# Renaissance Dashboard — Status

**Last updated:** 2026-06-22
**Source PRD:** `renaissance_dashboard_additions_prd.md`
**Working branch:** `feat/renaissance-dashboard` (all Renaissance dashboard work lives here, off `main`)

---

## At a glance

The PRD defines four client-facing reporting modules for Renaissance. Status:

| # | Module | Status | Notes |
|---|---|---|---|
| 1 | **Paid Search Advertising** | ✅ Built, reviewed, live-data validated | Google Ads, lead-gen, single scrolling page |
| 2 | **Meta Advertising** | ✅ Built, reviewed (final: ready) | Upper-funnel; KPIs + creative + geo |
| 3 | **LinkedIn Advertising** | ⛔ Not started | Same Supermetrics pattern (`LIA`); should be fast |
| 4 | **Organic Social + Influencer** | ⛔ Not started | Needs a **Dash Social** connector (not a Supermetrics source) |

Both built modules are complete in code and proven against the **live Renaissance Supermetrics data**. Neither is deployed to production yet (see Gates).

---

## Where the code lives (branch topology)

- **`main`** — clean. Contains none of the Renaissance modules. (Paid Search was briefly merged via #55, then reverted via #56 by decision — Renaissance work stays on its own branch.)
- **`feat/renaissance-dashboard`** — **the home branch.** Contains Paid Search + Meta on top of main's history. Modules 3 & 4 land here next.
- `feat/renaissance-paid-search`, `feat/renaissance-meta-ads` — superseded (content consolidated into `feat/renaissance-dashboard`); safe to delete.
- `client/renaissance` — stale (pre-DB-migration, ~May 2026); **not used**.

> ⚠️ **Branch-sync gotcha:** `main` contains the Paid Search commit *and its revert*. A plain `main → feat/renaissance-dashboard` merge would re-apply the revert and **delete Paid Search** from this branch. To pull future main work in, rebase/cherry-pick the Renaissance commits onto main — not a plain merge.

---

## Module 1 — Paid Search Advertising

Single scrolling Google Ads report for the Renaissance lead-gen account (`4136001852`).

**Sections:** hero combo chart (weekly YTD cost bars + leads line) · 8 KPI scorecards · campaign table (sortable, totals row) · Leads & Conversions (14 form-fill actions grouped Employer/Broker/Contact) · geographic (state bars) · search terms.

**Validated against live data** — which caught and fixed three real issues the mocks couldn't:
- Supermetrics `/query/data/json` responds **synchronously** (`{ meta, data }`), not submit→poll.
- Rows must be keyed by **field id** (`meta.query.fields`), not the display-name header — was silently zeroing leads.
- Search terms capped to top 50 (account returns ~5,800).

**Key product decisions** (recorded in `docs/superpowers/specs/2026-06-17-renaissance-paid-search-prd-decisions.md` for Amir review):
- **No per-category CPL** — Google Ads attributes cost at campaign level, not per conversion action, and campaigns aren't audience-segmented. Ship leads-by-category share + page-level + campaign-level CPL instead.
- **"Leads" = the 14 form-fill actions only** (excludes phone-call/directions conversions).

**Spec:** `docs/superpowers/specs/2026-06-17-renaissance-paid-search-design.md`
**Plan:** `docs/superpowers/plans/2026-06-17-renaissance-paid-search.md`

---

## Module 2 — Meta Advertising

Single scrolling upper-funnel Meta report for the Renaissance Meta account (`act_1480350426850960`).

**Sections:** 12 KPI scorecards (Spend, Impressions, Reach, Frequency, Link Clicks, CTR, CPM, CPC, LPV, Cost/LPV, Post Engagement, Engagement Rate) · creative performance table (with Share of Spend + Status) · geographic (state bars).

**Decisions (approved 2026-06-22):**
- **Engagement Rate is derived** (post engagements ÷ impressions) — Meta exposes only a categorical "Engagement Rate Ranking".
- **Share of Spend** computed per ad (ad spend ÷ total).
- Trend via the **prior-period compare** (defaults to `previous_period`), same as Paid Search.
- **Geo is state-only** — no reliable DMA dimension in the Meta connector.

**Spec:** `docs/superpowers/specs/2026-06-22-renaissance-meta-ads-design.md`
**Plan:** `docs/superpowers/plans/2026-06-22-renaissance-meta-ads.md`

---

## Shared foundation established (reused by modules 3 & 4)

- **Supermetrics client** (`lib/supermetrics/`) — server-side `smQuery`, proven against the live enterprise API; field-id keying; timeout/rate-limit handling. `DS_IDS`: Google Ads `AW`, Meta `FA`, LinkedIn `LIA`.
- **Shared formatters** (`lib/supermetrics/format.ts`) — `usd`/`num`/`pct`.
- **UI primitives** — `ComboChart` (dual-axis), upgraded `DataTable` (serializable `sortKey` sorting + totals row), reused `KpiCard`/`KpiGrid`, the global date-range picker with prior-period comparison.
- **Per-client config pattern** — `paid_search_config` + `meta_config` jsonb columns; `sm_api_key_env_var` (shared `SUPERMETRICS_API_KEY`).
- **Module pattern** — route → async RSC orchestrator (`safe()` per-section timeout/error isolation) → `lib/<platform>/` data layer (pure, tested transforms + thin fetchers).

LinkedIn (module 3) reuses all of this with `DS_IDS.LINKEDIN` and a `linkedin_config` column — expected to be the fastest module. Organic+Influencer (module 4) is gated on building a Dash Social connector.

---

## Gates (block going live)

- **B1 — Supermetrics enterprise API key in production.** Wired locally (`SUPERMETRICS_API_KEY` in `.env.local`); not yet set in Vercel. Blocks all live data on the deployed app.
- **B2 — Amir's authoritative 14-action → Employer/Broker/Contact map** (Paid Search only). The placeholder map works; categories are provisional until confirmed. Meta is unaffected.

See the Slack message drafted for Amir (decisions to confirm + B1/B2) — it covers per-category CPL, the Leads definition, the action map, and the key.

---

## Going-live runbook (per environment)

Both modules are config-driven; deploying is an ops exercise, not a code change:

1. Merge/deploy `feat/renaissance-dashboard` (or its successor) to the target.
2. Apply DB migrations **`0007`** (paid_search) + **`0008`** (meta) to that environment's DB.
3. Set the Renaissance client row: `paid_search_config` (+ Amir's action map), `meta_config = { metaAdAccountId: 'act_1480350426850960' }`, `sm_api_key_env_var`, and add `'google-ads'` + `'meta-ads'` to `enabled_reports`.
4. Set `SUPERMETRICS_API_KEY` in the environment (B1).

> Done so far only on the **dev** DB (`ep-royal-king-aqnzuelw`, distinct from prod). Prod is untouched.

---

## Verification status

- `npm run build` clean; **21/21 unit tests pass** on `feat/renaissance-dashboard`.
- Both modules rendered end-to-end against live Renaissance data in a local preview (throwaway, not committed).
- Every implementation task was task-reviewed; both modules passed a final whole-branch review.

---

## Next steps

1. Confirm B1 (key) + B2 (action map) with Amir.
2. **Module 3 — LinkedIn Advertising**: brainstorm → spec → plan → build on `feat/renaissance-dashboard` (fast follow; reuses the foundation).
3. **Module 4 — Organic Social + Influencer**: scope the Dash Social connector first.
4. When ready, decide the deployment path (which environment/branch) and run the going-live runbook.
