# Remove Demo Mode (sample-data toggle) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the global demo-mode toggle so every user always sees real data; delete the `lib/demo-data/*` sample datasets and the toggle plumbing.

**Architecture:** The `demoMode` prop already defaults to `false` everywhere, so the real-data code path already exists. Task 1 decommissions the plumbing that could ever set it true (DB flag → JWT → `resolveDemoMode` → router prop → sidebar toggle), leaving the build green with every section defaulting to real data. Tasks 2–5 then delete the now-unreachable demo branches inside each peec-ai slice (these touch disjoint files and run in parallel). Task 6 deletes the orphaned datasets and runs the final sweep.

**Tech Stack:** Next.js 15 (App Router, RSC), TypeScript (strict), Drizzle ORM, npm.

## Global Constraints

- **Out of scope — do NOT touch:** the demo *login* system — `app/actions/demo-auth.ts`, `lib/demo-auth.ts` (`getDemoSession`, `demo-session` cookie), the `demo-session` read in `app/api/glean/meeting-brief/route.ts`, the `demoLogout` form in `components/layout/portal-sidebar.tsx`, and the demo-login buttons on the login page.
- **Out of scope — do NOT touch:** per-section *local* fallback data in non-peec sections (`DEMO_KPIS`, local `isDemo`, etc. in `reddit-ads`, `exec-summary`, `tiktok-shop`, `bing-ads`, `snapchat-ads`, `ticket-sales`, `blended-performance`, `gohighlevel`, `shopify-performance`, `email-marketing`, `ffci`, `pr-placements`). These are independent of the toggle.
- **Keep the `demo_mode` DB column.** No Drizzle migration in this PR. The deferred column drop is recorded in `MIGRATIONS-PENDING.md` (Task 6) and a `// TODO` in `lib/db/schema.ts` (Task 1).
- **Verification per task:** `npx tsc --noEmit` must be clean. There are no unit tests for these RSC sections; the TypeScript compiler is the test — an orphaned reference to a removed symbol is a compile error.
- Match existing code style. Touch only lines tied to demo-mode removal.

---

## Dependency graph (for parallel execution)

```
Task 1  (FOUNDATION — must finish first; blocks everything)
   │
   ├── Task 2  index.tsx                                   ┐
   ├── Task 3  pr-influence.tsx + sentiment-insights-section.tsx  │  PARALLEL
   ├── Task 4  content-impact.tsx                          │  (disjoint files)
   └── Task 5  technical-audit.tsx + technical-audit-tables.tsx   ┘
                              │
                          Task 6  (FINAL — delete datasets + sweep)
```

**Why this order:** Tasks 2–5 import from `lib/demo-data/*`, so that directory can only be deleted after all four have dropped their imports (Task 6). Task 1 must precede 2–5 because it removes the only callers that pass `demoMode=true`; afterward each section's `demoMode?` optional prop simply defaults to `false`, so the demo branches are dead and safe to delete in any order.

**File ownership (no two parallel tasks share a file):**
- Task 2 → `index.tsx` only
- Task 3 → `pr-influence.tsx`, `sentiment-insights-section.tsx`
- Task 4 → `content-impact.tsx` only
- Task 5 → `technical-audit.tsx`, `technical-audit-tables.tsx`

---

### Task 1: Decommission the toggle plumbing

**Files:**
- Modify: `auth.ts`
- Modify: `types/next-auth.d.ts`
- Modify: `lib/db/schema.ts`
- Modify: `app/dashboard/layout.tsx`
- Modify: `app/tools/layout.tsx`
- Modify: `app/dashboard/[clientSlug]/reports/page.tsx`
- Modify: `app/portal/[clientSlug]/reports/[reportSlug]/page.tsx`
- Modify: `components/layout/sidebar.tsx`
- Modify: `components/layout/portal-sidebar.tsx`
- Delete: `lib/demo-data/resolve.ts`
- Delete: `app/actions/demo-mode.ts`
- Delete: `components/layout/demo-mode-toggle.tsx`

