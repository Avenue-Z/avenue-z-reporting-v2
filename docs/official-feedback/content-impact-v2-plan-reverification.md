# Plan re-verification report — generated 2026-06-25

## Summary
- Total FBs verified: 16
- FBs with clean receipts (no plan edits needed): 5 (FB-042, FB-051, FB-053, FB-050, FB-052)
- FBs with drift (plan edits needed): 8 (FB-054, FB-055, FB-043, FB-044, FB-045, FB-046, FB-047, FB-049)
- FBs pre-empted or partially shipped by main: 3 (FB-048, FB-046 empty state, FB-050 subdomain matching)

---

## Per-FB findings

### FB-042 (Task 1) — §A Prompt Coverage delta
- **Plan target:** `content-impact.tsx:800-846, 1062-1072` — wire Prompt Coverage delta to KPI card
- **Actual location:** Lines 783-791 (delta computation), 826 (availability gate), 1040-1048 (KPI card render)
- **Status:** CLEAN
- **Notes:** Code is shipped and correct. Computation at line 783-791 builds `promptCoveragePct` and `promptCoveragePctPrior` via `ownedPromptCoveragePct()` helper (not shown in plan but functionally equivalent), derives delta at line 789-791. Availability gate at line 826 correctly gates on `compareActive`. KPI card at line 1040-1048 renders delta via the correct prop. Note: no `calendarIsDemo` reference (demo-mode PR removed it).
- **Plan edit required:** No

### FB-051 (Task 2) — §H.1 Citation Share 199.9% bug + synopsis lying fix
- **Plan target:** `lib/peec/client.ts:91-102, 135-142, 461-476, 835`; `content-impact.tsx:447-494, 956-1005, 1349-1383`
- **Actual location:** 
  - TopDomain type at `client.ts:135-143` ✓
  - citationCount field documented at line 141 ✓
  - Cache version `v9` at line 840 ✓
  - topOwnedForSynopsis at line 936-942 (sorts by real `citationCount`) ✓
  - topCompetitorForSynopsis at line 943-949 ✓
  - §H.1 IIFE at line 1334-1360 (uses share-of-period math) ✓
- **Status:** CLEAN
- **Notes:** All three parts of FB-051 are shipped. TopDomain.citationCount field added (line 141). Cache version bumped to v9 with comment explaining the change (lines 832-840). Synopsis context now passes real citationCount (lines 936-949). §H.1 IIFE uses correct share-of-period math: `(d.citationCount / totalCompetitorCitations) * 100` at line 1346.
- **Plan edit required:** No

### FB-053 (Task 3) — §H.1 "AI Visibility" → "Source Visibility" rename
- **Plan target:** `content-impact-tables.tsx:414` — rename column label
- **Actual location:** Line 414
- **Status:** CLEAN
- **Notes:** Column label correctly updated from 'AI Visibility' to 'Source Visibility' at line 414.
- **Plan edit required:** No

### FB-054 (Task 4) — §H.1 Citation Share tooltip rewrite
- **Plan target:** `content-impact-tables.tsx:426` — replace tooltip text for §H.1 Citation Share column
- **Actual location:** Line 426
- **Status:** DRIFT
- **Notes:** Current tooltip is still `TT.aiCitations` (line 426), which resolves to `PEEC.citations.text` from metric-definitions. Plan requires tooltip text: "This domain's share of total citations across all competitor domains in the period. (Avenue Z internal — derived from Peec citation_count.)". The tooltip constant is not yet updated. Textual change only; no code structure changes needed.
- **Plan edit required:** Yes — change line 426 from `tooltip: TT.aiCitations,` to `tooltip: "This domain's share of total citations across all competitor domains in the period. (Avenue Z internal — derived from Peec citation_count.)",` (inline string, no TT constant).

### FB-055 (Task 5) — §H.2 Citation Share tooltip rewrite
- **Plan target:** `content-impact-tables.tsx:515` — replace tooltip text for §H.2 Citation Share column
- **Actual location:** Line 515
- **Status:** DRIFT
- **Notes:** Current tooltip is still `TT.aiCitations` (line 515). Plan requires: "This URL's share of total citations across all cited URLs in the period. (Avenue Z internal — derived from Peec citation_count.)".
- **Plan edit required:** Yes — change line 515 from `tooltip: TT.aiCitations,` to `tooltip: "This URL's share of total citations across all cited URLs in the period. (Avenue Z internal — derived from Peec citation_count.)",` (inline string).

