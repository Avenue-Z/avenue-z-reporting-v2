# AEO Overview v2 — Slice 6 (01 · Snapshot KPIs) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `kpi-cards@2`, section 01 of the v2 Overview: up to five KPI tiles chosen per client from a 9-KPI catalog, each with a source badge, a unit-labelled delta and a footer, plus a staff-only **Edit KPIs** panel that saves the choice through its own server action.

**Architecture:** The KPI ids and their storage validation live in `lib/report-sections/aeo-kpis.ts` (the stored contract); labels, units and value math live in `components/report-sections/peec-ai/v2/`. The choice is stored as `report_section_config['peec-ai'].kpis`, written only by a new staff-only action `setAeoKpis`, and carried untouched by `saveReportSectionConfig` (the `clientVisible` pattern). GA4 figures for the tiles come from a new v2-only fetch (`lib/ga4/ai-kpis.ts`) that filters AI sources server-side and reads period totals without a row cap; v1's `aiTraffic` query is left as it is.

**Tech Stack:** Next.js 16 App Router (RSC + one client component), TypeScript strict, Tailwind v4, GA4 Data API via `ga4Query`, vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-11-24-aeo-overview-v2-design.md` (on `origin/docs/aeo-overview-v2-spec`): sections 5.4, 6 "01 · Snapshot KPIs", 7, 9, 10. Format and foundation: `docs/superpowers/plans/2026-11-25-aeo-overview-v2-slice-1-foundation.md`. Executors read both.

**Depends on:** slice 1 (PR #532, `feat/aeo-overview-v2-foundation`) merged into `dev`. Do not start Task 1 before that. Slices 2–5 (Tracks A and B) edit the same shared files (`v2/sections.ts`, `parts/registry.ts`, `parts/export-layout.ts`, `ctx.ts`, the ctx fixture, `index.tsx`): expect one-line merge conflicts there and rebase on `dev` before opening the PR.

**Where to work:** a fresh worktree on a new branch cut from `origin/dev` after #532 merges, outside `.claude/` (memory: `check:rsc` scans nothing under `/.claude/`; a symlinked `node_modules` breaks `next build`):

```bash
git -C /Users/paulramirez/Documents/Projects/reporting-dashboard-renaissance fetch origin
git -C /Users/paulramirez/Documents/Projects/reporting-dashboard-renaissance worktree add -b feat/aeo-overview-v2-kpis /Users/paulramirez/Documents/Projects/.wt-aeo-v2-slice6 origin/dev
cd /Users/paulramirez/Documents/Projects/.wt-aeo-v2-slice6 && npm ci
```

## Decisions this plan makes (confirm with Paul before Task 3)

1. **AI search leads use the client's lead-event allowlist when it has one.** Tina's Q4 answer is "GA4 conversions (key events) by default, per-client customization later". The live check (below) shows Renaissance's key events are 96% `outbound_click` and `pdf_view`: 198 "leads" from AI sessions in the last 30 days, of which 4 are real leads. The per-client customization already exists: `clients.ga4_config.leadEvents` (`lib/db/schema.ts:91`, `lib/ga4/lead-events.ts`), set for Renaissance and used by the Executive Overview. So: allowlist configured → leads = `eventCount` of those events from AI sources; not configured → `keyEvents` from AI sources. The tile footer names which. This also keeps the AEO page's leads in step with the Executive Overview (spec anti-goal: one number, two answers). If Paul or Tina want key events regardless, it is one branch in `summarizeAiKpis`.
2. **Peec sentiment is rescaled.** `BrandRanking.sentiment` is `sentiment_sum / sentiment_count`, which is on a −1..1 scale (Renaissance 0.17). Peec's own score is 0–100 (Renaissance 59) and equals `50 × (1 + raw)` for all 29 brands (live check). The tile shows `peecSentimentScore(raw)`, rounded; Δ is `50 × sentimentDelta` in pts. The fetcher is not changed (nothing displays it today; changing it would move v1 cache values).
3. **Profound "Used as a source %" is unavailable** unless Task 6's probe finds a retrieval-share metric: Profound's `retrieved` is citation share (`lib/profound/client.ts:94`), a different number. Unavailable KPIs show disabled in the editor with "Not available from Profound" and are dropped from the default five.
4. **With a model filter active**, every Δ is hidden (v1's rule), rank and sentiment show `--` with "Not available with a model filter", and the other tiles use the filtered figures (detail in Task 4).

## Live check (2026-11-25, read-only, Renaissance, `last_30_days` = 2026-10-26..2026-11-24)

Scripts ran with `CACHE_DISABLE=1 npx tsx --env-file=.env.local`, calling `ga4QueryUncached` and `getPeecOverview`; nothing was written anywhere.

| Query (`ga4Query` params) | Result |
|---|---|
| `metrics: ['sessions','keyEvents'], dimensions: ['sessionSource'], limit: 150` | Works. Rows `{ sessionSource: 'chatgpt.com', sessions: 225, keyEvents: 195 }` (metrics are numbers, dimension a string). `rows.length` 150, **`rowCount` 325**: 175 sources cut. AI rows: chatgpt.com 225/195, gemini.google.com 9/3 → 234 sessions, 198 key events. |
| same, prior window 2026-09-26..2026-10-25 | `rowCount` 596. The 150 cap **already loses AI sources**: 99 AI sessions capped vs 104 uncapped (gemini, search.brave.com, claude.ai dropped). Same loss in YTD (876 vs 881). This is a live v1 bug in the AI Referral Traffic delta (filed below, not fixed here). |
| same + `dimensionFilter` = `orGroup` of `CONTAINS` (case-insensitive) on `sessionSource`, one per `AI_REFERRER_DOMAINS` entry, `limit: 1000` | Matches a full uncapped scan + `isAiSource` exactly in all four windows tested (current 234/198, prior 104/82, prior year 65/32, YTD 881/678). Use this. (A loose regex also matched the search engine `bing`, 1,931 sessions: don't.) |
| `metrics: ['sessions','keyEvents','sessionKeyEventRate']`, no dimensions | `{ rows: [{ sessions: 28785, keyEvents: 17809, sessionKeyEventRate: 0.4089 }], rowCount: 1 }`. **The period total.** Summing the `sessionSource` rows gives 28,272 even uncapped, so share of traffic must use this query, not a sum. |
| `metrics: ['keyEvents','sessions'], dimensions: ['eventName']` + the AI filter | `outbound_click` 190, `pdf_view` 4, `contact_individual_lead` 2, `broker_group_lead` 1, `via_form` 1. |
| `metrics: ['eventCount'], dimensions: ['sessionSource','eventName']`, filter `andGroup[AI filter, leadEventFilter(ga4Config)]` | Works (session-scoped source with event-scoped event name). Current 4 leads, prior 1, YTD 20, all chatgpt.com. Rows `{ sessionSource, eventName, eventCount }`. Sitewide lead events 148. |
| `getPeecOverview('renaissance','last_30_days')` | `brandRankings.length` 29, client `rank` 9 (Tina's "#9 of 29"), visibility 24.94 (Δ −3.98), sov 4.03 (Δ −2.10), sentiment 0.17 (see decision 2). One `topDomains` row with `type: 'Own'`: renaissancebenefits.com, `retrieved` 36.95, `retrievedDelta` −10.28. `competitorAverages` visibility 19.73, sov 3.43. |

Resulting Renaissance tiles for that window: visibility 24.9% (−4.0 pts), SoV 4.0% (−2.1 pts), rank #9 of 29, used as a source 37.0% (−10.3 pts), sentiment 59, AI sessions 234 (+125.0% vs 104), share of traffic 0.8% (+0.6 pts vs 104/41,618), AI leads 4 (+300.0%), CVR 1.7% (+0.7 pts).

## Global Constraints

- v1 output must not change: no edits to `parts/kpi-cards.tsx` or any existing golden; no `-u` on any existing snapshot; `parity.golden.test.tsx` and every `parts/*.golden.test.tsx` stay green untouched. A v1 client's fetch calls are unchanged (no new GA4 request unless the layout is v2).
- Part id/version: `kpi-cards` version **2**, file `parts/kpi-cards.v2.tsx`, `published: true`, `defaultLabel: 'Snapshot KPIs'`. `V2_PART_SECTIONS` gains `'kpi-cards@2': '01'`. `PEEC_EXPORT_LAYOUT` gains `'kpi-cards@2': 'block'`.
- Storage: `report_section_config['peec-ai'].kpis` (exact shape in Task 2). Absent = never saved (defaults apply); `[]` = staff chose none.
- Max 5 KPIs, rendered in catalog order (no reordering, spec non-goal).
- Only `INTERNAL_ADMIN` / `INTERNAL_ANALYST` (`isInternalStaff`) may write `kpis`; `CLIENT_ADMIN` never. `saveReportSectionConfig` neither accepts nor wipes it.
- Δ units (spec 5.3): visibility, SoV, used as a source, share of traffic, CVR, sentiment → `pts`; sessions, leads → `pct`; rank → `places` computed as prior − current. Every Δ uses `betterWhen: 'higher'`. Text from `formatDelta`, colour from `deltaTone(value, 'higher', unit)`; no prior → `–` with title `No comparison data`, never `0`.
- Delta colours: good `text-[#60FF80]`, bad `text-[#FF4444]`, neutral `text-text-muted` (slice 1).
- All tiles use the one selected comparison window (`ctx.compare`); no tile computes its own window.
- `'use client'` only on `v2/kpi-editor.tsx`; it receives data props only, no functions (`npm run check:rsc`). No `any`.
- New `lib/ga4/*.test.ts` files must be added to the `vitest.config.ts` `include` list (memory: unlisted lib tests are silently skipped).

## Review Focus

1. **A hand-edited or garbage `kpis` value in the jsonb** (`"oops"`, `["visibility","bogus"]`, seven ids, duplicates). Expect the page to render: non-array → defaults with one `console.warn` naming the slug; unknown ids dropped; duplicates collapsed; capped at 5. Test: Task 1 (`readSavedKpis`).
2. **The prior window had zero AI sessions or zero leads.** Expect `–`, not `+Infinity%` or `NaN`. Test: Task 4 (`prior zero gives no delta`).
3. **GA4 is configured but its request fails.** Expect GA4 tiles to show `--` with "GA4 data unavailable" (not "Source not connected"), and the AEO tiles to render normally. Test: Task 4 (`ga4 error`).
4. **A client viewer whose saved KPIs are all GA4, on a client without GA4.** Expect no section 01 and no 01 nav entry for the client; staff see disabled tiles reading "Source not connected". Test: Task 5 (`client sees no empty section`).
5. **A model filter (`models=ChatGPT`) is active.** Expect GA4 tiles counted from ChatGPT referrers only, rank and sentiment `--` with "Not available with a model filter", no Δ lines anywhere. Test: Task 4 (`model filter`).

## Edge cases (the six categories, for the commit bodies)

| Category | Item | Mark |
|---|---|---|
| External failure | GA4 query rejects or times out → `{ status: 'error' }`, tiles show `--`; Peec/Profound failure already handled by the section | fix (Task 3/4) |
| External failure | Profound sentiment call fails → sentiment tile `--` "Profound data unavailable" | fix (Task 6) |
| Operator visibility | GA4 KPI fetch failure logs `[aeo-kpis] ga4 failed slug=<slug> window=<iso> error=<name>`; bad stored `kpis` logs `[aeo-kpis] invalid stored kpis slug=<slug>` | fix |
| Bounds | AI-filtered query `limit: 1000` (14 referrer domains); totals query returns one row; selection ≤ 5 | fix |
| Input boundaries | `kpis` from the action wire (strict parse) and from jsonb (tolerant read); `ga4_config` read only through `hasLeadEvents` | fix |
| State / concurrency | Two staff save at once: last write wins over the whole `report_section_config` row (same as every other writer in `report-sections.ts`) | decline (existing behaviour) |
| Security | Non-staff calling `setAeoKpis` → `forbidden`; `CLIENT_ADMIN` smuggling `kpis` through `saveReportSectionConfig` → rejected; no secrets or event names logged beyond the slug | fix |
| Pre-existing | v1 AI Referral Traffic uses `limit: 150` and drops AI sources (prior window 99 vs 104) | file (issue, after this PR) |

---

### Task 1: KPI ids, catalog and selection rules

**Files:**
- Create: `lib/report-sections/aeo-kpis.ts`
- Create: `components/report-sections/peec-ai/v2/kpi-catalog.ts`
- Test: `lib/report-sections/aeo-kpis.test.ts`, `components/report-sections/peec-ai/v2/kpi-catalog.test.ts`

**Interfaces:**
- Produces (`lib/report-sections/aeo-kpis.ts`, the storage contract):
  - `AEO_KPI_IDS = ['visibility', 'share-of-voice', 'visibility-rank', 'used-as-source', 'sentiment', 'ai-sessions', 'ai-traffic-share', 'ai-leads', 'ai-cvr'] as const` (catalog order = render order)
  - `type KpiId = (typeof AEO_KPI_IDS)[number]`
  - `MAX_KPIS = 5`
  - `DEFAULT_KPIS: readonly KpiId[] = ['visibility', 'share-of-voice', 'used-as-source', 'ai-sessions', 'ai-leads']`
  - `parseKpiSelection(raw: unknown): KpiId[]` — strict, for writes. Throws `Error('invalid kpis')` (not an array or a non-string element), `` `unknown kpi ${id}` ``, `` `duplicate kpi ${id}` ``, `` `at most ${MAX_KPIS} kpis` ``. Returns the ids in catalog order.
  - `readSavedKpis(raw: unknown, slug: string): KpiId[] | null` — tolerant, for reads. `undefined` → `null`; non-array → `null` plus `console.warn('[aeo-kpis] invalid stored kpis slug=' + slug)`; array → known ids only, deduped, catalog order, first 5.
- Produces (`v2/kpi-catalog.ts`, presentation):
  - `type KpiSource = 'aeo' | 'ga4'`
  - `KPI_CATALOG: Record<KpiId, { label: string; source: KpiSource; unit: DeltaUnit }>` with labels exactly: `AI visibility`, `AI share of voice`, `AI visibility rank`, `Used as a source %`, `Sentiment`, `AI search sessions`, `Share of traffic from AI`, `AI search leads`, `AI search CVR`. Sources: the first five `aeo`, the rest `ga4`. Units per Global Constraints.
  - `type KpiAvailability = { ga4Connected: boolean; provider: AeoProvider }`
  - `unavailableReason(id: KpiId, a: KpiAvailability): string | null` → `'Source not connected'` for a `ga4` KPI when `!ga4Connected`; `'Not available from Profound'` for `used-as-source` when `provider === 'profound'` (until Task 6 says otherwise); else `null`.
  - `effectiveKpis(saved: KpiId[] | null, a: KpiAvailability): KpiId[]` — `saved === null` → `DEFAULT_KPIS` minus any with an `unavailableReason`; otherwise `saved` unchanged (rendering decides disabled vs hidden).
  - `peecSentimentScore(raw: number): number` → `50 * (1 + raw)`.

- [ ] **Step 1: Write the failing tests**
  - `aeo-kpis.test.ts`:
    - `parseKpiSelection(['ai-leads','visibility'])` → `['visibility','ai-leads']`; `[]` → `[]`.
    - throws: `'nope'` → `invalid kpis`; `[1]` → `invalid kpis`; `['bogus']` → `unknown kpi bogus`; `['sentiment','sentiment']` → `duplicate kpi sentiment`; six valid ids → `at most 5 kpis`.
    - `readSavedKpis(undefined,'x')` → `null`, no warn; `readSavedKpis('oops','x')` → `null` and `console.warn` called once with a string containing `slug=x`; `readSavedKpis(['ai-cvr','bogus','visibility','visibility'],'x')` → `['visibility','ai-cvr']`; all nine ids → the first five in catalog order; `[]` → `[]`.
  - `kpi-catalog.test.ts`:
    - every id in `AEO_KPI_IDS` has a `KPI_CATALOG` entry; `KPI_CATALOG['visibility-rank'].unit === 'places'`, `['ai-sessions'].unit === 'pct'`, `['ai-cvr'].unit === 'pts'`.
    - `effectiveKpis(null, { ga4Connected: true, provider: 'peec' })` → `DEFAULT_KPIS`; with `ga4Connected: false` → `['visibility','share-of-voice','used-as-source']`; with `provider: 'profound'` → `['visibility','share-of-voice','ai-sessions','ai-leads']`; `effectiveKpis(['ai-leads'], { ga4Connected: false, provider: 'peec' })` → `['ai-leads']`.
    - `unavailableReason('ai-cvr', { ga4Connected: false, provider: 'peec' })` → `'Source not connected'`.
    - `peecSentimentScore(0.17157492682106137)` rounds to 59; `peecSentimentScore(-1)` → 0; `peecSentimentScore(1)` → 100.
- [ ] **Step 2: Run** `npx vitest run lib/report-sections/aeo-kpis.test.ts components/report-sections/peec-ai/v2/kpi-catalog.test.ts` — Expected: FAIL (modules not found).
- [ ] **Step 3: Implement both files.**
- [ ] **Step 4: Run** the same command — Expected: PASS.
- [ ] **Step 5: Commit** `feat(aeo-v2): snapshot KPI ids, catalog and selection rules`

---

### Task 2: Storage field and the staff-only save action

**Files:**
- Modify: `lib/report-sections/types.ts` (`SectionOverride.kpis`)
- Modify: `lib/report-sections/mutations.ts` (`mergePreservingSharedParts`, new `applyAeoKpis`)
- Modify: `app/actions/report-sections.ts` (`saveReportSectionConfig` guard, new `setAeoKpis`)
- Test: `app/actions/report-sections.test.ts` (extend; it already mocks `auth`, `db` and `queries`)

**Storage field shape (exact):**

```ts
// lib/report-sections/types.ts, on SectionOverride
/** AEO Overview v2 Snapshot KPIs (peec-ai only): the ids the client's strip shows, catalog order, at most 5.
 *  Absent = never saved (defaults apply); [] = staff chose none. Written only by setAeoKpis. */