**Interfaces:**
- Consumes: nothing (foundation task).
- Produces: After this task, no code reads `session.user.demoMode`, calls `resolveDemoMode`, or passes a `demoMode` prop. The four peec report components (`PeecAIReport`, `PRInfluenceReport`, `ContentImpactReport`, `TechnicalAuditReport`) retain their optional `demoMode?: boolean` params (default `false`) — Tasks 2–5 remove those. `PageOverlapTable`/`LogAnomaliesTable`/`SentimentInsightsSection` props are untouched here.

- [ ] **Step 1: Remove `demoMode` from the auth callbacks**

In `auth.ts`, delete the three token-assignment lines and the session line. Find them with:

```bash
grep -n "demoMode" auth.ts
```

Delete `token.demoMode = clientConfig.demoMode` (the `true`-path), the two `token.demoMode = false` lines, and `session.user.demoMode = (token.demoMode as boolean | undefined) ?? false`. Leave the surrounding `token.*` / `session.user.*` assignments intact.

- [ ] **Step 2: Remove `demoMode` from the next-auth type augmentation**

In `types/next-auth.d.ts`, delete the `demoMode: boolean` line (Session `user`) and the `demoMode?: boolean` line (JWT). Find with `grep -n demoMode types/next-auth.d.ts`.

- [ ] **Step 3: Remove `demoMode` from the Drizzle users type and leave a migration TODO**

In `lib/db/schema.ts`, remove the `demoMode` field from the `users` table definition. Immediately above the `users` table declaration, add:

```typescript
// TODO(remove-demo-mode): the demo_mode column is intentionally left in the
// database for now. Drop it via a Drizzle migration in a follow-up. See
// MIGRATIONS-PENDING.md.
```

Find the field with `grep -n "demoMode\|demo_mode" lib/db/schema.ts`.

- [ ] **Step 4: Strip demo resolution from the two layouts**

In `app/dashboard/layout.tsx` and `app/tools/layout.tsx`: delete the `import { resolveDemoMode } from '@/lib/demo-data/resolve'` line, delete the `const demoModeEffective = resolveDemoMode({...})` block, and remove the `demoModeEffective={demoModeEffective}` prop from the `<Sidebar ... />` element. Remove any now-unused `cookieStore`/`cookies()` lines **only if** they were added solely for `cookieValue` and are unused afterward (verify by reading the file).

- [ ] **Step 5: Strip demo resolution from the two report routers**

In `app/dashboard/[clientSlug]/reports/page.tsx` and `app/portal/[clientSlug]/reports/[reportSlug]/page.tsx`:
- Delete the `import { resolveDemoMode } from '@/lib/demo-data/resolve'` line.
- Delete the `const demoMode = resolveDemoMode({...})` block.
- Remove the `demoMode` parameter from the `getReportComponent` / `getReportSection` helper signatures and from their call sites.
- Remove `demoMode={demoMode}` from every peec component element (`<PeecAIReport>`, `<PRInfluenceReport>`, `<ContentImpactReport>`, `<TechnicalAuditReport>`).

Locate every site with:

```bash
grep -n "demoMode\|resolveDemoMode" "app/dashboard/[clientSlug]/reports/page.tsx" "app/portal/[clientSlug]/reports/[reportSlug]/page.tsx"
```

- [ ] **Step 6: Remove the toggle from both sidebars**

In `components/layout/sidebar.tsx` and `components/layout/portal-sidebar.tsx`:
- Delete the `import { DemoModeToggle } from '@/components/layout/demo-mode-toggle'` line.
- Remove `demoModeEffective` from the component's props interface and destructuring.
- Delete the `<DemoModeToggle ... />` element.
- **Do NOT remove** the `<form action={demoLogout}>` block in `portal-sidebar.tsx` — that is the demo *login* system (out of scope).

Find with `grep -n "DemoModeToggle\|demoModeEffective" components/layout/sidebar.tsx components/layout/portal-sidebar.tsx`.