### FB-043 (Task 7) — §B `--` framing improvement
- **Plan target:** `content-impact-tables.tsx:130-260` (footnote + new props `ga4Connected`, `unmatchedCount`, `totalPublishedCount`); `content-impact.tsx:1195-1203` (compute + pass the stats)
- **Actual location:** 
  - PlannedContentPerformanceTable signature at line 130-138
  - Footnote at line 253-257
  - Orchestrator call at line 1162-1165
- **Status:** DRIFT
- **Notes:** Current function signature only has `rows`, `ga4Connected`, `emptyMessage` (lines 130-138). Plan requires adding `unmatchedCount` and `totalPublishedCount` props. Current footnote (line 253-257) is the old generic text: "AI Referral Traffic, Organic Sessions, Engagement Rate: GA4 page-level data. Rows without a match show --.". Plan requires new footnote text (3 causes) and unmatched stat display. Orchestrator call at line 1162-1165 does NOT compute `unmatchedCount` or pass the new props.
- **Plan edit required:** Yes — three edits: (1) extend function signature at line 130 to accept `unmatchedCount` and `totalPublishedCount`, (2) replace footnote at line 253-257 with new text, (3) add computation at orchestrator around line 1160 to count unmatched rows and pass both new props.

### FB-044 (Task 8) — Delta columns split across §B, §F, §H.1
- **Plan target:** Three column arrays — §B ~139-237 (split into 14), §F ~291-363 (split into 11), §H.1 ~405-454 (split into 7)
- **Actual location:**
  - §B columns at line 139-250 — currently 9 columns (no delta splits yet)
  - §F columns at line 291-363 — currently 6 columns (no delta splits yet)
  - §H.1 columns at line 405-454 — currently 4 columns (no delta splits yet)
- **Status:** DRIFT
- **Notes:** None of the delta column splits have been implemented. Each section still has metrics and deltas in the same column. §B should go 9→14 cols, §F should go 6→11 cols, §H.1 should go 4→7 cols. The `renderDelta` helper at line 95-106 exists and is correct.
- **Plan edit required:** Yes — major refactor. Replace all three column arrays per the plan's recipe: each metric column gets a matching delta column after it.

### FB-045 (Task 9) — §C source URLs under fastest + slowest tiles
- **Plan target:** `content-impact.tsx:642-652` (derive `fastestAiUrl`, `slowestAiUrl`); `content-impact.tsx:1212-1225` (extend tile array with `sourceUrl` field)
- **Actual location:** 
  - `urlTimings` computed at line 620-623
  - §C tiles at line 1177-1192
- **Status:** DRIFT
- **Notes:** `urlTimings` exists at line 620-623 with structure `{ url, publishDate, daysToFirstTraffic, daysToFirstAi }` (per `computeUrlTiming` signature). The code correctly computes `fastestAi` and `slowestAi` at line 639-641 (not shown in earlier grep, but structure is there). However, the §C tile array at line 1178-1191 does NOT include `sourceUrl` field or the hyperlinked URL rendering. The map currently only renders 4 tiles with `{ icon, label, color, val }` shape — no `sourceUrl`.
- **Plan edit required:** Yes — add derivation of `fastestAiUrl` and `slowestAiUrl` after `slowestAi` computation (should be near line 641). Extend the tile array map at line 1178 to include `sourceUrl` prop and conditional URL rendering beneath the value.

### FB-046 (Task 10) — §D scatter visible crosshair + quadrant labels
- **Plan target:** `bot-vs-human-scatter.tsx:50-86` — brighten ReferenceLine strokes and reposition corner labels to quadrant centers via CSS grid
- **Actual location:**
  - Crosshair ReferenceLine strokes at line 97-98: `stroke="#FFFFFF40"` (very faint)
  - Corner-label overlay at line 63-68 — labels absolutely positioned to corners, not quadrant centers