kpis?: KpiId[]
```

Stored jsonb, e.g. `{"peec-ai": {"versions": {"kpi-cards": 2}, "kpis": ["visibility", "share-of-voice", "used-as-source", "ai-sessions", "ai-leads"]}}`. `parseOverride` (`validate.ts`) is not changed: it never sees `kpis` because `saveReportSectionConfig` rejects it first and `setAeoKpis` validates with `parseKpiSelection`.

**Interfaces:**
- Consumes: `parseKpiSelection`, `KpiId` (Task 1); `isInternalStaff` (`lib/dashboard/permissions.ts`).
- Produces:
  - `applyAeoKpis(cfg: ReportSectionConfig, kpis: KpiId[]): ReportSectionConfig` → `{ ...cfg, 'peec-ai': { ...(cfg['peec-ai'] ?? {}), kpis } }`.
  - `mergePreservingSharedParts(prev, next)`: also drops `kpis` from `next` and carries `prev.kpis` when defined (same as `clientVisible`). Update its doc comment.
  - `saveReportSectionConfig`: when `raw` is an object with a `kpis` key → `{ ok: false, error: 'kpis is set with setAeoKpis' }`, nothing written.
  - `setAeoKpis(slug: string, kpis: unknown): Promise<Result>`: no session → `unauthenticated`; `!isInternalStaff(session.user.role)` → `forbidden`; `parseKpiSelection` throws → `{ ok: false, error: <message> }`; no client → `client not found`; else `persist(slug, applyAeoKpis(client.reportSectionConfig ?? {}, parsed))`. Only `'peec-ai'` is ever written.

- [ ] **Step 1: Write the failing tests** (reuse the file's `h`/`asRole` harness; add `setAeoKpis` to the import):
  - `test.each(['INTERNAL_ADMIN','INTERNAL_ANALYST'])('setAeoKpis saves for staff %s')`: `setAeoKpis('acme', ['ai-leads','visibility'])` → `{ ok: true }`; `h.set` called once with `reportSectionConfig['peec-ai'].kpis` equal to `['visibility','ai-leads']`.
  - `test.each([['CLIENT_ADMIN','acme'],['CLIENT_VIEWER','acme']])('setAeoKpis forbidden for %s of their own client')` → `{ ok: false, error: 'forbidden' }`, `h.set` not called.
  - `setAeoKpis with no session` → `{ ok: false, error: 'unauthenticated' }`.
  - `setAeoKpis rejects a bad payload`: six ids → `{ ok:false, error:'at most 5 kpis' }`; `['bogus']` → `unknown kpi bogus`; `'visibility'` → `invalid kpis`; `h.set` never called.
  - `setAeoKpis keeps the rest of the override`: `h.cfg = { 'peec-ai': { hidden: ['footer'], clientVisible: ['x'] }, other: { hidden: ['a'] } }` → saved `'peec-ai'` keeps `hidden` and `clientVisible`, `other` untouched.
  - `saveReportSectionConfig rejects kpis in body`: as `CLIENT_ADMIN` of `acme`, `saveReportSectionConfig('acme','peec-ai',{ kpis: ['visibility'] })` → `{ ok: false, error: 'kpis is set with setAeoKpis' }`; `h.set` not called.
  - `saveReportSectionConfig preserves kpis`: `h.cfg = { 'peec-ai': { kpis: ['ai-leads'] } }`, as `CLIENT_ADMIN` of `acme`, save `{ hidden: [] }` with `getSectionTemplate` → `null` (as mocked) → `ok: true` and saved `'peec-ai'.kpis` equals `['ai-leads']`.
  - `mergePreservingSharedParts` unit: `prev = { kpis: ['visibility'] }`, `next = { hidden: [] }` → result has `kpis: ['visibility']`; `prev = {}` → no `kpis` key.
- [ ] **Step 2: Run** `npx vitest run app/actions/report-sections.test.ts` — Expected: new tests FAIL.
- [ ] **Step 3: Implement** the three file changes.
- [ ] **Step 4: Run** `npx vitest run app/actions/report-sections.test.ts lib/report-sections` — Expected: PASS (the existing `clientVisible` tests unchanged).
- [ ] **Step 5: Commit** `feat(aeo-v2): staff-only KPI selection storage and save action` (commit body: the Security and Input-boundary rows of the edge-case table).

---

### Task 3: GA4 figures for the KPI tiles

**Files:**
- Create: `lib/ga4/ai-kpis.ts`
- Modify: `vitest.config.ts` (add `'lib/ga4/ai-kpis.test.ts'` to `include`)
- Test: `lib/ga4/ai-kpis.test.ts`

**Interfaces:**
- Consumes: `ga4Query` (`lib/ga4/client.ts`), `AI_REFERRER_DOMAINS`, `aiSourceModel` (`lib/constants.ts`), `hasLeadEvents`, `leadEventFilter` (`lib/ga4/lead-events.ts`), `Ga4Config` (`lib/db/schema.ts`), `AEOModel`.
- Produces:
  - `AI_SOURCE_FILTER: GA4DimensionFilter` = `{ orGroup: { expressions: AI_REFERRER_DOMAINS.map(d => ({ filter: { fieldName: 'sessionSource', stringFilter: { matchType: 'CONTAINS', value: d, caseSensitive: false } } })) } }`
  - `type AiKpiWindow = { totalSessions: number; bySource: { source: string; sessions: number; keyEvents: number }[]; leadsBySource: { source: string; leads: number }[] | null }` (`null` = no allowlist, leads come from `keyEvents`)
  - `fetchAiKpiWindow(clientSlug: string, isoRange: string, ga4Config: Ga4Config | null | undefined): Promise<AiKpiWindow>` — runs in parallel:
    1. `{ metrics: ['sessions'] }` (no dimensions) → `totalSessions` = `rows[0]?.sessions ?? 0`;
    2. `{ metrics: ['sessions','keyEvents'], dimensions: ['sessionSource'], limit: 1000, dimensionFilter: AI_SOURCE_FILTER }`;
    3. only when `hasLeadEvents(ga4Config)`: `{ metrics: ['eventCount'], dimensions: ['sessionSource','eventName'], limit: 1000, dimensionFilter: { andGroup: { expressions: [AI_SOURCE_FILTER, leadEventFilter(ga4Config)] } } }`, summed per source.
    Any rejection rejects the whole call (the caller maps it to `status: 'error'`).
  - `type Ga4KpiState = { status: 'not-configured' } | { status: 'error' } | { status: 'ok'; now: AiKpiWindow; prior: AiKpiWindow | null }`
  - `summarizeAiKpis(w: AiKpiWindow, models: AEOModel[] | null): { sessions: number; leads: number; totalSessions: number; leadBasis: 'lead-events' | 'key-events' }` — a source counts when `models` is null, or `aiSourceModel(source)` is in `models`; `leads` sums `leadsBySource` when non-null (basis `'lead-events'`), else `keyEvents` (basis `'key-events'`).

- [ ] **Step 1: Write the failing tests** (mock `@/lib/ga4/client`'s `ga4Query` and dispatch on `params.dimensions` / `params.metrics`):
  - `AI_SOURCE_FILTER` has 14 `CONTAINS` expressions, one per `AI_REFERRER_DOMAINS` entry, all `caseSensitive: false`.
  - `fetchAiKpiWindow without an allowlist makes two requests`: `ga4Config: null` → two `ga4Query` calls; result `{ totalSessions: 28785, bySource: [{ source:'chatgpt.com', sessions:225, keyEvents:195 }, { source:'gemini.google.com', sessions:9, keyEvents:3 }], leadsBySource: null }` from the live-check rows above.
  - `fetchAiKpiWindow with an allowlist`: config `{ leadEvents: [{ name:'lead', sourceEvents:['contact_individual_lead','via_form'] }] }` → third call's `dimensionFilter.andGroup.expressions[1]` is the `inListFilter` on `eventName`; rows `[{ sessionSource:'chatgpt.com', eventName:'contact_individual_lead', eventCount:2 }, { sessionSource:'chatgpt.com', eventName:'via_form', eventCount:1 }]` → `leadsBySource: [{ source:'chatgpt.com', leads:3 }]`.
  - `fetchAiKpiWindow rejects when any request fails`.
  - `summarizeAiKpis`: the two-row window → `{ sessions: 234, leads: 198, totalSessions: 28785, leadBasis: 'key-events' }`; with `leadsBySource: [{ source:'chatgpt.com', leads: 4 }]` → `leads: 4, leadBasis: 'lead-events'`; `models: ['Gemini']` → `sessions: 9`.
- [ ] **Step 2: Run** `npx vitest run lib/ga4/ai-kpis.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `lib/ga4/ai-kpis.ts` and add the test to `vitest.config.ts`.
- [ ] **Step 4: Run** the same command — Expected: PASS.
- [ ] **Step 5: Commit** `feat(aeo-v2): GA4 AI sessions, totals and leads for the KPI strip`