- [ ] **Step 7: Delete the three now-orphaned files**

```bash
git rm lib/demo-data/resolve.ts app/actions/demo-mode.ts components/layout/demo-mode-toggle.tsx
```

(`setDemoMode` in `app/actions/demo-mode.ts` was only imported by `demo-mode-toggle.tsx`; `resolveDemoMode` only by the layouts/routers just edited; `DemoModeToggle` only by the two sidebars just edited.)

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean exit (no errors). The peec sections still compile because their `demoMode?` props are optional and `lib/demo-data/*` still exists.

- [ ] **Step 9: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "refactor(remove-demo-mode): decommission demo-mode toggle plumbing

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Collapse demo branches in `peec-ai/index.tsx`

**Files:**
- Modify: `components/report-sections/peec-ai/index.tsx`

**Interfaces:**
- Consumes: Task 1 complete (no router passes `demoMode` to `PeecAIReport`).
- Produces: `PeecAIReport` signature loses its `demoMode?` param; internal `ProviderSection` loses its `isDemo` prop. No other file references either.

- [ ] **Step 1: Remove the `demoMode` param and demo data substitution**

In `PeecAIReport` (around line 310–387):
- Remove `demoMode = false,` from the destructured params and `demoMode?: boolean;` from the param type.
- Change `const peecConfigured = demoMode || !!config?.peecCustomerProjectId` → `const peecConfigured = !!config?.peecCustomerProjectId`.
- Same for `profoundConfigured` and `ga4Configured` (drop the `demoMode ||`).
- Delete the entire substitution block:

```typescript
  if (demoMode) {
    peecData     = samplePeecOverview()
    profoundData = sampleProfoundOverview()
  }
```

- Change `const aiNowOk = demoMode || aiNowRes.status === 'fulfilled'` → `const aiNowOk = aiNowRes.status === 'fulfilled'`. Same for `aiPriorOk`.

- [ ] **Step 2: Remove `isDemo` from the `ProviderSection` call sites and definition**

- In the two `sections.peec` / `sections.profound` assignments, delete `isDemo={demoMode}` from each `<ProviderSection ... />`.
- In the `ProviderSection` definition (starts at line 146), remove the `isDemo` prop from its props type and destructuring, and collapse any `isDemo ?`/`isDemo &&` logic inside it to the non-demo branch. Inspect with:

```bash
grep -n "isDemo" components/report-sections/peec-ai/index.tsx
```

- [ ] **Step 3: Remove orphaned demo-data imports**

Delete the now-unused imports from `@/lib/demo-data/*` (e.g. `samplePeecOverview`, `sampleProfoundOverview`, `SampleDataBadge` if present). Find with:

```bash
grep -n "lib/demo-data\|SampleDataBadge" components/report-sections/peec-ai/index.tsx
```

- [ ] **Step 4: Verify no demo references remain in this file**

Run: `grep -n "demoMode\|isDemo\|lib/demo-data\|SampleDataBadge" components/report-sections/peec-ai/index.tsx`
Expected: no output.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add components/report-sections/peec-ai/index.tsx
git commit -m "refactor(remove-demo-mode): drop demo branches from peec-ai overview

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Collapse demo branches in `pr-influence.tsx` + `sentiment-insights-section.tsx`

**Files:**
- Modify: `components/report-sections/peec-ai/pr-influence.tsx`
- Modify: `components/report-sections/peec-ai/sentiment-insights-section.tsx`

**Interfaces:**
- Consumes: Task 1 complete (router no longer passes `demoMode` to `PRInfluenceReport`).
- Produces: `PRInfluenceReport` loses its `demoMode?` param; `SentimentInsightsSection` loses its required `demoMode` prop. These two files are edited together because `pr-influence.tsx` passes `demoMode` into `SentimentInsightsSection` — they must change atomically or the required prop breaks the build.

- [ ] **Step 1: Remove `demoMode` from `SentimentInsightsSection`**