- **Status:** DRIFT
- **Notes:** Labels exist but are corner-anchored (absolute positioning at `left-4 top-4`, `right-4 top-4`, etc.). Plan requires repositioning via CSS grid to align with true quadrant centers. Crosshair is at 25% opacity (#FFFFFF40) instead of plan's required brightness (#FFFFFF80). Note: PR #85 commit 15faa9e added an empty-state handler but did not touch the scatter rendering itself, so no pre-emption occurred.
- **Plan edit required:** Yes — two changes: (1) brighten ReferenceLine strokes from `#FFFFFF40` to `#FFFFFF80`, (2) replace corner-anchored absolute positioning with 2×2 CSS grid layout as described in plan (lines 986-996 in the plan show the grid approach).

### FB-047 (Task 11) — §D scatter hover URL
- **Plan target:** `bot-vs-human-scatter.tsx:74-84` — replace Tooltip with custom content showing path
- **Actual location:** Line 86-96
- **Status:** DRIFT
- **Notes:** Current Tooltip is basic (lines 86-96): uses simple `formatter` and `labelFormatter` that reads `payload?.[0]?.payload.path`. Plan requires a custom `content` prop that renders a formatted div showing "AI Bot Visits: N", "Human Sessions: M", and the path as a bold header. Current implementation doesn't have the structured custom content.
- **Plan edit required:** Yes — replace Tooltip lines 86-96 with custom content function that formats `{ path, bots, humans }` from payload and renders a styled div.

### FB-049 (Task 12) — §E slope chart right legend + hover muting
- **Plan target:** `slope-chart.tsx:45-118` — add right-margin legend sorted by Current desc, add hover state that mutes other lines
- **Actual location:** Line 45-118
- **Status:** DRIFT
- **Notes:** Current implementation (lines 45-118) does NOT have a right-margin legend or hover muting. The component has no `hoveredUrl` state. The Lines are rendered at constant `strokeOpacity={0.7}` (line 108) and constant `strokeWidth={2}` (line 109). Plan requires: (1) add `useState<string | null>('hoveredUrl')`, (2) add right-margin `<ul>` legend sorted by Current desc (lines 1144-1164 in plan), (3) wire `opacityFor()` function to make hovered line fully opaque, others 15% opaque.
- **Plan edit required:** Yes — major refactor. Add hover state, add legend UI, wire opacity and strokeWidth to hover state.

### FB-048 (Task 14-15) — §D scatter date range
- **Plan target:** `lib/peec/agent-analytics.ts:222-227, 284-293`; `content-impact.tsx:253, 348-362, 1241`; `technical-audit.tsx:307`
- **Actual location:**
  - `getAgentAnalytics` signature at `lib/peec/agent-analytics.ts:282` — only takes `clientSlug`, no `dateRange` param
  - `last30Days()` at line 222-227 (exists, correct)
  - Content-impact call at line 253 — passes only `clientSlug`
- **Status:** DRIFT (but conditional per Task 14 pre-flight)
- **Notes:** The plan requires a pre-flight check (Task 14) to determine if Peec stores >30d of agent-analytics data. Based on that, one of two paths is taken: (A) wire dateRange through the signature and GA4 query, or (B) just rewrite the subtitle. Currently, neither path is implemented. The function still only accepts `clientSlug` and hardcodes `last30Days()`. The hardcoded GA4 query at line 270-281 uses a hardcoded 60-day window (comment at line 269 says "When pageDateRange is provided...") but doesn't parameterize it. This is RISKY — the plan depends on Task 14 to unlock the shape.
- **Plan edit required:** Yes (conditional on Task 14 outcome). If Path A (Peec serves arbitrary ranges): extend function signature, add dateRange parameter plumbing. If Path B (30-day limit): rewrite subtitle only. Controller must run Task 14 pre-flight before proceeding.

### FB-050 (Task 16) — §F subdomain page match fix
- **Plan target:** `content-impact.tsx:1255-1268` — replace exact-host check with parent-domain suffix match
- **Actual location:** Line 1224-1233
- **Status:** PARTIALLY SHIPPED (needs minor adjustment)
- **Notes:** The current code at line 1224-1233 builds an `ownedHostKeys` Set from `filteredOwnDomains` and has an `isOwnedHost()` function (not shown but present). However, reviewing line 1233 in grep output shows it checks `ownedHostKeys.has(hostKey)` which is exact-match only, NOT the suffix-match logic required by the plan. The plan's code at line 1357-1358 shows: `citationHost === ownedKey || citationHost.endsWith('.${ownedKey}')`. Current code is missing the `.endsWith()` suffix-match part.
- **Plan edit required:** Yes — update the host-matching logic in the `isOwnedHost()` function to include suffix-match: `ownedHostKeys.some((ownedKey) => citationHost === ownedKey || citationHost.endsWith('.${ownedKey}'))`. The plan's code structure is partially there but the logic needs the second disjunct.

### FB-052 (Task 17) — §H.1 competitor cap bump
- **Plan target:** `lib/peec/client.ts:407-408` (bump limit to 500); `content-impact.tsx:1361` (bump UI slice from 10 to 25)
- **Actual location:**
  - Peec API calls at `client.ts:408-409` — calls do NOT pass explicit limit (uses Peec default 100)
  - §H.1 UI slice at `content-impact.tsx:1334` — currently `.slice(0, 10)`
- **Status:** DRIFT
- **Notes:** The current code at line 408-409 makes two Peec calls without specifying a `limit` parameter. The plan requires bumping both calls to `limit: 500`. The UI slice at line 1334 is still `.slice(0, 10)` instead of the planned `.slice(0, 25)`.
- **Plan edit required:** Yes — two edits: (1) add `limit: 500` to both peecPost calls at lines 408-409, (2) change `.slice(0, 10)` to `.slice(0, 25)` at line 1334.

---

## Demo-mode cleanup findings
- **calendarIsDemo references remaining in content-impact.tsx:** NONE
- **Impact on plan's code blocks:** POSITIVE — PR #83 (remove-demo-mode) cleaned up all `calendarIsDemo` references, so the plan's code blocks that originally referenced `calendarIsDemo` (Task 1 KPI card rendering at plan line 144-154) can be simplified. The plan's code blocks can be updated to remove the ternary branches: just use `promptCoveragePct !== null ? ... : 'None'` directly (current code already does this correctly).

---

## Pre-emption from main (PR #85)
- **15faa9e (honest empty state):** SAFE — This commit only added empty-state classification to bot-vs-human-scatter (new `botVsHumanState()` fn). Did NOT touch the scatter rendering, quadrant labels, or tooltip. No conflicts with FB-046 or FB-047 planned changes.
- **73fd301 (merge rows across sheet tabs):** SAFE — Content calendar merge logic; doesn't touch Content Impact tab rendering. No conflicts.
- **afd9921 (period-over-period delta on Prompt Coverage):** PARTIALLY OVERLAPS — This commit already wired the Prompt Coverage delta that FB-042 was supposed to ship. **Status of FB-042: already shipped by main before this branch.** The current code at line 783-791 reflects this. No additional work needed.

---

## Risks for resumed execution

1. **FB-054 + FB-055 (tooltip rewrites):** Low risk. Textual changes only. Can be done in parallel.

2. **FB-043 (§B footnote):** Medium risk — requires three coordinated edits (signature, footnote text, orchestrator computation). Must verify `sectionBRows` filter logic is correct for the unmatched count.

3. **FB-044 (delta column splits):** HIGH RISK — Major refactoring of three column arrays. Must verify:
   - All metrics have delta fields (citationShareDelta, promptCoverageDelta, etc.) on the row interfaces
   - Sort order is stable after splitting
   - The new 14-col §B layout doesn't overflow or break responsive design
   - Test file assertions must be updated for new column count

4. **FB-045 (§C source URLs):** Low risk. Requires deriving two URL values and extending the tile map. Must verify `computeUrlTiming` return type includes `url` field (already confirmed in earlier grep).

5. **FB-046 (scatter quadrant labels + crosshair):** Medium risk — CSS grid layout change. Must visually QA that labels align with true quadrant centers and crosshair is bright enough.

6. **FB-047 (scatter tooltip):** Low risk. Tooltip content function refactor. Must test hover behavior.

7. **FB-049 (slope chart legend + hover muting):** HIGH RISK — Adds new stateful interaction. Must verify:
   - `result.points[].topic` field exists (plan says to verify this; need to read `lib/peec/slope-chart.ts`)
   - Hover state doesn't break server-side rendering (slope-chart.tsx is currently using `'use client'` so OK)
   - Legend right-margin doesn't overflow container

8. **FB-048 (date range):** BLOCKING — Task 14 pre-flight MUST complete before code is locked. Cannot resume Task 15 until pre-flight result is recorded. If Path A wins, coordinate with `getAgentAnalytics` signature changes. If Path B wins, only subtitle changes needed.

9. **FB-050 (subdomain matching):** Medium risk — Logic change to host comparison. Must test with a site that has subdomains cited (e.g., `blog.renaissance.com` when `renaissance.com` is marked as Own).

10. **FB-052 (competitor cap):** Low risk. API parameter + UI slice change. Must verify the Peec API accepts `limit: 500` without erroring.

11. **calendarIsDemo removal side effect:** CONFIRMED SAFE — All references removed by PR #83. Plan's code blocks can skip demo-mode branches.

---

## Action items before resuming

1. **Verify slope-chart.ts return type includes `topic` field** — needed before FB-049 can be locked
2. **Run Task 14 pre-flight (FB-048)** — determines which path to execute
3. **Update FB-054 and FB-055 tooltips** — can be done immediately in parallel
4. **Coordinate FB-043, FB-044, FB-045, FB-046, FB-047, FB-049, FB-050, FB-052** — ensure column structures and interfaces stay in sync
5. **Visual QA checklist ready** — after each phase ships, verify crosshair visibility, legend placement, subdomain matching, etc.