---

### Task 4: Tile values, and the KPI inputs on the context

**Files:**
- Create: `components/report-sections/peec-ai/v2/kpi-values.ts`
- Modify: `components/report-sections/peec-ai/ctx.ts` (`PeecCtx.kpi`, `buildPeecCtx` arg)
- Modify: `components/report-sections/peec-ai/parts/__fixtures__/peec-ctx.ts` (add `kpi`)
- Modify: `components/report-sections/peec-ai/index.tsx` (`PeecAIReport`: read `kpis`, fetch GA4 KPI windows for v2 only)
- Test: `components/report-sections/peec-ai/v2/kpi-values.test.ts`, extend `components/report-sections/peec-ai/v2/report-compare.test.tsx`

**Interfaces:**
- Consumes: Tasks 1 and 3; `formatDelta`-compatible units, `pctChange` (`v2/delta.ts`).
- Produces:
  - On `PeecCtx`: `kpi: KpiInputs` where `type KpiInputs = { saved: KpiId[] | null; ga4Connected: boolean; ga4: Ga4KpiState; profoundSentiment: { now: number | null; prior: number | null } | null }`. `buildPeecCtx` takes optional `kpi`, default `{ saved: null, ga4Connected: false, ga4: { status: 'not-configured' }, profoundSentiment: null }`. v1 parts ignore it.
  - `type KpiTileModel = { id: KpiId; label: string; badge: 'Peec' | 'Profound' | 'GA4'; value: string; delta: number | null; unit: DeltaUnit; footer: string; state: 'ok' | 'not-connected' | 'unavailable' }`
  - `computeKpiTile(id: KpiId, ctx: PeecCtx): KpiTileModel`
  - `priorRank(rankings: BrandRanking[], you: BrandRanking): number` — prior visibility of each brand = `visibility − visibilityDelta`; result = 1 + the number of other brands with a strictly higher prior visibility.
  - `PeecAIReport` (v2 only): `saved = readSavedKpis(override?.kpis, clientSlug)`; `ga4Connected = !!config?.ga4PropertyId`; when GA4 is configured and either `saved === null` (the defaults include GA4 KPIs) or `saved` contains a KPI whose `KPI_CATALOG[id].source === 'ga4'`, `Promise.allSettled` `fetchAiKpiWindow(clientSlug, mainIso, config.ga4Config)` and, when `compareIso`, the same for `compareIso`; fulfilled → `status: 'ok'` (prior `null` if its call failed), current rejected → `status: 'error'` plus the `[aeo-kpis] ga4 failed …` log. v1 layouts make none of these calls.

