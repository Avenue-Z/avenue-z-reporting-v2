# Overview iteration plan (TBD IDs)

Surgical sweep done 2026-06-22 from Tina's Overview-tab scorecard CSV. **No code touched yet.** Holding implementation until Content Impact closes — Thomas's call (2026-06-23) to finish Tina's feedback on Content Impact (and Technical Performance) before circling back here.

**ID note:** This plan originally reserved FB-020-a/b/c and FB-021. Per Thomas (2026-06-23) we reclaimed those IDs for Content Impact for sequential ordering. Specific FB IDs for the items below get assigned at implementation time after Content Impact's FB run closes. Inside this doc I keep the original a/b/c/d labels as item handles — they're not the final FB IDs.

**Source feedback:** `/Users/thomaschangavenuez/Downloads/Reporting Dash Feedback (Thomas Score Card) - Overview Tab.csv`

Four asks with content in column E:

| CSV cell | Item handle | Ask |
|---|---|---|
| **E2** | item-a | REMOVE Overview SectionHeader subtitle |
| **E7** | item-b | Visibility chart must be truly YTD + "Tracking began May 18" string is wrong |
| **E12** | item-c | REMOVE "Which prompts are AI engines answering with our brand?" chart (applies Rule #11) |
| **E11** | item-d | Biggest Winners / Biggest Losers cards must be live data, react to date range + model filter (separate PR) |

Split rationale: a/b/c are surgical, low-risk, fast (~1 hour). item-d is real data-layer work (~half-day, needs prior-period prompt-level fetch + model-aware dimensions). Keep them in separate commits / PRs for reviewability.

---

## Item-a — Remove Overview subtitle (E2)

**Tina's literal ask:** *"REMOVE: Subtitle 'Visibility, share of voice, and sentiment across tracked LLMs, with side-by-side comparison to competitors.'"*

**Files (2):**
- `components/report-sections/peec-ai/section-header.tsx:12` — change `subtitle: string` → `subtitle?: string`. Wrap the `<p>` at line 27 in `{subtitle && (...)}`.
- `components/report-sections/peec-ai/index.tsx:203` — delete the `subtitle="Visibility, share of voice..."` prop line.

**Confirmed unaffected** (all three pass their own non-empty subtitle):
- PR Influence: `components/report-sections/peec-ai/pr-influence.tsx:501`
- Technical: `components/report-sections/peec-ai/technical-audit.tsx:388`
- Content Impact: `components/report-sections/peec-ai/content-impact.tsx:589`

**Risk:** zero. **Diff:** ~3 lines.

---

## Item-b — Visibility chart truly YTD + drop "Tracking began" (E7)

**Tina's literal ask:** *"'Tracking began May 18' – this is incorrect, this workspace has been tracking data since March 28, 2025. I think that this YTD chart is changing based on the date range selector. Please make static to always show YTD."*

**The bug confirmed by code read:**
- `lib/peec/client.ts:397` fetches `trendRows` using `current` (the picker date range), not YTD.
- The chart's InfoTooltip at `components/report-sections/peec-ai/visibility-chart.tsx:55` lies: *"This chart is fixed to year-to-date and does not respond to the page date picker."*
- Same bug on Profound: `lib/profound/client.ts:438-441` feeds `dailyVisibility`/`competitorDailyVisibility` from `weeklyRes` which is picker-bound.

**Peec changes (`lib/peec/client.ts`):**

1. After the existing `parseDateRange(range)` block (line 372), compute the YTD window:
   ```ts
   const yearStart = `${new Date(mainDates.endDate).getUTCFullYear()}-01-01`
   const ytd = { start_date: yearStart, end_date: mainDates.endDate }
   ```
2. Add a second `fetchAllRows` alongside line 397:
   ```ts
   const trendRowsYTD = await fetchAllRows({ ...ytd, dimensions: ['date'] }, pid)
   ```
3. At lines 553-562 (`filteredTrendRows`/`competitorTrendRows`), route ONLY `dailyVisibility` + `competitorDailyVisibility` to use `trendRowsYTD`. Leave `weeklyVisibility`/`competitorWeeklyVisibility` on the picker-bound `trendRows` (the demand-overview consumer at `components/report-sections/demand-overview/index.tsx:195` reads `weeklyVisibility` — different audience, leave alone).
4. In `groupByDay` at line 299 — trim leading days where no data exists, so workspaces that started mid-year don't render empty bars from Jan 1.

**Profound changes (`lib/profound/client.ts`):**

- Same pattern. Add a second weekly-equivalent fetch with the YTD window around line 413 (`weeklyRes` block). Route only `dailyVisibility` (line 440) + `competitorDailyVisibility` (line 441) to use it. Leave `weeklyVisibility` alone.

**Component changes (`components/report-sections/peec-ai/visibility-chart.tsx`):**

- Line 37: delete the `trackingStart` calculation.
- Line 58: delete the `<p>Tracking began {trackingStart}</p>` line.
- Decision: leftmost x-axis bucket label communicates the natural start now that bars are trimmed.

**Open decision** (Thomas to confirm before implementation):
- (1) Drop the "Tracking began" line entirely (recommendation), OR (2) hardcode per-client first-tracking date in the clients DB table and display it accurately.

**Risk:** medium. Two extra API calls per page load (Peec + Profound YTD trends). Could cache by `${clientSlug}-${currentYear}-ytd` (refreshes once/day). **Diff:** ~25 lines.

---

## Item-c — Remove tracked-prompts chart (E12, applies Rule #11)

**Tina's literal ask:** *"REMOVE Chart: 'Which prompts are AI engines answering with our brand?' at the very bottom. This wasn't explicitly stated to remove in the initial doc, but it was not included in the recommended layout."*

This is **Rule #11** in action — the chart wasn't in her recommended layout, so it's gone.

**JSX block to delete:** `components/report-sections/peec-ai/index.tsx:270-274` — the conditional rendering both `<TrackedPromptsChart>` and `<ProfoundTrackedPromptsChart>`.

**Imports to delete in same file:**
- Line 8: `import { TrackedPromptsChart } from './tracked-prompts-chart'`
- Line 19: `import { TrackedPromptsChart as ProfoundTrackedPromptsChart } from '../profound-ai/tracked-prompts-chart'`

**Profound-side parallel render** at `components/report-sections/profound-ai/index.tsx:249-250` + import on line 6. Same chart, second mount point — **delete this too** (Rule #11 applied universally).

**Component files to delete (both):**
- `components/report-sections/peec-ai/tracked-prompts-chart.tsx`
- `components/report-sections/profound-ai/tracked-prompts-chart.tsx`

**KEEP `data.trackedPrompts` field** — five other consumers verified:
- `components/report-sections/peec-ai/pr-influence.tsx:358, 370` (opportunity matrix, FB-013)
- `components/report-sections/peec-ai/content-impact.tsx:370, 1259, 1262` (content impact)
- `components/report-sections/ai-summaries/index.tsx`
- `components/report-sections/demand-overview/index.tsx:274`
- `components/report-sections/report-generator/generator-interface.tsx`
- `lib/peec/client.ts:655` + `lib/profound/client.ts:534` (Glean synopsis input)

Pruning the data layer would break 5+ surfaces. **Render-only removal.**

**Risk:** zero. **Diff:** ~10 lines removed + 2 files deleted.

---

## Item-d — Winners/Losers live data (E11, separate branch/PR)

**Tina's literal ask:** *"This seems like static copy and should be pulling actual data. It doesn't change when a new date range or model is selected and is an exact copy of the example text I provided."*

She's right — current state is verbatim const arrays from her example doc.

**Current state:**
- `components/report-sections/peec-ai/winners-losers-cards.tsx:11-50` — two const arrays (`WINNERS` = 17 prompts, `LOSERS` = 20 prompts) from her AEO Analysis doc.
- Sandbox gate at lines 112-115: `SANDBOX_CLIENT_SLUG = 'avenue-z'`, returns `null` for other clients.
- Props: only `clientSlug`. No date range, no model awareness.

**`TrackedPrompt` type today** (`lib/peec/client.ts:156-164`):
```ts
{ text, sources, visibility, sov, position, group, topicSource }
```
No `rank`, no prior-period data. Cannot compute deltas without backfill.

### Data-layer work (`lib/peec/client.ts`)

1. **Add prior-period prompt-level fetch.** Current line 384 does `peecPost('/reports/brands', { ...current, dimensions: ['prompt_id'], limit: 2000 })`. Add the prior variant:
   ```ts
   peecPost('/reports/brands', { ...prior, dimensions: ['prompt_id'], limit: 2000 }, pid)
   ```
   One additional API call.

2. **Make prompt data model-aware** so model-filter reactivity works. Change dimensions on BOTH current + prior calls:
   ```ts
   dimensions: ['prompt_id', 'model_channel_id', 'model_id']
   ```
   Risk: bigger response payloads. `limit: 2000` may need to bump — verify in dev.

3. **Extend `TrackedPrompt`** with `priorVisibility?: number` + `priorPosition?: number` (or compute and attach a single `delta: number` field upstream).

4. **Build the prior-position map** by aggregating prior prompt-brand rows by `prompt_id`, then attach to each prompt in the `trackedPrompts` map at line 534.

### RSC compute (`components/report-sections/peec-ai/index.tsx`)

Add to `ProviderSection` (where `data` and `models` are in scope, ~line 165):

```ts
const promptDeltas = data.trackedPrompts
  .filter(p => p.priorPosition != null)
  .map(p => ({ text: p.text, rank: p.position, delta: p.priorPosition - p.position }))
const winners = [...promptDeltas].filter(d => d.delta > 0).sort((a,b) => b.delta - a.delta).slice(0, 20)
const losers  = [...promptDeltas].filter(d => d.delta < 0).sort((a,b) => a.delta - b.delta).slice(0, 20)
```

(Note: lower position number = better rank. Positive `delta` = improved.)

Apply model filter BEFORE the compute by filtering `data.trackedPrompts` to only prompts that appear under at least one selected model in the model-aware dimensions.

### Component changes (`components/report-sections/peec-ai/winners-losers-cards.tsx`)

- Delete `WINNERS` + `LOSERS` const arrays (lines 11-50).
- Add `winners: PromptDelta[]` + `losers: PromptDelta[]` props.
- Add graceful empty state: "Not enough history yet" when either array is empty (matters for new clients with < 14 days of data).

### Open decisions (Thomas to confirm before implementation)

1. **Sandbox gate:** lift it (recommendation — all clients see real winners/losers, universal-by-default per Rule #9 + Rule #11) OR keep Avenue-Z-only while validating?
2. **Profound parity:** mirror on Profound now (item-d-2) OR defer to a follow-up FB? (Recommendation: defer. Tina's screenshot was Profound data but the cards she's looking at are the Peec sandbox cards populated with her Profound numbers. Migrating Peec to live data covers the immediate ask.)

**Risk:** high. Real data-layer change. Verify:
- `limit: 2000` holds with extra dimensions.
- Empty-state behavior for thin-history clients.
- Peec API `position` semantics (1-indexed rank, lower = better — confirm in docs before sorting).

**Diff:** ~80-120 lines.

---

## Recommended execution sequence (when we resume)

1. **Wait** for Tina's Content Impact + Technical Performance feedback. Thomas wants to collect ALL feedback first before fixing anything.
2. When ready: cut new branch from `main` (suggested name: `iter/overview-recommended-layout` or `official-feedback-overview-iteration`).
3. **Commit 1:** items a + b + c together (one commit). Surgical, ~1 hour. Assigns sequential FB IDs at implementation time.
4. **Commit 2:** item-d Winners/Losers live data. Half-day. Resolve the two open decisions first. Separate FB ID.
5. **Other tabs' feedback iteration:** apply Rule #11 retroactively to PR Influence and the not-yet-started tabs as their feedback arrives.

## State at planning time

| Item | Value |
|---|---|
| Branch | `official-feedback-pr-influence-tab` (kept alive, PR Influence batch already shipped + merged) |
| Local HEAD | `54eb970` |
| Remote HEAD | `54eb970` (in sync) |
| Working tree | clean |
| Next FB ID after these | FB-022 |
| Sandbox gates intact | Yes (`winners-losers-cards.tsx:112,115`, `sentiment-insights.tsx:22,161`) |
| Tracked-prompts chart still rendering | Yes (intentional hold per Thomas — waiting for full Overview pass) |

## CSV row → action mapping (quick lookup)

| CSV cell | Status in spec | Item |
|---|---|---|
| D2 ⚠️ + E2 | Plan complete | item-a (FB ID TBD) |
| D7 ⚠️ + E7 | Plan complete (1 open decision) | item-b (FB ID TBD) |
| D11 ⚠️ + E11 | Plan complete (2 open decisions) | item-d (FB ID TBD) |
| E12 (free-standing add) | Plan complete | item-c (FB ID TBD) |
| All rows with D=✅ (3,4,5,6,8,9,10) | No action — Tina accepted as shipped | n/a |
