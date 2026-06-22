# Renaissance Dashboard — Status & Module Specs

**Last updated:** 2026-06-22
**Source PRD:** `renaissance_dashboard_additions_prd.md`
**Working branch:** `feat/renaissance-dashboard` (all Renaissance dashboard work lives here, off `main`)

This is the single reference for the Renaissance dashboard effort. Each of the
four PRD modules below carries enough detail to serve as (or directly seed) its
implementation spec — data source, sections, KPI→field mappings, decisions,
config, open items, and acceptance criteria. Modules 1 & 2 are built (full specs
also exist as separate files, linked); modules 3 & 4 are spec'd here but not yet
built.

---

## At a glance

| # | Module | Status | Data source (validated) |
|---|---|---|---|
| 1 | **Paid Search Advertising** | ✅ Built, reviewed, live-validated | Google Ads `AW` · acct `4136001852` |
| 2 | **Meta Advertising** | ✅ Built, reviewed | Facebook Ads `FA` · acct `act_1480350426850960` |
| 3 | **LinkedIn Advertising** | ✅ Built (PR #57) | LinkedIn Ads `LIA` · acct `503368877` |
| 4 | **Organic Social + Influencer** | 🟡 Spec'd (below), not built | **Dash Social (net-new connector)** |

All ad-platform connectors are authenticated under the Avenue Z Supermetrics
account; all three ad accounts are confirmed connected. The shared enterprise key
`SUPERMETRICS_API_KEY` is proven end-to-end (Paid Search live test).

---

## Branch topology

- **`main`** — clean; contains none of the Renaissance modules. (Paid Search was briefly merged via #55, then reverted via #56 — Renaissance work stays on its own branch.)
- **`feat/renaissance-dashboard`** — the home branch: Paid Search + Meta on top of main's history. Modules 3 & 4 land here.
- `feat/renaissance-paid-search`, `feat/renaissance-meta-ads` — superseded; safe to delete.
- `client/renaissance` — stale (pre-DB-migration, ~May 2026); not used.

> ⚠️ **Branch-sync gotcha:** `main` holds the Paid Search commit *and its revert*. A plain `main → feat/renaissance-dashboard` merge re-applies the revert and **deletes Paid Search** here. Pull future main work in via rebase/cherry-pick, not a plain merge.

---

## Shared foundation (reused by every module)

- **Supermetrics client** `lib/supermetrics/` — server-side `smQuery`, proven against the live enterprise API; **synchronous** `{ meta, data }` response; rows keyed by **field id** (`meta.query.fields`); timeout + 429 handling. `DS_IDS`: Google Ads `AW`, Meta `FA`, LinkedIn `LIA`.
- **Formatters** `lib/supermetrics/format.ts` — `usd`/`num`/`pct`.
- **UI** — `ComboChart` (dual-axis), upgraded `DataTable` (serializable `sortKey` sorting + totals row), `KpiCard`/`KpiGrid`, global date-range picker with prior-period comparison.
- **Per-client config** — `*_config` jsonb columns + `sm_api_key_env_var`.
- **Module pattern** — route → async RSC orchestrator (`safe()` per-section timeout/error isolation) → `lib/<platform>/` data layer (pure tested transforms + thin fetchers) → presentational components.

---

## Gates (block going live)

- **B1 — `SUPERMETRICS_API_KEY` in production** (Vercel). Wired locally only. Blocks all live data on the deployed app.
- **B2 — Amir's authoritative 14-action → Employer/Broker/Contact map** (Paid Search only). Placeholder works; categories provisional until confirmed.
- **B3 — Dash Social connector** (module 4 only). Net-new integration; nothing exists yet.

---

## Going-live runbook (per environment)

1. Deploy `feat/renaissance-dashboard` (or successor) to the target.
2. Apply DB migrations for the shipped modules (`0007` paid-search, `0008` meta, `0009` linkedin when built).
3. Set the Renaissance client row: each `*_config`, `sm_api_key_env_var`, and the enabled report slugs.
4. Set `SUPERMETRICS_API_KEY` in the environment (B1).

> Done so far on the **dev** DB only (`ep-royal-king-aqnzuelw`, distinct from prod). Prod untouched.

---

# Module Specs

## 1 — Paid Search Advertising ✅ built

**Full spec:** `docs/superpowers/specs/2026-06-17-renaissance-paid-search-design.md` · **Plan:** `…/plans/2026-06-17-renaissance-paid-search.md` · **Decisions:** `…/specs/2026-06-17-renaissance-paid-search-prd-decisions.md`

- **Purpose:** Google Ads performance for the Renaissance lead-gen account (not e-commerce; no ROAS).
- **Data source:** `AW`, account `4136001852`, shared key. Single sync query per section; rows keyed by field id.
- **Slug:** repurposed `google-ads` → "Paid Search"; in the Reports nav.
- **Page (single scroll):** Hero combo chart (weekly YTD: cost bars + leads dashed line, metric toggle) · KPI scorecards · Campaign table · Leads & Conversions · Geographic · Search Terms.
- **KPI cards (8):** Cost `Cost` · Clicks `Clicks` · Impressions `Impressions` · CTR `Ctr` · Avg CPC `CPC` · Leads (scoped) · Cost/Lead (`Cost`÷leads) · Conv Rate (leads÷clicks).
- **Leads = sum of the 14 form-fill conversion actions only** (segment `ConversionTypeName`+`Conversions`, category "Submit lead form"); excludes `Calls from ads` + `Directions`. Grouped Employer/Broker/Contact via the configured map.
- **Geo:** `Region` (state), ranked bars. **Search terms:** `Searchterm` (top 50, sorted leads→cost).
- **Key decisions** (signed by Paul, pending Amir): **no per-category CPL** (cost isn't per-action; campaigns aren't audience-segmented → ship leads-by-category share + page-level + campaign-level CPL); **Leads = form-fills only** (corrects PRD §125).
- **Config:** `paid_search_config { googleAdsAccountId, leadActions:[{name,category}] }` + `sm_api_key_env_var`; migration `0007`.
- **Open:** B2 authoritative action map (placeholder live).
- **Acceptance:** six sections in order; all 14 actions grouped w/ subtotals; KPI↔campaign totals reconcile; date range drives all sections + deltas; config-driven.

## 2 — Meta Advertising ✅ built

**Full spec:** `docs/superpowers/specs/2026-06-22-renaissance-meta-ads-design.md` · **Plan:** `…/plans/2026-06-22-renaissance-meta-ads.md`

- **Purpose:** upper-funnel Meta (awareness/traffic/engagement/creative). No ROAS/conversion framing.
- **Data source:** `FA`, account `act_1480350426850960`, shared key.
- **Slug:** repurposed `meta-ads` → "Meta Advertising"; in the Reports nav.
- **Page (single scroll):** KPI scorecards · Creative Performance · Geographic.
- **KPI cards (12) → field ids:** Spend `cost` · Impressions `impressions` · Reach `reach` · Frequency `Frequency` · Link Clicks `inline_link_clicks` · CTR `CTR` · CPM `CPM` · CPC `CPC` · Landing Page Views `landing_page_views` · Cost/LPV `cost_per_landing_page_view` · Post Engagement `action_post_engagement` · **Engagement Rate = derived** (`action_post_engagement`÷`impressions`×100).
- **Creative table:** dims `ad_name`/`Campaignname`/`adstatus`; columns incl. **Share of Spend = computed** (ad spend÷total) + Status; sortable, default Spend desc.
- **Geo:** `Region` (state only — no reliable DMA).
- **Decisions:** prior-period compare for trend; engagement rate derived; share of spend computed; state-only geo.
- **Config:** `meta_config { metaAdAccountId }`; migration `0008`.
- **Acceptance:** 3 sections; 12 KPIs w/ deltas; creative sortable w/ Share of Spend + Status; state geo; date-driven; config-driven.

## 3 — LinkedIn Advertising ✅ built

**Spec:** `docs/superpowers/specs/2026-06-22-renaissance-linkedin-ads-design.md` · **Plan:** `…/plans/2026-06-22-renaissance-linkedin-ads.md` · **Built on `feat/renaissance-dashboard` (PR #57).** Mirrors Meta: KPI Scorecards (14, incl. derived Frequency & Cost/Visit) · Creative Performance (Ad/Audience=`campaignName`/Campaign=`campaignGroupName` + Share of Spend + totals row) · Geographic (`memberRegion`). **Report-type note corrected:** `LIA` is `has_report_type_selection:false` (like AW/FA) — report type `1` covers every field, so each section is a single query (no join needed).

- **Purpose:** B2B channel — audience targeting, website traffic, lead gen (broker/HR/broad B2B), higher-intent engagement.
- **Data source (validated):** Supermetrics LinkedIn Ads `LIA`, Renaissance account **`503368877`** ("Renaissance Life and Health Ads Account"), shared key. **Note:** LinkedIn fields use report types (`ad_analytics`, `ad_form`, `ad_statistics`, …); lead-form metrics live in report types `0,1,5` — the data layer must select the right report type (unlike AW/FA which had `has_report_type_selection:false`). Pin this during the plan.
- **Slug:** repurpose the dormant `linkedin-ads` stub → "LinkedIn Advertising"; add to Reports nav.
- **Page (single scroll, v1 simplification — same shape as Meta):** KPI Scorecards · Creative Performance · Geographic.
- **KPI cards (14) → field ids** (✓ validated / ⚠ pin in plan):
  - Spend ⚠ (base spend/cost field) · Impressions ⚠ · Reach `approximateUniqueImpressions` ✓ · Clicks ⚠ · CTR ⚠ · CPM ⚠ · CPC ⚠ · Frequency ⚠ (LinkedIn frequency field) · Website Visits / Landing Page Clicks ⚠ · Cost per Visit ⚠ · **Leads `oneClickLeads`** ✓ · **Cost per Lead `oneClickLeadsCost`** ✓ · **Lead Form Opens `oneClickLeadFormOpens`** ✓ · **Lead Form Completion Rate `leadFormCompletionRate`** ✓.
- **Creative table (PRD):** Ad Name · Audience · Campaign · Spend · Impressions · Clicks · CTR · CPC/Cost per Visit · Leads · Cost per Lead · Lead Form Opens · Lead Form Completion Rate · Status. (Pin the `ad_name`/`Audience`/campaign/status dimension ids in the plan.)
- **Geo:** `memberRegion` ✓ (state/region). State-first; metro/DMA only if reliable — default **state-only** like Meta.
- **Decisions (proposed, mirror Meta):** prior-period compare for trend; state-only geo; `linkedin_config { linkedinAdAccountId }` jsonb.
- **Config:** `linkedin_config` column + migration `0009`; enable `linkedin-ads` for Renaissance.
- **Open / pin in plan:** exact field ids for spend/impressions/clicks/CTR/CPM/CPC/Frequency/Website-Visits/Cost-per-Visit; the `Audience` + status dimensions; **report-type selection** so lead-form metrics can be combined with creative dims in one query (may require separate queries per report type, joined — similar to Paid Search's two-query reconciliation).
- **Acceptance:** 3 sections; KPIs incl. the lead-form set; creative table; state geo; prior-period deltas; config-driven; live smoke test against `503368877`.
- **Effort:** fast follow — reuses the entire foundation; main new work is the report-type handling.

## 4 — Organic Social + Influencer 🟡 spec'd, not built (Phase 2)

- **Purpose:** one merged client-facing view of Organic Social **and** Influencer — overall performance, per-channel contribution, top content, and influencer contribution.
- **Channels:** Instagram, Facebook, LinkedIn, X.
- **Data source — the key open decision (B3):** the PRD names **Dash Social** as primary. **Dash Social is NOT a Supermetrics connector** (confirmed) → it must be built as a **net-new integration** (its own API client, like `lib/ga4` / `lib/hubspot`). Influencer data may come from Dash Social or a secondary source; the module must still roll influencer performance into the same view.
  - Supermetrics *does* offer authenticated organic alternatives — **Facebook Insights `FB`**, **LinkedIn Pages `LIP`**, **X Organic `TWO`**, **TikTok Organic `TIKBA`** — but **Instagram Insights `IGI` is NOT authenticated**, and none provide influencer data. So Supermetrics can't cover the PRD's channel set or influencer requirement on its own. **Recommendation: build the Dash Social connector** (per PRD); optionally supplement with Supermetrics organic connectors later.
- **KPIs (PRD):** Total Followers · Net New Followers · Views/Impressions · Total Engagements · Comments · Shares · Saves · Likes/Reactions · Engagement Rate · Profile/Page Views · Avg. Effectiveness. **Influencer KPIs:** Reach · Views/Impressions · Engagements · Follows (if provided).
- **Visualizations:** per-platform **follower growth** + **engagement** over the month; **top content** table across Organic + Influencer — Post · Platform · Source Type · Publish Date · Views/Impressions · Engagements; optional top-format/theme breakdown.
- **Decisions / open:** confirm the Dash Social API (auth, account id, rate limits, field availability) and the influencer source + field mapping; how "Source Type" (organic vs influencer) is labeled; whether channel KPI parity exists across IG/FB/LinkedIn/X in Dash Social.
- **Config:** a `dash_social_config` (account/workspace id; key env var) — shape TBD after the connector spike.
- **Acceptance:** combined Organic + Influencer in one view; follower-growth + engagement trends per platform; top content with source-type labeling spanning both.
- **Effort:** largest — gated on the Dash Social connector (Phase 2 per PRD); not a Supermetrics fast-follow.

---

## Media Tracker (PRD context, not a module)

The Renaissance media tracker (Media Coverage / Theme Tracker / Conferences / Interviews / Awards) is **contextual input, not a net-new dashboard module** this phase — the PRD notes it may already be covered by existing AEO reporting. Revisit only if a concrete gap remains (Phase 3).

---

## Verification status

- `npm run build` clean; **21/21 unit tests pass** on `feat/renaissance-dashboard`.
- Modules 1 & 2 rendered end-to-end against live Renaissance data in a local preview; every task task-reviewed; both passed a final whole-branch review.

## Next steps

1. Confirm **B1** (key) + **B2** (action map) with Amir.
2. **Module 3 — LinkedIn:** brainstorm → spec → plan → build on `feat/renaissance-dashboard` (fast follow; resolve report-type handling).
3. **Module 4 — Organic + Influencer:** spike the **Dash Social connector** (B3) first, then spec the merged view.
4. Decide deployment path and run the going-live runbook.