Value rules for `computeKpiTile` (`you` = `ctx.you`; `fmt1(x)` = one decimal; badge `'Peec'`/`'Profound'` from `ctx.provider` for `aeo` KPIs, `'GA4'` otherwise):

| id | value | delta | footer |
|---|---|---|---|
| visibility | `fmt1(modelActive ? visFiltered : you.visibility)%` | `you.visibilityDelta` | `Competitor avg · {fmt1(competitorAverages.visibility)}%` |
| share-of-voice | `fmt1(modelActive ? mean(llmFiltered.sov) : you.sov)%` | `you.sovDelta` | `Competitor avg · {fmt1(competitorAverages.sov)}%` |
| visibility-rank | `#{you.rank} of {brandRankings.length}` | `priorRank(...) − you.rank` | `Ranked by AI visibility among tracked brands` |
| used-as-source (Peec) | first `topDomains` row with `type === 'Own'`: `fmt1(retrieved)%`; modelActive → `fmt1(mean(llmFiltered.ownDomainRetrieved))%` | `retrievedDelta` | `Answers that retrieved {domain}` (none → value `--`, footer `No owned domain cited`) |
| sentiment (Peec) | `round(peecSentimentScore(you.sentiment))` | `50 × you.sentimentDelta` | `Competitor avg · {round(peecSentimentScore(competitorAverages.sentiment))}` |
| sentiment (Profound) | `round(profoundSentiment.now)%` | `now − prior` (null if either null) | `Share of positive mentions` |
| ai-sessions | `sessions.toLocaleString()` | `pctChange(now.sessions, prior.sessions)` | `GA4 sessions from AI referrers` |
| ai-traffic-share | `fmt1(100 × sessions / totalSessions)%` | now% − prior% (null when either total is 0) | `of {totalSessions.toLocaleString()} total sessions` |
| ai-leads | `leads.toLocaleString()` | `pctChange(now.leads, prior.leads)` | `GA4 lead events from AI sessions` / `GA4 key events from AI sessions` by `leadBasis` |
| ai-cvr | `fmt1(100 × leads / sessions)%` (`--` when sessions 0) | now% − prior% (null when either has 0 sessions) | `AI search leads ÷ AI search sessions` |