In `sentiment-insights-section.tsx`:
- Remove `demoMode,` from the destructured params and `demoMode: boolean` from the param type.
- Delete the line `if (demoMode) return <SentimentInsights data={null} />`.

Resulting function fetches and renders live data unconditionally.

- [ ] **Step 2: Remove `demoMode` from `PRInfluenceReport` signature and substitution**

In `pr-influence.tsx`:
- Remove `demoMode = false,` from params and `demoMode?: boolean;` from the param type.
- Replace `const prIsDemo = demoMode` and delete the `if (demoMode) { ... }` substitution block (around lines 252–260) that overwrites `coverage`, `urlCitations`, `urlCitationsPrior`.
- Change `const aiReferralOk = demoMode || aiReferralResult.status === 'fulfilled'` → `const aiReferralOk = aiReferralResult.status === 'fulfilled'`.

- [ ] **Step 3: Collapse all `prIsDemo` ternaries to the real-data branch**

Every `prIsDemo ? <demoValue> : <realValue>` becomes `<realValue>`; every `prIsDemo && <node>` is deleted; `const hasPR = prIsDemo` becomes the real condition (set `hasPR` to the real-data expression — for PR rows that is "a PR placement exists", which in the live path is driven by `prData`; use `false` only if no real signal exists — read the surrounding code at line ~358 to pick the honest live value). Remove the now-dead `demoBrandAbsentRows` array and the `demoShare`/`demoDelta` locals; set `brandAbsentTableRows` to the real `prIsDemo`-false branch. Delete the `<SampleDataBadge note="Demo mode — all data on this page is synthetic" />` block. Enumerate every site with:

```bash
grep -n "prIsDemo\|demoMode\|SampleDataBadge\|demoBrandAbsent\|demoShare\|demoDelta" components/report-sections/peec-ai/pr-influence.tsx
```

- [ ] **Step 4: Remove the `demoMode` prop passed to `SentimentInsightsSection`**

In the `<SentimentInsightsSection ... />` element (around line 566), delete the `demoMode={demoMode}` line.

- [ ] **Step 5: Remove orphaned demo-data imports**

Delete imports of `samplePRProofData`, `samplePeecOverview`, `SAMPLE_GA4_AI_REFERRAL_ROWS`, `SAMPLE_GA4_AI_REFERRAL_COMPARE_ROWS`, and `SampleDataBadge` from `pr-influence.tsx` (lines 7–10 region). Confirm none are still referenced first.

- [ ] **Step 6: Verify no demo references remain in either file**

Run:
```bash
grep -n "demoMode\|prIsDemo\|lib/demo-data\|SampleDataBadge" components/report-sections/peec-ai/pr-influence.tsx components/report-sections/peec-ai/sentiment-insights-section.tsx
```
Expected: no output.

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add components/report-sections/peec-ai/pr-influence.tsx components/report-sections/peec-ai/sentiment-insights-section.tsx
git commit -m "refactor(remove-demo-mode): drop demo branches from PR influence + sentiment

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Collapse demo branches in `content-impact.tsx`

**Files:**
- Modify: `components/report-sections/peec-ai/content-impact.tsx`

**Interfaces:**
- Consumes: Task 1 complete (router no longer passes `demoMode` to `ContentImpactReport`).
- Produces: `ContentImpactReport` loses its `demoMode?` param. This file passes `demoMode` to no child component, so it is fully self-contained.

- [ ] **Step 1: Remove the `demoMode` param and substitution block**

In `ContentImpactReport` (params around lines 205–211):
- Remove `demoMode = false,` from params and `demoMode?: boolean` from the param type.
- Replace `const calendarIsDemo = demoMode` and delete the `if (demoMode) { ... }` substitution block (around lines 421–427) that overwrites `urlCitations` and `coverage`.
- Change `if (!demoMode && plannedTiming.length > 0)` (around line 601) → `if (plannedTiming.length > 0)`.

- [ ] **Step 2: Collapse all `calendarIsDemo` ternaries to the real-data branch**