Overrides, in this order: `unavailableReason` non-null → `state` `'not-connected'` (for `Source not connected`) or `'unavailable'`, value `--`, footer = the reason, delta `null`. GA4 `status: 'error'` → value `--`, footer `GA4 data unavailable`, delta `null`. No `you` (brand not identified) → every `aeo` tile value `--`, footer `Brand not identified`. `modelActive` → every delta `null`; rank and sentiment value `--`, footer `Not available with a model filter`. GA4 `prior: null` → delta `null`.

- [ ] **Step 1: Write the failing tests** in `kpi-values.test.ts`, building ctx with `buildPeecCtx` over a fixture whose numbers are the live-check figures (29 brands, client rank 9; GA4 now `{ totalSessions: 28785, sessions 234, leads 4 (lead-events) }`, prior `{ 41618, 104, 1 }`):
  - visibility → value `24.9%`, delta ≈ −3.98, unit `pts`, footer `Competitor avg · 19.7%`, badge `Peec`.
  - rank → value `#9 of 29`, unit `places`; `priorRank` on a 3-brand case `[A 50 Δ+20, You 40 Δ−15, B 35 Δ0]` (current ranks 1, 2, 3) → prior visibilities `30, 55, 35` → `1`, so the rank tile's delta is `1 − 2 = −1` (`↓ 1 place`, tone bad).
  - used-as-source → `37.0%`, delta ≈ −10.28, footer `Answers that retrieved renaissancebenefits.com`.
  - sentiment (Peec) → value `59`, delta ≈ −0.75.
  - ai-sessions → `234`, delta ≈ 125.0; ai-traffic-share → `0.8%`, delta ≈ 0.56; ai-leads → `4`, delta 300, footer `GA4 lead events from AI sessions`; ai-cvr → `1.7%`, delta ≈ 0.75.
  - `prior zero gives no delta`: prior sessions 0, leads 0 → ai-sessions, ai-leads, ai-cvr deltas `null`.
  - `ga4 error`: `ga4: { status: 'error' }`, `ga4Connected: true` → ai-sessions value `--`, footer `GA4 data unavailable`, state `ok`; visibility still `24.9%`.
  - `not connected`: `ga4Connected: false` → ai-leads state `not-connected`, footer `Source not connected`.
  - `model filter`: `models: ['ChatGPT']` → every delta `null`; rank value `--`, footer `Not available with a model filter`; ai-sessions counts chatgpt.com only.
  - `profound used-as-source` → state `unavailable`, footer `Not available from Profound`.
  - In `report-compare.test.tsx`: `v1 makes no KPI requests` (v1 layout → `ga4Query` called exactly twice, as today); `v2 with GA4 KPIs fetches both windows` (v2 map containing `kpi-cards@2`, default selection → `ga4Query` receives a call with `dimensionFilter` equal to `AI_SOURCE_FILTER` for both the current and prior ISO ranges); `v2 with no GA4 KPI saved makes no KPI requests` (`reportSectionConfig['peec-ai'].kpis = ['visibility']`).
- [ ] **Step 2: Run** `npx vitest run components/report-sections/peec-ai/v2/` — Expected: new tests FAIL.
- [ ] **Step 3: Implement** `kpi-values.ts`, the ctx field (+ fixture default), and the `PeecAIReport` fetch.
- [ ] **Step 4: Run** `npx vitest run components/report-sections/peec-ai` — Expected: PASS, including `parity.golden.test.tsx` and every `parts/*.golden.test.tsx` with no snapshot updates.
- [ ] **Step 5: Commit** `feat(aeo-v2): KPI tile values from Peec, Profound and GA4`

---

### Task 5: The `kpi-cards@2` part and the Edit KPIs panel

**Files:**
- Create: `components/report-sections/peec-ai/parts/kpi-cards.v2.tsx`
- Create: `components/report-sections/peec-ai/v2/kpi-tile.tsx` (server-renderable, no `'use client'`)
- Create: `components/report-sections/peec-ai/v2/kpi-editor.tsx` (`'use client'`)
- Modify: `components/report-sections/peec-ai/parts/registry.ts` (`'kpi-cards': { 1: kpiCardsV1, 2: kpiCardsV2 }`)
- Modify: `components/report-sections/peec-ai/v2/sections.ts` (`V2_PART_SECTIONS` gains `'kpi-cards@2': '01'`)
- Modify: `components/report-sections/peec-ai/parts/export-layout.ts` (`'kpi-cards@2': 'block'`)
- Modify: `components/report-sections/peec-ai/index.tsx` (`ProviderSection` v2 branch drops an empty strip for clients)
- Test: `components/report-sections/peec-ai/parts/kpi-cards.v2.golden.test.tsx`, `components/report-sections/peec-ai/v2/kpi-cards-v2.test.tsx`, `components/report-sections/peec-ai/v2/kpi-editor.test.tsx`