Mechanical rule applied to every site: `calendarIsDemo ? <demoValue> : <realValue>` → `<realValue>`; `calendarIsDemo || <realCond>` → `<realCond>`; `{calendarIsDemo && <node>}` → delete the node. This covers the KPI strip (`live={calendarIsDemo || ...}`, value ternaries ~1051–1100), the `§B` table row builders (`sectionBDemo*` arrays ~1115–1120 and their use ~1180–1191), and the timing cards (the per-card `demo:` literal and `{calendarIsDemo ? demo : val ...}` ~1213–1222). After collapsing, delete the now-unused `sectionBDemo*` arrays and remove the `demo:` key from the timing-card objects. Delete the `<SampleDataBadge note="Demo mode — all data on this page is synthetic" />` block (~1018). Enumerate every site with:

```bash
grep -n "calendarIsDemo\|demoMode\|sectionBDemo\|SampleDataBadge\|demo:" components/report-sections/peec-ai/content-impact.tsx
```

- [ ] **Step 3: Remove orphaned demo-data imports**

Delete imports of `sampleContentCalendarData`, `sampleAgentAnalytics`, `samplePeecOverview`, `SAMPLE_GA4_CONTENT_IMPACT_ROWS`, and `SampleDataBadge` (lines 17–21 region), after confirming none remain referenced.

- [ ] **Step 4: Verify no demo references remain in this file**

Run: `grep -n "demoMode\|calendarIsDemo\|sectionBDemo\|lib/demo-data\|SampleDataBadge" components/report-sections/peec-ai/content-impact.tsx`
Expected: no output.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add components/report-sections/peec-ai/content-impact.tsx
git commit -m "refactor(remove-demo-mode): drop demo branches from content impact

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Collapse demo branches in `technical-audit.tsx` + `technical-audit-tables.tsx`

**Files:**
- Modify: `components/report-sections/peec-ai/technical-audit.tsx`
- Modify: `components/report-sections/peec-ai/technical-audit-tables.tsx`

**Interfaces:**
- Consumes: Task 1 complete (router no longer passes `demoMode` to `TechnicalAuditReport`).
- Produces: `TechnicalAuditReport` loses its `demoMode?` param; `PageOverlapTable` and `LogAnomaliesTable` lose their `demoMode?` props. Edited together because `technical-audit.tsx` passes `demoMode` into both tables.

- [ ] **Step 1: Remove `demoMode` from `TechnicalAuditReport`**

In `technical-audit.tsx`:
- Remove `demoMode = false` from params and `demoMode?: boolean` from the param type.
- Change `const clientDomain = demoMode ? 'avenuez.com' : (clientConfig?.domain ?? '')` → `const clientDomain = clientConfig?.domain ?? ''`.
- Delete the `if (demoMode) { ... }` substitution block (around lines 328–332).
- Change `if (!demoMode && ga4AiPathRows)` (around line 347) → `if (ga4AiPathRows)`.
- Change `badge={demoMode ? <SampleDataBadge /> : undefined}` (around line 389) → `badge={undefined}` (or remove the `badge` prop entirely if `undefined` is its default — read the consuming component to confirm).
- Remove `demoMode={demoMode}` from `<PageOverlapTable ... />` (line 468) and `<LogAnomaliesTable ... />` (line 480).

- [ ] **Step 2: Remove `demoMode` from the two table components**

In `technical-audit-tables.tsx`:
- `PageOverlapTable` (line 381): remove `demoMode = false` from destructuring and `demoMode?: boolean` from `PageOverlapTableProps`. Collapse the `demoMode ? demoCites[...] : <real>` and `demoMode ? demoIndex[...] : <real>` ternaries (~420–424) to their real branches; delete the now-unused `demoCites`/`demoIndex` arrays.
- `LogAnomaliesTable` (line 599): remove `demoMode = false` from destructuring and `demoMode?: boolean` from `LogAnomaliesTableProps`. Collapse any `demoMode ?` ternaries to the real branch.

Enumerate every site with:

```bash
grep -n "demoMode\|demoCites\|demoIndex" components/report-sections/peec-ai/technical-audit-tables.tsx
```

- [ ] **Step 3: Remove orphaned demo-data imports**

In `technical-audit.tsx` delete imports of `sampleSFData`, `sampleAgentAnalytics`, `sampleSitebulbData`, and `SampleDataBadge` (lines 14–17 region), after confirming none remain referenced.

- [ ] **Step 4: Verify no demo references remain in either file**

Run:
```bash
grep -n "demoMode\|demoCites\|demoIndex\|lib/demo-data\|SampleDataBadge" components/report-sections/peec-ai/technical-audit.tsx components/report-sections/peec-ai/technical-audit-tables.tsx
```
Expected: no output.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add components/report-sections/peec-ai/technical-audit.tsx components/report-sections/peec-ai/technical-audit-tables.tsx
git commit -m "refactor(remove-demo-mode): drop demo branches from technical audit

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Delete the datasets and run the final sweep

**Files:**
- Delete: entire `lib/demo-data/` directory
- Create: `MIGRATIONS-PENDING.md`

**Interfaces:**
- Consumes: Tasks 2–5 complete (no file imports `@/lib/demo-data/*` any more).

- [ ] **Step 1: Confirm nothing imports the datasets**

Run: `grep -rn "lib/demo-data\|@/lib/demo-data" app components lib auth.ts types`
Expected: no output. (If anything appears, the owning Task 2–5 is incomplete — stop and fix it there.)

- [ ] **Step 2: Delete the directory**

```bash
git rm -r lib/demo-data
```

- [ ] **Step 3: Record the deferred column drop**

Create `MIGRATIONS-PENDING.md` at the repo root with:

```markdown
# Pending Migrations

Schema changes that have been removed from application code but not yet
applied to the database.

## Drop `users.demo_mode` column

The demo-mode toggle was removed in `feat/remove-demo-mode` (2026-06-25). The
`demoMode` field was removed from `lib/db/schema.ts`, but the `demo_mode`
column is still present in the database. Generate and run a Drizzle migration
to drop it:

    npm run db:generate   # produces the DROP COLUMN migration
    npm run db:migrate
```

- [ ] **Step 4: Final sweep — toggle symbols fully gone**

Run:
```bash
grep -rn "demoMode\|resolveDemoMode\|DemoModeToggle\|SampleDataBadge\|lib/demo-data\|demoModeEffective" app components lib auth.ts types
```
Expected: no output.

- [ ] **Step 5: Sanity check — demo LOGIN system untouched**

Run:
```bash
grep -rln "demo-session\|getDemoSession\|demoLogin\|demoLogout" app components lib
```
Expected: still lists `app/actions/demo-auth.ts`, `lib/demo-auth.ts`, `components/layout/portal-sidebar.tsx`, `app/api/glean/meeting-brief/route.ts`, and the login page — confirming the login system was preserved.

- [ ] **Step 6: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: both clean.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(remove-demo-mode): delete sample datasets, note pending column drop

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-review notes

- **Spec coverage:** auth/types/schema (Task 1 S1–S3), resolver+toggle+layouts+routers+sidebars (Task 1 S4–S7), peec sections (Tasks 2–5), dataset deletion + migration note + verification (Task 6). All spec sections mapped.
- **Out-of-scope guardrails:** demo-login preservation is a Global Constraint and re-verified in Task 6 S5; local fallbacks are explicitly excluded and no task touches non-peec sections.
- **Type consistency:** the coupled prop pairs (router→reports, pr-influence→sentiment, technical-audit→tables) are each removed within a single task, so no intermediate state has a parent passing a prop a child no longer accepts. `SentimentInsightsSection`'s `demoMode` is required, which is why Task 3 keeps both files together.
- **Repetitive ternary collapse** (Tasks 3–4) is specified as an explicit mechanical rule plus the exact `grep` that enumerates every site, rather than reproducing ~1000 lines verbatim — the engineer applies the rule to each grep hit and verifies zero remain.