**Interfaces:**
- Consumes: Tasks 1–4; `compareSuffix`, `formatDelta`, `deltaTone` (slice 1); `setAeoKpis` (Task 2); `useExportMode`; `InfoTooltip`.
- Produces:
  - `kpiCardsV2: PartImpl<PeecCtx>` (`id: 'kpi-cards'`, `version: 2`, `published: true`, `defaultLabel: 'Snapshot KPIs'`). Render: `ids = effectiveKpis(ctx.kpi.saved, availability)`; `tiles = ids.map(id => computeKpiTile(id, ctx))`; for `audience === 'client'` drop tiles whose state is not `'ok'`. Grid `grid grid-cols-1 gap-5` plus `sm:grid-cols-2` when ≥ 2 tiles plus `lg:grid-cols-{n}` from a static map `['', 'lg:grid-cols-1', …, 'lg:grid-cols-5']` (so fewer tiles stretch). Staff (`audience === 'internal'`) with zero tiles see `No KPIs selected. Use Edit KPIs to choose up to five.`; staff always get `<KpiEditor>` above the grid.
  - `kpiStripHidden(ctx: PeecCtx): boolean` (exported from `parts/kpi-cards.v2.tsx`): `audience === 'client'` and no tile would render. `ProviderSection`'s v2 branch filters `resolved` with it for `kpi-cards@2` before `groupParts`, so section 01 and its nav entry disappear.
  - `KpiTile({ tile, showDeltas, compare }: { tile: KpiTileModel; showDeltas: boolean; compare: AeoCompare })`: label (uppercase, `text-xs font-extrabold tracking-widest text-text-muted`), badge pill with `tile.badge`, value (`text-3xl font-extrabold tabular-nums`), Δ line `` `${formatDelta(delta, unit)} ${compareSuffix(compare)}` `` coloured by `deltaTone(delta, 'higher', unit)` and rendered only when `showDeltas`; a `–` gets `title="No comparison data"`. A tile with state `not-connected`/`unavailable` renders at 50% opacity. Footer one line, `truncate`. Wrapper has `data-export-block=""`.
  - `KpiEditor({ clientSlug, selected, options }: { clientSlug: string; selected: KpiId[]; options: { id: KpiId; label: string; group: string; disabledReason: string | null }[] })`: returns `null` in export mode. Closed: a button `Edit KPIs`. Open: options grouped under their `group` heading (`Peec` or `Profound` for `aeo`, `GA4`), one checkbox each; counter `` `${n} of 5 selected` ``; unchecked boxes disabled at 5; a box with `disabledReason` is disabled and shows the reason; `Save` calls `setAeoKpis(clientSlug, ids)`, then `router.refresh()` and closes on `ok`, or shows `error` text; `Cancel` restores `selected` and closes.

- [ ] **Step 1: Write the failing tests**
  - `kpi-cards.v2.golden.test.tsx`: render `PEEC_PARTS['kpi-cards'][2]` with the fixture ctx (`audience: 'client'`, defaults, GA4 ok) → snapshot; text contains `AI visibility` and `GA4`, and does not contain `Edit KPIs`.
  - `kpi-cards-v2.test.tsx`:
    - `five tiles use lg:grid-cols-5`; `kpis: ['visibility','sentiment']` → `lg:grid-cols-2`.
    - `deltas off hides every delta line`: `showDeltas: false` → no element with text ending `vs previous period`.
    - `staff see the editor and unconnected tiles`: `audience: 'internal'`, `ga4Connected: false`, saved `['visibility','ai-leads']` → `Edit KPIs` present, text `Source not connected` present.
    - `client sees no empty section`: `audience: 'client'`, `ga4Connected: false`, saved `['ai-leads','ai-cvr']` → `kpiStripHidden(ctx)` is `true`; render `ProviderSection` with a v2 override (`versions: { 'kpi-cards': 2 }` and that `kpis`) → no `#aeo-section-01`, no `01 SNAPSHOT KPIS` nav text.
    - `staff empty state`: saved `[]`, `audience: 'internal'` → `No KPIs selected. Use Edit KPIs to choose up to five.`
  - `kpi-editor.test.tsx` (mock `next/navigation` `useRouter` → `{ refresh }`, mock `@/app/actions/report-sections` `setAeoKpis`):
    - five selected → counter `5 of 5 selected`, every unchecked box disabled.
    - a box with `disabledReason: 'Source not connected'` is disabled and the reason is visible.
    - check one, `Save` → `setAeoKpis('renaissance', [...])` called with the ids in catalog order, then `refresh` called.
    - `setAeoKpis` resolves `{ ok: false, error: 'forbidden' }` → `forbidden` shown, `refresh` not called.
    - `Cancel` after toggling → reopened panel shows the original selection.
- [ ] **Step 2: Run** `npx vitest run components/report-sections/peec-ai` — Expected: new tests FAIL.
- [ ] **Step 3: Implement** the part, tile, editor, registry/section/export-layout entries and the `ProviderSection` filter.
- [ ] **Step 4: Run** `npx vitest run components/report-sections/peec-ai && npm run check:rsc` — Expected: PASS; `export-layout.test.ts` and `guard.test.ts` green; no existing snapshot changed (only the new `kpi-cards.v2` snapshot written).
- [ ] **Step 5: Commit** `feat(aeo-v2): kpi-cards@2 strip and staff-only Edit KPIs`

---

### Task 6: Profound prompt scope and sentiment

Spec section 7: on Profound, visibility, SoV and rank use **Visibility-type** prompts and sentiment uses **Sentiment-type** prompts. Nothing in `lib/profound` filters on prompt type today. Avenue Z (Profound) is the test client.

**Files:**
- Modify: `lib/profound/sentiment.ts` (optional prompt-type scope), `lib/profound/client.ts` (only if no earlier slice already added the Visibility-type scope)
- Modify: `components/report-sections/peec-ai/index.tsx` (Profound sentiment now + prior for v2 when `sentiment` is selected)
- Modify: `components/report-sections/peec-ai/v2/kpi-catalog.ts` (`unavailableReason` for Profound `used-as-source`, per Step 1)
- Test: `lib/profound/sentiment.test.ts` (extend or create; `lib/profound/**` is already in the vitest include), `components/report-sections/peec-ai/v2/kpi-values.test.ts` (extend)

- [ ] **Step 1: Live check, read-only.** First `git log origin/dev -- lib/profound` to see whether slice 2, 3 or 4 already added a prompt-type scope to `getProfoundOverview`; if so, reuse it and skip the overview part of Step 3. Otherwise, with a scratch script (`CACHE_DISABLE=1 npx tsx --env-file=.env.local`, read endpoints only) for `avenue-z`: find how Profound's reports API exposes prompt type (the filter field name and values on `/v1/reports/visibility` and `/v1/reports/sentiment`), and whether any report gives a share of answers that retrieved the client's domain. Record request and response shapes in this plan. If there is no prompt-type filter, **stop and message Paul** before writing code.
  - **Result (2026-11-27).** Sibling live checks settled prompt scope: the visibility report is Visibility-type by construction and 422s on a prompt-type filter, and `/v1/reports/sentiment` 422s for dates on or after 2026-07-09, so sentiment moves to `/v2/reports/sentiment`. Working v2 request (Avenue Z, via `profoundPost`): `{ category_id, asset: 'Avenue Z', start_date: '2026-10-26', end_date: '2026-11-24', group_by: [], metrics: ['positive_sentiment','negative_sentiment'] }`. Trimmed response: `{"info":{"total_results":1,"asset":"Avenue Z","metrics":["positive_sentiment","negative_sentiment"]},"data":[{"positive_sentiment":77.0879,"negative_sentiment":22.9121}]}` (flat row, two shares summing to 100; `occurrence` 422s without theme/claim grouping; no data returns `data: []`). Avenue Z positive share 77.09% (2026-10-26..11-24) vs 77.97% (prior 2026-09-26..10-25). Task 6 was re-scoped to a new `lib/profound/sentiment-kpi.ts`; `getProfoundOverview` and `getProfoundSentiment` are unchanged.
- [ ] **Step 2: Write the failing tests**
  - `sentiment.test.ts`: with `promptType: 'sentiment'` the request body to `/v1/reports/sentiment` carries the filter found in Step 1; without it the body is byte-identical to today's (v1 and PR Influence unchanged).
  - If the overview scope is added here: `getProfoundOverview(slug, range, mode, { promptType: 'visibility' })` sends the filter on its visibility/brand requests; the existing call shapes are unchanged when the fourth argument is absent.
  - `kpi-values.test.ts`: Profound sentiment `{ now: 62.4, prior: 60.1 }` → value `62%`, delta ≈ 2.3, footer `Share of positive mentions`, badge `Profound`; `{ now: null, prior: 60 }` → value `--`, delta `null`.
- [ ] **Step 3: Implement.** Add the scope as an optional trailing argument so every existing call keeps its cache key (same rule as slice 1's two-argument calls). `PeecAIReport`, v2 + Profound + `sentiment` selected: `getProfoundSentiment(clientSlug, mainIso, null, models, 'sentiment')` and the same for `compareIso`; a rejection → `profoundSentiment.now = null` and a `[aeo-kpis] profound sentiment failed slug=…` log. Pass the Visibility scope to `getProfoundOverview` only for v2 layouts. If Step 1 found a real retrieval share, set it on the Profound used-as-source tile and drop the `Not available from Profound` reason; else leave it.
- [ ] **Step 4: Run** `npx vitest run lib/profound components/report-sections/peec-ai` — Expected: PASS, no snapshot updates.
- [ ] **Step 5: Commit** `feat(aeo-v2): Profound KPI prompt scope and sentiment`

---

### Task 7: Staging recipe and full gate

**Files:**
- Modify: `components/report-sections/peec-ai/MAINTAINING.md` (the `## Overview v2 layout (staging)` section slice 1 added)

- [ ] **Step 1: Document** under that heading: section 01 is `versions: { 'kpi-cards': 2 }` on the client's `report_section_config['peec-ai']` (staging Neon only until the account lead approves); the KPI choice lives in the same override's `kpis` and is set by Melena with **Edit KPIs** on the staging dashboard, never by hand-editing SQL or through `saveReportSectionConfig`; absent `kpis` = the default five; slice 7's flip script must leave `kpis` untouched (it clears only `versions`, `order`, `hidden` and `extraParts` entries); `leads` follow `clients.ga4_config.leadEvents` when set.
- [ ] **Step 2: Run the full gate:** `npm run typecheck && npm run lint && npm test && npm run check:rsc` — Expected: all PASS, no existing snapshot updated.
- [ ] **Step 3: Commit** `docs(aeo-v2): snapshot KPIs staging recipe`

---

## After the tasks

- Whole-branch review, then push `feat/aeo-overview-v2-kpis` and open a PR into `dev` (memory: stacked PRs are rejected).
- Write the review record `docs/qa/aeo-overview-v2-kpis-code-review.md` on its own `docs/` branch off `dev`, citing the feature diff range (CLAUDE.md Stage 1). §1 must answer "where does each tile's number come from" from the table in Task 4, including the lead-event allowlist and the sentiment rescale.
- On staging only, after the PR reaches staging: add `versions: { 'kpi-cards': 2 }` to Renaissance's `peec-ai` override (with whatever slices 2–5 have pinned), then Melena picks the KPIs in the editor.
- File an issue: v1 AI Referral Traffic (`components/report-sections/peec-ai/index.tsx`, `limit: 150`) drops AI sources when a window has more than 150 sources (Renaissance prior window: 99 shown, 104 real). Fix with `AI_SOURCE_FILTER`; it changes what v1 renders, so its own PR with a Renaissance proof.
