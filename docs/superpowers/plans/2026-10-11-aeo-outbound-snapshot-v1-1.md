# AEO Outbound Snapshot v1.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every word on the snapshot page editable behind an Edit button, give Ryan a "Before you send" checklist, an itinerary hub with opens he can trust, self-service settings, generation that explains itself, data contracts at every boundary, and the data-audit fixes, without changing how an existing snapshot looks.

**Architecture:** Pure library code stays in `lib/aeo-outbound/` (new: `contracts.ts`, `error-codes.ts`, `notes.ts`, `labels.ts`, `settings.ts`, `settings-store.ts`, `access.ts`, `hub-rows.ts`). Stored `data` gains `schemaVersion: 2` while a version 1 reader keeps old rows exactly as they were. The slots model grows four keys (`brand`, `window_label`, `kpis`, `page`) that are resolved from the row (never from live settings), and the page renders every word as a slot, a mirror or a fixed marker in draft only, so preview and final HTML stay AIVx. One additive migration (`0027`) adds the opens table, two columns and the settings tables; it is generated and committed, never applied here.

**Tech Stack:** Next.js 16.3.8 (App Router), React 19.2.3, TypeScript strict, Drizzle 0.45.2 on Neon (`neon-http`), Vitest 3 (jsdom 25), zod 4.3.6 (new direct dependency), Plotly.js 3.5.0 from CDN inside the report only.

**Spec:** `docs/superpowers/specs/2026-10-11-aeo-outbound-snapshot-v1-1-design.md` (v1.1, binding) amending `docs/superpowers/specs/2026-10-08-aeo-outbound-snapshot-design.md` (the main spec), both on branch `docs/aeo-outbound-audit-spec`. Read v1.1 §1 to §15 and main spec §5, §6, §7, §8, §9, §9a, §10 before any task. Read them with `git -C ~/code/reporting-aeo-outbound-ryan show docs/aeo-outbound-audit-spec:<path>`.

## Global Constraints

- **Branch.** All work happens on `feat/aeo-outbound-parts` (draft PR 368 into `dev`), in the worktree `~/code/worktrees/reporting-aeo-outbound-ryan-feat-aeo-outbound-parts` (Task 1 Step 1 creates it). No new branch, no new PR, no merge, no `gh` command from an implementer.
- **Commit and push after every task**, never before its `make check` is green: `perl -e 'alarm 120; exec @ARGV' -- git push origin feat/aeo-outbound-parts`.
- **Commit messages:** sentence-case subject, no `feat(...)` prefix, no em or en dashes, ending with the trailer line `Co-Authored-By: Claude <model> <noreply@anthropic.com>` where `<model>` is replaced by the implementer's own model name (for example `Claude Opus 5.5`). Stage files by name; never `git add -A`; run `git status --porcelain` before every commit.
- **Edge-case list in the commit body** for every task that crosses a network or process boundary, parses untrusted input or touches shared state (Tasks 1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12): the six classes (external failure, operator visibility, bounds, input boundaries, state and concurrency, security), each item marked `fix`, `file` or `decline`. Each such task below gives its list verbatim.
- **Test first** for every behavior: the failing test is written and run before the implementation. Vitest only. TypeScript strict.
- **The gate, at the end of every task:** `DATABASE_URL=postgresql://ci:ci@db.invalid/ci perl -e 'alarm 590; exec @ARGV' -- make check` run in the foreground with the Bash tool timeout set to 600000 (the tool backgrounds commands after 120 s otherwise). Exit 142 means it timed out: that is a failure, never a pass. `make check` runs typecheck, the full test suite, `check:rsc` (server-to-client props must be plain data) and `next build`.
- **Every other slow command** is bounded the same way: `perl -e 'alarm 590; exec @ARGV' -- <cmd>`, foreground, tool timeout 600000. A single test file: `perl -e 'alarm 590; exec @ARGV' -- npx vitest run <path>`.
- **Never edit:** `proxy.ts`, `auth.ts`, `lib/auth/*`, `lib/peec/*`, `lib/glean.ts`, `app/share/**`, `app/globals.css`, `components/layout/sidebar.tsx`, `lib/aeo-outbound/aivx/*` (the AIVx asset files) and `lib/aeo-outbound/__fixtures__/aivx-goldens.json` (the goldens).
- **`package.json` gains exactly one line:** `"zod": "4.3.6"` in `dependencies`, pinned exactly (my decision, v1.1 §10). `package-lock.json` changes only by what `npm install --save-exact zod@4.3.6` writes (zod 4.3.6 is already in the lockfile as a transitive dependency).
- **Shared files are append-only:** `lib/db/schema.ts` (the aeo block, lines 492 to 535, and new tables after it), `drizzle/0027_*.sql`, `drizzle/meta/0027_snapshot.json`, `drizzle/meta/_journal.json`, `MIGRATIONS-PENDING.md`. `vitest.config.ts` needs no change (its include list already covers `lib/aeo-outbound/**`, `app/api/aeo-outbound/**`, `app/snapshot/**`, `components/aeo-outbound/**` and `app/actions/**`).
- **Migration `0027` is generated and committed but NEVER applied** by anyone in this plan. No command in this plan connects to a database. Tests never need a real database: queries are checked with `.toSQL()` or `new PgDialect().sqlToQuery(...)`, and the db module is mocked where a function runs a query.
- **No em dashes or en dashes** (U+2014, U+2013) anywhere: code, comments, UI text, test names, commit messages. The ellipsis character `…` (U+2026) in UI strings is fine. The one exception is `lib/aeo-outbound/__fixtures__/v1-0-final.html`: it is v1.0's page verbatim, and AIVx's own page script (`lib/aeo-outbound/aivx/js.ts`, pinned by hash) carries one em dash in a comment. Before each commit run `perl -e 'alarm 30; exec @ARGV' -- git diff --cached -U0 -- . ':(exclude)lib/aeo-outbound/__fixtures__/v1-0-final.html' | grep -nP '[\x{2013}\x{2014}]'` and expect no output.
- **Synthetic data only** in tests and fixtures (public repo): brands like Example Co, Alpha, Beta; emails `@avenuez.com` placeholders such as `ryan@avenuez.com`, `admin@avenuez.com`; never a real prospect or client name.
- **Every user-facing string** is given verbatim in this plan. Use it exactly.
- **Line numbers** cite `feat/aeo-outbound-parts` at `06e68c0d`. When an earlier task of this plan already edited the same file, the numbers have moved: find the place by the code the step quotes, never by the number alone.
- **Data contracts amendment to the main spec (docs step, done by the coordinator, not an implementer):** on branch `docs/aeo-outbound-audit-spec`, replace the main spec's §16 bullet "Data contracts" (lines 643 to 645, "this repo is TypeScript with no validator dependency ... Boundary checks are the typed guards in §7") with: "**Data contracts:** amended by v1.1 §10 (2026-10-11): `zod` 4.3.6 is a direct dependency and every boundary is a declared schema in `lib/aeo-outbound/contracts.ts`, checked by `checkContract` with a per-boundary mode and the `CONTRACT_DISABLED` kill switch. The typed guards in §7 still run." and add to §4's "No change to `package.json`" the words "(amended by v1.1 §10: `zod` 4.3.6 only)". This keeps the main spec from contradicting the code this plan writes (round-2 MINOR 12).

## Review Focus

The five input classes or failure modes the spec implies but no spec test names, most likely to bite first. Each has a test added to the owning task.

1. **The browser clock is behind the server**, so a generating row's elapsed time is negative: the hub and editor show `0:00`, never `-0:05` or `NaN` (Task 9, `progress.test.ts` "a client clock behind the server shows 0:00").
2. **A hub search containing `%`, `_` or `\`** matches those characters literally, never as wildcards (Task 2, `store.test.ts` "search text is matched literally").
3. **Show older returns a row already on screen** (it was approved between loads and moved to the live list): the hub lists it once (Task 11, `hub.test.tsx` "Show older appends older rows once each").
4. **Ryan types a KPI value with words or another unit** ("about 15%", "15.5 pts"): grounding reports it as different from Peec and never throws (Task 6, `grounding.test.ts` "a KPI value with words or another unit is reported, never thrown on").
5. **A structural click lands while an edit is still inside its 800 ms debounce**: the frame sends that edit before the `structure` message, so the queue saves the text before the bullet list changes (Task 7, `render.frame.test.ts` "a structural click sends the pending edit first").

## Round-2 MINOR findings: where each one is handled

| # | Finding (review log, v1.1 round 2) | Task |
|---|---|---|
| 1 | `.sidebar-industry span` reset needs `letter-spacing:inherit; text-transform:inherit`, wrapper span only | 7 (`EDITOR_STYLE` targets `span.aeo-w`; the brand span has no `aeo-w`; test asserts both) |
| 2 | Defaults for `brand`, `window_label`, `kpis` come from `data` | 6 (`withDefaults` reads `data.brand`, `data.windowLabel`, `data.kpis`) |
| 3 | How the frame tells `chart` from `fixed`; Preview clicks post nothing | 7 (`data-locked="chart"` / `data-locked="fixed"`, `data-mirror`; frame tests) |
| 4 | Saved notes live in the `notes` column, shape `(string \| Note)[]`, structural PATCH returns `slots` | 3 (types), 6 (route, contract, response) |
| 5 | "About this data" for version 1 rows omits the project status | 10 (editor test "a version 1 row's About this data has no status") |
| 6 | Opens: caveat says best effort; ua_family tests Edge and Opera before Chrome, CriOS is Chrome, FxiOS is Firefox; three reason texts | 8 |
| 7 | Settings never alter existing drafts: grounding's code-set from the row; `needsValidationBlocksApprove` stays in config; settings read failure falls back to defaults with one log line | 3 (`settingsUsed` stored in data), 5 (fallback), 6 (test) |
| 8 | Concurrent settings saves: optimistic `updated_at` check and a "changed by someone else, reload" error | 2 (SQL), 5 (action) |
| 9 | `history_too_long` text built from `MAX_WINDOW_DAYS` | 9 (`failureText`) |
| 10 | Error codes travel on the error object (`PeecError.code`) | 1, 4 |
| 11 | Contract mode per boundary with per-field rules; settings-row contract failure falls back to defaults | 1, 5 |
| 12 | Main spec "no validator dependency" lines need an amendment note | Global Constraints (docs step above) |
| 13 | Tests named for the KPI comparison, the brand_name write, the brand_changed note, ua_family patterns, the code-to-text map per code, Show older, and render wording that respects the fixed-by-design exemptions | 6, 8, 9, 11, 7 |
| 14 | Hub search server-side via a query param; Show older request and response defined; per-row opens counts from an aggregate joined into the hub query | 2, 11 |
| 15 | Looks-right ticks for a list are cleared after a structural change (tested) | 10 |
| 16 | Version 1 rows: grounding on the new keys uses defaults with no numbers, and a version 1 row's flags are unchanged (tested) | 1 (fixture), 6 (test) |

## File Structure

New files:

| Path | Responsibility |
|---|---|
| `lib/aeo-outbound/error-codes.ts` | The closed list of generation error codes. |
| `lib/aeo-outbound/contracts.ts` | zod schemas per boundary, `checkContract`, `peecContract`, the kill switch. |
| `lib/aeo-outbound/notes.ts` | `Note`, `NoteKind`, `StoredNote`, group and text helpers. |
| `lib/aeo-outbound/labels.ts` | `fieldLabel(path, titles)`: one plain-words name per editable path. |
| `lib/aeo-outbound/settings-store.ts` | Reads and writes `aeo_outbound_settings` and its log (SQL only). |
| `lib/aeo-outbound/settings.ts` | Settings types, defaults from `config.ts`, row resolution through its contract, form validation, change diff. |
| `lib/aeo-outbound/access.ts` | `outboundAccess(user)`: staff, env floor, settings users and admins, one settings read per request. |
| `lib/aeo-outbound/hub-rows.ts` | `HubRow`, `toHubRow`, `cleanSearch`: the hub's plain-data row, shared by the page and the list route. |
| `lib/aeo-outbound/__fixtures__/v1-row.ts` | A version 1 row (data, slots) and its v1.0 Data block and grounding flags, captured from the unchanged code. |
| `lib/aeo-outbound/__fixtures__/v1-0-final.html` | The v1.0 final page of that row (the parity golden), generated once in Task 1. |
| `lib/aeo-outbound/v1-compat.test.ts` | Pins version 1 behaviour: Data block, grounding flags, final HTML. |
| `app/api/aeo-outbound/reports/route.ts` | `GET` Show older: the next 500 hub rows. |
| `app/tools/new-business/settings/page.tsx` | The Settings page (staff, then admin). |
| `app/actions/aeo-outbound-settings.ts` | `saveSettingsAction`. |
| `components/aeo-outbound/settings-form.tsx` | The settings form. |
| `components/aeo-outbound/confirm-dialog.tsx` | The in-app dialog (focus, trap, Escape, return focus). |
| `components/aeo-outbound/copy-link.tsx` | Copy link with feedback and the read-only fallback field. |
| `components/aeo-outbound/failure-text.ts` | Error code to plain words. |
| `components/aeo-outbound/progress.ts` | Generation progress text and the elapsed clock. |
| `components/aeo-outbound/before-you-send.tsx` | The checklist panel. |
| `components/aeo-outbound/project-picker.tsx` | The searchable project combobox. |

Modified files are listed in each task with the line ranges read at `feat/aeo-outbound-parts` `06e68c0d`.

## Task order

1. Baseline, version 1 fixtures, zod, contracts core, `PeecError.code`
2. Schema, migration `0027`, store and settings-store queries
3. Data version 2: structured notes, metrics, Data block, charts
3b. Ryan's answers (amendment 5, spec v1.1 §16.1)
3c. The share link: locked domain and the brand in the path (§16.2)
4. Peec contracts and error codes in pull, generate and the generate route
5. Settings model and `outboundAccess` everywhere
6. Slots model v1.1, labels, grounding on every slot, stored contracts, the slots route
7. Render v1.1 and the frame script
8. Opens events on the public link
9. Shared UI pieces: failure text, progress, dialog, copy link, save-queue structural items
10. The editor
11. The hub and Show older
12. Settings page
13. Migration notes and the final gate

---
### Task 1: Baseline, version 1 fixtures, zod, contracts core, `PeecError.code`

Covers v1.1 §10 (contracts core, kill switch, logging), §7 (code on the error object), §3 and §10 (the v1.0 parity golden and the version 1 reader fixtures every later task protects).

**Files:**
- Modify: `package.json` (one line in `dependencies`), `package-lock.json` (as `npm` writes it)
- Create: `lib/aeo-outbound/__fixtures__/v1-row.ts`, `lib/aeo-outbound/__fixtures__/v1-0-final.html` (generated), `lib/aeo-outbound/v1-compat.test.ts`
- Create: `lib/aeo-outbound/error-codes.ts`, `lib/aeo-outbound/contracts.ts`, `lib/aeo-outbound/contracts.test.ts`
- Modify: `lib/aeo-outbound/peec.ts:12-27` (PeecError), `lib/aeo-outbound/peec.test.ts` (append one test)
- Modify: `lib/aeo-outbound/config.ts` (append after line 37)

**Interfaces:**
- Consumes: `renderSnapshotHtml(data, slots, mode, preparedOn)` (`render.ts:34`), `dataBlock(d)` (`prompt.ts:15`), `groundingFlags(slots, d, dataText)` (`grounding.ts:16`), all unchanged in this task.
- Produces:
  - `ERROR_CODES`, `type ErrorCode`, `type PeecErrorCode`, `isErrorCode(v): v is ErrorCode` (`error-codes.ts`)
  - `class PeecError(message: string, timeout = false, rowCap = false, code: PeecErrorCode | null = null)` with `readonly code: PeecErrorCode | null`; `isPeecContractViolation(e: unknown): boolean` (`peec.ts`)
  - `type ContractMode = 'observe' | 'warn' | 'enforce'`, `CONTRACT_MODES`, `type ContractBoundary` (`config.ts`)
  - `contractsDisabled(env?): boolean`, `checkContract(boundary, schema, value, mode?, env?): ContractResult`, `type ContractIssue = { field: string; issue: string }`, `type ContractResult = { ok: true } | { ok: false; issues: ContractIssue[] }`, `PEEC_CONTRACTS`, `type PeecBoundary`, `peecContract<T>(boundary: PeecBoundary, value: T, env?): T` (`contracts.ts`)
  - `V1_DATA: SnapshotData`, `V1_SLOTS: Slots`, `V1_DATA_BLOCK: string`, `V1_FLAGS: string[]` (`__fixtures__/v1-row.ts`)

- [ ] **Step 1: Worktree and green baseline**

```bash
perl -e 'alarm 120; exec @ARGV' -- git -C ~/code/reporting-aeo-outbound-ryan fetch origin
test -d ~/code/worktrees/reporting-aeo-outbound-ryan-feat-aeo-outbound-parts || git -C ~/code/reporting-aeo-outbound-ryan worktree add ~/code/worktrees/reporting-aeo-outbound-ryan-feat-aeo-outbound-parts feat/aeo-outbound-parts
cd ~/code/worktrees/reporting-aeo-outbound-ryan-feat-aeo-outbound-parts
git merge --ff-only origin/feat/aeo-outbound-parts
git log --oneline -1
```
Expected: `06e68c0d Record migration 0026 applied to the dev database`. Then `perl -e 'alarm 590; exec @ARGV' -- npm ci` (exit 0) and the gate `DATABASE_URL=postgresql://ci:ci@db.invalid/ci perl -e 'alarm 590; exec @ARGV' -- make check` (exit 0). If the baseline is red, stop and report; do not build on it. Every later command in this plan runs from this worktree.

- [ ] **Step 2: Add zod, pinned exactly**

Run: `perl -e 'alarm 300; exec @ARGV' -- npm install --save-exact zod@4.3.6`
Then: `git diff package.json` must show exactly one added line, `"zod": "4.3.6",`, in `dependencies` (alphabetical position after `"tw-animate-css"`). Anything else changed in `package.json`: revert and stop.

- [ ] **Step 3: Capture a version 1 row from the unchanged code**

Create `lib/aeo-outbound/__fixtures__/v1-row.ts`. These values were produced by the code at `06e68c0d` (`buildSnapshotData` on a synthetic pull, then `dataBlock` and `groundingFlags`); they are the version 1 behaviour later tasks must keep.

```ts
// A row stored before v1.1 (schema version 1), with the Data block and grounding flags v1.0 produced for it.
// Synthetic. Later tasks must keep these outputs for version 1 rows (spec v1.1 §10, round-2 MINOR 16).
import type { SnapshotData } from '../metrics'
import type { Slots } from '../slots'

const ALPHA = { id: 'kw_a', name: 'Alpha', isOwn: false, visibilityPct: 26.1, sovPct: 22.5, position: 2.4, rank: 1 }
const BETA = { id: 'kw_b', name: 'Beta', isOwn: false, visibilityPct: 18.5, sovPct: 16.9, position: 3.1, rank: 2 }
const OWN = { id: 'kw_own', name: 'Example Co', isOwn: true, visibilityPct: 15.1, sovPct: 15.9, position: 3.1, rank: 3 }

export const V1_DATA: SnapshotData = {
  projectId: 'or_fixture', projectName: 'Example pitch', brand: 'Example Co', generatedAt: '2026-10-08T15:00:00.000Z',
  window: { start: '2026-10-01', end: '2026-10-08' }, windowLabel: 'Oct 1, 2026 to Oct 8, 2026',
  category: 'Fintech', market: 'United States',
  brands: [ALPHA, BETA, OWN], own: OWN,
  kpis: [
    { label: 'AI visibility', value: '15.1%' }, { label: 'AI share of voice', value: '15.9%' },
    { label: 'Average answer position', value: '#3.1' }, { label: 'Competitive rank', value: '#3 of 3 brands' },
  ],
  competitorsTracked: 2, rankN: 3,
  leaderGaps: [{ name: 'Alpha', visibilityPoints: 11, sovPoints: 6.6 }, { name: 'Beta', visibilityPoints: 3.4, sovPoints: 1 }],
  ownDomains: ['example.com'], ownRetrievedChats: 1989, ownRetrievedPct: 22.4,
  sourceMix: [
    { label: 'Competitor', weight: 5902, pct: 53.7 }, { label: 'You', weight: 3698, pct: 33.6 },
    { label: 'Editorial', weight: 1000, pct: 9.1 }, { label: 'UGC', weight: 400, pct: 3.6 },
  ],
  gapDomains: [{ domain: 'forum.com', retrievedChats: 300 }],
  actions: [{ title: 'Give this page an H1 heading', impact: 'HIGH', type: 'SEO_ISSUE' }],
  promptCount: 100, models: ['ChatGPT UI', 'Google AI Overview'],
  notes: [
    'Rank is by visibility among the 3 brands tracked in Peec.',
    'Peec project or_fixture (PITCH). Window 2026-10-01 to 2026-10-08, all models: ChatGPT UI, Google AI Overview.',
  ],
}

export const V1_SLOTS: Slots = {
  category: 'Fintech', market: 'United States',
  headline: 'Example Co ranks #3 of 3 brands with 15.1% visibility',
  summary: 'Alpha leads with 26.1% visibility.',
  context: 'Alpha leads with 26.1% visibility and 22.5% share of voice, ahead of Example Co.',
  competitive_bullets: [{ lead: 'Own site:', text: 'Retrieved in 1,989 answers on example.com.' }, { lead: 'Position:', text: 'Average answer position is #3.1.' }],
  sources_bullets: [{ lead: 'Gap:', text: 'The gap to Alpha is 11 points.' }, { lead: 'Sites:', text: 'forum.com was used in 300 answers.' }],
  why: 'Visibility rose 42% on rival.io.',
  opportunities: [
    { signal: 'Peec recommends a heading fix', opportunity: 'Explore it', workstream: 'Technical AEO / SEO' },
    { signal: 'forum.com is used', opportunity: 'Investigate', workstream: 'PR / earned media' },
    { signal: 'Share of voice is 15.9%', opportunity: 'Test content', workstream: 'Content / AEO' },
  ],
  methodology: 'Peec data from Oct 1, 2026 to Oct 8, 2026 across 3 brands and 100 prompts. Results are directional.',
  next_step: 'A full AEO audit.',
}

export const V1_DATA_BLOCK = [
  'Brand: Example Co',
  'Category: Fintech',
  'Market: United States',
  'Data window: Oct 1, 2026 to Oct 8, 2026',
  'Key metrics: AI visibility 15.1%; AI share of voice 15.9%; Average answer position #3.1; Competitive rank #3 of 3 brands',
  'Competitors tracked in Peec: 2',
  'Brands in the comparison set: 3',
  'Brands by AI visibility (rank, name, visibility, share of voice): #1 Alpha 26.1% / 22.5%; #2 Beta 18.5% / 16.9%; #3 Example Co 15.1% / 15.9%',
  'Gap to each brand ranked above (visibility points, share of voice points): Alpha 11 points, 6.6 points; Beta 3.4 points, 1 points',
  'Own site retrievals (answers that retrieved example.com): 1,989, which is 22.4% of answers',
  'Source types by share of retrievals: Competitor 53.7%; You 33.6%; Editorial 9.1%; UGC 3.6%',
  'Competitor domain gaps (sites where competitors appear and the brand does not, by answers that used them): forum.com 300',
  'Current Peec recommended actions (title, impact): Give this page an H1 heading (high)',
  'Prompts tracked: 100',
  'AI models covered: ChatGPT UI, Google AI Overview',
].join('\n')

/** v1.0's flags for V1_SLOTS, in v1.0's "<top-level key>: <text>" form. */
export const V1_FLAGS = ['why: "rival.io" is not a domain in the Peec data', 'why: "42%" is not in the Peec data']
```

- [ ] **Step 4: Generate the v1.0 parity golden from the unchanged render**

Run from the worktree root, before any change to `render.ts` or `charts.ts`:
```bash
perl -e 'alarm 120; exec @ARGV' -- npx tsx -e "import { writeFileSync } from 'node:fs'; import { renderSnapshotHtml } from './lib/aeo-outbound/render'; import { V1_DATA, V1_SLOTS } from './lib/aeo-outbound/__fixtures__/v1-row'; writeFileSync('lib/aeo-outbound/__fixtures__/v1-0-final.html', renderSnapshotHtml(V1_DATA, V1_SLOTS, 'final', 'Oct 9, 2026'))"
grep -c 'Citations: %{value}' lib/aeo-outbound/__fixtures__/v1-0-final.html
```
Expected: the file exists and the count is `1`. This file is never regenerated by any later task.

- [ ] **Step 5: Pin version 1 behaviour**

Create `lib/aeo-outbound/v1-compat.test.ts`:
```ts
import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { V1_DATA, V1_DATA_BLOCK, V1_FLAGS, V1_SLOTS } from './__fixtures__/v1-row'
import { dataBlock } from './prompt'
import { groundingFlags } from './grounding'
import { renderSnapshotHtml } from './render'

// The v1.0 final page of V1_DATA and V1_SLOTS, generated once from the code at 06e68c0d (plan Task 1 Step 4).
const GOLDEN = readFileSync('lib/aeo-outbound/__fixtures__/v1-0-final.html', 'utf8')

test('a version 1 row keeps its version 1 Data block', () => {
  expect(dataBlock(V1_DATA)).toBe(V1_DATA_BLOCK)
})

test('a version 1 row keeps its version 1 grounding flags', () => {
  expect(groundingFlags(V1_SLOTS, V1_DATA, V1_DATA_BLOCK)).toEqual(V1_FLAGS)
})

test('a version 1 row renders its final page exactly as v1.0 did', () => {
  expect(renderSnapshotHtml(V1_DATA, V1_SLOTS, 'final', 'Oct 9, 2026')).toBe(GOLDEN)
})
```
Run: `perl -e 'alarm 590; exec @ARGV' -- npx vitest run lib/aeo-outbound/v1-compat.test.ts`
Expected: 3 passed. (These are characterization tests: they pass now and must keep passing, with only the changes later tasks name.)

- [ ] **Step 6: Write the failing error-code test**

Append to `lib/aeo-outbound/peec.test.ts` (and add `isPeecContractViolation` to its import from `./peec`):
```ts
test('a PeecError carries an optional code, none by default', () => {
  expect(new PeecError('x').code).toBeNull()
  const e = new PeecError('No day between 2026-09-01 and 2026-09-07 has any Peec data for this project', false, false, 'no_data')
  expect([e.code, e.timeout, e.rowCap, e.name]).toEqual(['no_data', false, false, 'PeecError'])
  expect(isPeecContractViolation(new PeecError('peec.brands_report.visibility', false, false, 'contract_violation'))).toBe(true)
  expect(isPeecContractViolation(e)).toBe(false)
  expect(isPeecContractViolation(new Error('x'))).toBe(false)
})
```
Run: `perl -e 'alarm 590; exec @ARGV' -- npx vitest run lib/aeo-outbound/peec.test.ts`
Expected: FAIL (`isPeecContractViolation` is not exported; `code` is undefined).

- [ ] **Step 7: Add the error codes and the code on PeecError**

Create `lib/aeo-outbound/error-codes.ts`:
```ts
// Why a generation failed, as a code the UI turns into plain words (spec v1.1 §7). A code travels on the error object
// (PeecError.code) or the generation result, never parsed from message text.
export const ERROR_CODES = [
  'no_project', 'own_brand_count', 'no_data', 'own_brand_no_row', 'zero_retrievals', 'history_too_long', 'timeout',
  'copy_failed', 'copy_outside_sources', 'peec_error', 'contract_violation', 'stale', 'internal',
] as const
export type ErrorCode = (typeof ERROR_CODES)[number]
/** The codes a PeecError can carry. An HTTP or transport failure carries none and is reported as peec_error. */
export type PeecErrorCode = 'no_project' | 'own_brand_count' | 'no_data' | 'own_brand_no_row' | 'zero_retrievals' | 'history_too_long' | 'contract_violation'
export const isErrorCode = (v: unknown): v is ErrorCode => typeof v === 'string' && (ERROR_CODES as readonly string[]).includes(v)
```

In `lib/aeo-outbound/peec.ts` add `import type { PeecErrorCode } from './error-codes'` at the top and replace lines 12 to 27 with:
```ts
export class PeecError extends Error {
  /** True only for an exhausted time budget: the deadline passed or a call timed out. */
  readonly timeout: boolean
  /** True only for the MAX_ENDPOINT_ROWS cap, never for a repeated row or an HTTP error. */
  readonly rowCap: boolean
  /** Why, for the UI (spec v1.1 §7). Null for an HTTP or transport failure. */
  readonly code: PeecErrorCode | null
  constructor(message: string, timeout = false, rowCap = false, code: PeecErrorCode | null = null) {
    super(message)
    this.name = 'PeecError'
    this.timeout = timeout
    this.rowCap = rowCap
    this.code = code
  }
}

/** Optional calls rethrow these instead of turning them into a warning. */
export const isPeecTimeout = (e: unknown): boolean => e instanceof PeecError && e.timeout
export const isPeecRowCap = (e: unknown): boolean => e instanceof PeecError && e.rowCap
/** A Peec field broke its enforced contract (lib/aeo-outbound/contracts.ts). Never downgraded to a warning. */
export const isPeecContractViolation = (e: unknown): boolean => e instanceof PeecError && e.code === 'contract_violation'
```
Run the peec test again. Expected: PASS.

- [ ] **Step 8: Contract modes in config**

Append to `lib/aeo-outbound/config.ts`:
```ts
/** Data contracts (spec v1.1 §10): the mode of each boundary's enforced fields. Every field a Peec boundary reads outside
 *  its enforced set is always observed. CONTRACT_DISABLED (any value but empty, 0 or false) turns every check off. */
export type ContractMode = 'observe' | 'warn' | 'enforce'
export const CONTRACT_MODES = {
  'peec.projects': 'observe',
  'peec.brands': 'observe',
  'peec.project_profile': 'observe',
  'peec.domains_by_date': 'enforce',
  'peec.brands_report': 'enforce',
  'peec.brands_by_model': 'enforce',
  'peec.model_channels': 'observe',
  'peec.domains_report': 'enforce',
  'peec.actions': 'observe',
  'peec.prompts': 'enforce',
  'glean.slots': 'enforce',
  'request.generate': 'enforce',
  'request.slots': 'enforce',
  'settings.row': 'enforce',
  'stored.data': 'enforce',
  'stored.slots': 'enforce',
  'stored.notes': 'enforce',
} as const satisfies Record<string, ContractMode>
export type ContractBoundary = keyof typeof CONTRACT_MODES
```

- [ ] **Step 9: Write the failing contract tests**

Create `lib/aeo-outbound/contracts.test.ts`:
```ts
import { afterEach, beforeEach, expect, test, vi, type MockInstance } from 'vitest'
import { z } from 'zod'
import { CONTRACT_MODES } from './config'
import { checkContract, contractsDisabled, PEEC_CONTRACTS, peecContract } from './contracts'
import { PeecError } from './peec'

// Every value here is invented. SECRET stands for a prospect's data that must never reach a log line.
const SECRET = 'Secret Prospect Name'
let info: MockInstance<typeof console.info>, warn: MockInstance<typeof console.warn>, error: MockInstance<typeof console.error>
beforeEach(() => {
  info = vi.spyOn(console, 'info').mockImplementation(() => {})
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  error = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { vi.restoreAllMocks() })
const lines = () => [...info.mock.calls, ...warn.mock.calls, ...error.mock.calls].map((c) => c.map(String).join(' '))
const SCHEMA = z.array(z.looseObject({ visibility: z.number().min(0).max(1) }))
const BAD = [{ visibility: 2, name: SECRET }, { visibility: 3, name: SECRET }, { name: SECRET }]

test('observe logs one info line per field and issue, with a count, and passes', () => {
  expect(checkContract('peec.brands_report', SCHEMA, BAD, 'observe', {})).toEqual({ ok: true })
  expect(info.mock.calls.map((c) => String(c[0]))).toEqual([
    '[aeo-outbound] contract boundary=peec.brands_report field=visibility issue=too_big count=2 mode=observe',
    '[aeo-outbound] contract boundary=peec.brands_report field=visibility issue=invalid_type count=1 mode=observe',
  ])
})

test('warn logs at warn and passes; enforce logs at error and fails with each field and issue', () => {
  expect(checkContract('peec.brands_report', SCHEMA, BAD, 'warn', {})).toEqual({ ok: true })
  expect(warn).toHaveBeenCalledTimes(2)
  expect(checkContract('peec.brands_report', SCHEMA, BAD, 'enforce', {})).toEqual({
    ok: false, issues: [{ field: 'visibility', issue: 'too_big' }, { field: 'visibility', issue: 'invalid_type' }],
  })
  expect(error).toHaveBeenCalledTimes(2)
})

test('the mode defaults to the boundary mode in config', () => {
  expect(checkContract('peec.projects', SCHEMA, BAD, undefined, {})).toEqual({ ok: true })
  expect(checkContract('peec.brands_report', SCHEMA, BAD, undefined, {}).ok).toBe(false)
})

test('a valid value logs nothing', () => {
  expect(checkContract('peec.brands_report', SCHEMA, [{ visibility: 0.5 }], 'enforce', {})).toEqual({ ok: true })
  expect(lines()).toEqual([])
})

test('no log line ever carries a value', () => {
  for (const mode of ['observe', 'warn', 'enforce'] as const) checkContract('peec.brands_report', z.array(z.looseObject({ name: z.number() })), BAD, mode, {})
  expect(lines().length).toBeGreaterThan(0)
  for (const l of lines()) expect(l).not.toContain(SECRET)
})

test('CONTRACT_DISABLED turns every check off; empty, 0 and false do not', () => {
  for (const v of ['1', 'true', 'yes']) expect(contractsDisabled({ CONTRACT_DISABLED: v })).toBe(true)
  for (const v of [undefined, '', '0', 'false', ' FALSE ']) expect(contractsDisabled({ CONTRACT_DISABLED: v })).toBe(false)
  expect(checkContract('peec.brands_report', SCHEMA, BAD, 'enforce', { CONTRACT_DISABLED: '1' })).toEqual({ ok: true })
  expect(() => peecContract('peec.brands_report', [{ brand: { id: 'a', name: 'A' } }], { CONTRACT_DISABLED: '1' })).not.toThrow()
  expect(lines()).toEqual([])
})

const ROW = { brand: { id: 'kw_a', name: 'Alpha' }, visibility: 0.3, share_of_voice: 0.2, position: 2.1, mention_count: 5 }

test('a brands report row with no visibility fails as contract_violation naming the field (the NaN% path)', () => {
  let err: unknown
  try { peecContract('peec.brands_report', [ROW, { ...ROW, visibility: undefined }], {}) } catch (e) { err = e }
  expect(err).toBeInstanceOf(PeecError)
  expect((err as PeecError).code).toBe('contract_violation')
  expect((err as PeecError).message).toBe('peec.brands_report.visibility')
})

test('NaN and a proportion above 1 are refused; absent or null share of voice and position pass', () => {
  expect(() => peecContract('peec.brands_report', [{ ...ROW, visibility: Number.NaN }], {})).toThrow('peec.brands_report.visibility')
  expect(() => peecContract('peec.brands_report', [{ ...ROW, visibility: 1.2 }], {})).toThrow(PeecError)
  const ok = [{ brand: ROW.brand, visibility: 0 }, { ...ROW, share_of_voice: null, position: null }]
  expect(peecContract('peec.brands_report', ok, {})).toBe(ok)
})

test('counts are null or non-negative whole numbers; percentages are proportions', () => {
  const r = { domain: 'a.example', classification: 'UGC', retrieved_chat_count: 3, retrieval_count: 4, retrieved_percentage: 0.1 }
  expect(peecContract('peec.domains_report', [r, { ...r, retrieved_chat_count: null, retrieval_count: undefined, retrieved_percentage: null }], {})).toHaveLength(2)
  expect(() => peecContract('peec.domains_report', [{ ...r, retrieval_count: -1 }], {})).toThrow('peec.domains_report.retrieval_count')
  expect(() => peecContract('peec.domains_report', [{ ...r, retrieved_chat_count: 1.5 }], {})).toThrow('peec.domains_report.retrieved_chat_count')
  expect(() => peecContract('peec.domains_report', [{ ...r, retrieved_percentage: 22.4 }], {})).toThrow('peec.domains_report.retrieved_percentage')
  expect(() => peecContract('peec.domains_by_date', [{ domain: 'a.example', date: '2026-10-05', retrieved_chat_count: -2 }], {})).toThrow(PeecError)
  expect(() => peecContract('peec.prompts', { total_count: 2.5 }, {})).toThrow('peec.prompts.total_count')
})

test('fields outside the enforced set are observed only: drift logs one info line and never throws', () => {
  const rows = [{ ...ROW, brand: { id: 'kw_a', name: 7 } }]
  expect(peecContract('peec.brands_report', rows, {})).toBe(rows)
  expect(lines()).toEqual(['[aeo-outbound] contract boundary=peec.brands_report field=brand.name issue=invalid_type count=1 mode=observe'])
})

test('unused fields pass through untouched: the very same value comes back', () => {
  const rows = [{ ...ROW, extra: { deep: true } }]
  expect(peecContract('peec.brands_report', rows, {})).toBe(rows)
})

test('every Peec boundary has a contract and starts in the documented mode', () => {
  expect(Object.keys(PEEC_CONTRACTS).sort()).toEqual(Object.keys(CONTRACT_MODES).filter((b) => b.startsWith('peec.')).sort())
  for (const b of ['peec.domains_by_date', 'peec.brands_report', 'peec.brands_by_model', 'peec.domains_report', 'peec.prompts'] as const) expect(CONTRACT_MODES[b]).toBe('enforce')
  for (const b of ['peec.projects', 'peec.brands', 'peec.project_profile', 'peec.model_channels', 'peec.actions'] as const) expect(CONTRACT_MODES[b]).toBe('observe')
})
```
Run: `perl -e 'alarm 590; exec @ARGV' -- npx vitest run lib/aeo-outbound/contracts.test.ts`
Expected: FAIL (module `./contracts` not found).

- [ ] **Step 10: Implement contracts**

Create `lib/aeo-outbound/contracts.ts`:
```ts
// Data contracts (spec v1.1 §10). contract-core's model (one declared schema per boundary, a mode per boundary, one
// log line per violation naming the boundary, field and issue, never a value, and a kill switch) applied with zod,
// because contract-core is Python. Peec boundaries enforce their numeric fields and observe every other field they read.
import { z } from 'zod'
import { CONTRACT_MODES, type ContractBoundary, type ContractMode } from './config'
import { PeecError } from './peec'

export interface ContractIssue { field: string; issue: string }
export type ContractResult = { ok: true } | { ok: false; issues: ContractIssue[] }
type Env = Record<string, string | undefined>

/** CONTRACT_DISABLED set to anything but empty, 0 or false turns every check off. */
export function contractsDisabled(env: Env = process.env): boolean {
  const v = (env.CONTRACT_DISABLED ?? '').trim().toLowerCase()
  return v !== '' && v !== '0' && v !== 'false'
}

/** A zod path as a field name: array indexes dropped, so 10,000 rows missing one field are one field. */
const fieldOf = (path: readonly PropertyKey[]): string => path.filter((p): p is string => typeof p === 'string').join('.') || '(root)'

/**
 * Checks value against schema. Logs one line per distinct field and issue, with how many times it occurred, at info
 * (observe), warn (warn) or error (enforce), and never a value. Only enforce can fail.
 */
export function checkContract(boundary: ContractBoundary, schema: z.ZodType, value: unknown, mode: ContractMode = CONTRACT_MODES[boundary], env: Env = process.env): ContractResult {
  if (contractsDisabled(env)) return { ok: true }
  const parsed = schema.safeParse(value)
  if (parsed.success) return { ok: true }
  const counts = new Map<string, { field: string; issue: string; n: number }>()
  for (const i of parsed.error.issues) {
    const field = fieldOf(i.path)
    const key = `${field}\u0000${i.code}`
    const seen = counts.get(key)
    if (seen) seen.n++
    else counts.set(key, { field, issue: i.code, n: 1 })
  }
  const log = mode === 'observe' ? console.info : mode === 'warn' ? console.warn : console.error
  for (const c of counts.values()) log(`[aeo-outbound] contract boundary=${boundary} field=${c.field} issue=${c.issue} count=${c.n} mode=${mode}`)
  return mode === 'enforce' ? { ok: false, issues: [...counts.values()].map(({ field, issue }) => ({ field, issue })) } : { ok: true }
}

const count = z.number().int().nonnegative().nullish()
const ratio = z.number().min(0).max(1)

/** Only the fields pull.ts reads. looseObject passes every other field through untouched. */
export const PEEC_CONTRACTS = {
  'peec.projects': { observe: z.array(z.looseObject({ id: z.union([z.string(), z.number()]), name: z.string().nullish(), status: z.string().nullish() })) },
  'peec.brands': { observe: z.array(z.looseObject({ id: z.string(), name: z.string(), is_own: z.boolean(), domains: z.array(z.string()).nullish() })) },
  'peec.project_profile': {
    observe: z.looseObject({
      profile: z.looseObject({ industry: z.string().nullish(), target_markets: z.array(z.looseObject({ location: z.string().nullish() })).nullish() }).nullish(),
    }).nullable(),
  },
  'peec.domains_by_date': {
    enforce: z.array(z.looseObject({ retrieved_chat_count: count })),
    observe: z.array(z.looseObject({ domain: z.string(), date: z.string() })),
  },
  'peec.brands_report': {
    enforce: z.array(z.looseObject({ visibility: ratio, share_of_voice: ratio.nullish(), position: z.number().nonnegative().nullish() })),
    observe: z.array(z.looseObject({ brand: z.looseObject({ id: z.string(), name: z.string() }) })),
  },
  'peec.brands_by_model': {
    enforce: z.array(z.looseObject({ visibility_total: count })),
    observe: z.array(z.looseObject({ brand: z.looseObject({ id: z.string() }), model_channel: z.looseObject({ id: z.string() }).nullish() })),
  },
  'peec.model_channels': { observe: z.array(z.looseObject({ id: z.string(), description: z.string().nullish() })) },
  'peec.domains_report': {
    enforce: z.array(z.looseObject({ retrieved_chat_count: count, retrieval_count: count, retrieved_percentage: ratio.nullish() })),
    observe: z.array(z.looseObject({ domain: z.string(), classification: z.string().nullish(), mentioned_brands: z.array(z.looseObject({ id: z.string() })).nullish() })),
  },
  'peec.actions': { observe: z.array(z.looseObject({ title: z.string().nullish(), impact: z.string().nullish(), type: z.string().nullish(), status: z.string().nullish() })) },
  'peec.prompts': { enforce: z.looseObject({ total_count: count }).nullable(), observe: z.unknown() },
} satisfies Record<string, { observe: z.ZodType; enforce?: z.ZodType }>
export type PeecBoundary = keyof typeof PEEC_CONTRACTS

/**
 * Checks one Peec response and returns it unchanged. Observed fields only log. An enforced field that breaks its rule
 * throws a PeecError whose message is "<boundary>.<field>" and whose code is contract_violation, so the generation
 * fails with that reason instead of publishing a wrong number.
 */
export function peecContract<T>(boundary: PeecBoundary, value: T, env: Env = process.env): T {
  const c: { observe: z.ZodType; enforce?: z.ZodType } = PEEC_CONTRACTS[boundary]
  checkContract(boundary, c.observe, value, 'observe', env)
  if (c.enforce) {
    const r = checkContract(boundary, c.enforce, value, CONTRACT_MODES[boundary], env)
    if (!r.ok) throw new PeecError(`${boundary}.${r.issues[0].field}`, false, false, 'contract_violation')
  }
  return value
}
```
Run the contract tests. Expected: PASS (12 tests).

- [ ] **Step 11: Gate, commit, push**

Run the gate. Then:
```bash
git add package.json package-lock.json lib/aeo-outbound/__fixtures__/v1-row.ts lib/aeo-outbound/__fixtures__/v1-0-final.html lib/aeo-outbound/v1-compat.test.ts lib/aeo-outbound/error-codes.ts lib/aeo-outbound/contracts.ts lib/aeo-outbound/contracts.test.ts lib/aeo-outbound/peec.ts lib/aeo-outbound/peec.test.ts lib/aeo-outbound/config.ts
git commit -F - <<'MSG'
Add data contracts, error codes and the version 1 fixtures

zod 4.3.6 pinned exactly (spec v1.1 §10). checkContract applies contract-core's model per boundary;
PeecError carries an optional code. The v1.0 final page, Data block and grounding flags of a synthetic
version 1 row are captured from the unchanged code so later changes can prove they keep old rows.

Edge cases (contracts parse untrusted Peec, Glean and request data):
- external failure: a payload of the wrong shape fails its schema and is logged: fix
- operator visibility: one line per boundary, field and issue, with a count: fix
- bounds: 10,000 rows missing one field log one line, not 10,000: fix
- input boundaries: NaN, Infinity, negative or fractional counts and proportions above 1 are refused: fix
- state and concurrency: pure functions, no shared state: decline
- security: field names and zod issue codes only, never a value, reach a log: fix

Co-Authored-By: Claude <model> <noreply@anthropic.com>
MSG
perl -e 'alarm 120; exec @ARGV' -- git push origin feat/aeo-outbound-parts
```
(Replace `<model>` in the trailer with your model name before running.)

---
### Task 2: Schema, migration `0027`, store and settings-store queries

Covers v1.1 §13 (migration), §6 (the opens table and the one-statement counter plus event), §7 (`progress_step`, `error_code`), §5 (hub columns, counts, search, Show older paging, per-row open counts), §8 (settings tables, the log, the optimistic `updated_at` save), round-2 MINORs 8 and 14.

**Files:**
- Modify: `lib/db/schema.ts:524-525` (two columns at the end of `aeoOutboundReports`), and append three tables after line 535
- Create (generated): `drizzle/0027_aeo_outbound_v1_1.sql`, `drizzle/meta/0027_snapshot.json`; modify (generated): `drizzle/meta/_journal.json`
- Modify: `lib/aeo-outbound/opens.ts` (append constants), `lib/aeo-outbound/store.ts:1-171`, `lib/aeo-outbound/store.test.ts`
- Create: `lib/aeo-outbound/settings-store.ts`, `lib/aeo-outbound/settings-store.test.ts`
- Modify: `app/tools/new-business/page.tsx:12` (`.rows`)

**Interfaces:**
- Consumes: `type ErrorCode` (Task 1).
- Produces (all in `store.ts` unless noted):
  - `markStaleGeneratingQuery(projectId, now)` now also sets `error_code = 'stale'`
  - `finishFailedQuery(id: string, error: string, brandName: string | null, now: Date, code: ErrorCode | null = null)`
  - `progressStepQuery(id: string, step: number)` (an UPDATE builder, no `returning`)
  - `saveSlotsQuery(id, shownRevision, slots, notes, brandName?: string)`
  - `liveByTokenQuery(token)` selects `id, html, approved_at`; `getLiveByToken(token): Promise<{ id: string; html: string; approvedAt: Date | null } | undefined>`
  - `recordOpenSql(id: string, now: Date, v: { uaFamily: string; linkFresh: boolean }): SQL`, `recordOpen(id, now, v): Promise<void>`
  - `type ReportSummary` (hub columns plus `opensPerson: number`, `opensAutomated: number`), `type HubCursor = { before: string; beforeId: string }`
  - `liveSummariesQuery(q: string | null = null)`, `recentSummariesQuery(limit: number, q: string | null = null, before: { createdAt: Date; id: string } | null = null)`
  - `listReportSummaries(opts: { q?: string | null; before?: { createdAt: Date; id: string } | null } = {}): Promise<{ rows: ReportSummary[]; cursor: HubCursor | null }>`
  - `type HubCounts = { all: number; draft: number; live: number; revoked: number; failed: number }`, `hubCountsQuery(q: string | null, now: Date)`, `hubCounts(q, now): Promise<HubCounts>`
  - `type ProjectStat = { count: number; last: string }`, `projectStatsQuery()`, `projectStats(): Promise<Record<string, ProjectStat>>`
  - `opensForReportQuery(id: string)` (newest first, at most 200)
  - `OPEN_REASONS`, `LINK_FRESH_MS` (`opens.ts`)
  - `settings-store.ts`: `type SettingsValues`, `type SettingsChange`, `readSettingsRowQuery()`, `readSettingsRow(): Promise<AeoOutboundSettingsRow | null>`, `saveSettingsSql(v, changes, by, now, expectedUpdatedAt: string | null): SQL`, `saveSettings(...): Promise<boolean>`, `recentSettingsLogQuery(limit: number)`
  - `schema.ts`: `aeoOutboundOpens`, `AeoOutboundOpenRow`, `aeoOutboundSettings`, `AeoOutboundSettingsRow`, `aeoOutboundSettingsLog`; `aeoOutboundReports.progressStep`, `aeoOutboundReports.errorCode`

- [ ] **Step 1: Schema, append-only**

In `lib/db/schema.ts`, inside `aeoOutboundReports`, after line 524 (`deletedAt: ...,`) and before `}, (table) => ({`, insert:
```ts
  // v1.1 (spec 2026-10-11 §7): the generating row's last step written, and a failed row's error code.
  progressStep: integer('progress_step').notNull().default(0),
  errorCode: text('error_code'),
```
After line 535 (`export type AeoOutboundRow = ...`) append:
```ts

// v1.1 (spec 2026-10-11 §6): one row per counted open of a live link. No IP address and no full user agent.
export const aeoOutboundOpens = pgTable('aeo_outbound_opens', {
  id: uuid('id').primaryKey().defaultRandom(),
  reportId: uuid('report_id').notNull().references(() => aeoOutboundReports.id),
  openedAt: timestamp('opened_at', { withTimezone: true }).notNull(),
  uaFamily: text('ua_family').notNull(),
  likelyAutomated: boolean('likely_automated').notNull(),
  reason: text('reason'),
}, (table) => ({
  reportIdx: index('aeo_outbound_opens_report_idx').on(table.reportId, table.openedAt),
}))
export type AeoOutboundOpenRow = typeof aeoOutboundOpens.$inferSelect

// v1.1 (spec 2026-10-11 §8): the tool's settings (one row at most) and every change made to them. Every write sets
// updated_at explicitly at millisecond precision, so the optimistic check compares exactly what the browser was sent.
export const aeoOutboundSettings = pgTable('aeo_outbound_settings', {
  id: boolean('id').primaryKey().default(true),
  users: jsonb('users').$type<string[]>().notNull(),
  admins: jsonb('admins').$type<string[]>().notNull(),
  sectionTitles: jsonb('section_titles').$type<string[]>().notNull(),
  fixedNextStep: text('fixed_next_step'),
  rankAmong: integer('rank_among'),
  peecOpportunityRows: integer('peec_opportunity_rows').notNull(),
  methodologyStatesPromptsAndModels: boolean('methodology_states_prompts_and_models').notNull(),
  sidebarWordmark: text('sidebar_wordmark').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  updatedBy: text('updated_by').notNull(),
}, (table) => ({
  singleRow: check('aeo_outbound_settings_single_row', sql`${table.id}`),
}))
export type AeoOutboundSettingsRow = typeof aeoOutboundSettings.$inferSelect

export const aeoOutboundSettingsLog = pgTable('aeo_outbound_settings_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  changedAt: timestamp('changed_at', { withTimezone: true }).notNull(),
  changedBy: text('changed_by').notNull(),
  field: text('field').notNull(),
  oldValue: jsonb('old_value'),
  newValue: jsonb('new_value'),
}, (table) => ({
  changedIdx: index('aeo_outbound_settings_log_changed_idx').on(table.changedAt),
}))
```
Every import used (`boolean`, `check`, `index`, `integer`, `jsonb`, `pgTable`, `text`, `timestamp`, `uuid`, `sql`) is already imported at `schema.ts:1,3`.

- [ ] **Step 2: Generate (never apply) migration 0027**

Run: `DATABASE_URL_UNPOOLED=postgresql://x:x@localhost:5432/x perl -e 'alarm 120; exec @ARGV' -- npx drizzle-kit generate --name aeo_outbound_v1_1`
Expected: one new `drizzle/0027_aeo_outbound_v1_1.sql`, a new `drizzle/meta/0027_snapshot.json`, and one new `_journal.json` entry with `"idx": 27` and `"tag": "0027_aeo_outbound_v1_1"`. The SQL must be exactly these statements (a trial generation against `06e68c0d` produced them): `CREATE TABLE "aeo_outbound_opens"`, `CREATE TABLE "aeo_outbound_settings"` (with `CONSTRAINT "aeo_outbound_settings_single_row" CHECK ("aeo_outbound_settings"."id")`), `CREATE TABLE "aeo_outbound_settings_log"`, `ALTER TABLE "aeo_outbound_reports" ADD COLUMN "progress_step" integer DEFAULT 0 NOT NULL`, `ALTER TABLE "aeo_outbound_reports" ADD COLUMN "error_code" text`, the foreign key `aeo_outbound_opens_report_id_aeo_outbound_reports_id_fk`, and the two indexes. If it touches any other table, or drops or alters anything else: stop and report. Never run `drizzle-kit migrate`, `push` or `scripts/migrate-http.ts`.

- [ ] **Step 3: Write the failing store tests**

In `lib/aeo-outbound/store.test.ts`:

(a) Add to the import from `./store`: `hubCountsQuery, opensForReportQuery, progressStepQuery, projectStatsQuery, recordOpenSql`.

(b) Replace the test `'stale generating rows for a project are failed before a new insert'` (lines 53 to 58) with:
```ts
test('stale generating rows for a project are failed, with the stale code, before a new insert', () => {
  const q = markStaleGeneratingQuery('or_a', NOW).toSQL()
  expect(q.sql).toBe(
    `update ${T} set "status" = $1, "error" = $2, "updated_at" = $3, "error_code" = $4 where (${T}."peec_project_id" = $5 and ${T}."status" = $6 and ${T}."created_at" < $7)`)
  expect(q.params).toEqual(['failed', 'Timed out', NOW_ISO, 'stale', 'or_a', 'generating', STALE])
})
```

(c) Replace the test `'the token lookup requires approved and excludes revoked and deleted rows'` (lines 60 to 65) with:
```ts
test('the token lookup requires approved, excludes revoked and deleted rows, and reads approved_at', () => {
  const q = liveByTokenQuery('tok').toSQL()
  expect(q.sql).toBe(
    `select "id", "html", "approved_at" from ${T} where (${T}."share_token" = $1 and ${T}."status" = $2 and ${T}."share_revoked_at" is null and ${T}."deleted_at" is null) limit $3`)
  expect(q.params).toEqual(['tok', 'approved', 1])
})
```

(d) Replace `HUB_COLS` and the test `'hub summaries select exactly the hub columns and never the heavy ones'` (lines 82 to 93) with:
```ts
const OPENS = '(select count(*) from "aeo_outbound_opens" o where o."report_id" = "aeo_outbound_reports"."id" and not o."likely_automated"), (select count(*) from "aeo_outbound_opens" o where o."report_id" = "aeo_outbound_reports"."id" and o."likely_automated")'
const HUB_COLS = `"id", "peec_project_id", "peec_project_name", "brand_name", "status", "error", "error_code", "progress_step", "share_token", "share_recipient", "open_count", "first_opened_at", "last_opened_at", "created_at", "created_by", "approved_at", "approved_by", "share_revoked_at", "requested_start", "requested_end", ${OPENS}`
const CREATED_MS = `date_trunc('milliseconds', ${T}."created_at")`
test('hub summaries select exactly the hub columns, with both open counts, and never the heavy ones', () => {
  const live = liveSummariesQuery().toSQL()
  expect(live.sql).toBe(
    `select ${HUB_COLS} from ${T} where (${T}."status" = $1 and ${T}."share_revoked_at" is null and ${T}."deleted_at" is null)`)
  expect(live.params).toEqual(['approved'])
  const recent = recentSummariesQuery(501).toSQL()
  expect(recent.sql).toBe(
    `select ${HUB_COLS} from ${T} where (${T}."deleted_at" is null and not (${T}."status" = $1 and ${T}."share_revoked_at" is null)) order by ${CREATED_MS} desc, ${T}."id" desc limit $2`)
  expect(recent.params).toEqual(['approved', 501])
  for (const s of [live.sql, recent.sql]) for (const c of ['"data"', '"slots"', '"notes"', '"html"']) expect(s).not.toContain(c)
})
test('the open counts are correlated to the outer row by its qualified id, never a bare "id"', () => {
  expect(liveSummariesQuery().toSQL().sql).not.toContain('"report_id" = "id"')
})
test('Show older pages by the millisecond created_at, then id, below the cursor', () => {
  const at = new Date('2026-09-01T00:00:00Z')
  const q = recentSummariesQuery(501, null, { createdAt: at, id: ID }).toSQL()
  expect(q.sql).toBe(
    `select ${HUB_COLS} from ${T} where (${T}."deleted_at" is null and not (${T}."status" = $1 and ${T}."share_revoked_at" is null) and (${CREATED_MS} < $2::timestamptz or (${CREATED_MS} = $3::timestamptz and ${T}."id" < $4))) order by ${CREATED_MS} desc, ${T}."id" desc limit $5`)
  expect(q.params).toEqual(['approved', at.toISOString(), at.toISOString(), ID, 501])
})
test('search text is matched literally, %, _ and \\ included, over brand, project, recipient and creator', () => {
  const q = liveSummariesQuery('50%_a\\b').toSQL()
  expect(q.sql).toContain(`(${T}."brand_name" ilike $2 or ${T}."peec_project_name" ilike $3 or ${T}."share_recipient" ilike $4 or ${T}."created_by" ilike $5)`)
  expect(q.params.slice(1)).toEqual(Array(4).fill('%50\\%\\_a\\\\b%'))
})
test('tab counts are one statement over every row that is not discarded, a stale generating row counting as failed', () => {
  const q = hubCountsQuery(null, NOW).toSQL()
  expect(q.sql).toBe(
    `select count(*), count(*) filter (where "status" = 'draft'), count(*) filter (where "status" = 'approved' and "share_revoked_at" is null), count(*) filter (where "status" = 'approved' and "share_revoked_at" is not null), count(*) filter (where "status" = 'failed' or ("status" = 'generating' and "created_at" < $1::timestamptz)) from ${T} where ${T}."deleted_at" is null`)
  expect(q.params).toEqual([STALE])
  expect(hubCountsQuery('acme', NOW).toSQL().sql).toContain(`${T}."brand_name" ilike $2`)
})
test('project stats count every row not discarded and keep the newest created_at', () => {
  expect(projectStatsQuery().toSQL().sql).toBe(
    `select "peec_project_id", count(*), max("created_at") from ${T} where ${T}."deleted_at" is null group by ${T}."peec_project_id"`)
})
test('the open list for a report is newest first and capped at 200', () => {
  const q = opensForReportQuery(ID).toSQL()
  expect(q.sql).toBe('select "opened_at", "ua_family", "likely_automated", "reason" from "aeo_outbound_opens" where "aeo_outbound_opens"."report_id" = $1 order by "aeo_outbound_opens"."opened_at" desc limit $2')
  expect(q.params).toEqual([ID, 200])
})
```

(e) Replace the test `'listReportSummaries merges the live rows with the recent ones once, newest first'` (lines 95 to 113) with:
```ts
async function withDb(select: ReturnType<typeof vi.fn>, run: (store: typeof import('./store')) => Promise<void>) {
  vi.resetModules()
  vi.doMock('@/lib/db/client', () => ({ db: { select } }))
  try { await run(await import('./store')) } finally { vi.doUnmock('@/lib/db/client'); vi.resetModules() }
}
const chain = (rows: unknown[]) => ({ from: () => ({ where: () => Object.assign(Promise.resolve(rows), { orderBy: () => ({ limit: () => Promise.resolve(rows) }) }) }) })
const mk = (id: string, ms: number) => ({ id, createdAt: new Date(ms) })

test('listReportSummaries merges the live rows with the recent ones once, newest first, with no cursor under 501', async () => {
  const day = (d: number) => Date.UTC(2026, 9, d)
  const oldLive = mk('live-old', day(1))
  const recent = [mk('r3', day(9)), mk('r2', day(8)), mk('r1', day(7))]
  const select = vi.fn().mockReturnValueOnce(chain([oldLive, recent[2]])).mockReturnValueOnce(chain(recent))
  await withDb(select, async (store) => {
    const out = await store.listReportSummaries()
    expect(out.rows.map((r) => r.id)).toEqual(['r3', 'r2', 'r1', 'live-old'])
    expect(out.cursor).toBeNull()
  })
})
test('a full page keeps 500 recent rows and returns a cursor at the 500th; a cursor read skips the live rows', async () => {
  const recent = Array.from({ length: 501 }, (_, i) => mk(`r${i}`, Date.UTC(2026, 8, 1) - i * 60_000))
  const select = vi.fn().mockReturnValueOnce(chain([])).mockReturnValueOnce(chain(recent))
  await withDb(select, async (store) => {
    const out = await store.listReportSummaries()
    expect(out.rows).toHaveLength(500)
    expect(out.cursor).toEqual({ before: recent[499].createdAt.toISOString(), beforeId: 'r499' })
  })
  const select2 = vi.fn().mockReturnValueOnce(chain(recent.slice(0, 2)))
  await withDb(select2, async (store) => {
    const out = await store.listReportSummaries({ before: { createdAt: new Date(), id: ID } })
    expect(select2).toHaveBeenCalledTimes(1)
    expect(out.rows.map((r) => r.id)).toEqual(['r0', 'r1'])
  })
})
```

(f) Replace the test `'finishing as failed only matches a generating row'` (lines 122 to 127) with:
```ts
test('finishing as failed only matches a generating row and stores the code', () => {
  const q = finishFailedQuery(ID, 'boom', 'B', NOW, 'peec_error').toSQL()
  expect(q.sql).toBe(
    `update ${T} set "brand_name" = $1, "status" = $2, "error" = $3, "updated_at" = $4, "error_code" = $5 where (${T}."id" = $6 and ${T}."status" = $7) returning "id"`)
  expect(q.params).toEqual(['B', 'failed', 'boom', NOW_ISO, 'peec_error', ID, 'generating'])
  expect(finishFailedQuery(ID, 'boom', 'B', NOW).toSQL().params[4]).toBeNull()
})
```

(g) Append:
```ts
test('progress only moves forward, only while generating, and never touches updated_at', () => {
  const q = progressStepQuery(ID, 4).toSQL()
  expect(q.sql).toBe(`update ${T} set "progress_step" = $1 where (${T}."id" = $2 and ${T}."status" = $3 and ${T}."progress_step" < $4)`)
  expect(q.params).toEqual([4, ID, 'generating', 4])
})

test('a brand save also writes brand_name; any other save leaves it alone', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(SAVED_AT))
  try {
    const q = saveSlotsQuery(ID, 4, SLOTS, [], 'New Co').toSQL()
    expect(q.sql).toBe(
      `update ${T} set "brand_name" = $1, "slots" = $2, "notes" = $3, "revision" = ${T}."revision" + 1, "updated_at" = $4 where (${T}."id" = $5 and ${T}."status" = $6 and ${T}."revision" = $7 and ${T}."deleted_at" is null) returning "revision"`)
    expect(q.params[0]).toBe('New Co')
    expect(saveSlotsQuery(ID, 4, SLOTS, []).toSQL().sql).not.toContain('"brand_name"')
  } finally {
    vi.useRealTimers()
  }
})

test('recording an open is one statement: the counter and its event come from the same matched row', () => {
  const q = new PgDialect().sqlToQuery(recordOpenSql(ID, NOW, { uaFamily: 'Chrome on Mac', linkFresh: false }))
  expect(q.sql).toBe('with "prev" as (select "id", "last_opened_at" from "aeo_outbound_reports" where "id" = $1 and "status" = \'approved\' and "share_revoked_at" is null and "deleted_at" is null), "upd" as (update "aeo_outbound_reports" set "open_count" = "aeo_outbound_reports"."open_count" + 1, "first_opened_at" = coalesce("aeo_outbound_reports"."first_opened_at", $2::timestamptz), "last_opened_at" = $3::timestamptz from "prev" where "aeo_outbound_reports"."id" = "prev"."id" returning "aeo_outbound_reports"."id"), "cls" as (select "prev"."id", $4::boolean as "fresh", ("prev"."last_opened_at" is not null and $5::timestamptz - "prev"."last_opened_at" < interval \'10 seconds\') as "quick", $6::text = \'Other\' as "unknown" from "prev") insert into "aeo_outbound_opens" ("report_id", "opened_at", "ua_family", "likely_automated", "reason") select "upd"."id", $7::timestamptz, $8::text, ("cls"."fresh" or "cls"."quick" or "cls"."unknown"), case when "cls"."fresh" then $9 when "cls"."quick" then $10 when "cls"."unknown" then $11 else null end from "upd" join "cls" on "cls"."id" = "upd"."id"')
  expect(q.params).toEqual([ID, NOW_ISO, NOW_ISO, false, NOW_ISO, 'Chrome on Mac', NOW_ISO, 'Chrome on Mac',
    'Opened within a minute of the link being created', 'Opened within 10 seconds of the previous open', 'Not a known browser'])
  expect(q.sql).not.toContain('"updated_at"')
})

test('the 0027 migration adds only the opens and settings tables and two report columns, and is additive', () => {
  const sqlText = readFileSync('drizzle/0027_aeo_outbound_v1_1.sql', 'utf8')
  for (const c of ['ADD COLUMN "progress_step" integer DEFAULT 0 NOT NULL', 'ADD COLUMN "error_code" text', '"likely_automated" boolean NOT NULL', '"ua_family" text NOT NULL', 'CONSTRAINT "aeo_outbound_settings_single_row" CHECK ("aeo_outbound_settings"."id")', '"old_value" jsonb']) expect(sqlText).toContain(c)
  const tables = [...sqlText.matchAll(/(?:CREATE TABLE|ALTER TABLE|ON|REFERENCES)\s+"(?:public"\.")?([a-z_]+)"/g)].map((m) => m[1])
  expect(new Set(tables)).toEqual(new Set(['aeo_outbound_reports', 'aeo_outbound_opens', 'aeo_outbound_settings', 'aeo_outbound_settings_log']))
  expect(sqlText).not.toMatch(/\bDROP\b|ALTER COLUMN|RENAME/)
  expect(sqlText).not.toMatch(/\bip\b|user_agent/i)
})
```
Run: `perl -e 'alarm 590; exec @ARGV' -- npx vitest run lib/aeo-outbound/store.test.ts`
Expected: FAIL (the new exports are missing and the changed SQL differs).

- [ ] **Step 4: Implement the store changes**

In `lib/aeo-outbound/opens.ts` append:
```ts
/** An open this soon after the link was created is likely an email security scanner (spec v1.1 §6). */
export const LINK_FRESH_MS = 60_000
/** The reason stored with a likely automated open, by rule, first match wins (spec v1.1 §6). */
export const OPEN_REASONS = {
  fresh: 'Opened within a minute of the link being created',
  quick: 'Opened within 10 seconds of the previous open',
  unknown: 'Not a known browser',
} as const
```

In `lib/aeo-outbound/store.ts`:
- Replace the drizzle import (line 4) with `import { and, desc, eq, ilike, inArray, isNull, lt, not, or, sql, type SQL } from 'drizzle-orm'`, the schema import (line 6) with `import { aeoOutboundOpens as o, aeoOutboundReports as t, type AeoOutboundRow } from '@/lib/db/schema'`, and add `import type { ErrorCode } from './error-codes'` and `import { OPEN_REASONS } from './opens'`.
- Replace `markStaleGeneratingQuery` (lines 18 to 22): its `.set` becomes `{ status: 'failed', error: 'Timed out', errorCode: 'stale', updatedAt: now }`.
- Replace `finishFailedQuery` (lines 41 to 46) with:
```ts
export function finishFailedQuery(id: string, error: string, brandName: string | null, now: Date, code: ErrorCode | null = null) {
  return db.update(t)
    .set({ status: 'failed', error: error.slice(0, 500), errorCode: code, brandName, updatedAt: now })
    .where(and(eq(t.id, id), eq(t.status, 'generating')))
    .returning({ id: t.id })
}

/** The generating row's latest step (spec v1.1 §7). Only forward, only while generating, never touches updated_at. */
export function progressStepQuery(id: string, step: number) {
  return db.update(t).set({ progressStep: step }).where(and(eq(t.id, id), eq(t.status, 'generating'), lt(t.progressStep, step)))
}
```
- Replace `saveSlotsQuery` (lines 48 to 53) with:
```ts
/** brandName is passed only for a save of the brand slot (spec v1.1 §3), so the hub and search use the edited name. */
export function saveSlotsQuery(id: string, shownRevision: number, slots: Slots, notes: string[], brandName?: string) {
  return db.update(t)
    .set({
      slots: slots as unknown as Record<string, unknown>, notes, revision: sql`${t.revision} + 1`, updatedAt: new Date(),
      ...(brandName !== undefined ? { brandName } : {}),
    })
    .where(and(eq(t.id, id), eq(t.status, 'draft'), eq(t.revision, shownRevision), isNull(t.deletedAt)))
    .returning({ revision: t.revision })
}
```
- Replace lines 100 to 117 (`liveByTokenQuery`, `getLiveByToken`, `recordOpenQuery`) with:
```ts
export function liveByTokenQuery(token: string) {
  return db.select({ id: t.id, html: t.html, approvedAt: t.approvedAt }).from(t)
    .where(and(eq(t.shareToken, token), eq(t.status, 'approved'), isNull(t.shareRevokedAt), isNull(t.deletedAt))).limit(1)
}

/** The row id, frozen HTML and link creation time for a live link, or undefined for unknown, revoked or discarded tokens. */
export async function getLiveByToken(token: string): Promise<{ id: string; html: string; approvedAt: Date | null } | undefined> {
  if (!isShareTokenShape(token)) return undefined
  const r = (await liveByTokenQuery(token))[0]
  return r?.html ? { id: r.id, html: r.html, approvedAt: r.approvedAt } : undefined
}

/** Counts one open of a live link. Leaves updated_at alone: an open is not an edit. Returns no rows. Replaced by recordOpen in Task 8. */
export function recordOpenQuery(id: string, now: Date) {
  return db.update(t)
    .set({ openCount: sql`${t.openCount} + 1`, firstOpenedAt: sql`coalesce(${t.firstOpenedAt}, ${now.toISOString()}::timestamptz)`, lastOpenedAt: now })
    .where(and(eq(t.id, id), eq(t.status, 'approved'), isNull(t.shareRevokedAt), isNull(t.deletedAt)))
}

/**
 * One counted open as one statement (spec v1.1 §6): the counter update and the event insert both come from the same
 * live-row match, so they always agree, and the event's classification reads the previous open in that statement. Two
 * opens in the same instant may both miss each other (best effort, stated in the hub's caveat).
 */
export function recordOpenSql(id: string, now: Date, v: { uaFamily: string; linkFresh: boolean }): SQL {
  const at = now.toISOString()
  return sql`with "prev" as (select "id", "last_opened_at" from "aeo_outbound_reports" where "id" = ${id} and "status" = 'approved' and "share_revoked_at" is null and "deleted_at" is null), "upd" as (update "aeo_outbound_reports" set "open_count" = "aeo_outbound_reports"."open_count" + 1, "first_opened_at" = coalesce("aeo_outbound_reports"."first_opened_at", ${at}::timestamptz), "last_opened_at" = ${at}::timestamptz from "prev" where "aeo_outbound_reports"."id" = "prev"."id" returning "aeo_outbound_reports"."id"), "cls" as (select "prev"."id", ${v.linkFresh}::boolean as "fresh", ("prev"."last_opened_at" is not null and ${at}::timestamptz - "prev"."last_opened_at" < interval '10 seconds') as "quick", ${v.uaFamily}::text = 'Other' as "unknown" from "prev") insert into "aeo_outbound_opens" ("report_id", "opened_at", "ua_family", "likely_automated", "reason") select "upd"."id", ${at}::timestamptz, ${v.uaFamily}::text, ("cls"."fresh" or "cls"."quick" or "cls"."unknown"), case when "cls"."fresh" then ${OPEN_REASONS.fresh} when "cls"."quick" then ${OPEN_REASONS.quick} when "cls"."unknown" then ${OPEN_REASONS.unknown} else null end from "upd" join "cls" on "cls"."id" = "upd"."id"`
}

export async function recordOpen(id: string, now: Date, v: { uaFamily: string; linkFresh: boolean }): Promise<void> {
  await db.execute(recordOpenSql(id, now, v))
}
```
- Replace lines 133 to 171 (`hubColumns` through `listReportSummaries`) with:
```ts
// The hub's per-row open counts, from an aggregate over aeo_outbound_opens (spec v1.1 §6). Written as raw SQL because a
// Drizzle column inside sql`` in a one-table select renders unqualified, and a bare "id" here would mean the opens row.
const OPENS_PERSON = sql<number>`(select count(*) from "aeo_outbound_opens" o where o."report_id" = "aeo_outbound_reports"."id" and not o."likely_automated")`.mapWith(Number)
const OPENS_AUTOMATED = sql<number>`(select count(*) from "aeo_outbound_opens" o where o."report_id" = "aeo_outbound_reports"."id" and o."likely_automated")`.mapWith(Number)
const plainHubColumns = {
  id: t.id, peecProjectId: t.peecProjectId, peecProjectName: t.peecProjectName, brandName: t.brandName, status: t.status,
  error: t.error, errorCode: t.errorCode, progressStep: t.progressStep, shareToken: t.shareToken, shareRecipient: t.shareRecipient,
  openCount: t.openCount, firstOpenedAt: t.firstOpenedAt, lastOpenedAt: t.lastOpenedAt, createdAt: t.createdAt, createdBy: t.createdBy,
  approvedAt: t.approvedAt, approvedBy: t.approvedBy, shareRevokedAt: t.shareRevokedAt, requestedStart: t.requestedStart, requestedEnd: t.requestedEnd,
}
const hubColumns = { ...plainHubColumns, opensPerson: OPENS_PERSON, opensAutomated: OPENS_AUTOMATED }
/** One hub row: the columns the list shows plus the two open counts, never data, slots, notes or html. */
export type ReportSummary = Pick<AeoOutboundRow, keyof typeof plainHubColumns> & { opensPerson: number; opensAutomated: number }
/** Where Show older continues: the oldest recent row already sent, as ISO time and id. */
export type HubCursor = { before: string; beforeId: string }

/** Search over brand, Peec project, recipient and creator; %, _ and \ match literally (spec v1.1 §5). */
function searchWhere(q: string | null): SQL | undefined {
  if (!q) return undefined
  const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
  return or(ilike(t.brandName, pattern), ilike(t.peecProjectName, pattern), ilike(t.shareRecipient, pattern), ilike(t.createdBy, pattern))
}
/** created_at at millisecond precision, the precision a JS Date carries, so a cursor never skips a row. */
const createdMs = sql`date_trunc('milliseconds', ${t.createdAt})`

/** Every live link, with no limit, so a live link can never fall off the hub. */
export function liveSummariesQuery(q: string | null = null) {
  return db.select(hubColumns).from(t).where(and(eq(t.status, 'approved'), isNull(t.shareRevokedAt), isNull(t.deletedAt), searchWhere(q)))
}

/** The newest rows that are not live and not discarded, below an optional cursor. */
export function recentSummariesQuery(limit: number, q: string | null = null, before: { createdAt: Date; id: string } | null = null) {
  const iso = before?.createdAt.toISOString()
  const below = before ? or(sql`${createdMs} < ${iso}::timestamptz`, and(sql`${createdMs} = ${iso}::timestamptz`, lt(t.id, before.id))) : undefined
  return db.select(hubColumns).from(t)
    .where(and(isNull(t.deletedAt), not(and(eq(t.status, 'approved'), isNull(t.shareRevokedAt))!), searchWhere(q), below))
    .orderBy(desc(createdMs), desc(t.id)).limit(limit)
}

export const HUB_RECENT_LIMIT = 500

/** All live links plus the newest HUB_RECENT_LIMIT others, each row once, newest first; with a cursor, only the next
 *  HUB_RECENT_LIMIT older rows (the live ones are already on screen). */
export async function listReportSummaries(opts: { q?: string | null; before?: { createdAt: Date; id: string } | null } = {}): Promise<{ rows: ReportSummary[]; cursor: HubCursor | null }> {
  const q = opts.q ?? null
  const before = opts.before ?? null
  const [live, recent] = await Promise.all([
    before ? Promise.resolve([] as ReportSummary[]) : liveSummariesQuery(q),
    recentSummariesQuery(HUB_RECENT_LIMIT + 1, q, before),
  ])
  const page = recent.slice(0, HUB_RECENT_LIMIT)
  const last = page.at(-1)
  const cursor = recent.length > HUB_RECENT_LIMIT && last ? { before: last.createdAt.toISOString(), beforeId: last.id } : null
  const seen = new Set<string>()
  const rows = [...live, ...page]
    .filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  return { rows, cursor }
}

export type HubCounts = { all: number; draft: number; live: number; revoked: number; failed: number }
/** The tab counts in one statement over every row not discarded (spec v1.1 §5), a stale generating row counting as failed. */
export function hubCountsQuery(q: string | null, now: Date) {
  const stale = staleBefore(now).toISOString()
  return db.select({
    all: sql<number>`count(*)`.mapWith(Number),
    draft: sql<number>`count(*) filter (where ${t.status} = 'draft')`.mapWith(Number),
    live: sql<number>`count(*) filter (where ${t.status} = 'approved' and ${t.shareRevokedAt} is null)`.mapWith(Number),
    revoked: sql<number>`count(*) filter (where ${t.status} = 'approved' and ${t.shareRevokedAt} is not null)`.mapWith(Number),
    failed: sql<number>`count(*) filter (where ${t.status} = 'failed' or (${t.status} = 'generating' and ${t.createdAt} < ${stale}::timestamptz))`.mapWith(Number),
  }).from(t).where(and(isNull(t.deletedAt), searchWhere(q)))
}
export async function hubCounts(q: string | null, now: Date): Promise<HubCounts> {
  return (await hubCountsQuery(q, now))[0] ?? { all: 0, draft: 0, live: 0, revoked: 0, failed: 0 }
}

export type ProjectStat = { count: number; last: string }
/** For the project picker's "{n} snapshots, last {date}" (spec v1.1 §11). */
export function projectStatsQuery() {
  return db.select({ projectId: t.peecProjectId, count: sql<number>`count(*)`.mapWith(Number), last: sql<Date>`max(${t.createdAt})`.mapWith(t.createdAt) })
    .from(t).where(isNull(t.deletedAt)).groupBy(t.peecProjectId)
}
export async function projectStats(): Promise<Record<string, ProjectStat>> {
  const out: Record<string, ProjectStat> = {}
  for (const r of await projectStatsQuery()) out[r.projectId] = { count: r.count, last: r.last.toISOString() }
  return out
}

/** The open list the editor shows for a live or revoked row: newest first, at most 200. */
export function opensForReportQuery(id: string) {
  return db.select({ openedAt: o.openedAt, uaFamily: o.uaFamily, likelyAutomated: o.likelyAutomated, reason: o.reason })
    .from(o).where(eq(o.reportId, id)).orderBy(desc(o.openedAt)).limit(200)
}
```
- Update the file's header comment (lines 1 to 3) to: `// The only reader and writer of aeo_outbound_reports and aeo_outbound_opens (spec §9, v1.1 §6). Every write is one conditional statement; all but markStaleGeneratingQuery, progressStepQuery and the open writes end in .returning(), so a lost race matches nothing instead of reporting success (app/actions/commentary.ts:17-37).`

In `app/tools/new-business/page.tsx` line 12 change `(await listReportSummaries()).map((r) => ({` to `(await listReportSummaries()).rows.map((r) => ({`.

Run the store tests. Expected: PASS.

- [ ] **Step 5: Write the failing settings-store tests**

Create `lib/aeo-outbound/settings-store.test.ts`:
```ts
import { expect, test, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import { readSettingsRowQuery, recentSettingsLogQuery, saveSettingsSql, type SettingsValues } from './settings-store'

const V: SettingsValues = {
  users: ['ana@avenuez.com'], admins: [], sectionTitles: ['Category data', 'Competitive visibility'], fixedNextStep: null,
  rankAmong: 7, peecOpportunityRows: 1, methodologyStatesPromptsAndModels: true, sidebarWordmark: 'AIVx',
}
const CHANGES = [{ field: 'users', oldValue: [], newValue: ['ana@avenuez.com'] }, { field: 'rankAmong', oldValue: null, newValue: 7 }]
const NOW = new Date('2026-10-11T12:00:00Z')
const LOG = ' insert into "aeo_outbound_settings_log" ("changed_at", "changed_by", "field", "old_value", "new_value") select '

test('the settings read is the single row by its true key', () => {
  const q = readSettingsRowQuery().toSQL()
  expect(q.sql).toBe('select "id", "users", "admins", "section_titles", "fixed_next_step", "rank_among", "peec_opportunity_rows", "methodology_states_prompts_and_models", "sidebar_wordmark", "updated_at", "updated_by" from "aeo_outbound_settings" where "aeo_outbound_settings"."id" = $1 limit $2')
  expect(q.params).toEqual([true, 1])
})

test('a first save inserts the row and its log entries in one statement, and does nothing if a row appeared meanwhile', () => {
  const q = new PgDialect().sqlToQuery(saveSettingsSql(V, CHANGES, 'admin@avenuez.com', NOW, null))
  expect(q.sql.startsWith('with "s" as (insert into "aeo_outbound_settings" ("id", "users", "admins", "section_titles", "fixed_next_step", "rank_among", "peec_opportunity_rows", "methodology_states_prompts_and_models", "sidebar_wordmark", "updated_at", "updated_by") values (true, $1::jsonb, $2::jsonb, $3::jsonb, $4::text, $5::integer, $6::integer, $7::boolean, $8::text, $9::timestamptz, $10::text) on conflict ("id") do nothing returning "id")')).toBe(true)
  expect(q.sql).toContain(`)${LOG}$11::timestamptz, $12::text, "v"."field", "v"."old_value", "v"."new_value" from "s", (values ($13::text, $14::jsonb, $15::jsonb), ($16::text, $17::jsonb, $18::jsonb)) as "v"("field", "old_value", "new_value") returning "id"`)
  expect(q.params).toEqual(['["ana@avenuez.com"]', '[]', '["Category data","Competitive visibility"]', null, 7, 1, true, 'AIVx', NOW.toISOString(), 'admin@avenuez.com',
    NOW.toISOString(), 'admin@avenuez.com', 'users', '[]', '["ana@avenuez.com"]', 'rankAmong', 'null', '7'])
})

test('a later save matches the updated_at the editor loaded, so a concurrent save matches nothing', () => {
  const q = new PgDialect().sqlToQuery(saveSettingsSql(V, CHANGES, 'admin@avenuez.com', NOW, '2026-10-10T09:00:00.000Z'))
  expect(q.sql).toContain('"updated_at" = $9::timestamptz, "updated_by" = $10::text where "id" = true and "updated_at" = $11::timestamptz returning "id")')
  expect(q.params[10]).toBe('2026-10-10T09:00:00.000Z')
})

test('a save with no changes is refused before any SQL', () => {
  expect(() => saveSettingsSql(V, [], 'admin@avenuez.com', NOW, null)).toThrow('saveSettingsSql needs at least one change')
})

test('saveSettings is true when the write matched and false when it did not', async () => {
  vi.resetModules()
  const execute = vi.fn().mockResolvedValueOnce({ rows: [{ id: 'x' }, { id: 'y' }] }).mockResolvedValueOnce({ rows: [] })
  vi.doMock('@/lib/db/client', () => ({ db: { execute } }))
  try {
    const store = await import('./settings-store')
    expect(await store.saveSettings(V, CHANGES, 'admin@avenuez.com', NOW, null)).toBe(true)
    expect(await store.saveSettings(V, CHANGES, 'admin@avenuez.com', NOW, '2026-10-10T09:00:00.000Z')).toBe(false)
  } finally {
    vi.doUnmock('@/lib/db/client')
    vi.resetModules()
  }
})

test('the log read is newest first', () => {
  const q = recentSettingsLogQuery(20).toSQL()
  expect(q.sql).toBe('select "changed_at", "changed_by", "field" from "aeo_outbound_settings_log" order by "aeo_outbound_settings_log"."changed_at" desc limit $1')
  expect(q.params).toEqual([20])
})
```
Run: `perl -e 'alarm 590; exec @ARGV' -- npx vitest run lib/aeo-outbound/settings-store.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 6: Implement the settings store**

Create `lib/aeo-outbound/settings-store.ts`:
```ts
// The only reader and writer of aeo_outbound_settings and aeo_outbound_settings_log (spec v1.1 §8). A save is one
// statement: the settings write and its log rows together, guarded by the updated_at the editor loaded, so a second
// concurrent save matches nothing and is told to reload.
import { desc, eq, sql, type SQL } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { aeoOutboundSettings as s, aeoOutboundSettingsLog as log, type AeoOutboundSettingsRow } from '@/lib/db/schema'

export interface SettingsValues {
  users: string[]
  admins: string[]
  sectionTitles: [string, string]
  fixedNextStep: string | null
  rankAmong: number | null
  peecOpportunityRows: number
  methodologyStatesPromptsAndModels: boolean
  sidebarWordmark: 'AIVx' | 'Avenue Z'
}
export interface SettingsChange { field: string; oldValue: unknown; newValue: unknown }

export function readSettingsRowQuery() {
  return db.select().from(s).where(eq(s.id, true)).limit(1)
}

/** The settings row, or null when none was ever saved. */
export async function readSettingsRow(): Promise<AeoOutboundSettingsRow | null> {
  return (await readSettingsRowQuery())[0] ?? null
}

/** expectedUpdatedAt null means the editor saw no row: insert, and do nothing if one appeared meanwhile. */
export function saveSettingsSql(v: SettingsValues, changes: SettingsChange[], by: string, now: Date, expectedUpdatedAt: string | null): SQL {
  if (!changes.length) throw new Error('saveSettingsSql needs at least one change')
  const at = now.toISOString()
  const j = (x: unknown) => JSON.stringify(x)
  const write = expectedUpdatedAt === null
    ? sql`insert into "aeo_outbound_settings" ("id", "users", "admins", "section_titles", "fixed_next_step", "rank_among", "peec_opportunity_rows", "methodology_states_prompts_and_models", "sidebar_wordmark", "updated_at", "updated_by") values (true, ${j(v.users)}::jsonb, ${j(v.admins)}::jsonb, ${j(v.sectionTitles)}::jsonb, ${v.fixedNextStep}::text, ${v.rankAmong}::integer, ${v.peecOpportunityRows}::integer, ${v.methodologyStatesPromptsAndModels}::boolean, ${v.sidebarWordmark}::text, ${at}::timestamptz, ${by}::text) on conflict ("id") do nothing returning "id"`
    : sql`update "aeo_outbound_settings" set "users" = ${j(v.users)}::jsonb, "admins" = ${j(v.admins)}::jsonb, "section_titles" = ${j(v.sectionTitles)}::jsonb, "fixed_next_step" = ${v.fixedNextStep}::text, "rank_among" = ${v.rankAmong}::integer, "peec_opportunity_rows" = ${v.peecOpportunityRows}::integer, "methodology_states_prompts_and_models" = ${v.methodologyStatesPromptsAndModels}::boolean, "sidebar_wordmark" = ${v.sidebarWordmark}::text, "updated_at" = ${at}::timestamptz, "updated_by" = ${by}::text where "id" = true and "updated_at" = ${expectedUpdatedAt}::timestamptz returning "id"`
  const rows = sql.join(changes.map((c) => sql`(${c.field}::text, ${j(c.oldValue)}::jsonb, ${j(c.newValue)}::jsonb)`), sql`, `)
  return sql`with "s" as (${write}) insert into "aeo_outbound_settings_log" ("changed_at", "changed_by", "field", "old_value", "new_value") select ${at}::timestamptz, ${by}::text, "v"."field", "v"."old_value", "v"."new_value" from "s", (values ${rows}) as "v"("field", "old_value", "new_value") returning "id"`
}

/** True when the save landed (one log row per change came back); false when another save got there first. */
export async function saveSettings(v: SettingsValues, changes: SettingsChange[], by: string, now: Date, expectedUpdatedAt: string | null): Promise<boolean> {
  const res = await db.execute(saveSettingsSql(v, changes, by, now, expectedUpdatedAt))
  return res.rows.length > 0
}

export function recentSettingsLogQuery(limit: number) {
  return db.select({ changedAt: log.changedAt, changedBy: log.changedBy, field: log.field }).from(log).orderBy(desc(log.changedAt)).limit(limit)
}
```
Run the settings-store tests. Expected: PASS.

- [ ] **Step 7: Gate, commit, push**

Run the gate. Commit `lib/db/schema.ts drizzle/0027_aeo_outbound_v1_1.sql drizzle/meta/0027_snapshot.json drizzle/meta/_journal.json lib/aeo-outbound/opens.ts lib/aeo-outbound/store.ts lib/aeo-outbound/store.test.ts lib/aeo-outbound/settings-store.ts lib/aeo-outbound/settings-store.test.ts app/tools/new-business/page.tsx` with subject `Add migration 0027 and the store queries for opens, progress, the hub and settings` and this body:
```
Migration 0027 is generated and committed, not applied (spec v1.1 §13).

Edge cases (shared state in Postgres; search text from the URL):
- external failure: a failing query rejects to its caller, which logs it (Tasks 4, 5, 8, 11): fix
- operator visibility: no new logging here; callers log the row id and the error code: decline
- bounds: the hub reads every live row plus 501 recent; open counts use the (report_id, opened_at) index; the open list is capped at 200: fix
- input boundaries: search text is escaped for ILIKE and bound as a parameter; the cursor is bound, compared at millisecond precision: fix
- state and concurrency: progress only moves forward while generating; the open counter and its event are one statement; a settings save is guarded by the loaded updated_at: fix. Two opens in the same instant may miss each other: decline, best effort and stated in the caveat
- security: every value is a bound parameter; no IP address or full user agent column exists: fix
```
Then push.

---
### Task 3: Data version 2: structured notes, metrics, Data block, charts

Covers v1.1 §4 (structured notes and kinds), §9 (own brand on the chart and in the top-5 line, own domains paired, single-brand share of voice card dropped, one-decimal gap points capped at the 5 nearest, the donut hover), §10 (`schemaVersion` 2 with a version 1 reader), §8 (the settings a row was generated with travel in its data), round-2 MINORs 4 and 7.

**Files:**
- Create: `lib/aeo-outbound/notes.ts`, `lib/aeo-outbound/notes.test.ts`
- Modify: `lib/aeo-outbound/metrics.ts:1-207` (types and `buildSnapshotData`), `lib/aeo-outbound/metrics.test.ts`
- Modify: `lib/aeo-outbound/prompt.ts:3,15-39,41-42,64-66`, `lib/aeo-outbound/prompt.test.ts` (append)
- Modify: `lib/aeo-outbound/charts.ts:44-46,79`, `lib/aeo-outbound/charts.test.ts:21-27` (and append)
- Modify: `lib/aeo-outbound/v1-compat.test.ts` (the hover carve-out)
- Modify: `lib/db/schema.ts:504` (`notes` `$type`), `lib/aeo-outbound/store.ts:15-16,34,48`, `lib/aeo-outbound/generate.ts:13-15`, `components/aeo-outbound/editor.tsx:28,37,96,315`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `notes.ts`: `NOTE_KINDS`, `type NoteKind`, `interface Note { kind: NoteKind; path?: string; text: string }`, `type StoredNote = string | Note`, `type NoteGroup = 'fill' | 'check' | 'about'`, `noteGroup(n: StoredNote): NoteGroup`, `noteText(n: StoredNote): string`, `isNote(v): v is Note`, `isStoredNotes(v): v is StoredNote[]`
  - `metrics.ts`: `interface SettingsUsed { rankAmong: number | null; peecOpportunityRows: number; methodologyStatesPromptsAndModels: boolean; fixedNextStep: string | null }`, `V1_SETTINGS_USED`, `settingsUsedOf(d): SettingsUsed`, `interface OwnSite { domain: string; retrievedChats: number; retrievedPct: number | null }`; `SnapshotData` gains optional `schemaVersion?: 2`, `projectStatus?: string`, `ownSites?: OwnSite[]`, `settingsUsed?: SettingsUsed`, and `notes: StoredNote[]`; `buildSnapshotData(pull, generatedAt, decisions = DECISIONS, used: Omit<SettingsUsed, 'rankAmong'> = V1_SETTINGS_USED)` returns version 2 data
  - `charts.ts`: `visibilityBarFigure(brands: { name: string; visibilityPct: number; isOwn?: boolean }[])`
  - `store.ts`: `ReportRow.notes: StoredNote[] | null`; `finishDraftQuery` and `saveSlotsQuery` take `notes: StoredNote[]`
  - `generate.ts`: `GenerationResult` success `notes: StoredNote[]`

- [ ] **Step 1: Write the failing notes tests**

Create `lib/aeo-outbound/notes.test.ts`:
```ts
import { expect, test } from 'vitest'
import { isStoredNotes, NOTE_KINDS, noteGroup, noteText, type NoteKind } from './notes'

test('every kind belongs to the group spec v1.1 §4 names, and an old plain-string note is a Check these item', () => {
  const groups = Object.fromEntries(NOTE_KINDS.map((k) => [k, noteGroup({ kind: k, text: 'x' })]))
  const want: Record<NoteKind, string> = {
    needs_validation: 'fill',
    number_not_in_data: 'check', domain_not_in_data: 'check', long_dash: 'check', kpi_changed: 'check', brand_changed: 'check',
    high_visibility: 'check', missing_metric: 'check', no_competitors: 'check', no_data_brands: 'check',
    rank_basis: 'about', requested_range: 'about', project: 'about', peec_warning: 'about', own_domains: 'about', empty_source_mix: 'about', no_profile: 'about',
  }
  expect(groups).toEqual(want)
  expect(noteGroup('An old note')).toBe('check')
  expect(noteText('An old note')).toBe('An old note')
  expect(noteText({ kind: 'long_dash', path: 'why', text: 'contains a long dash; use a period or comma' })).toBe('contains a long dash; use a period or comma')
})

test('isStoredNotes accepts strings and well-formed Notes only', () => {
  expect(isStoredNotes(['a', { kind: 'project', text: 'b' }, { kind: 'number_not_in_data', path: 'why', text: 'c' }])).toBe(true)
  for (const bad of [null, 'a', [{ kind: 'nope', text: 'x' }], [{ kind: 'project' }], [{ kind: 'project', text: 'x', path: 5 }], [5]]) expect(isStoredNotes(bad)).toBe(false)
})
```
Run: `perl -e 'alarm 590; exec @ARGV' -- npx vitest run lib/aeo-outbound/notes.test.ts` (FAIL: module missing).

- [ ] **Step 2: Implement notes**

Create `lib/aeo-outbound/notes.ts`:
```ts
// Structured notes (spec v1.1 §4). Rows from before v1.1 store plain strings; the editor shows those under "Check these".
// A row's notes column holds the data notes followed by the grounding flags of its latest save: (string | Note)[].
export const NOTE_KINDS = [
  'needs_validation',
  'number_not_in_data', 'domain_not_in_data', 'long_dash', 'kpi_changed', 'brand_changed',
  'high_visibility', 'missing_metric', 'no_competitors', 'no_data_brands',
  'rank_basis', 'requested_range', 'project', 'peec_warning', 'own_domains', 'empty_source_mix', 'no_profile',
] as const
export type NoteKind = (typeof NOTE_KINDS)[number]
/** path is the full slot path when the note is about one field (for example competitive_bullets.0.lead). */
export interface Note { kind: NoteKind; path?: string; text: string }
export type StoredNote = string | Note
export type NoteGroup = 'fill' | 'check' | 'about'

const ABOUT: ReadonlySet<NoteKind> = new Set<NoteKind>(['rank_basis', 'requested_range', 'project', 'peec_warning', 'own_domains', 'empty_source_mix', 'no_profile'])

export const noteGroup = (n: StoredNote): NoteGroup =>
  typeof n === 'string' ? 'check' : n.kind === 'needs_validation' ? 'fill' : ABOUT.has(n.kind) ? 'about' : 'check'
export const noteText = (n: StoredNote): string => (typeof n === 'string' ? n : n.text)

export function isNote(v: unknown): v is Note {
  if (!v || typeof v !== 'object') return false
  const n = v as Record<string, unknown>
  return (NOTE_KINDS as readonly unknown[]).includes(n.kind) && typeof n.text === 'string' && (n.path === undefined || typeof n.path === 'string')
}
export const isStoredNotes = (v: unknown): v is StoredNote[] => Array.isArray(v) && v.every((n) => typeof n === 'string' || isNote(n))
```
Run the notes tests: PASS.

- [ ] **Step 3: Write the failing metrics tests (version 2)**

In `lib/aeo-outbound/metrics.test.ts`:
- Change the import on line 3 to `import { buildSnapshotData, fmtDay, fmtEasternDay, pyRound, titleClassification, V1_SETTINGS_USED } from './metrics'` and add `import type { Note, StoredNote } from './notes'`.
- After line 6 add `const texts = (ns: StoredNote[]) => ns.map((n) => (typeof n === 'string' ? n : n.text))`.
- In every assertion that reads a `.notes` array (lines 80, 87, 95, 101, 108, 116, 169, 176, 177, 226, 227, 237, 238, 242, 244, 246, and every `d.notes` or `withVis(...).notes` in lines 271 to 304) wrap that array in `texts(...)`, for example `expect(texts(d.notes)).toContain('No competitors tracked in this Peec project')` and `texts(d.notes).indexOf(WARN('Ace', '90.5'))`. Line 310 (`JSON.stringify({ ...hot, notes: null })`) stays as it is.
- In the test `'only the own brand tracked: no rank card, a note, no competitor gaps'` (lines 90 to 96) add, after line 94:
```ts
  expect(d.kpis.map((k) => k.label)).toEqual(['AI visibility', 'Average answer position'])
  expect(d.notes).toContainEqual({ kind: 'missing_metric', text: 'With no competitors tracked, share of voice is 100% by construction, so that card is left out.' })
```
- Replace the test `'more than one own domain: ...'` (lines 159 to 166) with:
```ts
test('more than one own domain: each is listed with its own count and percentage, and the sum is never paired with one percentage', () => {
  const own = { ...PULL.ownBrand, domains: ['example.com', 'shop.example.com'] }
  const domains = [...PULL.domains, { domain: 'shop.example.com', classification: 'OWN', retrieved_chat_count: 11, retrieval_count: 20, retrieved_percentage: 0.01 }]
  const d = buildSnapshotData({ ...PULL, ownBrand: own, domains }, '2026-10-08T15:00:00Z')
  expect(d.ownSites).toEqual([{ domain: 'example.com', retrievedChats: 1989, retrievedPct: 22.4 }, { domain: 'shop.example.com', retrievedChats: 11, retrievedPct: 1 }])
  expect(d.ownRetrievedChats).toBe(2000)
  expect(d.ownRetrievedPct).toBeNull()
  expect(d.notes).toContainEqual({ kind: 'own_domains', text: 'The brand has 2 own domains with retrievals; each is listed with its own count and percentage.' })
})
```
- Append:
```ts
test('data is schema version 2, with the project status and the settings this generation used', () => {
  const d = buildSnapshotData(PULL, '2026-10-08T15:00:00Z', { ...DEFAULTS, rankAmong: 3 }, { peecOpportunityRows: 2, methodologyStatesPromptsAndModels: false, fixedNextStep: 'Book a working session.' })
  expect(d.schemaVersion).toBe(2)
  expect(d.projectStatus).toBe('PITCH')
  expect(d.settingsUsed).toEqual({ rankAmong: 3, peecOpportunityRows: 2, methodologyStatesPromptsAndModels: false, fixedNextStep: 'Book a working session.' })
  expect(buildSnapshotData(PULL, '2026-10-08T15:00:00Z').settingsUsed).toEqual(V1_SETTINGS_USED)
})

test('every note is a structured Note with the kind its group needs, in the order v1.0 wrote them', () => {
  const d = buildSnapshotData({ ...PULL, profile: null, warnings: ["Peec's prompt count could not be loaded, so the methodology leaves it out."] }, '2026-10-08T15:00:00Z')
  expect(d.notes.every((n) => typeof n === 'object')).toBe(true)
  expect(d.notes.map((n) => (n as Note).kind)).toEqual(['rank_basis', 'requested_range', 'no_profile', 'peec_warning', 'project'])
  expect(d.notes).toContainEqual({ kind: 'peec_warning', text: "Peec's prompt count could not be loaded, so the methodology leaves it out." })
})

test('a missing share of voice or position is a missing_metric note; brands with no data are a no_data_brands note', () => {
  const brands = PULL.brands.map((b) => (b.brand.id === 'kw_own' ? { ...b, share_of_voice: null } : b))
  expect(buildSnapshotData({ ...PULL, brands }, '2026-10-08T15:00:00Z').notes).toContainEqual({ kind: 'missing_metric', text: 'Peec has no share of voice for the brand in this window, so that card is left out.' })
  const roster = [...PULL.roster, { id: 'kw_z', name: 'Zed', is_own: false, domains: [] }]
  expect(buildSnapshotData({ ...PULL, roster }, '2026-10-08T15:00:00Z').notes).toContainEqual({ kind: 'no_data_brands', text: '1 tracked brand has no Peec data in this window and counts as zero visibility.' })
})
```
Run: `perl -e 'alarm 590; exec @ARGV' -- npx vitest run lib/aeo-outbound/metrics.test.ts` (FAIL).

- [ ] **Step 4: Implement metrics version 2**

In `lib/aeo-outbound/metrics.ts`:
- Replace lines 1 to 36 with:
```ts
// Turns a Peec pull into the numbers the page shows and Glean writes from (spec §5a, §7; v1.1 §4, §9, §10).
// It writes schema version 2: structured notes, each own domain on its own, the project status and the settings used.
import { DECISIONS, IMPLAUSIBLE_VISIBILITY_PCT } from './config'
import type { Note, NoteKind, StoredNote } from './notes'
import type { PeecPull } from './pull'

/** The three DECISIONS this file reads; a parameter so tests can cover both settings of each. */
export type MetricDecisions = Pick<typeof DECISIONS, 'rankAmong' | 'competitorSiteGaps' | 'sourceMixWeight'>

/** The settings a generation used. Stored with the data so a later settings change never alters the row (v1.1 §8). */
export interface SettingsUsed {
  rankAmong: number | null
  peecOpportunityRows: number
  methodologyStatesPromptsAndModels: boolean
  fixedNextStep: string | null
}
/** What a row from before v1.1 was generated with: the config.ts constants, never live settings. */
export const V1_SETTINGS_USED: SettingsUsed = {
  rankAmong: DECISIONS.rankAmong,
  peecOpportunityRows: DECISIONS.peecOpportunityRows,
  methodologyStatesPromptsAndModels: DECISIONS.methodologyStatesPromptsAndModels,
  fixedNextStep: DECISIONS.fixedNextStep,
}
export const settingsUsedOf = (d: { settingsUsed?: SettingsUsed }): SettingsUsed => d.settingsUsed ?? V1_SETTINGS_USED

export interface BrandMetric { id: string; name: string; isOwn: boolean; visibilityPct: number; sovPct: number | null; position: number | null; rank: number }
export interface Kpi { label: string; value: string }
export interface SourceSlice { label: string; weight: number; pct: number }
export interface OwnSite { domain: string; retrievedChats: number; retrievedPct: number | null }
export interface SnapshotData {
  /** 2 for rows generated by v1.1. Absent on version 1 rows, which keep their version 1 Data block and notes. */
  schemaVersion?: 2
  projectId: string
  projectName: string
  brand: string
  generatedAt: string
  window: { start: string; end: string }
  windowLabel: string
  category: string | null
  market: string | null
  brands: BrandMetric[]
  own: BrandMetric
  kpis: Kpi[]
  competitorsTracked: number
  /** The size of the ranked set: the n in "#i of n brands". */
  rankN: number
  leaderGaps: { name: string; visibilityPoints: number; sovPoints: number | null }[]
  ownDomains: string[]
  /** Every own domain's retrieved chats added up. Never paired with one domain's percentage. */
  ownRetrievedChats: number
  /** The own site's percentage when exactly one own domain has retrievals (version 2), else null. */
  ownRetrievedPct: number | null
  sourceMix: SourceSlice[]
  gapDomains: { domain: string; retrievedChats: number }[]
  actions: { title: string; impact: string; type: string }[]
  promptCount: number | null
  models: string[]
  /** Version 1 rows hold strings; version 2 rows hold Note objects. */
  notes: StoredNote[]
  /** Version 2: Peec's project status (PITCH or PITCH_ENDED). */
  projectStatus?: string
  /** Version 2: each own domain with retrievals, most retrieved first. */
  ownSites?: OwnSite[]
  /** Version 2: the settings this generation used. */
  settingsUsed?: SettingsUsed
}
```
- Lines 38 to 73 (`pyRound` to `bare`) stay.
- Replace lines 75 to 207 (`buildSnapshotData`) with:
```ts
export function buildSnapshotData(
  pull: PeecPull,
  generatedAt: string,
  decisions: MetricDecisions = DECISIONS,
  used: Omit<SettingsUsed, 'rankAmong'> = V1_SETTINGS_USED,
): SnapshotData {
  if (decisions.rankAmong !== null && !(Number.isInteger(decisions.rankAmong) && decisions.rankAmong >= 2)) throw new Error('DECISIONS.rankAmong must be null or a whole number of 2 or more')
  const notes: Note[] = []
  const note = (kind: NoteKind, text: string) => { notes.push({ kind, text }) }
  // One entry per distinct brand id across the roster and the report rows. A roster brand with no row is a
  // zero-visibility entry for ranking only (spec "Competitive rank"): it is never drawn or listed.
  type Entry = { id: string; name: string; visibility: number; share_of_voice: number | null | undefined; position: number | null | undefined; hasRow: boolean; pct: number }
  const byId = new Map<string, Entry>()
  for (const b of pull.roster) byId.set(b.id, { id: b.id, name: b.name, visibility: 0, share_of_voice: null, position: null, hasRow: false, pct: 0 })
  for (const r of pull.brands) byId.set(r.brand.id, { id: r.brand.id, name: r.brand.name, visibility: r.visibility, share_of_voice: r.share_of_voice, position: r.position, hasRow: true, pct: pct1(r.visibility) })
  const entries = [...byId.values()].sort((a, b) => (b.pct - a.pct) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const totalBrands = entries.length
  // Q2: keep the brand and its rankAmong - 1 most visible competitors, in displayed-visibility order.
  const cut = decisions.rankAmong !== null && decisions.rankAmong < totalBrands
  const keptIds = new Set(entries.filter((e) => e.id !== pull.ownBrand.id).slice(0, cut ? decisions.rankAmong! - 1 : totalBrands).map((e) => e.id))
  const ranked = entries.filter((e) => e.id === pull.ownBrand.id || keptIds.has(e.id))
  const rankN = ranked.length
  const noData = entries.filter((e) => !e.hasRow).length
  const brands: BrandMetric[] = ranked.filter((e) => e.hasRow).map((e) => ({
    id: e.id,
    name: e.name,
    isOwn: e.id === pull.ownBrand.id,
    visibilityPct: e.pct,
    sovPct: typeof e.share_of_voice === 'number' ? pct1(e.share_of_voice) : null,
    position: typeof e.position === 'number' ? pyRound(e.position, 1) : null,
    rank: 1 + ranked.filter((o) => o.pct > e.pct).length,
  }))
  const own = brands.find((b) => b.isOwn)!
  const competitorsTracked = pull.roster.filter((b) => !b.is_own).length

  const kpis: Kpi[] = [{ label: 'AI visibility', value: `${own.visibilityPct.toFixed(1)}%` }]
  // v1.1 §9: with no competitors share of voice is 100% by construction, so its card is left out.
  if (own.sovPct === null) note('missing_metric', 'Peec has no share of voice for the brand in this window, so that card is left out.')
  else if (competitorsTracked === 0) note('missing_metric', 'With no competitors tracked, share of voice is 100% by construction, so that card is left out.')
  else kpis.push({ label: 'AI share of voice', value: `${own.sovPct.toFixed(1)}%` })
  if (own.position !== null) kpis.push({ label: 'Average answer position', value: `#${own.position.toFixed(1)}` })
  else note('missing_metric', 'Peec has no answer position for the brand in this window, so that card is left out.')
  if (competitorsTracked > 0) {
    kpis.push({ label: 'Competitive rank', value: `#${own.rank} of ${rankN} brands` })
    note('rank_basis', cut
      ? `Rank is by visibility among ${rankN} of the ${totalBrands} brands tracked in Peec: the brand and the competitors with the highest visibility.`
      : `Rank is by visibility among the ${rankN} brands tracked in Peec.`)
    if (noData === 1) note('no_data_brands', '1 tracked brand has no Peec data in this window and counts as zero visibility.')
    else if (noData > 1) note('no_data_brands', `${noData} tracked brands have no Peec data in this window and count as zero visibility.`)
  } else {
    note('no_competitors', 'No competitors tracked in this Peec project')
  }
  // Spec §7: a note only. Never on the page, in the Data block or in the copy, and it never blocks Approve.
  for (const b of brands) {
    if (b.visibilityPct > IMPLAUSIBLE_VISIBILITY_PCT) {
      note('high_visibility', `${b.name} shows ${b.visibilityPct.toFixed(1)}% AI visibility, which is unusually high. Check this brand's setup in Peec before sending: a name that is a common word can match unrelated answers.`)
    }
  }
  if (pull.rangePicked && (pull.requested.start !== pull.window.start || pull.requested.end !== pull.window.end)) {
    note('requested_range', `Requested ${pull.requested.start} to ${pull.requested.end}; Peec data covers ${pull.window.start} to ${pull.window.end}.`)
  }

  // Spec 5a row 17: competitor minus own from the exact ratios, rounded once at the end. Only brands with a
  // higher displayed visibility and an exact gap above 0 are listed, so a tied brand is never a leader.
  const ownEntry = byId.get(own.id)!
  const leaderGaps = ranked
    .filter((e) => e.hasRow && e.pct > own.visibilityPct)
    .map((rival) => ({
      name: rival.name,
      visibilityPoints: pyRound((rival.visibility - ownEntry.visibility) * 100, 1),
      sovPoints: typeof rival.share_of_voice === 'number' && typeof ownEntry.share_of_voice === 'number'
        ? pyRound((rival.share_of_voice - ownEntry.share_of_voice) * 100, 1)
        : null,
    }))
    .filter((g) => g.visibilityPoints > 0)

  // v1.1 §9: each own domain keeps its own count and percentage; the sum is never paired with one domain's percentage.
  const ownDomains = (pull.ownBrand.domains ?? []).map(bare)
  const ownRows = pull.domains.filter((r) => ownDomains.includes(bare(r.domain)))
  const ownSites: OwnSite[] = ownRows
    .map((r) => ({ domain: r.domain, retrievedChats: r.retrieved_chat_count ?? 0, retrievedPct: typeof r.retrieved_percentage === 'number' ? pct1(r.retrieved_percentage) : null }))
    .sort((a, b) => (b.retrievedChats - a.retrievedChats) || (a.domain < b.domain ? -1 : 1))
  const ownRetrievedChats = ownSites.reduce((s, x) => s + x.retrievedChats, 0)
  const ownRetrievedPct = ownSites.length === 1 ? ownSites[0].retrievedPct : null
  if (!ownRows.length) note('own_domains', "No retrievals of the brand's own site in this window.")
  if (ownRows.length > 1) note('own_domains', `The brand has ${ownRows.length} own domains with retrievals; each is listed with its own count and percentage.`)

  const weights = new Map<string, number>()
  for (const r of pull.domains) {
    const w = r[decisions.sourceMixWeight] ?? 0
    if (w <= 0) continue
    const label = r.classification ? titleClassification(r.classification) : 'Uncategorized'
    weights.set(label, (weights.get(label) ?? 0) + w)
  }
  const total = [...weights.values()].reduce((s, w) => s + w, 0)
  const sourceMix = [...weights.entries()]
    .sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : 1))
    .map(([label, weight]) => ({ label, weight, pct: total ? pyRound((weight / total) * 100, 1) : 0 }))
  if (!sourceMix.length) note('empty_source_mix', 'Peec reported no source weights for this window, so the source mix is empty.')

  const competitorIds = new Set(pull.roster.filter((b) => !b.is_own).map((b) => b.id))
  const rosterDomains = pull.roster.flatMap((b) => (b.domains ?? []).map(bare)).filter(Boolean)
  const isRosterSite = (domain: string) => { const d = bare(domain); return rosterDomains.some((rd) => d === rd || d.endsWith(`.${rd}`)) }
  const gapDomains = !decisions.competitorSiteGaps ? [] : pull.domains
    .filter((r) => {
      if (r.classification === 'COMPETITOR' || r.classification === 'OWN' || isRosterSite(r.domain)) return false
      const ids = new Set((r.mentioned_brands ?? []).map((m) => m.id))
      return !ids.has(pull.ownBrand.id) && [...ids].some((id) => competitorIds.has(id))
    })
    .sort((a, b) => ((b.retrieved_chat_count ?? 0) - (a.retrieved_chat_count ?? 0)) || (a.domain < b.domain ? -1 : 1))
    .slice(0, 4)
    .map((r) => ({ domain: r.domain, retrievedChats: r.retrieved_chat_count ?? 0 }))

  if (!pull.profile) note('no_profile', 'Peec has no project profile, so category and market need validation.')
  for (const w of pull.warnings) note('peec_warning', w)
  note('project', `Peec project ${pull.project.id} (${pull.project.status}). Window ${pull.window.start} to ${pull.window.end}, all models: ${pull.models.join(', ') || 'none reported'}.`)

  return {
    schemaVersion: 2,
    projectId: pull.project.id,
    projectName: pull.project.name,
    brand: pull.ownBrand.name,
    generatedAt,
    window: pull.window,
    windowLabel: pull.window.start === pull.window.end ? fmtDay(pull.window.start) : `${fmtDay(pull.window.start)} to ${fmtDay(pull.window.end)}`,
    category: pull.profile?.industry ?? null,
    market: pull.profile?.markets.length ? pull.profile.markets.join(', ') : null,
    brands,
    own,
    kpis,
    competitorsTracked,
    rankN,
    leaderGaps,
    ownDomains,
    ownRetrievedChats,
    ownRetrievedPct,
    sourceMix,
    gapDomains,
    actions: pull.actions.map((a) => ({ title: String(a.title ?? ''), impact: String(a.impact ?? ''), type: String(a.type ?? '') })).filter((a) => a.title).slice(0, 10),
    promptCount: pull.promptCount,
    models: pull.models,
    notes,
    projectStatus: pull.project.status,
    ownSites,
    settingsUsed: { rankAmong: decisions.rankAmong, peecOpportunityRows: used.peecOpportunityRows, methodologyStatesPromptsAndModels: used.methodologyStatesPromptsAndModels, fixedNextStep: used.fixedNextStep },
  }
}
```
Run the metrics tests: PASS.

- [ ] **Step 5: Write the failing Data block tests (version 2)**

Append to `lib/aeo-outbound/prompt.test.ts`:
```ts
// A version 2 row: same values as D plus the version 2 fields.
const D2 = {
  ...D, schemaVersion: 2, ownSites: [{ domain: 'example.com', retrievedChats: 1989, retrievedPct: 22.4 }],
  settingsUsed: { rankAmong: null, peecOpportunityRows: 1, methodologyStatesPromptsAndModels: true, fixedNextStep: null },
} as unknown as SnapshotData
const line = (d: SnapshotData, start: string) => dataBlock(d).split('\n').find((l) => l.startsWith(start))

test('version 2: gap points always print one decimal, and only the 5 nearest brands above are listed', () => {
  const gaps = [30, 25, 20, 12, 11, 7, 3.4, 1].map((v, i) => ({ name: `Brand${String.fromCharCode(65 + i)}`, visibilityPoints: v, sovPoints: i === 7 ? 1 : null }))
  expect(line({ ...D2, leaderGaps: gaps } as unknown as SnapshotData, 'Gap to each brand')).toBe(
    'Gap to each brand ranked above (visibility points, share of voice points): BrandD 12.0 points; BrandE 11.0 points; BrandF 7.0 points; BrandG 3.4 points; BrandH 1.0 points, 1.0 points')
})

test('version 2: the own brand is always in the brands line, in place of the fifth', () => {
  const many = Array.from({ length: 7 }, (_, i) => ({ id: `b${i}`, name: `Brand${String.fromCharCode(65 + i)}`, isOwn: i === 6, visibilityPct: 50 - i, sovPct: null, position: null, rank: i + 1 }))
  expect(line({ ...D2, brands: many } as unknown as SnapshotData, 'Brands by AI visibility')).toBe(
    'Brands by AI visibility (rank, name, visibility, share of voice): #1 BrandA 50.0%; #2 BrandB 49.0%; #3 BrandC 48.0%; #4 BrandD 47.0%; #7 BrandG 44.0%')
  expect(dataBlock({ ...D, brands: many } as unknown as SnapshotData)).not.toContain('BrandG')
})

test('version 2: with no competitors tracked, share of voice leaves the Data block', () => {
  const own = { id: 'o', name: 'Example Co', isOwn: true, visibilityPct: 15.1, sovPct: 100, position: 3.1, rank: 1 }
  const d = { ...D2, competitorsTracked: 0, rankN: 1, brands: [own], leaderGaps: [], kpis: [{ label: 'AI visibility', value: '15.1%' }, { label: 'Average answer position', value: '#3.1' }] } as unknown as SnapshotData
  expect(line(d, 'Brands by AI visibility')).toBe('Brands by AI visibility (rank, name, visibility, share of voice): Example Co 15.1%')
  expect(dataBlock(d)).not.toContain('100.0%')
})

test('version 2: each own domain is listed with its own count and percentage, and the sum is not printed', () => {
  const d = { ...D2, ownDomains: ['example.com', 'shop.example.com'], ownRetrievedChats: 2000, ownRetrievedPct: null, ownSites: [{ domain: 'example.com', retrievedChats: 1989, retrievedPct: 22.4 }, { domain: 'shop.example.com', retrievedChats: 11, retrievedPct: null }] } as unknown as SnapshotData
  expect(line(d, 'Own site')).toBe('Own site retrievals by domain (answers that retrieved each site): example.com 1,989, which is 22.4% of answers; shop.example.com 11')
  expect(dataBlock(d)).not.toContain('2,000')
})

test('the prompt and the Data block follow the settings the row was generated with, not live settings', () => {
  const d = { ...D2, settingsUsed: { rankAmong: null, peecOpportunityRows: 2, methodologyStatesPromptsAndModels: false, fixedNextStep: 'Book a working session.' } } as unknown as SnapshotData
  expect(dataBlock(d)).not.toContain('Prompts tracked')
  const p = buildPrompt(d, [])
  expect(p).toContain('exactly 2 of the 3 must be based on those actions')
  expect(p).not.toContain('- next_step:')
  expect(p).not.toContain('the prompt count and the AI models covered')
})
```
Run: `perl -e 'alarm 590; exec @ARGV' -- npx vitest run lib/aeo-outbound/prompt.test.ts` (FAIL).

- [ ] **Step 6: Implement the Data block version 2**

In `lib/aeo-outbound/prompt.ts`:
- Replace line 3 (`import { DECISIONS } from './config'`) with `import { DECISIONS } from './config'` (kept for `writeSpecificCategory`) plus `import { settingsUsedOf, type BrandMetric, type SnapshotData } from './metrics'`, and delete the old line 4 type import.
- Replace `dataBlock` (lines 15 to 39) with:
```ts
/** Version 2: the top five by rank, with the own brand in place of the fifth when it ranks lower (v1.1 §9). */
function listedBrands(d: SnapshotData, v2: boolean): BrandMetric[] {
  if (d.competitorsTracked === 0) return d.brands.filter((b) => b.isOwn).slice(0, 5)
  const top = d.brands.slice(0, 5)
  if (!v2 || top.some((b) => b.isOwn)) return top
  const own = d.brands.find((b) => b.isOwn)
  return own ? [...top.slice(0, 4), own] : top
}
/** Version 2: the 5 brands above with the smallest gaps, kept in rank order (v1.1 §9). */
function listedGaps(d: SnapshotData, v2: boolean): SnapshotData['leaderGaps'] {
  if (d.competitorsTracked === 0) return []
  if (!v2) return d.leaderGaps
  const keep = new Set([...d.leaderGaps].sort((a, b) => a.visibilityPoints - b.visibilityPoints).slice(0, 5))
  return d.leaderGaps.filter((g) => keep.has(g))
}

export function dataBlock(d: SnapshotData): string {
  // A version 1 row (no schemaVersion) keeps every version 1 line, so grounding on its saves is unchanged (v1.1 §10).
  const v2 = d.schemaVersion === 2
  // No competitors tracked: Peec can still return a row for a brand outside the roster, and metrics counts it in
  // the rank and the comparison set. Name none of them, and print no rank.
  const noRivals = d.competitorsTracked === 0
  const listed = listedBrands(d, v2)
  const gaps = listedGaps(d, v2)
  const points = (x: number) => (v2 ? x.toFixed(1) : String(x))
  const showSov = !(v2 && noRivals)
  const ownSite = d.ownDomains.length ? `answers that retrieved ${d.ownDomains.map(one).join(', ')}` : "answers that retrieved the brand's own site"
  const ownLine = v2 && d.ownSites && d.ownSites.length
    ? `Own site retrievals by domain (answers that retrieved each site): ${d.ownSites.map((s) => `${one(s.domain)} ${n(s.retrievedChats)}${s.retrievedPct !== null ? `, which is ${p1(s.retrievedPct)} of answers` : ''}`).join('; ')}`
    : `Own site retrievals (${ownSite}): ${n(d.ownRetrievedChats)}${d.ownRetrievedPct !== null ? `, which is ${p1(d.ownRetrievedPct)} of answers` : ''}`
  const lines = [
    `Brand: ${one(d.brand)}`,
    `Category: ${d.category === null ? 'not in Peec' : one(d.category)}`,
    `Market: ${d.market === null ? 'not in Peec' : one(d.market)}`,
    `Data window: ${one(d.windowLabel)}`,
    `Key metrics: ${d.kpis.map((k) => `${one(k.label)} ${one(k.value)}`).join('; ')}`,
    `Competitors tracked in Peec: ${d.competitorsTracked}`,
    ...(noRivals ? [] : [`Brands in the comparison set: ${d.rankN}`]),
    `Brands by AI visibility (rank, name, visibility, share of voice): ${listed.map((b) => `${noRivals ? '' : `#${b.rank} `}${one(b.name)} ${p1(b.visibilityPct)}${showSov && b.sovPct !== null ? ` / ${p1(b.sovPct)}` : ''}`).join('; ') || 'none'}`,
    `Gap to each brand ranked above (visibility points, share of voice points): ${gaps.map((g) => `${one(g.name)} ${points(g.visibilityPoints)} points${typeof g.sovPoints === 'number' && g.sovPoints > 0 ? `, ${points(g.sovPoints)} points` : ''}`).join('; ') || 'none'}`,
    ownLine,
    `Source types by share of retrievals: ${d.sourceMix.map((s) => `${one(s.label)} ${p1(s.pct)}`).join('; ') || 'none'}`,
    `Competitor domain gaps (sites where competitors appear and the brand does not, by answers that used them): ${d.gapDomains.map((g) => `${one(g.domain)} ${n(g.retrievedChats)}`).join('; ') || 'none'}`,
    `Current Peec recommended actions (title, impact): ${d.actions.map((a) => `${one(a.title)} (${impactWords(a.impact)})`).join('; ') || 'none'}`,
  ]
  if (settingsUsedOf(d).methodologyStatesPromptsAndModels) lines.push(`Prompts tracked: ${d.promptCount ?? 'not reported'}`, `AI models covered: ${d.models.map(one).join(', ') || 'not reported'}`)
  return lines.join('\n')
}
```
- In `buildPrompt` (line 41 onward): replace line 42 `const peecRows = DECISIONS.peecOpportunityRows` with `const used = settingsUsedOf(d)` and `const peecRows = used.peecOpportunityRows`; on line 65 replace `DECISIONS.methodologyStatesPromptsAndModels` with `used.methodologyStatesPromptsAndModels`; on line 66 replace `DECISIONS.fixedNextStep === null` with `used.fixedNextStep === null`. `DECISIONS.writeSpecificCategory` on line 66 stays (it is not a setting).

Run the prompt tests and `lib/aeo-outbound/v1-compat.test.ts` (its Data block test must still pass: the version 1 row prints `11 points`). Expected: PASS.

- [ ] **Step 7: Write the failing chart tests**

In `lib/aeo-outbound/charts.test.ts` replace lines 21 to 27 with:
```ts
for (const name of ['sources_8_types', 'sources_3_types']) {
  test(`${name}: identical to AIVx's content-source donut except the Retrievals hover`, () => {
    const eb = C[name].input.earned_breakdown as Record<string, { count: number }>
    const ours = plain(sourceDonutFigure(Object.entries(eb).map(([label, v]) => ({ label, weight: v.count }))))
    const gold = plain(C[name].figure)
    // A deliberate difference from AIVx (spec v1.1 §9): the weight is retrievals, not citations.
    expect(ours.data[0].hovertemplate).toBe('<b>%{label}</b><br>Retrievals: %{value}<extra></extra>')
    for (const f of [ours, gold]) delete f.data[0].hovertemplate
    expect(ours).toEqual(gold)
  })
}
```
and append:
```ts
test('the own brand outside the top 10 replaces the tenth bar', () => {
  const brands = Array.from({ length: 12 }, (_, i) => ({ name: `Brand${i}`, visibilityPct: 60 - i, isOwn: i === 11 }))
  const y = (visibilityBarFigure(brands).data[0] as { y: string[] }).y
  expect(y).toHaveLength(10)
  expect(y[0]).toBe('Brand11')
  expect(y).not.toContain('Brand9')
  expect(y.at(-1)).toBe('Brand0')
})
test('an own brand already in the top 10 changes nothing', () => {
  const brands = Array.from({ length: 12 }, (_, i) => ({ name: `Brand${i}`, visibilityPct: 60 - i, isOwn: i === 3 }))
  expect(plain(visibilityBarFigure(brands))).toEqual(plain(visibilityBarFigure(brands.map(({ isOwn: _o, ...b }) => b))))
})
```
Run: `perl -e 'alarm 590; exec @ARGV' -- npx vitest run lib/aeo-outbound/charts.test.ts` (FAIL).

- [ ] **Step 8: Implement the chart changes**

In `lib/aeo-outbound/charts.ts` replace lines 44 to 46 with:
```ts
export function visibilityBarFigure(brands: { name: string; visibilityPct: number; isOwn?: boolean }[]): Figure {
  let top10 = [...brands.slice(0, 20)].sort((a, b) => b.visibilityPct - a.visibilityPct).slice(0, 10)
  // v1.1 §9: the prospect always shows on its own chart, in place of the tenth bar.
  const own = brands.find((b) => b.isOwn)
  if (own && !top10.includes(own)) top10 = [...top10.slice(0, 9), own]
  const rev = [...top10].reverse()
```
and line 79's hovertemplate with `hovertemplate: '<b>%{label}</b><br>Retrievals: %{value}<extra></extra>',`.

In `lib/aeo-outbound/v1-compat.test.ts` replace the third test with:
```ts
// Deliberate differences from v1.0 (spec v1.1 §9), applied to the frozen v1.0 golden. Later tasks add to this list.
const v11 = (html: string) => {
  expect(html.split('Citations: %{value}')).toHaveLength(2)
  return html.split('Citations: %{value}').join('Retrievals: %{value}')
}
test('a version 1 row renders its final page as v1.0 did, apart from the deliberate changes', () => {
  expect(renderSnapshotHtml(V1_DATA, V1_SLOTS, 'final', 'Oct 9, 2026')).toBe(v11(GOLDEN))
})
```
Run the chart and v1-compat tests: PASS.

- [ ] **Step 9: Carry the note type through store, generate and the editor**

- `lib/db/schema.ts:504`: `notes: jsonb('notes').$type<unknown[]>(),` (the aeo block; the column itself does not change, so no migration).
- `lib/aeo-outbound/store.ts`: add `import type { StoredNote } from './notes'`; line 15 becomes `export type ReportRow = Omit<AeoOutboundRow, 'data' | 'slots' | 'notes'> & { data: SnapshotData | null; slots: Slots | null; notes: StoredNote[] | null }`; in `finishDraftQuery` (line 34) and `saveSlotsQuery` the `notes` parameter type becomes `StoredNote[]`.
- `lib/aeo-outbound/generate.ts`: add `import type { StoredNote } from './notes'` and change line 14 to `| { ok: true; brandName: string; data: SnapshotData; slots: Slots; notes: StoredNote[] }`.
- `components/aeo-outbound/editor.tsx`: import `{ isStoredNotes, noteText, type StoredNote } from '@/lib/aeo-outbound/notes'`; line 28 `notes: StoredNote[]`; line 96 `if (isStoredNotes(b.notes)) setNotes(b.notes)`; line 315 `{notes.map((n, i) => <li key={i}>{noteText(n)}</li>)}`. (Task 10 replaces the drawer; this keeps it compiling and correct now.)

- [ ] **Step 10: Gate, commit, push**

Gate, then commit every file this task touched by name with subject `Write data version 2 with structured notes and the data audit fixes` and body:
```
Version 1 rows keep their Data block (pinned by v1-compat.test.ts). Settings used at generation are stored
in data.settingsUsed so a later settings change never alters a row.

Co-Authored-By: Claude <model> <noreply@anthropic.com>
```
(No edge-case list: pure functions over data already parsed; no boundary, untrusted input or shared state changes here.) Push.

---
### Task 3b: Ryan's answers (spec v1.1 §16.1)

Covers v1.1 §16.1 (Q3, Q5, Q7 and Q10), the Task 3b bullet of §16.4, and the "Answers" tests of §16.6. Added on 2026-10-12 after Tasks 1 to 3 were built; line numbers cite `feat/aeo-outbound-parts` at `0ac4b5b9`.

**Files:**
- Modify: `lib/aeo-outbound/config.ts:14-15,20-21,26-27`, `lib/aeo-outbound/prompt.ts:88,90`, `lib/aeo-outbound/generate.ts:9,59`, `lib/aeo-outbound/slots.ts:41`, `lib/aeo-outbound/grounding.ts:3-4,13-14,38`, `lib/aeo-outbound/render.ts:63-67`
- Create: `lib/aeo-outbound/config.test.ts`
- Modify tests: `lib/aeo-outbound/prompt.test.ts:123` (and append), `lib/aeo-outbound/generate.test.ts` (append), `lib/aeo-outbound/slots.test.ts` (append), `lib/aeo-outbound/grounding.test.ts` (append), `lib/aeo-outbound/render.test.ts` (append), `lib/aeo-outbound/v1-compat.test.ts:19-27`

**Interfaces:**
- Consumes: `settingsUsedOf` (`metrics.ts:24`), `cleanValue` and `MAX_LEAD` (`slots.ts:21,26`), `NEEDS_VALIDATION` (`config.ts:30`).
- Produces: `showsPowered(wordmark: string): boolean` (`render.ts`), used again by Task 7's render. The four `DECISIONS` values below, which Task 5 turns into `SETTINGS_DEFAULTS`.

- [ ] **Step 1: Write the failing tests**

Create `lib/aeo-outbound/config.test.ts`:
```ts
import { expect, test } from 'vitest'
import { DECISIONS } from './config'

test("Ryan's answers of 2026-10-12 are the defaults (spec v1.1 §16.1)", () => {
  expect(DECISIONS.sectionTitles).toEqual(['Category data', 'Competitive visibility'])
  expect(DECISIONS.rankAmong).toBeNull()
  expect(DECISIONS.writeSpecificCategory).toBe(true)
  expect(DECISIONS.competitorSiteGaps).toBe(true)
  expect(DECISIONS.peecOpportunityRows).toBe(1)
  expect(DECISIONS.methodologyStatesPromptsAndModels).toBe(true)
  expect(DECISIONS.fixedNextStep).toBe('A comprehensive AEO audit can validate these patterns across prompt demand, citations, source influence, owned content, earned media, and technical readiness.')
  expect(DECISIONS.needsValidationBlocksApprove).toBe(true)
  expect(DECISIONS.pitchOnly).toBe(true)
  expect(DECISIONS.showAivxName).toBe(false)
})
```

In `lib/aeo-outbound/prompt.test.ts`, replace line 123 (`expect(p).toContain('exactly 2 of the 3 must be based on those actions')`) with:
```ts
  expect(p).toContain('If the Peec recommended actions list is not "none", you may base at most 2 of the 3 on those actions, and only where an action fits the data. Never force one. An opportunity based on an action has a signal that starts with "Peec recommends".')
  expect(p).not.toContain('exactly 2 of the 3')
```
and append:
```ts
test('Q5: with 0 Peec rows the prompt says nothing about actions; Q3: the category line names the 80-character limit', () => {
  const zero = { ...D2, settingsUsed: { rankAmong: null, peecOpportunityRows: 0, methodologyStatesPromptsAndModels: true, fixedNextStep: null } } as unknown as SnapshotData
  const p = buildPrompt(zero, [])
  expect(p).not.toContain('Peec recommends')
  expect(p).not.toContain('at most 0')
  expect(p).toContain('- category: a short, specific category for the brand based on the data, at most 80 characters.\n')
})
```

Append to `lib/aeo-outbound/generate.test.ts` (add `import { DECISIONS } from './config'` to the imports):
```ts
test('Q3: a written category of 1 to 80 characters is used; a long, blank or non-string one keeps the code value, with no extra Glean call and no failure', async () => {
  const baseline = vi.fn(async () => reply(GOOD))
  await generateSnapshot('or_a', deps(baseline))
  const used = await generateSnapshot('or_a', deps(vi.fn(async () => reply(JSON.stringify({ ...JSON.parse(GOOD), category: '  Consumer  lending ' })))))
  expect(used.ok && used.slots.category).toBe('Consumer lending')
  for (const category of ['x'.repeat(81), '   ', 42, null]) {
    const glean = vi.fn(async () => reply(JSON.stringify({ ...JSON.parse(GOOD), category })))
    const r = await generateSnapshot('or_a', deps(glean))
    expect(r.ok && r.slots.category).toBe('Fintech')
    expect(glean).toHaveBeenCalledTimes(baseline.mock.calls.length)
  }
})

test('Q7: the fixed next step is written into next_step', async () => {
  const r = await generateSnapshot('or_a', deps(vi.fn(async () => reply(GOOD))))
  expect(r.ok && r.slots.next_step).toBe(DECISIONS.fixedNextStep)
})
```

Append to `lib/aeo-outbound/slots.test.ts`:
```ts
test('Q3: an edited category is limited to 80 characters; market keeps 1,000', () => {
  expect(applySlotPatch(S, 'category', 'x'.repeat(80)).ok).toBe(true)
  expect(applySlotPatch(S, 'category', 'x'.repeat(81))).toEqual({ ok: false, error: 'Keep this under 80 characters.' })
  expect(applySlotPatch(S, 'market', 'x'.repeat(81)).ok).toBe(true)
})
```

Append to `lib/aeo-outbound/grounding.test.ts`:
```ts
test('long-dash exemption (spec v1.1 §16.1): category on version 1 always, on version 2 only while it is the code value; next_step only while it is the fixed sentence; market always', () => {
  const dash = String.fromCharCode(0x2014)
  const fixed = 'A fixed sentence.'
  const v2 = { ...D, schemaVersion: 2, category: `Fin${dash}tech`, settingsUsed: { rankAmong: null, peecOpportunityRows: 1, methodologyStatesPromptsAndModels: true, fixedNextStep: fixed } } as unknown as SnapshotData
  const flag = (path: string) => `${path}: contains a long dash; use a period or comma`
  // Peec's own category, untouched, and the untouched fixed sentence: Glean can't fix either, so no flag.
  expect(groundingFlags({ ...base, category: `Fin${dash}tech`, market: `U${dash}S`, next_step: fixed }, v2, allowed)).toEqual([])
  // A written or edited category with a dash.
  expect(groundingFlags({ ...base, category: `Consumer ${dash} lending`, next_step: fixed }, v2, allowed)).toEqual([flag('category')])
  // An edited next step with a dash.
  expect(groundingFlags({ ...base, category: `Fin${dash}tech`, next_step: `Book ${dash} soon` }, v2, allowed)).toEqual([flag('next_step')])
  // No Peec category: the code value is Needs validation.
  const noCategory = { ...v2, category: null } as unknown as SnapshotData
  expect(groundingFlags({ ...base, category: 'Needs validation', next_step: fixed }, noCategory, allowed)).toEqual([])
  // Version 1 (no schemaVersion, no settingsUsed): category always exempt; next_step never, its fixed sentence was null.
  expect(groundingFlags({ ...base, category: `Consumer ${dash} lending`, next_step: `Book ${dash} soon` }, D, allowed)).toEqual([flag('next_step')])
})
```

Append to `lib/aeo-outbound/render.test.ts` (add `showsPowered` to the `./render` import):
```ts
test('Q10: the wordmark reads Avenue Z with no Powered by line, in every mode (spec v1.1 §16.1)', () => {
  for (const mode of ['draft', 'preview', 'final'] as const) {
    const h = renderSnapshotHtml(DATA, SLOTS, mode, 'Oct 9, 2026')
    expect(h).toContain('<div class="aivx-brand">Avenue Z</div>\n  </div>')
    expect(h).not.toContain('Powered by Avenue Z')
    expect(h).not.toContain('>AIVx<')
  }
})

test('showsPowered: only a wordmark that is not Avenue Z, trimmed and compared without case, gets the line', () => {
  expect(showsPowered('AIVx')).toBe(true)
  for (const w of ['Avenue Z', 'avenue z ', ' AVENUE Z']) expect(showsPowered(w)).toBe(false)
})
```

In `lib/aeo-outbound/v1-compat.test.ts`, replace lines 19 to 24 (the comment and the `v11` function) with:
```ts
// Deliberate differences from v1.0 (spec v1.1 §9 and §16.1), applied to the frozen v1.0 golden. Later tasks add to this list.
// Also deliberate for version 1 drafts: the own brand replaces the 10th bar (§9); the golden has too few brands to show it (charts.test.ts pins it).
// §16.1 Q10: no AIVx wordmark, and no "Powered by Avenue Z" line under the Avenue Z one.
const V10_LOGO = '<div class="aivx-brand">AIVx</div>\n    <div class="powered">Powered by Avenue Z</div>'
const v11 = (html: string) => {
  expect(html.split('Citations: %{value}')).toHaveLength(2)
  expect(html.split(V10_LOGO)).toHaveLength(2)
  return html.split('Citations: %{value}').join('Retrievals: %{value}').split(V10_LOGO).join('<div class="aivx-brand">Avenue Z</div>')
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `perl -e 'alarm 590; exec @ARGV' -- npx vitest run lib/aeo-outbound/config.test.ts lib/aeo-outbound/prompt.test.ts lib/aeo-outbound/generate.test.ts lib/aeo-outbound/slots.test.ts lib/aeo-outbound/grounding.test.ts lib/aeo-outbound/render.test.ts lib/aeo-outbound/v1-compat.test.ts`
Expected: FAIL in each file on the new or changed assertions (config values, the prompt sentence, the category rule, the 80-character edit limit, the dash rules, the wordmark, the golden).

- [ ] **Step 3: Implement**

`lib/aeo-outbound/config.ts`: change only these three values and their comments (lines 14-15, 20-21, 26-27):
```ts
  /** Q3 (Ryan, 2026-10-12: yes): Glean writes a more specific category instead of using Peec's `industry` (spec v1.1 §16.1). */
  writeSpecificCategory: true as boolean,
```
```ts
  /** Q7 (Ryan, 2026-10-12: "This looks repeatable, yes"): one fixed next-step sentence for every report, the one from his
   *  own example; null would mean one written per brand (spec v1.1 §16.1). */
  fixedNextStep: 'A comprehensive AEO audit can validate these patterns across prompt demand, citations, source influence, owned content, earned media, and technical readiness.' as string | null,
```
```ts
  /** Q10 (Ryan, 2026-10-12: leave AIVx off the report): false makes the sidebar wordmark read "Avenue Z" (spec v1.1 §16.1). */
  showAivxName: false as boolean,
```
Also change the Q5 comment (line 16) to: `/** Q5 (Ryan, 2026-10-12: only when relevant): at most this many of the three opportunities may come from Peec actions, never forced (spec v1.1 §16.1). */` with the value `1` unchanged.

`lib/aeo-outbound/prompt.ts` line 88: replace the conditional sentence (from `If the Peec recommended actions list` to `"Peec recommends".`) so the whole template piece reads:
```ts
${peecRows > 0 ? ` If the Peec recommended actions list is not "none", you may base at most ${peecRows} of the 3 on those actions, and only where an action fits the data. Never force one. An opportunity based on an action has a signal that starts with "Peec recommends".` : ''}
```
Line 90: the category line becomes `'- category: a short, specific category for the brand based on the data, at most 80 characters.\n'`.

`lib/aeo-outbound/generate.ts`: line 9 becomes `import { cleanValue, MAX_LEAD, validateGeneratedSlots, type Slots } from './slots'`. Line 59 becomes:
```ts
      if (parsed && DECISIONS.writeSpecificCategory && typeof parsed.category === 'string') {
        // Glean's category only when it fits (spec v1.1 §16.1); anything else keeps the code value and never retries or fails.
        const written = cleanValue(parsed.category)
        if (written && written.length <= MAX_LEAD) fixedNow.category = written
      }
```

`lib/aeo-outbound/slots.ts` line 41 becomes:
```ts
  const checked = checkValue(raw, m[4] === 'lead' || m[1] === 'category' ? MAX_LEAD : MAX_VALUE)
```

`lib/aeo-outbound/grounding.ts`: line 3 becomes `import { NEEDS_VALIDATION } from './config'`; line 4 becomes `import { settingsUsedOf, type SnapshotData } from './metrics'`. Replace lines 13-14 (the `CODE_SET` comment and constant) with:
```ts
/**
 * Paths whose long dash is not flagged because code set the text and Glean can't fix it (spec v1.1 §16.1): market always;
 * category on a version 1 row always, on a version 2 row only while it is still the code value (Peec's category or
 * "Needs validation"); next_step only while it is still the row's fixed sentence.
 */
function dashExempt(path: string, slots: Slots, d: SnapshotData): boolean {
  if (path === 'market') return true
  if (path === 'category') return d.schemaVersion !== 2 || slots.category === (d.category ?? NEEDS_VALIDATION)
  if (path === 'next_step') {
    const fixed = settingsUsedOf(d).fixedNextStep
    return fixed !== null && slots.next_step === fixed
  }
  return false
}
```
and line 38 becomes `    if (!dashExempt(path, slots, d) && DASHES.test(text)) flags.push(\`${path.split('.')[0]}: contains a long dash; use a period or comma\`)`.

`lib/aeo-outbound/render.ts`: after the `SHARE_BUTTON` export (line 32) add:
```ts

/** The "Powered by Avenue Z" line shows only under a wordmark that is not already Avenue Z (spec v1.1 §16.1). */
export const showsPowered = (wordmark: string): boolean => wordmark.trim().toLowerCase() !== 'avenue z'
```
Inside `renderSnapshotHtml`, before `const sidebar =` add `  const wordmark = DECISIONS.showAivxName ? 'AIVx' : 'Avenue Z'`, and replace the two logo lines inside `<div class="sidebar-logo">` (lines 66-67) with exactly one line:
```ts
    <div class="aivx-brand">${wordmark}</div>${showsPowered(wordmark) ? '\n    <div class="powered">Powered by Avenue Z</div>' : ''}
```
so the AIVx case renders byte for byte as before.

- [ ] **Step 4: Run the tests to verify they pass**

Run the Step 2 command. Expected: PASS. Then the gate: `DATABASE_URL=postgresql://ci:ci@db.invalid/ci perl -e 'alarm 590; exec @ARGV' -- make check` (Bash tool timeout 600000). Expected: exit 0.

- [ ] **Step 5: Commit and push**

Commit every file this task touched, by name, with subject `Apply Ryan's answers: specific category, optional Peec rows, fixed next step, no AIVx` and a body that lists the four answers, then this edge-case list (the Glean reply is untrusted input):
- external failure: a Glean category that is missing, not a string, blank or over 80 characters keeps the code value and never retries or fails the run: fix
- operator visibility: unchanged; a bad category leaves no flag because the code value is shown and Ryan can edit it: decline
- bounds: a written category is at most 80 characters, and so is an edit: fix
- input boundaries: the category reply is cleaned with cleanValue before its length is checked: fix
- state and concurrency: none touched: decline
- security: the category is escaped at render like every slot (render.ts esc): decline, unchanged

Then `perl -e 'alarm 120; exec @ARGV' -- git push origin feat/aeo-outbound-parts`.

### Task 3c: The share link: locked domain and the brand in the path (spec v1.1 §16.2)

Covers v1.1 §16.2, the Task 3c bullet of §16.4, and the "Link" tests of §16.6. Line numbers cite `feat/aeo-outbound-parts` at `0ac4b5b9`.

**Files:**
- Create: `lib/aeo-outbound/share-link.ts`, `lib/aeo-outbound/share-link.test.ts`, `lib/aeo-outbound/share-origin.ts`, `lib/aeo-outbound/share-origin.test.ts`
- Modify: `lib/aeo-outbound/token.ts:5` (re-export), `app/snapshot/[token]/route.ts:9,27-29,55-66`, `app/snapshot/[token]/route.test.ts` (append)
- Modify: `components/aeo-outbound/status.ts:26` (delete `snapshotUrl`), `components/aeo-outbound/status.test.ts:2,24-26` (drop its import and test)
- Modify: `components/aeo-outbound/hub.tsx:15,17-31,53,234-235` (and a test-link line), `components/aeo-outbound/hub.test.tsx:22-25,242-249` (and append)
- Modify: `components/aeo-outbound/editor.tsx:21,23-41,264-265` (and a test-link line), `components/aeo-outbound/editor.test.tsx:35-37,195` (and append)
- Modify: `app/tools/new-business/page.tsx:1-27`, `app/tools/new-business/[reportId]/page.tsx:30-41`
- Modify: `.env.example:99-100` (one line added)

**Interfaces:**
- Consumes: the token recipe (`token.ts:4`, unchanged).
- Produces (client-safe, `share-link.ts`, no Node imports): `SLUG_MAX = 40`, `TEST_LINK_NOTE`, `isShareTokenShape(t: string): boolean` (moved here from `token.ts`, which re-exports it), `brandSlug(brandName: string | null): string`, `sharePath(brandName: string | null, token: string): string`, `shareUrl(origin: string, brandName: string | null, token: string): string`, `tokenFromSegment(segment: string): string | null`.
- Produces (server only, `share-origin.ts`): `SHARE_ORIGINS`, `shareOrigin(targetEnv?: string): string | null`.
- Produces: `HubRow.linkBrand: string | null`; `OutboundHub` prop `shareOrigin?: string | null` (default null); `OutboundEditorProps.linkBrand: string | null` and `shareOrigin: string | null`. Tasks 9, 10 and 11 use `shareUrl` and these props; `snapshotUrl` no longer exists.

- [ ] **Step 1: Write the failing tests**

Create `lib/aeo-outbound/share-link.test.ts`:
```ts
import { expect, test } from 'vitest'
import { SLUG_MAX, brandSlug, sharePath, shareUrl, tokenFromSegment } from './share-link'

const T = 'AbCdEfGhIjKlMnOpQrStUv_-'

test('brandSlug: NFKD, marks removed, lowercase, one dash per run of other characters, trimmed, at most 40', () => {
  expect(brandSlug('Example Co')).toBe('example-co')
  expect(brandSlug('Café Société & Fils')).toBe('cafe-societe-fils')
  expect(brandSlug('  --Acme!!  Labs--  ')).toBe('acme-labs')
  expect(brandSlug('ＡＢＣ　１２３')).toBe('abc-123')
  expect(brandSlug('🙂🙂')).toBe('')
  expect(brandSlug('日本')).toBe('')
  expect(brandSlug(null)).toBe('')
  expect(brandSlug('')).toBe('')
  const long = brandSlug('alpha '.repeat(10))
  expect(long.length).toBeLessThanOrEqual(SLUG_MAX)
  expect(long.endsWith('-')).toBe(false)
  expect(long).toBe('alpha-alpha-alpha-alpha-alpha-alpha-alph')
  expect(brandSlug('a'.repeat(39) + ' b')).toBe('a'.repeat(39))
})

test('sharePath and shareUrl: brand slug then the token; no slug gives the bare token', () => {
  expect(sharePath('Example Co', T)).toBe(`/snapshot/example-co-${T}`)
  expect(sharePath(null, T)).toBe(`/snapshot/${T}`)
  expect(sharePath('🙂', T)).toBe(`/snapshot/${T}`)
  expect(shareUrl('https://reporting.avenuez.com', 'Example Co', T)).toBe(`https://reporting.avenuez.com/snapshot/example-co-${T}`)
})

test('tokenFromSegment: a bare token, or a well-formed slug then "-" then a token; anything else is null', () => {
  expect(tokenFromSegment(T)).toBe(T)
  expect(tokenFromSegment(`example-co-${T}`)).toBe(T)
  expect(tokenFromSegment(`a-${T}`)).toBe(T)
  expect(tokenFromSegment(`${'a'.repeat(40)}-${T}`)).toBe(T)
  for (const bad of [`${'a'.repeat(41)}-${T}`, `Example-${T}`, `ex_ample-${T}`, `-${T}`, `ex--co-${T}`, `x${T}`, T.slice(1), `example-co-${T.slice(1)}`, `example-co-${T}x`, `example co-${T}`, '', 'short']) {
    expect(tokenFromSegment(bad)).toBeNull()
  }
  // Every built path reads back to its token.
  for (const brand of ['Example Co', 'Café', null, '🙂', 'alpha '.repeat(10)]) {
    expect(tokenFromSegment(sharePath(brand, T).slice('/snapshot/'.length))).toBe(T)
  }
})
```
Check one expectation before relying on it: `'alpha '.repeat(10)` slugs to `alpha-alpha-...-alpha` (59 characters); its first 40 are `alpha-alpha-alpha-alpha-alpha-alpha-alph` (6 × 6 = 36 characters of `alpha-`, then `alph`), which ends in a letter, so nothing is trimmed.

Create `lib/aeo-outbound/share-origin.test.ts`:
```ts
import { afterEach, expect, test, vi } from 'vitest'
import { SHARE_ORIGINS, shareOrigin } from './share-origin'

afterEach(() => { vi.unstubAllEnvs() })

test('the origin is locked per Vercel environment (spec v1.1 §16.2)', () => {
  expect(SHARE_ORIGINS).toEqual({ production: 'https://reporting.avenuez.com', staging: 'https://staging.reporting.avenuez.com' })
  expect(shareOrigin('production')).toBe('https://reporting.avenuez.com')
  expect(shareOrigin('staging')).toBe('https://staging.reporting.avenuez.com')
  for (const env of ['preview', 'development', '', undefined, 'Production']) expect(shareOrigin(env)).toBeNull()
})

test('with no argument it reads VERCEL_TARGET_ENV', () => {
  vi.stubEnv('VERCEL_TARGET_ENV', 'production')
  expect(shareOrigin()).toBe('https://reporting.avenuez.com')
  vi.stubEnv('VERCEL_TARGET_ENV', 'preview')
  expect(shareOrigin()).toBeNull()
})
```

Append to `app/snapshot/[token]/route.test.ts`:
```ts
test('a slugged segment resolves by its token for GET and HEAD; a bad slug shape is the same 404 (spec v1.1 §16.2)', async () => {
  const ok = await settle(GET(req(), ctx(`example-co-${TOKEN}`)))
  expect(ok.status).toBe(200)
  expect(await ok.text()).toBe(HTML)
  expect(store.getLiveByToken).toHaveBeenLastCalledWith(TOKEN)
  const head = await HEAD(req({ method: 'HEAD' }), ctx(`example-co-${TOKEN}`))
  expect(head.status).toBe(200)
  const unknown = await (await settle(GET(req(), ctx('short')))).text()
  vi.mocked(store.getLiveByToken).mockClear()
  for (const bad of [`Example-${TOKEN}`, `${'a'.repeat(41)}-${TOKEN}`, `example_co-${TOKEN}`]) {
    const r = await settle(GET(req(), ctx(bad)))
    expect(r.status).toBe(404)
    expect(await r.text()).toBe(unknown)
  }
  expect(store.getLiveByToken).not.toHaveBeenCalled()
})
```

In `components/aeo-outbound/status.test.ts`: delete line 24 to 26 (the `snapshotUrl` test) and remove `snapshotUrl` from the import on line 2.

In `components/aeo-outbound/hub.test.tsx`: add `linkBrand: null,` to the `row` helper's object (line 22 to 25). Append:
```ts
test('Copy link uses the locked origin and the brand slug when the server passes them (spec v1.1 §16.2)', async () => {
  const writeText = vi.fn(async () => {})
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  render(<OutboundHub shareOrigin="https://reporting.avenuez.com" rows={[row({ status: 'live', token: 'tok_123', linkBrand: 'Example Co', recipient: 'R', approvedAt: '2026-10-02T15:00:00.000Z' })]} />)
  fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
  expect(writeText).toHaveBeenCalledWith('https://reporting.avenuez.com/snapshot/example-co-tok_123')
  expect(screen.queryByText('Test link: it works on this environment only.')).not.toBeInTheDocument()
  await screen.findByRole('option', { name: 'Acme pitch' })
})

test('with no locked origin the hub labels its links as test links', async () => {
  render(<OutboundHub rows={[row({ status: 'live', token: 'tok_123', recipient: 'R', approvedAt: '2026-10-02T15:00:00.000Z' })]} />)
  expect(screen.getByText('Test link: it works on this environment only.')).toBeInTheDocument()
  await screen.findByRole('option', { name: 'Acme pitch' })
})
```
In `components/aeo-outbound/editor.test.tsx`: add `linkBrand: null, shareOrigin: null,` to `base` (line 35 to 37). Append:
```ts
test('a live snapshot copies the locked link with the brand slug (spec v1.1 §16.2)', async () => {
  const writeText = vi.fn(async () => {})
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  await setup({ status: 'live', token: 'tok_123', linkBrand: 'Example Co', shareOrigin: 'https://reporting.avenuez.com' })
  fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
  expect(writeText).toHaveBeenCalledWith('https://reporting.avenuez.com/snapshot/example-co-tok_123')
  expect(screen.queryByText('Test link: it works on this environment only.')).not.toBeInTheDocument()
})

test('a live snapshot with no locked origin labels the link as a test link', async () => {
  await setup({ status: 'live', token: 'tok_123' })
  expect(screen.getByText('Test link: it works on this environment only.')).toBeInTheDocument()
})
```
(The existing hub test at line 247 and editor test at line 195 keep expecting `${window.location.origin}/snapshot/tok_123`: no origin and a null `linkBrand` give exactly that.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `perl -e 'alarm 590; exec @ARGV' -- npx vitest run lib/aeo-outbound/share-link.test.ts lib/aeo-outbound/share-origin.test.ts "app/snapshot/[token]/route.test.ts" components/aeo-outbound/status.test.ts components/aeo-outbound/hub.test.tsx components/aeo-outbound/editor.test.tsx`
Expected: FAIL (the new modules don't exist; the route 404s a slugged segment; the props are unknown).

- [ ] **Step 3: Implement**

Create `lib/aeo-outbound/share-link.ts`:
```ts
// The public link's path (spec v1.1 §16.2): the brand slug, the token, and the rule the route reads back. Client-safe:
// no Node imports, so the hub and editor build links with it. The origin comes from share-origin.ts on the server.

export const SLUG_MAX = 40
export const TEST_LINK_NOTE = 'Test link: it works on this environment only.'
/** Combining marks left by NFKD in the Latin, extended and symbol mark blocks. ES2017 has no \p{M}. */
const MARKS = /[̀-ͯ᪰-᫿᷀-᷿⃐-⃿︠-︯]/g
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export const isShareTokenShape = (t: string): boolean => /^[A-Za-z0-9_-]{24}$/.test(t)

/** The brand part of the path: NFKD, marks removed, lowercase, each run outside a-z0-9 one "-", trimmed, at most 40. */
export function brandSlug(brandName: string | null): string {
  if (!brandName) return ''
  const s = brandName.normalize('NFKD').replace(MARKS, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return s.slice(0, SLUG_MAX).replace(/-+$/, '')
}

export function sharePath(brandName: string | null, token: string): string {
  const slug = brandSlug(brandName)
  return `/snapshot/${slug ? `${slug}-` : ''}${token}`
}

export const shareUrl = (origin: string, brandName: string | null, token: string): string => `${origin}${sharePath(brandName, token)}`

/** The token a /snapshot segment names, or null: a bare token, else a well-formed slug, "-", then a token. */
export function tokenFromSegment(segment: string): string | null {
  if (isShareTokenShape(segment)) return segment
  if (segment.length < 26 || segment[segment.length - 25] !== '-') return null
  const slug = segment.slice(0, -25)
  const token = segment.slice(-24)
  return slug.length <= SLUG_MAX && SLUG.test(slug) && isShareTokenShape(token) ? token : null
}
```

Create `lib/aeo-outbound/share-origin.ts`:
```ts
// Server only (spec v1.1 §16.2): the origin every public link uses on this deployment. VERCEL_TARGET_ENV names the
// system or custom environment (Vercel docs, read 2026-10-12); the domains were read from the Vercel project the same
// day. Anywhere else (a preview, local dev) there is no locked origin and the page's own is used, labelled as a test link.
export const SHARE_ORIGINS = { production: 'https://reporting.avenuez.com', staging: 'https://staging.reporting.avenuez.com' } as const

export function shareOrigin(targetEnv: string | undefined = process.env.VERCEL_TARGET_ENV): string | null {
  if (targetEnv === 'production') return SHARE_ORIGINS.production
  if (targetEnv === 'staging') return SHARE_ORIGINS.staging
  return null
}
```

`lib/aeo-outbound/token.ts` line 5 becomes `export { isShareTokenShape } from './share-link'` (its two importers, `store.ts:11` and the route, keep working; the route switches below).

`app/snapshot/[token]/route.ts`: line 9 becomes `import { tokenFromSegment } from '@/lib/aeo-outbound/share-link'`. The `live` helper (lines 26-35) takes the segment:
```ts
/** The live row for a /snapshot segment (spec v1.1 §16.2), or undefined. A failed lookup answers like an unknown token, logged without the token. */
async function live(segment: string) {
  const token = tokenFromSegment(segment)
  if (!token) return undefined
  try {
    return await getLiveByToken(token)
  } catch (e) {
    console.error(`[aeo-outbound] snapshot lookup failed reason=${errorLabel(e)}`)
    return undefined
  }
}
```
`GET` and `HEAD` keep `const { token } = await ctx.params` and pass it to `live` unchanged (the folder name `[token]` stays; it now holds a segment).

`components/aeo-outbound/status.ts`: delete line 26 (`snapshotUrl`).

`components/aeo-outbound/hub.tsx`: line 15 drops `snapshotUrl` from the `./status` import; add `import { TEST_LINK_NOTE, shareUrl } from '@/lib/aeo-outbound/share-link'`. `HubRow` gains `linkBrand: string | null` (after `brand`, with the comment `/** The row's own brand_name for the link slug; null when Peec never named it (never the project name). */`). The component signature becomes `export function OutboundHub({ rows, shareOrigin = null }: { rows: HubRow[]; shareOrigin?: string | null })`. The Copy link `onClick` (line 235) becomes `onClick={() => r.token && void navigator.clipboard?.writeText(shareUrl(shareOrigin ?? window.location.origin, r.linkBrand, r.token))}`. Directly above the table's wrapping element, when `shareOrigin === null && rows.some((r) => r.token)`, render `<p className="text-xs text-text-muted">{TEST_LINK_NOTE}</p>`.

`components/aeo-outbound/editor.tsx`: line 21 becomes `import { TEST_LINK_NOTE, shareUrl } from '@/lib/aeo-outbound/share-link'`. `OutboundEditorProps` gains `linkBrand: string | null` and `shareOrigin: string | null`. The Copy link `onClick` (line 265) becomes `onClick={() => token && void navigator.clipboard?.writeText(shareUrl(props.shareOrigin ?? window.location.origin, props.linkBrand, token))}`; directly after that button, when `props.shareOrigin === null`, render `<span className="text-xs text-text-muted">{TEST_LINK_NOTE}</span>`.

`app/tools/new-business/page.tsx`: add `import { shareOrigin } from '@/lib/aeo-outbound/share-origin'`; each row adds `linkBrand: r.brandName,` after `brand`; the return becomes `return <OutboundHub rows={rows} shareOrigin={shareOrigin()} />`.

`app/tools/new-business/[reportId]/page.tsx`: add the same import, and the props `linkBrand={row.brandName}` and `shareOrigin={shareOrigin()}` after `brand={...}`.

`.env.example`: after line 100 (`# VERCEL_URL=`) add:
```
# VERCEL_TARGET_ENV=                # [vercel] 'production' | 'preview' | 'development' | a custom environment such as 'staging'; locks the AEO Outbound share-link domain
```

- [ ] **Step 4: Run the tests to verify they pass**

Run the Step 2 command, then `perl -e 'alarm 590; exec @ARGV' -- npx vitest run lib/aeo-outbound/token.test.ts lib/aeo-outbound/store.test.ts`. Expected: PASS. Then the gate (`make check`, as in Task 3b Step 4). Expected: exit 0, including check:rsc (the new props are plain strings or null).

- [ ] **Step 5: Commit and push**

Commit every file this task touched, by name, with subject `Lock the share link to our domain and put the brand name in it` and this edge-case list in the body (the route parses an untrusted path segment):
- external failure: none added; a lookup failure still answers the unknown-token 404: decline, unchanged
- operator visibility: the route still never logs the segment or the token: fix, kept
- bounds: a segment is a token, or at most 40 slug characters plus "-" plus a token; anything longer is a 404 before the database: fix
- input boundaries: the slug must match ^[a-z0-9]+(-[a-z0-9]+)*$ and the token its 24-character shape, else the same 404 as an unknown token: fix
- state and concurrency: none: decline
- security: the slug is not trusted or checked against the row, the token alone is the credential, as before; the origin is a server constant per environment, never read from the request: fix

Then push.

### Task 4: Peec contracts and error codes in pull, generate and the generate route

Covers v1.1 §7 (error codes on the error object, the `error_code` column, the unawaited `progress_step` writer, step 9 before the Glean call), §9 (`/actions/list` paging, a missing Peec key answers 502 JSON), §10 (each Peec endpoint, the Glean reply and the generate body checked against their contracts), round-2 MINOR 10.

**Files:**
- Modify: `lib/aeo-outbound/contracts.ts` (append), `lib/aeo-outbound/contracts.test.ts` (append)
- Modify: `lib/aeo-outbound/pull.ts:1-143` (full replacement below), `lib/aeo-outbound/pull.test.ts` (append)
- Modify: `lib/aeo-outbound/generate.ts:1-76` (full replacement below), `lib/aeo-outbound/generate.test.ts` (append)
- Modify: `lib/aeo-outbound/store.ts:86` (`UUID` from contracts)
- Modify: `app/api/aeo-outbound/generate/route.ts:5-113`, `app/api/aeo-outbound/generate/route.test.ts`

**Interfaces:**
- Consumes: `peecContract`, `checkContract` (Task 1); `PeecError(message, timeout, rowCap, code)`, `isPeecContractViolation` (Task 1); `finishFailedQuery(id, error, brandName, now, code)`, `progressStepQuery(id, step)` (Task 2).
- Produces:
  - `contracts.ts`: `REPORT_ID_RE`, `GLEAN_SLOTS`, `GENERATE_BODY`, `SLOTS_BODY` (zod schemas)
  - `generate.ts`: `GenerationResult` failure `{ ok: false; error: string; code: ErrorCode; brandName: string | null }`; `deps.onStep?: (step: number) => void`; `WRITING_STEP = 9`
  - generate route: `200 { id, status: 'failed', error, code }`; `502 { error: "Peec isn't configured on this server. Tell engineering." }` when the key is missing

- [ ] **Step 1: Write the failing pull tests**

Append to `lib/aeo-outbound/pull.test.ts` (add `isPeecContractViolation` to the `./peec` import if you use it; the tests below read `.code` directly):
```ts
const codeOf = async (p: Promise<unknown>) => { try { await p; return 'resolved' } catch (e) { return (e as PeecError).code } }

test('each guard fails with its code on the error object', async () => {
  expect(await codeOf(pullSnapshot(fakePeec(base).client, 'or_zzz', NOW))).toBe('no_project')
  expect(await codeOf(pullSnapshot(fakePeec({ ...base, '/brands': () => ROSTER.map((r) => ({ ...r, is_own: true })) }).client, 'or_a', NOW))).toBe('own_brand_count')
  expect(await codeOf(pullSnapshot(fakePeec({ ...base, '/reports/domains': () => [] }).client, 'or_a', NOW))).toBe('no_data')
  expect(await codeOf(pullSnapshot(fakePeec({ ...base, '/reports/brands': (_u, b) => (b?.dimensions ? [] : [{ brand: { id: 'kw_c1', name: 'Rival' }, visibility: 0.3, share_of_voice: 0.8, position: 2 }]) }).client, 'or_a', NOW))).toBe('own_brand_no_row')
  const zero = fakePeec({ ...base, '/reports/domains': (_u, b) => (b?.dimensions ? [{ domain: 'x.com', date: '2026-10-05', retrieved_chat_count: 1 }] : [{ domain: 'x.com', retrieved_chat_count: 0 }]) })
  expect(await codeOf(pullSnapshot(zero.client, 'or_a', NOW))).toBe('zero_retrievals')
  const rows = [1, 2, 3, 4].map((i) => ({ domain: `d${i}.com`, date: '2026-10-05', retrieved_chat_count: 1 }))
  const cap = fakePeec({ ...base, '/reports/domains': (_u, b) => (b?.dimensions ? rows : []) }, { maxRows: 3 })
  expect(await codeOf(pullSnapshot(cap.client, 'or_a', NOW))).toBe('history_too_long')
  const http = fakePeec({ ...base, '/brands': () => { throw { status: 500 } } })
  expect(await codeOf(pullSnapshot(http.client, 'or_a', NOW))).toBeNull()
})

test('a brands report row missing visibility fails with contract_violation naming the field, never a NaN%', async () => {
  const f = fakePeec({ ...base, '/reports/brands': (_u, b) => (b?.dimensions ? [] : [{ brand: { id: 'kw_own', name: 'Example Co' }, share_of_voice: 0.2 }]) })
  await expect(pullSnapshot(f.client, 'or_a', NOW)).rejects.toMatchObject({ code: 'contract_violation', message: 'peec.brands_report.visibility' })
})

test('a broken contract in an optional call propagates instead of becoming a warning', async () => {
  const f = fakePeec({ ...base, '/prompts': () => ({ total_count: 2.5 }) })
  await expect(pullSnapshot(f.client, 'or_a', NOW)).rejects.toMatchObject({ code: 'contract_violation', message: 'peec.prompts.total_count' })
})

/** /actions/list answering page by page from body.offset, so the fake's offset-0 rule does not apply. */
const actionPages = (all: { id: string; status: string; title: string }[]) => (_u: URL, b: Record<string, unknown> | null) => {
  const offset = Number(b?.offset ?? 0); const limit = Number(b?.limit ?? 50)
  return { data: all.slice(offset, offset + limit) }
}
const act = (i: number, pending: boolean) => ({ id: `a${i}`, status: pending ? 'PENDING' : 'COMPLETED', title: `Action ${i}`, impact: 'HIGH', type: 'SEO_ISSUE' })

test('/actions/list pages until it has 10 pending actions', async () => {
  const all = Array.from({ length: 300 }, (_, i) => act(i, i % 10 === 0))
  const f = fakePeec({ ...base, '/actions/list': actionPages(all) })
  const pull = await pullSnapshot(f.client, 'or_a', NOW)
  expect(pull.actions.map((a) => a.id)).toEqual(['a0', 'a10', 'a20', 'a30', 'a40', 'a50', 'a60', 'a70', 'a80', 'a90'])
  expect(f.seen.filter((s) => s.path === '/actions/list').map((s) => s.body?.offset)).toEqual([0, 50])
})

test('/actions/list stops at 5 pages, and on a short page', async () => {
  const sparse = Array.from({ length: 400 }, (_, i) => act(i, i === 7))
  const f = fakePeec({ ...base, '/actions/list': actionPages(sparse) })
  expect((await pullSnapshot(f.client, 'or_a', NOW)).actions.map((a) => a.id)).toEqual(['a7'])
  expect(f.seen.filter((s) => s.path === '/actions/list').map((s) => s.body?.offset)).toEqual([0, 50, 100, 150, 200])
  const short = fakePeec({ ...base, '/actions/list': actionPages(Array.from({ length: 60 }, (_, i) => act(i, false))) })
  await pullSnapshot(short.client, 'or_a', NOW)
  expect(short.seen.filter((s) => s.path === '/actions/list').map((s) => s.body?.offset)).toEqual([0, 50])
})
```
Run: `perl -e 'alarm 590; exec @ARGV' -- npx vitest run lib/aeo-outbound/pull.test.ts` (FAIL).

- [ ] **Step 2: Implement pull with contracts, codes and actions paging**

Replace `lib/aeo-outbound/pull.ts` with:
```ts
// Spec §7 steps 1-8 over one window. Every report call sends project_id, start_date and end_date and no
// model filter (all models; T3 confirmed). Guards fail with a reason Ryan can act on and a code the UI maps to
// words (v1.1 §7). Every Peec response is checked against its contract before it is used (v1.1 §10).
import { DECISIONS, MAX_WINDOW_DAYS, PITCH_STATUSES } from './config'
import { peecContract } from './contracts'
import { isPeecContractViolation, isPeecRowCap, isPeecTimeout, PeecClient, PeecError, rowsOf } from './peec'
import { defaultRange, type DayRange } from './range'

export interface PeecProject { id: string; name: string; status: string }
export interface RosterBrand { id: string; name: string; is_own: boolean; domains?: string[] | null }
export interface BrandReportRow {
  brand: { id: string; name: string }
  visibility: number
  share_of_voice?: number | null
  position?: number | null
}
export interface DomainRow {
  domain: string
  classification?: string | null
  retrieved_chat_count?: number | null
  retrieval_count?: number | null
  retrieved_percentage?: number | null
  mentioned_brands?: { id: string }[] | null
}
export interface ActionRow { id: string; title?: string | null; impact?: string | null; type?: string | null; status?: string | null }
export interface PeecPull {
  project: PeecProject
  roster: RosterBrand[]
  ownBrand: RosterBrand
  profile: { industry: string | null; markets: string[] } | null
  /** The range asked for (Ryan's dates, or the default). */
  requested: DayRange
  /** True when Ryan picked the range, false when the default applied. */
  rangePicked: boolean
  /** The days inside it that carry data. */
  window: { start: string; end: string }
  brands: BrandReportRow[]
  domains: DomainRow[]
  actions: ActionRow[]
  promptCount: number | null
  models: string[]
  /** Non-fatal problems for the notes panel. */
  warnings: string[]
}

/** /actions/list paging (v1.1 §9): pages of 50, stopping at 10 PENDING actions, a short page, or 5 pages. */
const ACTION_PAGE = 50
const ACTION_PAGES = 5
const ACTIONS_WANTED = 10
/** An optional call's failure becomes a warning, except an exhausted budget or a broken contract. */
const mustRethrow = (e: unknown): boolean => isPeecTimeout(e) || isPeecContractViolation(e)

export const isUsableProject = (p: PeecProject): boolean => !DECISIONS.pitchOnly || PITCH_STATUSES.includes(p.status)

export async function listProjects(client: PeecClient): Promise<PeecProject[]> {
  const rows = peecContract('peec.projects', await client.all<{ id: string; name?: string; status?: string }>('GET', '/projects', {}, (r) => String(r.id), 1000))
  return rows
    .map((r) => ({ id: String(r.id), name: String(r.name ?? r.id), status: String(r.status ?? '') }))
    .filter(isUsableProject)
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function pullSnapshot(client: PeecClient, projectId: string, nowMs: number, onStep?: (step: number) => void, range?: DayRange | null): Promise<PeecPull> {
  onStep?.(1)
  const project = (await listProjects(client)).find((p) => p.id === projectId)
  if (!project) throw new PeecError(`Peec project ${projectId} is not available to this tool`, false, false, 'no_project')

  onStep?.(2)
  const roster = peecContract('peec.brands', await client.all<RosterBrand>('GET', '/brands', { project_id: projectId }, (r) => r.id, 1000))
  const owned = roster.filter((b) => b.is_own)
  if (owned.length !== 1) throw new PeecError(`Peec project needs exactly one own brand (found ${owned.length})`, false, false, 'own_brand_count')

  onStep?.(3)
  const prof = peecContract('peec.project_profile', (await client.call('GET', '/project-profile', { params: { project_id: projectId } })) as
    { profile?: { industry?: string | null; target_markets?: { location?: string | null }[] | null } | null } | null)
  const p = prof?.profile ?? null
  const profile = p
    ? { industry: p.industry?.trim() || null, markets: (p.target_markets ?? []).map((m) => m.location?.trim() ?? '').filter(Boolean) }
    : null

  onStep?.(4)
  // Not validated here: generate validates a fresh request, and a rerun's stored range is used as stored (spec §7a).
  const requested = range ?? defaultRange(nowMs)
  const { start, end } = requested
  let dated: { domain: string; date?: string; retrieved_chat_count?: number | null }[]
  try {
    dated = peecContract('peec.domains_by_date', await client.all<{ domain: string; date?: string; retrieved_chat_count?: number | null }>(
      'POST', '/reports/domains', { project_id: projectId, start_date: start, end_date: end, dimensions: ['date'] },
      (r) => `${r.domain}|${r.date}`, 10_000))
  } catch (e) {
    // Only the full-history default turns the cap into advice; a picked range keeps the client's message.
    if (range == null && isPeecRowCap(e)) throw new PeecError(`This project has too much history for one snapshot. Pick a start and end date, at most ${MAX_WINDOW_DAYS} days.`, false, false, 'history_too_long')
    throw e
  }
  const days = dated.filter((r) => (r.retrieved_chat_count ?? 0) > 0).map((r) => String(r.date ?? '').slice(0, 10)).filter(Boolean).sort()
  if (!days.length) throw new PeecError(`No day between ${start} and ${end} has any Peec data for this project`, false, false, 'no_data')
  const window = { start: days[0], end: days[days.length - 1] }
  const W = { project_id: projectId, start_date: window.start, end_date: window.end }

  onStep?.(5)
  const brands = peecContract('peec.brands_report', await client.all<BrandReportRow>('POST', '/reports/brands', W, (r) => r.brand.id, 10_000))
  if (!brands.some((r) => r.brand.id === owned[0].id)) throw new PeecError('The own brand has no row in the Peec brands report for this window', false, false, 'own_brand_no_row')
  const warnings: string[] = []
  // Both calls below only supply model names, so a failure other than an exhausted budget or a broken contract is a warning.
  let byModel: { brand: { id: string }; model_channel?: { id?: string } | null; visibility_total?: number | null }[] = []
  try {
    byModel = peecContract('peec.brands_by_model', await client.all<{ brand: { id: string }; model_channel?: { id?: string } | null; visibility_total?: number | null }>(
      'POST', '/reports/brands', { ...W, dimensions: ['model_channel_id'] }, (r) => `${r.brand.id}|${r.model_channel?.id}`, 10_000))
  } catch (e) {
    if (mustRethrow(e)) throw e
    warnings.push("Peec's model breakdown could not be loaded, so the models covered are not listed.")
  }
  const channelIds = [...new Set(byModel.filter((r) => (r.visibility_total ?? 0) > 0).map((r) => r.model_channel?.id).filter((x): x is string => !!x))].sort()
  // One unpaged, non-fatal call, as AIVx does (aivx agent/agent.py:1125-1138); names fall back to the ids.
  let channels: { id: string; description?: string | null; current_model?: { id?: string } | null }[] = []
  try {
    channels = peecContract('peec.model_channels', rowsOf<{ id: string; description?: string | null; current_model?: { id?: string } | null }>(await client.call('GET', '/model-channels', { params: { project_id: projectId, limit: 100 } })))
  } catch (e) {
    if (mustRethrow(e)) throw e
    warnings.push("Peec's model names could not be loaded, so models are shown by id.")
  }
  const models = channelIds.map((id) => { const c = channels.find((x) => x.id === id); return c?.description || c?.current_model?.id || id })

  onStep?.(6)
  const domains = peecContract('peec.domains_report', await client.all<DomainRow>('POST', '/reports/domains', W, (r) => r.domain, 10_000))
  if (domains.reduce((s, r) => s + (r.retrieved_chat_count ?? 0), 0) <= 0) throw new PeecError('Peec returned zero retrievals across every domain for this window', false, false, 'zero_retrievals')

  onStep?.(8)
  // Default order impact desc; non-fatal, since actions are optional.
  let actions: ActionRow[] = []
  try {
    for (let page = 0; page < ACTION_PAGES && actions.length < ACTIONS_WANTED; page++) {
      const rows = peecContract('peec.actions', rowsOf<ActionRow>(await client.call('POST', '/actions/list', { body: { project_id: projectId, limit: ACTION_PAGE, offset: page * ACTION_PAGE } })))
      actions.push(...rows.filter((a) => a.status === 'PENDING'))
      if (rows.length < ACTION_PAGE) break
    }
    actions = actions.slice(0, ACTIONS_WANTED)
  } catch (e) {
    if (mustRethrow(e)) throw e
    actions = []
    warnings.push('Peec actions could not be loaded, so opportunities come from the data only.')
  }
  // Optional: the methodology leaves the count out when this fails.
  let prompts: { total_count?: number } | null = null
  try {
    prompts = peecContract('peec.prompts', (await client.call('GET', '/prompts', { params: { project_id: projectId, limit: 1 } })) as { total_count?: number } | null)
  } catch (e) {
    if (mustRethrow(e)) throw e
    warnings.push("Peec's prompt count could not be loaded, so the methodology leaves it out.")
  }

  return {
    project, roster, ownBrand: owned[0], profile, requested, rangePicked: range != null, window, brands, domains, actions,
    promptCount: typeof prompts?.total_count === 'number' ? prompts.total_count : null,
    models,
    warnings,
  }
}
```
Run the pull tests: PASS (the existing ones too).

- [ ] **Step 3: Write the failing contract additions and generate tests**

Append to `lib/aeo-outbound/contracts.test.ts` (add `GENERATE_BODY, GLEAN_SLOTS, SLOTS_BODY` to the import from `./contracts`):
```ts
test('the generate body contract keeps the v1.0 rules: a non-empty projectId, and rerunOf null or a report id', () => {
  const ok = (b: unknown) => checkContract('request.generate', GENERATE_BODY, b, 'enforce', {}).ok
  expect(ok({ projectId: 'or_a' })).toBe(true)
  expect(ok({ projectId: 'or_a', rerunOf: null, start: '2026-09-01', end: '2026-09-30' })).toBe(true)
  expect(ok({ projectId: 'or_a', rerunOf: 'c7d8e0a1-1111-4111-8111-111111111111' })).toBe(true)
  for (const b of [null, 'x', {}, { projectId: '' }, { projectId: 5 }, { projectId: 'or_a', rerunOf: 'nope' }, { projectId: 'or_a', rerunOf: 7 }]) expect(ok(b)).toBe(false)
})
test('the slots body contract: a string path, any value, an integer revision', () => {
  const ok = (b: unknown) => checkContract('request.slots', SLOTS_BODY, b, 'enforce', {}).ok
  expect(ok({ path: 'headline', value: 'x', revision: 3 })).toBe(true)
  for (const b of [null, {}, { path: 5, revision: 3 }, { path: 'headline', value: 'x' }, { path: 'headline', value: 'x', revision: 1.5 }, { path: 'headline', value: 'x', revision: '3' }]) expect(ok(b)).toBe(false)
})
test('the Glean reply contract: every copy key a non-empty string, 2 or 3 bullets, exactly 3 opportunities, next_step optional', () => {
  const reply = { headline: 'H', summary: 'S', context: 'C', competitive_bullets: [{ lead: 'L', text: 'T' }, { lead: 'L', text: 'T' }], sources_bullets: [{ lead: 'L', text: 'T' }, { lead: 'L', text: 'T' }], why: 'W', opportunities: [0, 1, 2].map(() => ({ signal: 's', opportunity: 'o', workstream: 'w' })), methodology: 'M' }
  expect(checkContract('glean.slots', GLEAN_SLOTS, reply, 'enforce', {}).ok).toBe(true)
  expect(checkContract('glean.slots', GLEAN_SLOTS, { ...reply, headline: 5 }, 'enforce', {})).toEqual({ ok: false, issues: [{ field: 'headline', issue: 'invalid_type' }] })
  expect(checkContract('glean.slots', GLEAN_SLOTS, { ...reply, opportunities: reply.opportunities.slice(0, 2) }, 'enforce', {}).ok).toBe(false)
})
```

Append to `lib/aeo-outbound/generate.test.ts`:
```ts
test('progress: pull reports steps 1 to 6 and 8, then generate reports 9 before the first Glean call', async () => {
  const steps: number[] = []
  const glean = vi.fn(async () => { steps.push(-1); return reply(GOOD) })
  await generateSnapshot('or_a', { ...deps(glean), onStep: (s) => steps.push(s) })
  // GOOD has numbers the fixture's Data block lacks, so a second attempt may follow; only the order up to the first call matters.
  expect(steps.slice(0, 9)).toEqual([1, 2, 3, 4, 5, 6, 8, 9, -1])
})

test('a reply that breaks its contract is retried once with the fields named', async () => {
  const glean = vi.fn().mockResolvedValueOnce(reply('{"headline":5}')).mockResolvedValueOnce(reply(GOOD))
  const r = await generateSnapshot('or_a', deps(glean))
  expect(r.ok).toBe(true)
  expect(String(glean.mock.calls[1][0])).toContain('headline: invalid_type')
})

test('every failure carries its code', async () => {
  const run = (routes: Record<string, Route>, range: { start: string; end: string } | null = null, opts: { maxRows?: number } = {}, glean = vi.fn(), project = 'or_a') =>
    generateSnapshot(project, { peec: fakePeec(routes, opts).client, glean, deadline: NOW + 270_000, now: () => NOW }, range)
  const codeOf = async (p: Promise<{ ok: boolean }>) => ((await p) as { code?: string }).code
  expect(await codeOf(run(base, null, {}, vi.fn(), 'or_zzz'))).toBe('no_project')
  expect(await codeOf(run({ ...base, '/brands': () => ROSTER.map((r) => ({ ...r, is_own: true })) }))).toBe('own_brand_count')
  expect(await codeOf(run({ ...base, '/reports/domains': () => [] }, { start: '2026-09-01', end: '2026-09-07' }))).toBe('no_data')
  expect(await codeOf(run({ ...base, '/reports/brands': (_u, b) => (b?.dimensions ? [] : [{ brand: { id: 'kw_c1', name: 'Rival' }, visibility: 0.3 }]) }))).toBe('own_brand_no_row')
  expect(await codeOf(run({ ...base, '/reports/domains': (_u, b) => (b?.dimensions ? [{ domain: 'x.com', date: '2026-10-05', retrieved_chat_count: 1 }] : [{ domain: 'x.com', retrieved_chat_count: 0 }]) }))).toBe('zero_retrievals')
  const rows = [1, 2, 3, 4].map((i) => ({ domain: `d${i}.com`, date: '2026-10-05', retrieved_chat_count: 1 }))
  expect(await codeOf(run({ ...base, '/reports/domains': (_u, b) => (b?.dimensions ? rows : []) }, null, { maxRows: 3 }))).toBe('history_too_long')
  expect(await codeOf(run(timeoutRoutes))).toBe('history_too_long')
  expect(await codeOf(run(timeoutRoutes, { start: '2026-09-01', end: '2026-09-07' }))).toBe('timeout')
  expect(await codeOf(run({ ...base, '/brands': () => { throw { status: 404 } } }))).toBe('peec_error')
  const noVisibility = await run({ ...base, '/reports/brands': (_u, b) => (b?.dimensions ? [] : [{ brand: { id: 'kw_own', name: 'Example Co' } }]) })
  expect(noVisibility).toMatchObject({ ok: false, code: 'contract_violation', error: 'peec.brands_report.visibility' })
  expect(await codeOf(run(base, null, {}, vi.fn(async () => reply('{"headline":5}'))))).toBe('copy_failed')
  expect(await codeOf(run(base, null, {}, vi.fn(async () => reply(GOOD, true))))).toBe('copy_outside_sources')
  const clockBroken = await generateSnapshot('or_a', { peec: fakePeec(base).client, glean: vi.fn(), deadline: NOW + 270_000, now: () => { throw new Error('clock') } })
  expect(clockBroken).toMatchObject({ ok: false, code: 'internal', error: 'Generation failed at step 0: clock' })
  expect(await generateSnapshot('or_a', { peec: new PeecClient('skc-x', { now: () => 10, deadline: 5 }), glean: vi.fn(), deadline: 5, now: () => 10 })).toMatchObject({ code: 'timeout', error: 'Timed out at step 1' })
})
```
Note: `timeoutRoutes` is defined later in the existing file (line 151); because these tests are appended after it, they can use it.

Run: `perl -e 'alarm 590; exec @ARGV' -- npx vitest run lib/aeo-outbound/contracts.test.ts lib/aeo-outbound/generate.test.ts` (FAIL).

- [ ] **Step 4: Implement the contract additions and generate**

Append to `lib/aeo-outbound/contracts.ts`:
```ts
/** A report id: the same shape store.ts checks before any query reaches Postgres. */
export const REPORT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const copyText = z.string().min(1)
const bullet = z.looseObject({ lead: copyText, text: copyText })
/** The Glean reply's shape (spec §6). validateGeneratedSlots still cleans and length-checks every value afterwards. */
export const GLEAN_SLOTS = z.looseObject({
  headline: copyText, summary: copyText, context: copyText,
  competitive_bullets: z.array(bullet).min(2).max(3), sources_bullets: z.array(bullet).min(2).max(3),
  why: copyText, opportunities: z.array(z.looseObject({ signal: copyText, opportunity: copyText, workstream: copyText })).length(3),
  methodology: copyText, next_step: copyText.optional(),
})
/** POST /api/aeo-outbound/generate. start and end are checked by checkRange (range.ts), which owns their messages. */
export const GENERATE_BODY = z.looseObject({ projectId: z.string().min(1), rerunOf: z.string().regex(REPORT_ID_RE).nullish() })
/** PATCH /api/aeo-outbound/reports/{id}/slots. path and value are checked by slots.ts, which owns their messages. */
export const SLOTS_BODY = z.looseObject({ path: z.string(), value: z.unknown(), revision: z.number().int() })
```
In `lib/aeo-outbound/store.ts` replace line 86 (`const UUID = /^...$/`) with `const UUID = REPORT_ID_RE` and add `import { REPORT_ID_RE } from './contracts'`.

Replace `lib/aeo-outbound/generate.ts` with:
```ts
// Spec §6 and §7a (v1.1 §7, §10): pull, compute, write copy with at most two Glean attempts inside the deadline, enforce
// the search guard, the reply contract and the shape check, keep grounding problems as notes. Every failure carries
// a code the UI turns into plain words.
import { DECISIONS, MAX_WINDOW_DAYS, NEEDS_VALIDATION } from './config'
import { checkContract, GLEAN_SLOTS } from './contracts'
import type { ErrorCode } from './error-codes'
import { buildSnapshotData, type SnapshotData } from './metrics'
import type { StoredNote } from './notes'
import { isPeecTimeout, PeecClient, PeecError } from './peec'
import { pullSnapshot } from './pull'
import { buildPrompt, dataBlock, parseModelJson } from './prompt'
import { groundingFlags } from './grounding'
import { validateGeneratedSlots, type Slots } from './slots'
import type { GleanReply } from './glean'
import type { DayRange } from './range'

export type GenerationResult =
  | { ok: true; brandName: string; data: SnapshotData; slots: Slots; notes: StoredNote[] }
  | { ok: false; error: string; code: ErrorCode; brandName: string | null }

/** The step reported while Glean writes the copy (v1.1 §7). Pull reports 1 to 6 and 8; there is no step 7. */
export const WRITING_STEP = 9

export async function generateSnapshot(
  projectId: string,
  deps: { peec: PeecClient; glean: (prompt: string, signal: AbortSignal) => Promise<GleanReply>; deadline: number; now: () => number; onStep?: (step: number) => void },
  range: DayRange | null = null,
): Promise<GenerationResult> {
  let brandName: string | null = null
  let step = 0
  const reach = (s: number) => { step = s; deps.onStep?.(s) }
  try {
    const pull = await pullSnapshot(deps.peec, projectId, deps.now(), reach, range)
    brandName = pull.ownBrand.name
    const data = buildSnapshotData(pull, new Date(deps.now()).toISOString())
    const fixed = {
      category: data.category ?? NEEDS_VALIDATION,
      market: data.market ?? NEEDS_VALIDATION,
      ...(DECISIONS.fixedNextStep !== null ? { next_step: DECISIONS.fixedNextStep } : {}),
    }
    const block = dataBlock(data)
    let problems: string[] = []
    let lastSearched = false
    /** A shape-valid reply whose only problem was grounding: kept so a worse second attempt can't lose it. */
    let groundedFallback: { slots: Slots; flags: string[] } | null = null
    reach(WRITING_STEP)
    for (let attempt = 1; attempt <= 2; attempt++) {
      const left = deps.deadline - deps.now()
      if (attempt === 2 && left < 60_000) break
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), Math.max(left, 1))
      let replyText: string
      try {
        const r = await deps.glean(buildPrompt(data, problems), controller.signal)
        lastSearched = r.searched
        if (r.searched) { problems = ['the answer used sources outside the Data section']; continue }
        replyText = r.text
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') { if (groundedFallback) break; throw e }
        problems = [`the previous answer could not be read (${String((e as Error)?.message ?? e).slice(0, 80)})`]
        continue
      } finally {
        clearTimeout(timer)
      }
      const parsed = parseModelJson(replyText) as Record<string, unknown> | null
      // v1.1 §10: the reply's shape is a contract. A violation is a shape problem fed to the one retry.
      const shape = checkContract('glean.slots', GLEAN_SLOTS, parsed)
      if (!shape.ok) { problems = shape.issues.map((i) => `${i.field}: ${i.issue}`); continue }
      const fixedNow = { ...fixed }
      if (DECISIONS.writeSpecificCategory && typeof parsed?.category === 'string') fixedNow.category = parsed.category
      const checked = validateGeneratedSlots(parsed, fixedNow)
      if (!checked.ok) { problems = checked.errors; continue }
      const flags = groundingFlags(checked.slots, data, block)
      if (!flags.length) return { ok: true, brandName, data, slots: checked.slots, notes: data.notes }
      groundedFallback = { slots: checked.slots, flags }
      if (attempt === 1 && deps.deadline - deps.now() >= 60_000) { problems = flags; continue }
      break
    }
    if (groundedFallback) return { ok: true, brandName, data, slots: groundedFallback.slots, notes: [...data.notes, ...groundedFallback.flags] }
    if (lastSearched) return { ok: false, error: 'Copy generation used outside sources. Rerun.', code: 'copy_outside_sources', brandName }
    return { ok: false, error: 'Copy generation failed. Rerun.', code: 'copy_failed', brandName }
  } catch (e) {
    // Only this client's own exhausted budget counts (PeecError.timeout), never an upstream body that says "timed out".
    if ((e as Error)?.name === 'AbortError' || isPeecTimeout(e)) {
      const history = range == null && step === 4
      return { ok: false, error: history ? `Timed out at step 4. Pick a start and end date, at most ${MAX_WINDOW_DAYS} days.` : `Timed out at step ${step}`, code: history ? 'history_too_long' : 'timeout', brandName }
    }
    if (e instanceof PeecError) return { ok: false, error: e.message, code: e.code ?? 'peec_error', brandName }
    return { ok: false, error: `Generation failed at step ${step}: ${(e as Error)?.message ?? String(e)}`.slice(0, 300), code: 'internal', brandName }
  }
}
```
Run the contract and generate tests: PASS.

- [ ] **Step 5: Write the failing generate route tests**

In `app/api/aeo-outbound/generate/route.test.ts`:
- Add `progress: vi.fn(), progressArgs: vi.fn(), failedArgs: vi.fn()` to the `vi.hoisted` object (line 4 to 7).
- In the store mock (lines 11 to 19) replace the `finishFailedQuery` line with `finishFailedQuery: (...a: unknown[]) => { m.failedArgs(...a); return { then: (r: (v: unknown) => void) => r(m.failed()) } },` and add `progressStepQuery: (id: string, step: number) => { m.progressArgs(id, step); return { then: (r: (v: unknown) => void, j: (e: unknown) => void) => { try { r(m.progress()) } catch (e) { j(e) } } } },`.
- In `'200 draft and 200 failed, with the row inserted with its range'` (lines 158 to 166) change the failed mock and expectation to:
```ts
  m.generateSnapshot.mockResolvedValueOnce({ ok: false, error: 'Copy generation failed. Rerun.', code: 'copy_failed', brandName: 'Example Co' })
  expect(await (await post({ projectId: 'or_a', rerunOf: RERUN })).json()).toEqual({ id: 'row-1', status: 'failed', error: 'Copy generation failed. Rerun.', code: 'copy_failed' })
```
and after `expect(m.failed).toHaveBeenCalled()` add `expect(m.failedArgs).toHaveBeenLastCalledWith('row-1', 'Copy generation failed. Rerun.', 'Example Co', expect.any(Date), 'copy_failed')`.
- In `'a throw while finishing still fails the row and answers'` (lines 209 to 214) the expected body becomes `{ id: 'row-1', status: 'failed', error: 'Generation failed. Rerun.', code: 'internal' }` and add `expect(m.failedArgs).toHaveBeenLastCalledWith('row-1', 'Generation failed. Rerun.', null, expect.any(Date), 'internal')`.
- Append:
```ts
test('a missing Peec key answers 502 JSON with one log line, and creates no row', async () => {
  as('ryan@avenuez.com')
  vi.stubEnv('PEEC_AI_CUSTOMER_TOKEN', '')
  const res = await post({ projectId: 'or_a' })
  expect(res.status).toBe(502)
  expect(await res.json()).toEqual({ error: "Peec isn't configured on this server. Tell engineering." })
  expect(m.insert).not.toHaveBeenCalled()
  expect(vi.mocked(console.error).mock.calls.map((c) => c.map(String).join(' '))).toEqual(['[aeo-outbound] generate peec client failed reason=PeecError'])
})

test('progress steps are written unawaited for this row, and a failing write logs one line and never throws', async () => {
  as('ryan@avenuez.com')
  await post({ projectId: 'or_a' })
  const deps = m.generateSnapshot.mock.calls[0][1] as { onStep: (s: number) => void }
  deps.onStep(4)
  await new Promise((r) => setTimeout(r, 0))
  expect(m.progressArgs).toHaveBeenCalledWith('row-1', 4)
  m.progress.mockImplementationOnce(() => { throw Object.assign(new Error('params ryan@avenuez.com'), { code: '57P01' }) })
  expect(() => deps.onStep(5)).not.toThrow()
  await new Promise((r) => setTimeout(r, 0))
  const lines = vi.mocked(console.warn).mock.calls.map((c) => c.map(String).join(' '))
  expect(lines).toEqual(['[aeo-outbound] progress not recorded id=row-1 step=5 reason=57P01'])
})
```
Run: `perl -e 'alarm 590; exec @ARGV' -- npx vitest run app/api/aeo-outbound/generate/route.test.ts` (FAIL).

- [ ] **Step 6: Implement the route changes**

In `app/api/aeo-outbound/generate/route.ts`:
- Imports: add `import { checkContract, GENERATE_BODY } from '@/lib/aeo-outbound/contracts'`, add `PeecClient` to the `@/lib/aeo-outbound/peec` import, and add `progressStepQuery` to the store import.
- After line 22 add `const PEEC_NOT_CONFIGURED = { error: "Peec isn't configured on this server. Tell engineering." }`.
- Replace lines 42 to 46 with:
```ts
  // v1.1 §10: the body is a contract; a violation keeps the v1.0 400 body.
  if (!checkContract('request.generate', GENERATE_BODY, body).ok) return NextResponse.json(BAD_REQUEST, { status: 400 })
  const projectId = (body as { projectId: string }).projectId
  const rerunOf = (body as { rerunOf?: string | null }).rerunOf ?? null
```
  (`isReportId` is no longer used in this file: remove it from the store import.)
- Replace line 64 (`const peec = peecFromEnv({ deadline })`) with:
```ts
  let peec: PeecClient
  try { peec = peecFromEnv({ deadline }) } catch (e) {
    // A missing PEEC_AI_CUSTOMER_TOKEN throws in the constructor (peec.ts:60): answer JSON, never crash (v1.1 §9).
    console.error(`[aeo-outbound] generate peec client failed reason=${errorLabel(e)}`)
    return NextResponse.json(PEEC_NOT_CONFIGURED, { status: 502 })
  }
```
- In the `generateSnapshot` deps object (lines 87 to 96) add, after `now: Date.now,`:
```ts
        // v1.1 §7: one unawaited, guarded UPDATE per step. It never throws and never slows the run.
        onStep: (step: number) => {
          void Promise.resolve()
            .then(() => progressStepQuery(id, step))
            .then(() => undefined, (e: unknown) => console.warn(`[aeo-outbound] progress not recorded id=${id} step=${step} reason=${errorLabel(e)}`))
        },
```
- Replace lines 104 to 106 with:
```ts
    await finishFailedQuery(id, result.error, result.brandName, new Date(), result.code)
    console.info(`[aeo-outbound] generate id=${id} outcome=failed code=${result.code} ms=${Date.now() - started}`)
    return NextResponse.json({ id, status: 'failed', error: result.error, code: result.code })
```
- Replace lines 110 and 111 with:
```ts
    try { await finishFailedQuery(id, 'Generation failed. Rerun.', null, new Date(), 'internal') } catch { /* logged above; the stale rule still frees the row */ }
    return NextResponse.json({ id, status: 'failed', error: 'Generation failed. Rerun.', code: 'internal' })
```
Run the route tests: PASS.

- [ ] **Step 7: Gate, commit, push**

Gate. Commit every file this task touched, by name, with subject `Check Peec responses against their contracts and carry an error code on every failure` and body:
```
Edge cases (Peec and Glean responses and the generate body are untrusted; progress writes touch shared state):
- external failure: a drifted enforced Peec field fails the run with contract_violation and the field; a missing Peec key answers 502 JSON: fix
- operator visibility: the failed row stores error_code; the outcome log names the code; a failed progress write logs id, step and error code: fix
- bounds: /actions/list reads at most 5 pages of 50: fix
- input boundaries: the generate body and the Glean reply are checked against their contracts before use: fix
- state and concurrency: progress writes are unawaited, only move forward and only touch a generating row, so a late write cannot change a finished one: fix
- security: logs carry ids, steps and codes, never a value or an email: fix

Co-Authored-By: Claude <model> <noreply@anthropic.com>
```
Push.

---
### Task 5: Settings model and `outboundAccess` everywhere

Covers v1.1 §8 (settings types and limits, `config.ts` values as defaults, one async `outboundAccess` replacing `outboundEmail` in every page, route and action, the env floor, the read-failure fallback, settings read once per request and passed to metrics and prompt through the generation, the no-access page naming the admins), §10 (the settings-row contract), round-2 MINORs 7 and 11.

**Files:**
- Modify: `lib/aeo-outbound/contracts.ts` (append `SETTINGS_ROW`)
- Create: `lib/aeo-outbound/settings.ts`, `lib/aeo-outbound/settings.test.ts`, `lib/aeo-outbound/access.ts`, `lib/aeo-outbound/access.test.ts`
- Modify: `lib/aeo-outbound/permissions.ts:9-18` (`outboundEmail` becomes `accessFor`), `lib/aeo-outbound/permissions.test.ts:2,9-22`
- Modify: `lib/aeo-outbound/generate.ts` (a `settings` parameter), `lib/aeo-outbound/generate.test.ts` (append)
- Modify: `app/api/aeo-outbound/projects/route.ts:5,15`, `app/api/aeo-outbound/generate/route.ts:8,33-35,85-98`, `app/api/aeo-outbound/reports/[id]/view/route.ts:3,28`, `app/api/aeo-outbound/reports/[id]/slots/route.ts:3,18`, `app/actions/aeo-outbound.ts:9,23-30`, `app/tools/new-business/page.tsx:2,9`, `app/tools/new-business/[reportId]/page.tsx:3,17`
- Modify: `components/aeo-outbound/no-access.tsx`, `components/aeo-outbound/messages.ts` (append); create `components/aeo-outbound/no-access.test.tsx`
- Modify tests: `app/api/aeo-outbound/projects/route.test.ts`, `app/api/aeo-outbound/generate/route.test.ts`, `app/api/aeo-outbound/reports/[id]/view/route.test.ts`, `app/api/aeo-outbound/reports/[id]/slots/route.test.ts`, `app/actions/aeo-outbound.test.ts` (each gains the settings-store mock)

**Interfaces:**
- Consumes: `readSettingsRow()`, `type SettingsValues`, `type SettingsChange` (Task 2); `checkContract` (Task 1); `buildSnapshotData(pull, at, decisions, used)` (Task 3).
- Produces:
  - `settings.ts`: `type OutboundSettings = SettingsValues`, `SETTINGS_DEFAULTS`, `SETTINGS_LIMITS`, `SETTINGS_ERRORS`, `type SettingsField = keyof OutboundSettings`, `SETTINGS_FIELD_LABELS`, `resolveSettings(row: unknown): { settings: OutboundSettings; updatedAt: string | null; invalid: boolean }`, `parseEmails(raw: string): string[]`, `interface SettingsInput`, `type SettingsErrors`, `validateSettingsInput(input: SettingsInput): { ok: true; values: OutboundSettings } | { ok: false; errors: SettingsErrors }`, `settingsChanges(before: OutboundSettings | null, after: OutboundSettings): SettingsChange[]`, `settingsToInput(s: OutboundSettings): SettingsInput`, `type GenerationSettings`
  - `access.ts`: `type OutboundAccess = { ok: true; email: string; admin: boolean; admins: string[]; settings: OutboundSettings; settingsUpdatedAt: string | null; settingsInvalid: boolean; settingsReadFailed: boolean } | { ok: false; admins: string[] }`, `outboundAccess(user, env?, read?): Promise<OutboundAccess>`
  - `permissions.ts`: `accessFor(user, envUsers: Set<string>, lists: { users: readonly string[]; admins: readonly string[] }): { email: string; admin: boolean } | null` (replaces `outboundEmail`, which is deleted)
  - `generate.ts`: `generateSnapshot(projectId, deps, range = null, settings: GenerationSettings = SETTINGS_DEFAULTS)`
  - `messages.ts`: `askAdmin(admins: string[]): string`; `NoAccess({ admins }: { admins: string[] })`

- [ ] **Step 1: Write the failing settings and access tests**

Create `lib/aeo-outbound/settings.test.ts`:
```ts
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { parseEmails, resolveSettings, SETTINGS_DEFAULTS, SETTINGS_ERRORS, settingsChanges, settingsToInput, validateSettingsInput, type SettingsInput } from './settings'

beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}) })
afterEach(() => { vi.restoreAllMocks() })

const INPUT: SettingsInput = {
  users: 'ana@avenuez.com', admins: '', section1: 'Category data', section2: 'Competitive visibility',
  nextStepMode: 'written', nextStep: '', rankMode: 'all', rankAmong: '', peecOpportunityRows: '1',
  methodologyStatesPromptsAndModels: true, sidebarWordmark: 'AIVx',
}
const ROW = { id: true, users: ['ana@avenuez.com'], admins: ['boss@avenuez.com'], sectionTitles: ['Strengths', 'Gaps'], fixedNextStep: null, rankAmong: 7, peecOpportunityRows: 2, methodologyStatesPromptsAndModels: false, sidebarWordmark: 'Avenue Z', updatedAt: new Date('2026-10-10T09:00:00.000Z'), updatedBy: 'boss@avenuez.com' }

test('the defaults are the config.ts DECISIONS, and no row means the defaults', () => {
  expect(SETTINGS_DEFAULTS).toEqual({ users: [], admins: [], sectionTitles: ['Category data', 'Competitive visibility'], fixedNextStep: null, rankAmong: null, peecOpportunityRows: 1, methodologyStatesPromptsAndModels: true, sidebarWordmark: 'AIVx' })
  expect(resolveSettings(null)).toEqual({ settings: SETTINGS_DEFAULTS, updatedAt: null, invalid: false })
  expect(resolveSettings(undefined)).toEqual({ settings: SETTINGS_DEFAULTS, updatedAt: null, invalid: false })
})

test('a valid row becomes the settings with its updated_at', () => {
  expect(resolveSettings(ROW)).toEqual({ settings: { users: ['ana@avenuez.com'], admins: ['boss@avenuez.com'], sectionTitles: ['Strengths', 'Gaps'], fixedNextStep: null, rankAmong: 7, peecOpportunityRows: 2, methodologyStatesPromptsAndModels: false, sidebarWordmark: 'Avenue Z' }, updatedAt: '2026-10-10T09:00:00.000Z', invalid: false })
})

test('a row that breaks its contract falls back to the defaults, keeps its updated_at so a save can replace it, and logs the field', () => {
  expect(resolveSettings({ ...ROW, sectionTitles: ['Only one'] })).toEqual({ settings: SETTINGS_DEFAULTS, updatedAt: '2026-10-10T09:00:00.000Z', invalid: true })
  expect(vi.mocked(console.error).mock.calls.map((c) => String(c[0]))).toEqual(['[aeo-outbound] contract boundary=settings.row field=sectionTitles issue=too_small count=1 mode=enforce'])
})

test('emails are split on commas, semicolons and whitespace, trimmed, lowercased and deduplicated', () => {
  expect(parseEmails(' Ana@AvenueZ.com, bo@avenuez.com;\nana@avenuez.com  ')).toEqual(['ana@avenuez.com', 'bo@avenuez.com'])
  expect(parseEmails('')).toEqual([])
})

test('validation applies the §8 limits field by field', () => {
  expect(validateSettingsInput(INPUT)).toEqual({ ok: true, values: { ...SETTINGS_DEFAULTS, users: ['ana@avenuez.com'] } })
  const bad = (over: Partial<SettingsInput>) => { const r = validateSettingsInput({ ...INPUT, ...over }); return r.ok ? null : r.errors }
  expect(bad({ users: 'ana@gmail.com' })).toEqual({ users: SETTINGS_ERRORS.email })
  expect(bad({ admins: `${'a'.repeat(190)}@avenuez.com` })).toEqual({ admins: SETTINGS_ERRORS.emailLong })
  expect(bad({ users: Array.from({ length: 51 }, (_, i) => `p${i}@avenuez.com`).join(',') })).toEqual({ users: SETTINGS_ERRORS.tooMany })
  expect(bad({ section1: '' })).toEqual({ sectionTitles: SETTINGS_ERRORS.title })
  expect(bad({ section2: 'x'.repeat(61) })).toEqual({ sectionTitles: SETTINGS_ERRORS.title })
  expect(bad({ nextStepMode: 'fixed', nextStep: '  ' })).toEqual({ fixedNextStep: SETTINGS_ERRORS.nextStep })
  expect(bad({ nextStepMode: 'fixed', nextStep: 'x'.repeat(301) })).toEqual({ fixedNextStep: SETTINGS_ERRORS.nextStep })
  for (const n of ['1', '51', '2.5', 'ten', '']) expect(bad({ rankMode: 'top', rankAmong: n })).toEqual({ rankAmong: SETTINGS_ERRORS.rank })
  expect(bad({ peecOpportunityRows: '4' })).toEqual({ peecOpportunityRows: SETTINGS_ERRORS.peecRows })
  expect(bad({ sidebarWordmark: 'AIVX' })).toEqual({ sidebarWordmark: SETTINGS_ERRORS.wordmark })
  const ok = validateSettingsInput({ ...INPUT, nextStepMode: 'fixed', nextStep: '  Book a   working session. ', rankMode: 'top', rankAmong: '7', section1: ' Strengths ' })
  expect(ok.ok && [ok.values.fixedNextStep, ok.values.rankAmong, ok.values.sectionTitles[0]]).toEqual(['Book a working session.', 7, 'Strengths'])
})

test('the change list names each changed field with its old and new value', () => {
  const after = { ...SETTINGS_DEFAULTS, users: ['ana@avenuez.com'], rankAmong: 7 }
  expect(settingsChanges(SETTINGS_DEFAULTS, after)).toEqual([
    { field: 'users', oldValue: [], newValue: ['ana@avenuez.com'] },
    { field: 'rankAmong', oldValue: null, newValue: 7 },
  ])
  expect(settingsChanges(SETTINGS_DEFAULTS, SETTINGS_DEFAULTS)).toEqual([])
  expect(settingsChanges(null, SETTINGS_DEFAULTS).map((c) => c.field)).toEqual(['users', 'admins', 'sectionTitles', 'fixedNextStep', 'rankAmong', 'peecOpportunityRows', 'methodologyStatesPromptsAndModels', 'sidebarWordmark'])
})

test('the form starts from the settings, and validating that input gives the same settings back', () => {
  const s = { ...SETTINGS_DEFAULTS, users: ['ana@avenuez.com', 'bo@avenuez.com'], fixedNextStep: 'Book a working session.', rankAmong: 7 }
  const input = settingsToInput(s)
  expect(input).toMatchObject({ users: 'ana@avenuez.com\nbo@avenuez.com', nextStepMode: 'fixed', rankMode: 'top', rankAmong: '7', peecOpportunityRows: '1' })
  expect(validateSettingsInput(input)).toEqual({ ok: true, values: s })
})
```

Create `lib/aeo-outbound/access.test.ts`:
```ts
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { outboundAccess } from './access'
import { SETTINGS_DEFAULTS } from './settings'

beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}) })
afterEach(() => { vi.restoreAllMocks() })
const staff = (email: string | null, role = 'INTERNAL_ANALYST') => ({ role, email })
const row = (over: Record<string, unknown> = {}) => ({ id: true, users: ['ana@avenuez.com'], admins: ['boss@avenuez.com'], sectionTitles: ['Strengths', 'Gaps'], fixedNextStep: null, rankAmong: null, peecOpportunityRows: 1, methodologyStatesPromptsAndModels: true, sidebarWordmark: 'AIVx', updatedAt: new Date('2026-10-10T09:00:00.000Z'), updatedBy: 'boss@avenuez.com', ...over })
const ENV = 'ryan@avenuez.com'

test('the env list is the floor: always a user and an admin, whatever the settings say', async () => {
  const a = await outboundAccess(staff('Ryan@AvenueZ.com'), ENV, async () => row({ users: [], admins: [] }))
  expect(a).toMatchObject({ ok: true, email: 'ryan@avenuez.com', admin: true, admins: ['ryan@avenuez.com'] })
})

test('settings users are users; settings admins are users and admins; the settings travel with the access', async () => {
  const read = async () => row()
  expect(await outboundAccess(staff('ana@avenuez.com'), ENV, read)).toMatchObject({ ok: true, admin: false, settings: { sectionTitles: ['Strengths', 'Gaps'] }, settingsUpdatedAt: '2026-10-10T09:00:00.000Z' })
  expect(await outboundAccess(staff('boss@avenuez.com'), ENV, read)).toMatchObject({ ok: true, admin: true, admins: ['boss@avenuez.com', 'ryan@avenuez.com'] })
})

test('staff on no list, other domains and client roles are refused, and the refusal names the admins', async () => {
  const read = async () => row()
  expect(await outboundAccess(staff('other@avenuez.com'), ENV, read)).toEqual({ ok: false, admins: ['boss@avenuez.com', 'ryan@avenuez.com'] })
  expect(await outboundAccess(staff('ryan@gmail.com'), 'ryan@gmail.com', read)).toMatchObject({ ok: false })
  expect(await outboundAccess(staff('ana@avenuez.com', 'CLIENT_ADMIN'), ENV, read)).toEqual({ ok: false, admins: [] })
  expect(await outboundAccess(staff(null), ENV, read)).toMatchObject({ ok: false })
  expect(await outboundAccess(null, ENV, read)).toEqual({ ok: false, admins: [] })
})

test('no settings row means the config.ts defaults and env users only', async () => {
  expect(await outboundAccess(staff('ana@avenuez.com'), ENV, async () => null)).toEqual({ ok: false, admins: ['ryan@avenuez.com'] })
  expect(await outboundAccess(staff('ryan@avenuez.com'), ENV, async () => null)).toMatchObject({ ok: true, settings: SETTINGS_DEFAULTS, settingsUpdatedAt: null, settingsReadFailed: false })
})

test('a settings read failure falls back to the env list only and the defaults, with one log line', async () => {
  const fail = async () => { throw Object.assign(new Error('params ana@avenuez.com'), { code: '57P01' }) }
  expect(await outboundAccess(staff('ana@avenuez.com'), ENV, fail)).toEqual({ ok: false, admins: ['ryan@avenuez.com'] })
  expect(await outboundAccess(staff('ryan@avenuez.com'), ENV, fail)).toMatchObject({ ok: true, admin: true, settings: SETTINGS_DEFAULTS, settingsReadFailed: true })
  const lines = vi.mocked(console.error).mock.calls.map((c) => c.map(String).join(' '))
  expect(lines).toEqual(['[aeo-outbound] settings read failed reason=57P01', '[aeo-outbound] settings read failed reason=57P01'])
  for (const l of lines) expect(l).not.toContain('@')
})

test('a client role never triggers a settings read', async () => {
  const read = vi.fn(async () => row())
  await outboundAccess(staff('ana@avenuez.com', 'CLIENT_VIEWER'), ENV, read)
  expect(read).not.toHaveBeenCalled()
})
```

In `lib/aeo-outbound/permissions.test.ts` change line 2 to `import { accessFor, originAllowed, outboundUsers } from './permissions'` and replace lines 9 to 22 (the two `outboundEmail` tests and `unset list means nobody`) with:
```ts
const NONE = { users: [] as string[], admins: [] as string[] }
test('accessFor: env staff are users and admins; the settings lists add users and admins', () => {
  const env = outboundUsers(LIST)
  expect(accessFor({ role: 'INTERNAL_ANALYST', email: 'Ryan@avenuez.com' }, env, NONE)).toEqual({ email: 'ryan@avenuez.com', admin: true })
  expect(accessFor({ role: 'INTERNAL_ADMIN', email: 'someone@avenuez.com' }, env, NONE)).toBeNull()
  expect(accessFor({ role: 'INTERNAL_ADMIN', email: 'someone@avenuez.com' }, env, { users: ['someone@avenuez.com'], admins: [] })).toEqual({ email: 'someone@avenuez.com', admin: false })
  expect(accessFor({ role: 'INTERNAL_ADMIN', email: 'boss@avenuez.com' }, env, { users: [], admins: ['boss@avenuez.com'] })).toEqual({ email: 'boss@avenuez.com', admin: true })
  expect(accessFor({ role: 'CLIENT_ADMIN', email: 'ryan@avenuez.com' }, env, NONE)).toBeNull()
  expect(accessFor({ role: 'INTERNAL_ANALYST', email: 'ryan@gmail.com' }, outboundUsers('ryan@gmail.com'), { users: ['ryan@gmail.com'], admins: [] })).toBeNull()
  expect(accessFor({ role: 'INTERNAL_ANALYST', email: null }, env, NONE)).toBeNull()
  expect(accessFor(null, env, NONE)).toBeNull()
})
test('an unset env list and empty settings mean nobody', () => {
  expect(accessFor({ role: 'INTERNAL_ADMIN', email: 'ryan@avenuez.com' }, outboundUsers(undefined), NONE)).toBeNull()
})
```

Create `components/aeo-outbound/no-access.test.tsx`:
```tsx
import { afterEach, expect, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { NoAccess } from './no-access'

afterEach(() => cleanup())
test('the no-access page names who to ask', () => {
  render(<NoAccess admins={['boss@avenuez.com', 'ryan@avenuez.com']} />)
  expect(screen.getByText('This tool is limited to the New Business team.')).toBeInTheDocument()
  expect(screen.getByText('Ask a New Business admin (boss@avenuez.com, ryan@avenuez.com) to add you.')).toBeInTheDocument()
})
test('with no admins known it still says who to ask', () => {
  render(<NoAccess admins={[]} />)
  expect(screen.getByText('Ask a New Business admin to add you.')).toBeInTheDocument()
})
```
Run: `perl -e 'alarm 590; exec @ARGV' -- npx vitest run lib/aeo-outbound/settings.test.ts lib/aeo-outbound/access.test.ts lib/aeo-outbound/permissions.test.ts components/aeo-outbound/no-access.test.tsx` (FAIL).

- [ ] **Step 2: Implement settings, access, permissions and the no-access page**

Append to `lib/aeo-outbound/contracts.ts`:
```ts
/** The settings row as Drizzle reads it (spec v1.1 §8 limits). A failure falls back to the config.ts defaults. */
export const SETTINGS_ROW = z.looseObject({
  users: z.array(z.string()).max(50),
  admins: z.array(z.string()).max(50),
  sectionTitles: z.array(z.string().min(1).max(60)).length(2),
  fixedNextStep: z.string().min(1).max(300).nullable(),
  rankAmong: z.number().int().min(2).max(50).nullable(),
  peecOpportunityRows: z.number().int().min(0).max(3),
  methodologyStatesPromptsAndModels: z.boolean(),
  sidebarWordmark: z.enum(['AIVx', 'Avenue Z']),
  updatedAt: z.date(),
})
```

Create `lib/aeo-outbound/settings.ts`:
```ts
// The tool's settings (spec v1.1 §8): types, the config.ts defaults used when no row exists, the row read through its
// contract, form validation with the §8 limits, and the per-field change list the log records. pitchOnly and
// needsValidationBlocksApprove stay config.ts constants, never settings.
import { DECISIONS } from './config'
import { checkContract, SETTINGS_ROW } from './contracts'
import type { SettingsChange, SettingsValues } from './settings-store'
import { cleanValue } from './slots'

export type OutboundSettings = SettingsValues
/** What a generation reads from the settings. */
export type GenerationSettings = Pick<OutboundSettings, 'sectionTitles' | 'fixedNextStep' | 'rankAmong' | 'peecOpportunityRows' | 'methodologyStatesPromptsAndModels' | 'sidebarWordmark'>

export const SETTINGS_DEFAULTS: OutboundSettings = {
  users: [],
  admins: [],
  sectionTitles: [DECISIONS.sectionTitles[0], DECISIONS.sectionTitles[1]],
  fixedNextStep: DECISIONS.fixedNextStep,
  rankAmong: DECISIONS.rankAmong,
  peecOpportunityRows: DECISIONS.peecOpportunityRows,
  methodologyStatesPromptsAndModels: DECISIONS.methodologyStatesPromptsAndModels,
  sidebarWordmark: DECISIONS.showAivxName ? 'AIVx' : 'Avenue Z',
}
export const SETTINGS_LIMITS = { people: 50, emailChars: 200, title: 60, nextStep: 300, rankMin: 2, rankMax: 50, peecRowsMax: 3 } as const
export const SETTINGS_ERRORS = {
  email: 'Each email must end in @avenuez.com.',
  emailLong: 'Keep each email under 200 characters.',
  tooMany: 'List at most 50 people.',
  title: 'Section titles need 1 to 60 characters.',
  nextStep: 'The next-step sentence needs 1 to 300 characters.',
  rank: 'Rank among must be a whole number from 2 to 50.',
  peecRows: 'Pick 0, 1, 2 or 3.',
  wordmark: 'Pick AIVx or Avenue Z.',
  lastAdmin: 'Keep at least one admin.',
  conflict: 'Someone else changed these settings. Reload to see their changes.',
  readFailed: "The settings couldn't be loaded, so they can't be saved now. Reload and try again.",
} as const
export type SettingsField = keyof OutboundSettings
export const SETTINGS_FIELD_LABELS: Record<SettingsField, string> = {
  users: 'Who can use the tool',
  admins: 'Admins',
  sectionTitles: 'Section titles',
  fixedNextStep: 'Next step',
  rankAmong: 'Rank the brand among',
  peecOpportunityRows: 'Opportunities based on Peec recommendations',
  methodologyStatesPromptsAndModels: 'Methodology names the prompt count and the AI models',
  sidebarWordmark: 'Menu wordmark',
}
const FIELDS: SettingsField[] = ['users', 'admins', 'sectionTitles', 'fixedNextStep', 'rankAmong', 'peecOpportunityRows', 'methodologyStatesPromptsAndModels', 'sidebarWordmark']

/** The row as settings. No row: the defaults. A row that breaks its contract: the defaults, flagged invalid, with its
 *  updated_at kept so an admin's save can replace it. */
export function resolveSettings(row: unknown): { settings: OutboundSettings; updatedAt: string | null; invalid: boolean } {
  if (row === null || row === undefined) return { settings: SETTINGS_DEFAULTS, updatedAt: null, invalid: false }
  const at = (row as { updatedAt?: unknown }).updatedAt
  const updatedAt = at instanceof Date ? at.toISOString() : null
  if (!checkContract('settings.row', SETTINGS_ROW, row).ok) return { settings: SETTINGS_DEFAULTS, updatedAt, invalid: true }
  const r = row as OutboundSettings
  return {
    settings: {
      users: r.users, admins: r.admins, sectionTitles: [r.sectionTitles[0], r.sectionTitles[1]], fixedNextStep: r.fixedNextStep,
      rankAmong: r.rankAmong, peecOpportunityRows: r.peecOpportunityRows,
      methodologyStatesPromptsAndModels: r.methodologyStatesPromptsAndModels, sidebarWordmark: r.sidebarWordmark,
    },
    updatedAt,
    invalid: false,
  }
}

/** Split on commas, semicolons and whitespace; trimmed, lowercased, blanks and repeats dropped. */
export const parseEmails = (raw: string): string[] => [...new Set(raw.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))]

/** What the settings form sends. */
export interface SettingsInput {
  users: string
  admins: string
  section1: string
  section2: string
  nextStepMode: 'written' | 'fixed'
  nextStep: string
  rankMode: 'all' | 'top'
  rankAmong: string
  peecOpportunityRows: string
  methodologyStatesPromptsAndModels: boolean
  sidebarWordmark: string
}
export type SettingsErrors = Partial<Record<SettingsField, string>>

export function validateSettingsInput(input: SettingsInput): { ok: true; values: OutboundSettings } | { ok: false; errors: SettingsErrors } {
  const errors: SettingsErrors = {}
  const people = (raw: unknown, field: 'users' | 'admins'): string[] => {
    const list = parseEmails(typeof raw === 'string' ? raw : '')
    if (list.length > SETTINGS_LIMITS.people) errors[field] = SETTINGS_ERRORS.tooMany
    else if (list.some((e) => e.length > SETTINGS_LIMITS.emailChars)) errors[field] = SETTINGS_ERRORS.emailLong
    else if (list.some((e) => !/^[^@\s]+@avenuez\.com$/.test(e))) errors[field] = SETTINGS_ERRORS.email
    return list
  }
  const users = people(input.users, 'users')
  const admins = people(input.admins, 'admins')
  const titles = [input.section1, input.section2].map((t) => cleanValue(typeof t === 'string' ? t : ''))
  if (titles.some((t) => t.length < 1 || t.length > SETTINGS_LIMITS.title)) errors.sectionTitles = SETTINGS_ERRORS.title
  let fixedNextStep: string | null = null
  if (input.nextStepMode === 'fixed') {
    fixedNextStep = cleanValue(typeof input.nextStep === 'string' ? input.nextStep : '')
    if (fixedNextStep.length < 1 || fixedNextStep.length > SETTINGS_LIMITS.nextStep) errors.fixedNextStep = SETTINGS_ERRORS.nextStep
  }
  let rankAmong: number | null = null
  if (input.rankMode === 'top') {
    const raw = String(input.rankAmong ?? '').trim()
    rankAmong = /^\d+$/.test(raw) ? Number(raw) : Number.NaN
    if (!(rankAmong >= SETTINGS_LIMITS.rankMin && rankAmong <= SETTINGS_LIMITS.rankMax)) errors.rankAmong = SETTINGS_ERRORS.rank
  }
  const rowsRaw = String(input.peecOpportunityRows ?? '')
  if (!/^[0-3]$/.test(rowsRaw)) errors.peecOpportunityRows = SETTINGS_ERRORS.peecRows
  if (input.sidebarWordmark !== 'AIVx' && input.sidebarWordmark !== 'Avenue Z') errors.sidebarWordmark = SETTINGS_ERRORS.wordmark
  if (Object.keys(errors).length) return { ok: false, errors }
  return {
    ok: true,
    values: {
      users, admins, sectionTitles: [titles[0], titles[1]], fixedNextStep, rankAmong,
      peecOpportunityRows: Number(rowsRaw), methodologyStatesPromptsAndModels: input.methodologyStatesPromptsAndModels === true,
      sidebarWordmark: input.sidebarWordmark as OutboundSettings['sidebarWordmark'],
    },
  }
}

/** One entry per field whose value changed, in a fixed order, for the log table. before null (a stored row that broke
 *  its contract) logs every field, so an admin's save always replaces such a row. */
export function settingsChanges(before: OutboundSettings | null, after: OutboundSettings): SettingsChange[] {
  return FIELDS.filter((f) => before === null || JSON.stringify(before[f]) !== JSON.stringify(after[f])).map((f) => ({ field: f, oldValue: before ? before[f] : null, newValue: after[f] }))
}

/** The form's starting values for a set of settings. */
export function settingsToInput(s: OutboundSettings): SettingsInput {
  return {
    users: s.users.join('\n'), admins: s.admins.join('\n'), section1: s.sectionTitles[0], section2: s.sectionTitles[1],
    nextStepMode: s.fixedNextStep === null ? 'written' : 'fixed', nextStep: s.fixedNextStep ?? '',
    rankMode: s.rankAmong === null ? 'all' : 'top', rankAmong: s.rankAmong === null ? '' : String(s.rankAmong),
    peecOpportunityRows: String(s.peecOpportunityRows), methodologyStatesPromptsAndModels: s.methodologyStatesPromptsAndModels, sidebarWordmark: s.sidebarWordmark,
  }
}
```

In `lib/aeo-outbound/permissions.ts` replace lines 9 to 18 (`outboundEmail`) with:
```ts
/**
 * The caller's email and admin flag when they are staff, @avenuez.com, and on AEO_OUTBOUND_USERS or a settings list;
 * otherwise null (spec v1.1 §8). The env list is the floor: everyone on it is a user and an admin. A settings admin is
 * also a user.
 */
export function accessFor(
  user: { role?: string | null; email?: string | null } | null | undefined,
  envUsers: Set<string>,
  lists: { users: readonly string[]; admins: readonly string[] },
): { email: string; admin: boolean } | null {
  if (!user || !isStaff({ role: user.role ?? null })) return null
  const email = user.email?.trim().toLowerCase()
  if (!email || !isAvenueZEmail(email)) return null
  const admin = envUsers.has(email) || lists.admins.includes(email)
  return admin || lists.users.includes(email) ? { email, admin } : null
}
```

Create `lib/aeo-outbound/access.ts`:
```ts
// The one access check for every page, route and action of the tool (spec v1.1 §8). It reads the settings row once per
// request and hands the settings back, so callers pass them down instead of reading again.
import { isStaff } from '@/lib/auth/route-access'
import { errorLabel } from './log'
import { accessFor, outboundUsers } from './permissions'
import { readSettingsRow } from './settings-store'
import { resolveSettings, SETTINGS_DEFAULTS, type OutboundSettings } from './settings'

export type OutboundAccess =
  | { ok: true; email: string; admin: boolean; admins: string[]; settings: OutboundSettings; settingsUpdatedAt: string | null; settingsInvalid: boolean; settingsReadFailed: boolean }
  | { ok: false; admins: string[] }

export async function outboundAccess(
  user: { role?: string | null; email?: string | null } | null | undefined,
  env: string | undefined = process.env.AEO_OUTBOUND_USERS,
  read: () => Promise<unknown> = readSettingsRow,
): Promise<OutboundAccess> {
  // A non-staff caller never reaches the database.
  if (!user || !isStaff({ role: user.role ?? null })) return { ok: false, admins: [] }
  const envUsers = outboundUsers(env)
  let settings: OutboundSettings = SETTINGS_DEFAULTS
  let updatedAt: string | null = null
  let invalid = false
  let readFailed = false
  try {
    const r = resolveSettings(await read())
    settings = r.settings
    updatedAt = r.updatedAt
    invalid = r.invalid
  } catch (e) {
    // The settings can't be read: access falls back to the env list only and every other value to config.ts.
    readFailed = true
    console.error(`[aeo-outbound] settings read failed reason=${errorLabel(e)}`)
  }
  const lists = readFailed ? { users: [] as string[], admins: [] as string[] } : settings
  const admins = [...new Set([...envUsers, ...lists.admins])].sort()
  const who = accessFor(user, envUsers, lists)
  if (!who) return { ok: false, admins }
  return { ok: true, email: who.email, admin: who.admin, admins, settings, settingsUpdatedAt: updatedAt, settingsInvalid: invalid, settingsReadFailed: readFailed }
}
```

Append to `components/aeo-outbound/messages.ts`:
```ts
/** v1.1 §8: the no-access page names who to ask. */
export const askAdmin = (admins: string[]): string =>
  admins.length ? `Ask a New Business admin (${admins.join(', ')}) to add you.` : 'Ask a New Business admin to add you.'
```
Replace `components/aeo-outbound/no-access.tsx` with:
```tsx
import { ACCESS_MESSAGE, askAdmin } from './messages'

/** Shown to staff who are on no list (spec §8, v1.1 §8). */
export function NoAccess({ admins }: { admins: string[] }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface p-5">
      <p className="text-sm text-white">{ACCESS_MESSAGE}</p>
      <p className="mt-2 text-sm text-text-muted">{askAdmin(admins)}</p>
    </div>
  )
}
```
Run the four test files: PASS.

- [ ] **Step 3: Write the failing generation-settings tests**

Append to `lib/aeo-outbound/generate.test.ts` (add `import { SETTINGS_DEFAULTS } from './settings'`):
```ts
test('the settings passed in shape the data, the prompt and the fixed next step', async () => {
  const glean = vi.fn(async (_p: string) => reply(GOOD))
  const r = await generateSnapshot('or_a', deps(glean), null, { ...SETTINGS_DEFAULTS, rankAmong: 2, peecOpportunityRows: 0, methodologyStatesPromptsAndModels: false, fixedNextStep: 'Book a working session.' })
  expect(r.ok && r.data.settingsUsed).toEqual({ rankAmong: 2, peecOpportunityRows: 0, methodologyStatesPromptsAndModels: false, fixedNextStep: 'Book a working session.' })
  expect(r.ok && r.slots.next_step).toBe('Book a working session.')
  expect(String(glean.mock.calls[0][0])).not.toContain('Prompts tracked')
})
```
In `app/api/aeo-outbound/generate/route.test.ts`: add `readSettings: vi.fn(async () => null)` to the `vi.hoisted` object, add after the other mocks `vi.mock('@/lib/aeo-outbound/settings-store', () => ({ readSettingsRow: m.readSettings }))`, and append:
```ts
const SETTINGS_ROW = { id: true, users: ['ana@avenuez.com'], admins: [], sectionTitles: ['Strengths', 'Gaps'], fixedNextStep: null, rankAmong: 5, peecOpportunityRows: 1, methodologyStatesPromptsAndModels: true, sidebarWordmark: 'AIVx', updatedAt: new Date('2026-10-10T09:00:00.000Z'), updatedBy: 'ryan@avenuez.com' }
test('a settings user can generate, and the request settings reach the pipeline', async () => {
  m.readSettings.mockResolvedValueOnce(SETTINGS_ROW)
  as('ana@avenuez.com')
  expect((await post({ projectId: 'or_a' })).status).toBe(200)
  expect(m.generateSnapshot.mock.calls[0][3]).toMatchObject({ rankAmong: 5, sectionTitles: ['Strengths', 'Gaps'] })
  expect(m.insertArgs).toHaveBeenLastCalledWith(expect.objectContaining({ createdBy: 'ana@avenuez.com' }))
})
```
In each of `app/api/aeo-outbound/projects/route.test.ts`, `app/api/aeo-outbound/reports/[id]/view/route.test.ts`, `app/api/aeo-outbound/reports/[id]/slots/route.test.ts` and `app/actions/aeo-outbound.test.ts`, add next to the existing `vi.mock` calls:
```ts
vi.mock('@/lib/aeo-outbound/settings-store', () => ({ readSettingsRow: vi.fn(async () => null) }))
```
(In the actions test `vi.resetAllMocks()` makes it resolve `undefined`, which `resolveSettings` treats as no row.) Their assertions do not change: with no settings row, access is exactly the v1.0 allowlist.

Run: `perl -e 'alarm 590; exec @ARGV' -- npx vitest run lib/aeo-outbound/generate.test.ts app/api/aeo-outbound/generate/route.test.ts` (FAIL).

- [ ] **Step 4: Thread access and settings through every caller**

`lib/aeo-outbound/generate.ts`:
- add `import { SETTINGS_DEFAULTS, type GenerationSettings } from './settings'`
- change the signature to `export async function generateSnapshot(projectId: string, deps: {...unchanged}, range: DayRange | null = null, settings: GenerationSettings = SETTINGS_DEFAULTS): Promise<GenerationResult>`
- replace `const data = buildSnapshotData(pull, new Date(deps.now()).toISOString())` with:
```ts
    const data = buildSnapshotData(
      pull,
      new Date(deps.now()).toISOString(),
      { rankAmong: settings.rankAmong, competitorSiteGaps: DECISIONS.competitorSiteGaps, sourceMixWeight: DECISIONS.sourceMixWeight },
      { peecOpportunityRows: settings.peecOpportunityRows, methodologyStatesPromptsAndModels: settings.methodologyStatesPromptsAndModels, fixedNextStep: settings.fixedNextStep },
    )
```
- in `fixed`, replace `...(DECISIONS.fixedNextStep !== null ? { next_step: DECISIONS.fixedNextStep } : {}),` with `...(settings.fixedNextStep !== null ? { next_step: settings.fixedNextStep } : {}),`

`app/api/aeo-outbound/projects/route.ts`: line 5 becomes `import { outboundAccess } from '@/lib/aeo-outbound/access'`; line 15 becomes `if (!(await outboundAccess(session?.user)).ok) return NextResponse.json({ error: 'forbidden' }, { status: 403 })`.

`app/api/aeo-outbound/generate/route.ts`: line 8 becomes `import { originAllowed } from '@/lib/aeo-outbound/permissions'` plus `import { outboundAccess } from '@/lib/aeo-outbound/access'`; lines 34 and 35 become:
```ts
  const access = await outboundAccess(session?.user)
  if (!access.ok || !originAllowed(req.headers.get('origin'), req.headers.get('host'))) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const email = access.email
```
and the `generateSnapshot(` call gains a fourth argument after `range,`: `access.settings,`.

`app/api/aeo-outbound/reports/[id]/view/route.ts`: line 3 becomes `import { outboundAccess } from '@/lib/aeo-outbound/access'`; line 28 becomes `if (!(await outboundAccess(session?.user)).ok) return new Response('Forbidden', { status: 403 })`.

`app/api/aeo-outbound/reports/[id]/slots/route.ts`: line 3 becomes `import { originAllowed } from '@/lib/aeo-outbound/permissions'` plus `import { outboundAccess } from '@/lib/aeo-outbound/access'`; line 18 becomes `if (!(await outboundAccess(session?.user)).ok || !originAllowed(req.headers.get('origin'), req.headers.get('host'))) return NextResponse.json({ error: 'forbidden' }, { status: 403 })`.

`app/actions/aeo-outbound.ts`: line 9 becomes `import { originAllowed } from '@/lib/aeo-outbound/permissions'` plus `import { outboundAccess } from '@/lib/aeo-outbound/access'`; `caller()` (lines 24 to 30) becomes:
```ts
async function caller(): Promise<string | null> {
  const session = await auth()
  const access = await outboundAccess(session?.user)
  if (!access.ok) return null
  const h = await headers()
  return originAllowed(h.get('origin'), h.get('host')) ? access.email : null
}
```

`app/tools/new-business/page.tsx`: line 2 becomes `import { outboundAccess } from '@/lib/aeo-outbound/access'`; line 9 becomes two lines:
```tsx
  const access = await outboundAccess(session.user)
  if (!access.ok) return <NoAccess admins={access.admins} />
```
`app/tools/new-business/[reportId]/page.tsx`: the same two changes at lines 3 and 17.

Confirm nothing still imports `outboundEmail`: `grep -rn outboundEmail app lib components` prints nothing. Run the gate's tests for the touched files, then the full gate.

- [ ] **Step 5: Gate, commit, push**

Commit every file this task touched, by name, with subject `Add self-service settings and one access check for every page, route and action` and body:
```
Edge cases (settings are shared state; emails and settings values are untrusted input):
- external failure: a settings read failure falls back to the env list and the config.ts defaults with one log line: fix
- operator visibility: that line, and a contract line per field for a drifted settings row: fix
- bounds: at most 50 users and 50 admins, 200 characters each: fix
- input boundaries: emails trimmed, lowercased, @avenuez.com only; titles 1 to 60; next step 1 to 300; rank 2 to 50; rows 0 to 3; wordmark AIVx or Avenue Z: fix
- state and concurrency: settings are read once per request and passed down; a generation stores the settings it used, so a later change never alters a row: fix
- security: AEO_OUTBOUND_USERS stays the floor, so nobody is locked out; staff and @avenuez.com are checked for every email; a non-staff caller never triggers a read: fix

Co-Authored-By: Claude <model> <noreply@anthropic.com>
```
Push.

---
### Task 6: Slots model v1.1, labels, grounding on every slot, stored contracts, the slots route

Covers v1.1 §3 (the new keys and the closed path grammar, defaults resolved at creation and for old rows from their own data and the v1.0 words, the limits, add and remove bullets, grounding on every slot with `avenuez.com` allowed and the KPI rule, `brand` writing `brand_name`, the brand_changed note), §4 (the label map; structured flags; the PATCH response with `slots` for a structural path), §10 (stored `data`, `slots` and notes contracts; the unreadable row; a version 1 row's flags unchanged), round-2 MINORs 2, 4, 7, 13 and 16.

**Files:**
- Modify: `lib/aeo-outbound/config.ts` (append `PAGE_WORDS_V1`)
- Modify: `lib/aeo-outbound/slots.ts:1-105` (full replacement), `lib/aeo-outbound/slots.test.ts`
- Create: `lib/aeo-outbound/labels.ts`, `lib/aeo-outbound/labels.test.ts`
- Modify: `lib/aeo-outbound/grounding.ts:1-41` (full replacement), `lib/aeo-outbound/grounding.test.ts`
- Modify: `lib/aeo-outbound/contracts.ts` (append), `lib/aeo-outbound/store.ts:14-16,89-94`, `lib/aeo-outbound/store.test.ts` (append)
- Modify: `lib/aeo-outbound/generate.ts`, `lib/aeo-outbound/generate.test.ts:84` and append
- Modify: `app/api/aeo-outbound/reports/[id]/slots/route.ts:1-52`, `app/api/aeo-outbound/reports/[id]/slots/route.test.ts`
- Modify: `app/actions/aeo-outbound.ts:12,55-60`, `app/actions/aeo-outbound.test.ts` (append)
- Modify: `app/tools/new-business/[reportId]/page.tsx:6,38`
- Modify: `lib/aeo-outbound/v1-compat.test.ts` (the flags test)

**Interfaces:**
- Consumes: `Note`, `StoredNote`, `NOTE_KINDS` (Task 3); `settingsUsedOf` (Task 3); `GenerationSettings` (Task 5); `checkContract` (Task 1); `saveSlotsQuery(id, rev, slots, notes, brandName?)` (Task 2).
- Produces:
  - `config.ts`: `PAGE_WORDS_V1` (the v1.0 words of every page key)
  - `slots.ts`: `PAGE_KEYS`, `type PageKey`, `type PageWords = Record<PageKey, string>`, `interface Slots` (stored: copy keys required, `brand?`, `window_label?`, `kpis?: Kpi[]`, `page?: Partial<PageWords>`), `type FullSlots` (every key present), `MAX_LABEL = 120`, `limitFor(path): number`, `pageDefaults(s: { sectionTitles: readonly string[]; sidebarWordmark: string }): PageWords`, `withDefaults(s: Slots, d: { brand: string; windowLabel: string; kpis: Kpi[] }): FullSlots`, `isStructuralPath(path): boolean`, `STRUCTURE_ERRORS`, `applySlotPatch(slots: FullSlots, path, raw): { ok: true; slots: FullSlots } | { ok: false; error: string }`, `applyStructure(slots: FullSlots, path, raw)` (same result type), `slotEntries(s: FullSlots): [string, string][]`, `needsValidationPaths(s: FullSlots): string[]`; `validateGeneratedSlots` unchanged (returns the copy keys as `Slots`)
  - `labels.ts`: `fieldLabel(path: string, titles: readonly [string, string]): string`
  - `grounding.ts`: `kpiDiffers(shown: string, peec: string): boolean`, `groundingFlags(slots: Slots, d: SnapshotData, dataText: string): Note[]`
  - `contracts.ts`: `STORED_DATA`, `STORED_SLOTS`, `STORED_NOTES`
  - `store.ts`: `ReportRow.unreadable?: boolean` (true when a stored column breaks its contract)
  - `generate.ts`: success `slots: FullSlots`
  - slots route: `200 { revision, notes: StoredNote[], needsValidation: string[], slots?: FullSlots }` (`slots` only for a structural path); `400 { error }` for a bad structure with `STRUCTURE_ERRORS` texts; `409 { error: 'not-draft', revision }` also for an unreadable row

- [ ] **Step 1: Write the failing slots and labels tests**

In `lib/aeo-outbound/slots.test.ts`:
- Line 2 becomes `import { applySlotPatch, applyStructure, cleanValue, isStructuralPath, limitFor, needsValidationPaths, PAGE_KEYS, pageDefaults, slotEntries, STRUCTURE_ERRORS, validateGeneratedSlots, withDefaults, type Slots } from './slots'` plus `import { PAGE_WORDS_V1 } from './config'`.
- Rename the fixture on line 4 from `S` to `S0` and add after line 10:
```ts
const DATA_STUB = { brand: 'Example Co', windowLabel: 'Oct 1, 2026 to Oct 8, 2026', kpis: [{ label: 'AI visibility', value: '15.1%' }, { label: 'Competitive rank', value: '#2 of 2 brands' }] }
const S = withDefaults(S0, DATA_STUB)
```
- In `'every closed path form saves; nothing else does'` (lines 18 to 23) replace the bad-path list with `['', 'headline.0', 'competitive_bullets.2.lead', 'opportunities.3.signal', 'opportunities.0.title', '__proto__', 'constructor', 'page.nope', 'page.__proto__', 'page.constructor', 'kpis.2.label', 'kpis.0.other', 'competitive_bullets.add', 'brand.x']` (`brand` is now a valid path).
- Line 32's `S.opportunities[1].workstream` stays (S is a fresh full copy; the immutability check still applies).
- Append:
```ts
test('a row from before v1.1 reads brand, window label and KPIs from its own data and every page word from v1.0', () => {
  expect([S.brand, S.window_label]).toEqual(['Example Co', 'Oct 1, 2026 to Oct 8, 2026'])
  expect(S.kpis).toEqual(DATA_STUB.kpis)
  expect(S.kpis).not.toBe(DATA_STUB.kpis)
  expect(S.page).toEqual(PAGE_WORDS_V1)
  const stored = withDefaults({ ...S0, brand: 'New Co', page: { series: 'Snapshot' } }, DATA_STUB)
  expect(stored.brand).toBe('New Co')
  expect(stored.page).toMatchObject({ series: 'Snapshot', headline_label: 'Headline signal' })
  expect(S0).not.toHaveProperty('brand')
})

test('every page key has a v1.0 default, and no default carries a number', () => {
  expect(Object.keys(PAGE_WORDS_V1).sort()).toEqual([...PAGE_KEYS].sort())
  for (const v of Object.values(PAGE_WORDS_V1)) expect(v).not.toMatch(/\d/)
})

test('a new row takes the section titles and wordmark from settings and every other word from v1.0', () => {
  expect(pageDefaults({ sectionTitles: ['Strengths', 'Gaps'], sidebarWordmark: 'Avenue Z' })).toEqual({ ...PAGE_WORDS_V1, section_1_title: 'Strengths', section_2_title: 'Gaps', sidebar_wordmark: 'Avenue Z' })
})

test('every new path saves within its limit: 120 for page words, KPIs, brand and window label, 1,000 for the footer description and disclaimer', () => {
  for (const p of ['brand', 'window_label', 'kpis.0.label', 'kpis.1.value', 'page.series', 'page.opps_col_3']) {
    expect(limitFor(p)).toBe(120)
    expect(applySlotPatch(S, p, 'x'.repeat(120)).ok).toBe(true)
    expect(applySlotPatch(S, p, 'x'.repeat(121))).toEqual({ ok: false, error: 'Keep this under 120 characters.' })
  }
  for (const p of ['page.footer_desc', 'page.footer_disclaimer']) {
    expect(applySlotPatch(S, p, 'x'.repeat(1000)).ok).toBe(true)
    expect(applySlotPatch(S, p, 'x'.repeat(1001)).ok).toBe(false)
  }
  const r = applySlotPatch(S, 'kpis.1.value', '#1 of 2 brands')
  expect(r.ok && r.slots.kpis[1]).toEqual({ label: 'Competitive rank', value: '#1 of 2 brands' })
  expect(applySlotPatch(S, 'page.series', '   ')).toEqual({ ok: false, error: "This field can't be empty." })
})

test('add and remove keep every list at two or three bullets; a new bullet says Needs validation', () => {
  expect(isStructuralPath('competitive_bullets.add')).toBe(true)
  expect(isStructuralPath('sources_bullets.2.remove')).toBe(true)
  for (const p of ['competitive_bullets.3.remove', 'opportunities.add', 'headline', 'competitive_bullets.remove']) expect(isStructuralPath(p)).toBe(false)
  const added = applyStructure(S, 'competitive_bullets.add', 'structure')
  expect(added.ok && added.slots.competitive_bullets).toEqual([...S.competitive_bullets, { lead: 'Needs validation', text: 'Needs validation' }])
  expect(added.ok && needsValidationPaths(added.slots)).toEqual(['competitive_bullets.2.lead', 'competitive_bullets.2.text'])
  if (!added.ok) throw new Error('add failed')
  expect(applyStructure(added.slots, 'competitive_bullets.add', 'structure')).toEqual({ ok: false, error: STRUCTURE_ERRORS.full })
  const removed = applyStructure(added.slots, 'competitive_bullets.0.remove', 'structure')
  expect(removed.ok && removed.slots.competitive_bullets).toEqual([S.competitive_bullets[1], { lead: 'Needs validation', text: 'Needs validation' }])
  expect(applyStructure(S, 'competitive_bullets.0.remove', 'structure')).toEqual({ ok: false, error: STRUCTURE_ERRORS.min })
  expect(applyStructure(S, 'competitive_bullets.add', '')).toEqual({ ok: false, error: "This field can't be empty." })
  expect(STRUCTURE_ERRORS).toEqual({ full: 'A list can have at most three bullets.', min: 'A list needs at least two bullets.' })
})

test('slotEntries lists the page words, the KPIs, the brand and the window label after the copy, and Needs validation anywhere blocks', () => {
  const paths = slotEntries(S).map(([p]) => p)
  expect(paths.slice(-PAGE_KEYS.length)).toEqual(PAGE_KEYS.map((k) => `page.${k}`))
  expect(paths).toEqual(expect.arrayContaining(['brand', 'window_label', 'kpis.0.label', 'kpis.1.value']))
  const r = applySlotPatch(S, 'page.opps_title', 'needs validation')
  expect(r.ok && needsValidationPaths(r.slots)).toEqual(['page.opps_title'])
})
```

Create `lib/aeo-outbound/labels.test.ts`:
```ts
import { expect, test } from 'vitest'
import { fieldLabel } from './labels'
import { slotEntries, withDefaults, type Slots } from './slots'

const T: [string, string] = ['Strengths', 'Gaps']
const S0: Slots = {
  category: 'c', market: 'm', headline: 'h', summary: 's', context: 'c',
  competitive_bullets: [{ lead: 'a', text: 'b' }, { lead: 'a', text: 'b' }, { lead: 'a', text: 'b' }], sources_bullets: [{ lead: 'a', text: 'b' }, { lead: 'a', text: 'b' }],
  why: 'w', opportunities: [0, 1, 2].map(() => ({ signal: 's', opportunity: 'o', workstream: 'w' })), methodology: 'm', next_step: 'n',
}
const FULL = withDefaults(S0, { brand: 'B', windowLabel: 'W', kpis: [{ label: 'l', value: 'v' }, { label: 'l', value: 'v' }] })

test('the label map names each field in plain words, a bullet by its current section title', () => {
  expect(fieldLabel('competitive_bullets.0.lead', T)).toBe('Strengths, bullet 1, bold lead-in')
  expect(fieldLabel('sources_bullets.1.text', T)).toBe('Gaps, bullet 2, text')
  expect(fieldLabel('competitive_bullets.2.remove', T)).toBe('Strengths, bullet 3, remove')
  expect(fieldLabel('sources_bullets.add', T)).toBe('Gaps, add a bullet')
  expect(fieldLabel('opportunities.2.workstream', T)).toBe('Opportunity 3, workstream')
  expect(fieldLabel('kpis.0.value', T)).toBe('Metric card 1, value')
  expect(fieldLabel('page.opps_col_2', T)).toBe('Opportunities table, second column')
  expect(fieldLabel('why', T)).toBe('Why it matters')
  expect(fieldLabel('brand', T)).toBe('Brand name')
})

test('every editable path has a label that is not the path itself', () => {
  for (const [p] of slotEntries(FULL)) expect(fieldLabel(p, T), p).not.toBe(p)
})

test('an unknown path, a prototype key included, is returned as given', () => {
  for (const p of ['nope', '__proto__', 'constructor', 'page.__proto__', 'page.toString']) expect(fieldLabel(p, T)).toBe(p)
})
```
Run: `perl -e 'alarm 590; exec @ARGV' -- npx vitest run lib/aeo-outbound/slots.test.ts lib/aeo-outbound/labels.test.ts` (FAIL).

- [ ] **Step 2: Implement the page words, slots and labels**

Append to `lib/aeo-outbound/config.ts`:
```ts
/** Every fixed word on the v1.0 page (render.ts at 06e68c0d), keyed by its page slot (spec v1.1 §3). The default of each
 *  page.* slot on a row from before v1.1. A new row takes section titles and the wordmark from settings instead. None
 *  contains a number, so grounding on a row's page words is unchanged until Ryan types one. */
export const PAGE_WORDS_V1 = {
  series: 'AI Visibility Snapshot',
  headline_label: 'Headline signal',
  section_1_title: DECISIONS.sectionTitles[0],
  section_2_title: DECISIONS.sectionTitles[1],
  opps_label: 'Opportunities',
  method_nav: 'Methodology',
  category_label: 'Category:',
  market_label: 'Market:',
  window_prefix: 'Data window:',
  chart_1_title: 'Domain Types',
  chart_2_title: 'Competitive Visibility',
  why_title: 'Why it matters',
  opps_title: 'Three opportunities to explore',
  opps_col_1: 'Signal',
  opps_col_2: 'Opportunity to explore',
  opps_col_3: 'Likely workstream',
  opps_takeaway: 'These are opportunity hypotheses for discussion, not a full roadmap.',
  method_label: 'Methodology:',
  next_label: 'Next step:',
  prepared_label: 'Prepared',
  footer_name: 'Avenue Z',
  footer_desc: 'Avenue Z is a digital marketing and PR agency specializing in AI visibility and Answer Engine Optimization (AEO). We help brands earn citation authority with AI models through earned media, content strategy, and technical optimization.',
  footer_link: 'avenuez.com ↗',
  footer_disclaimer: 'Data reflects a Peec AI visibility snapshot for the stated window and is directional. Avenue Z makes no representations about future AI visibility outcomes.',
  sidebar_wordmark: DECISIONS.showAivxName ? 'AIVx' : 'Avenue Z',
  sidebar_powered: 'Powered by Avenue Z',
  sidebar_link: 'avenuez.com ↗',
}
```

Replace `lib/aeo-outbound/slots.ts` with:
```ts
// The editable copy (spec §6, §9a; v1.1 §3). competitive_bullets holds the first data section (strengths) and
// sources_bullets the second (gaps), as spec §5 rows 5-6 say. v1.1 makes every visible word a slot: brand,
// window_label, kpis and the page words. A row from before v1.1 lacks those keys; withDefaults fills them from the row's
// own data and the v1.0 words, never from live settings, so a settings change never alters an existing row.
import { NEEDS_VALIDATION, PAGE_WORDS_V1 } from './config'
import type { Kpi } from './metrics'

export interface Bullet { lead: string; text: string }
export interface Opportunity { signal: string; opportunity: string; workstream: string }
export const PAGE_KEYS = [
  'series', 'headline_label', 'section_1_title', 'section_2_title', 'opps_label', 'method_nav', 'category_label', 'market_label',
  'window_prefix', 'chart_1_title', 'chart_2_title', 'why_title', 'opps_title', 'opps_col_1', 'opps_col_2', 'opps_col_3',
  'opps_takeaway', 'method_label', 'next_label', 'prepared_label', 'footer_name', 'footer_desc', 'footer_link',
  'footer_disclaimer', 'sidebar_wordmark', 'sidebar_powered', 'sidebar_link',
] as const
export type PageKey = (typeof PAGE_KEYS)[number]
export type PageWords = Record<PageKey, string>
const V1_WORDS: PageWords = PAGE_WORDS_V1

/** As stored. Every row has the copy keys; rows from before v1.1 lack brand, window_label, kpis and page. */
export interface Slots {
  category: string
  market: string
  headline: string
  summary: string
  context: string
  competitive_bullets: Bullet[]
  sources_bullets: Bullet[]
  why: string
  opportunities: Opportunity[]
  methodology: string
  next_step: string
  brand?: string
  window_label?: string
  kpis?: Kpi[]
  page?: Partial<PageWords>
}
/** Every key present: what saves, grounding and render work on. */
export type FullSlots = Omit<Slots, 'brand' | 'window_label' | 'kpis' | 'page'> & { brand: string; window_label: string; kpis: Kpi[]; page: PageWords }

export const MAX_VALUE = 1000
export const MAX_LEAD = 80
export const MAX_LABEL = 120
const SCALARS = ['category', 'market', 'headline', 'summary', 'context', 'why', 'methodology', 'next_step'] as const
// The closed path grammar (spec §9a, v1.1 §3). Page keys are spelled out, so no prototype key can ever match.
const PATH = new RegExp(`^(?:(category|market|headline|summary|context|why|methodology|next_step|brand|window_label)|(competitive_bullets|sources_bullets)\\.(\\d)\\.(lead|text)|opportunities\\.(\\d)\\.(signal|opportunity|workstream)|kpis\\.(\\d)\\.(label|value)|page\\.(${PAGE_KEYS.join('|')}))$`)
const STRUCTURE = /^(competitive_bullets|sources_bullets)\.(?:add|([0-2])\.remove)$/
export const isStructuralPath = (path: string): boolean => STRUCTURE.test(path)
export const STRUCTURE_ERRORS = { full: 'A list can have at most three bullets.', min: 'A list needs at least two bullets.' } as const

export function cleanValue(v: string): string {
  return v.replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim()
}

function checkValue(raw: unknown, limit: number): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof raw !== 'string') return { ok: false, error: 'value must be text' }
  const value = cleanValue(raw)
  if (!value) return { ok: false, error: "This field can't be empty." }
  if (value.length > limit) return { ok: false, error: `Keep this under ${limit} characters.` }
  return { ok: true, value }
}

/** Characters allowed for a path (v1.1 §3): footer description and disclaimer 1,000; other page words, KPIs, brand and
 *  window label 120; a bullet lead 80; the rest of the copy 1,000. */
export function limitFor(path: string): number {
  if (path === 'page.footer_desc' || path === 'page.footer_disclaimer') return MAX_VALUE
  if (path.startsWith('page.') || path.startsWith('kpis.') || path === 'brand' || path === 'window_label') return MAX_LABEL
  return path.endsWith('.lead') ? MAX_LEAD : MAX_VALUE
}

/** The page words a new row is created with: v1.0's, with the section titles and wordmark from settings (v1.1 §3). */
export function pageDefaults(s: { sectionTitles: readonly string[]; sidebarWordmark: string }): PageWords {
  return { ...V1_WORDS, section_1_title: s.sectionTitles[0], section_2_title: s.sectionTitles[1], sidebar_wordmark: s.sidebarWordmark }
}

/** Every key filled. Missing keys read the row's own data (brand, window label, KPIs) and the v1.0 words. Never mutates. */
export function withDefaults(s: Slots, d: { brand: string; windowLabel: string; kpis: Kpi[] }): FullSlots {
  const { brand, window_label, kpis, page, ...copy } = structuredClone(s)
  return { ...copy, brand: brand ?? d.brand, window_label: window_label ?? d.windowLabel, kpis: kpis ?? structuredClone(d.kpis), page: { ...V1_WORDS, ...(page ?? {}) } }
}

export function applySlotPatch(slots: FullSlots, path: string, raw: unknown): { ok: true; slots: FullSlots } | { ok: false; error: string } {
  const m = PATH.exec(path)
  if (!m) return { ok: false, error: 'unknown field' }
  const checked = checkValue(raw, limitFor(path))
  if (!checked.ok) return checked
  const next: FullSlots = structuredClone(slots)
  if (m[1]) {
    (next as unknown as Record<string, string>)[m[1]] = checked.value
  } else if (m[2]) {
    const item = next[m[2] as 'competitive_bullets' | 'sources_bullets'][Number(m[3])]
    if (!item) return { ok: false, error: 'unknown field' }
    item[m[4] as keyof Bullet] = checked.value
  } else if (m[5]) {
    const item = next.opportunities[Number(m[5])]
    if (!item) return { ok: false, error: 'unknown field' }
    item[m[6] as keyof Opportunity] = checked.value
  } else if (m[7]) {
    const item = next.kpis[Number(m[7])]
    if (!item) return { ok: false, error: 'unknown field' }
    item[m[8] as keyof Kpi] = checked.value
  } else {
    next.page[m[9] as PageKey] = checked.value
  }
  return { ok: true, slots: next }
}

/** Add a bullet to a list of 2, or remove one from a list of 3 (v1.1 §3). value is the literal "structure": ignored, but
 *  it must be non-empty text, so the §9a rule holds for every PATCH. */
export function applyStructure(slots: FullSlots, path: string, raw: unknown): { ok: true; slots: FullSlots } | { ok: false; error: string } {
  const m = STRUCTURE.exec(path)
  if (!m) return { ok: false, error: 'unknown field' }
  const checked = checkValue(raw, MAX_VALUE)
  if (!checked.ok) return checked
  const next: FullSlots = structuredClone(slots)
  const list = next[m[1] as 'competitive_bullets' | 'sources_bullets']
  if (m[2] === undefined) {
    if (list.length !== 2) return { ok: false, error: STRUCTURE_ERRORS.full }
    list.push({ lead: NEEDS_VALIDATION, text: NEEDS_VALIDATION })
  } else {
    if (list.length !== 3) return { ok: false, error: STRUCTURE_ERRORS.min }
    list.splice(Number(m[2]), 1)
  }
  return { ok: true, slots: next }
}

/** Every [path, value] in page order: the copy as v1.0 listed it, then brand, window label, KPIs and page words. */
export function slotEntries(s: FullSlots): [string, string][] {
  const out: [string, string][] = SCALARS.map((k) => [k, s[k]])
  for (const list of ['competitive_bullets', 'sources_bullets'] as const) s[list].forEach((b, i) => { out.push([`${list}.${i}.lead`, b.lead], [`${list}.${i}.text`, b.text]) })
  s.opportunities.forEach((o, i) => { out.push([`opportunities.${i}.signal`, o.signal], [`opportunities.${i}.opportunity`, o.opportunity], [`opportunities.${i}.workstream`, o.workstream]) })
  out.push(['brand', s.brand], ['window_label', s.window_label])
  s.kpis.forEach((k, i) => { out.push([`kpis.${i}.label`, k.label], [`kpis.${i}.value`, k.value]) })
  for (const k of PAGE_KEYS) out.push([`page.${k}`, s.page[k]])
  return out
}

/** Case-insensitive: a reviewer typing "needs validation" still blocks Approve (spec §9). */
export const needsValidationPaths = (s: FullSlots): string[] => slotEntries(s).filter(([, v]) => v.toLowerCase().includes(NEEDS_VALIDATION.toLowerCase())).map(([p]) => p)
```
Then append to the same file the existing `validateGeneratedSlots` function exactly as it is at `06e68c0d` lines 69 to 105 (unchanged; it returns the copy keys as `Slots`).

Create `lib/aeo-outbound/labels.ts`:
```ts
// One plain-words name per editable path (spec v1.1 §4), shared by the Before you send panel, grounding flags and save
// errors. A bullet is named by its section's current title. Lookups use own properties only, so no prototype key
// ever becomes a label.
import type { PageKey } from './slots'

const SCALAR_LABELS: Record<string, string> = {
  category: 'Category', market: 'Market', headline: 'Headline', summary: 'Summary sentence', context: 'Competitive context',
  why: 'Why it matters', methodology: 'Methodology', next_step: 'Next step', brand: 'Brand name', window_label: 'Data window',
}
const PAGE_LABELS: Record<PageKey, string> = {
  series: 'Report title', headline_label: 'Headline label', section_1_title: 'First section title', section_2_title: 'Second section title',
  opps_label: 'Opportunities label', method_nav: 'Methodology menu item', category_label: 'Category label', market_label: 'Market label',
  window_prefix: 'Data window label', chart_1_title: 'First chart title', chart_2_title: 'Second chart title', why_title: 'Why it matters title',
  opps_title: 'Opportunities title', opps_col_1: 'Opportunities table, first column', opps_col_2: 'Opportunities table, second column',
  opps_col_3: 'Opportunities table, third column', opps_takeaway: 'Opportunities footnote', method_label: 'Methodology label',
  next_label: 'Next step label', prepared_label: 'Prepared label', footer_name: 'Footer name', footer_desc: 'Footer description',
  footer_link: 'Footer link text', footer_disclaimer: 'Footer disclaimer', sidebar_wordmark: 'Menu wordmark', sidebar_powered: 'Menu tagline',
  sidebar_link: 'Menu link text',
}
const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k)

export function fieldLabel(path: string, titles: readonly [string, string]): string {
  if (has(SCALAR_LABELS, path)) return SCALAR_LABELS[path]
  let m = /^page\.([a-z0-9_]+)$/.exec(path)
  if (m && has(PAGE_LABELS, m[1])) return PAGE_LABELS[m[1] as PageKey]
  const section = (list: string) => (list === 'competitive_bullets' ? titles[0] : titles[1])
  m = /^(competitive_bullets|sources_bullets)\.(\d)\.(lead|text|remove)$/.exec(path)
  if (m) {
    const where = `${section(m[1])}, bullet ${Number(m[2]) + 1}`
    return m[3] === 'lead' ? `${where}, bold lead-in` : m[3] === 'text' ? `${where}, text` : `${where}, remove`
  }
  m = /^(competitive_bullets|sources_bullets)\.add$/.exec(path)
  if (m) return `${section(m[1])}, add a bullet`
  m = /^opportunities\.(\d)\.(signal|opportunity|workstream)$/.exec(path)
  if (m) return `Opportunity ${Number(m[1]) + 1}, ${m[2]}`
  m = /^kpis\.(\d)\.(label|value)$/.exec(path)
  if (m) return `Metric card ${Number(m[1]) + 1}, ${m[2]}`
  return path
}
```
Run the slots and labels tests: PASS.

- [ ] **Step 3: Write the failing grounding tests**

In `lib/aeo-outbound/grounding.test.ts`:
- Add `import type { Note } from './notes'` and after the imports: `const legacy = (ns: Note[]) => [...new Set(ns.map((n) => `${(n.path ?? '').split('.')[0]}: ${n.text}`))]` (v1.0's `"<top-level key>: <text>"` form).
- Line 7 (`D`): add `brand: 'Example Co', windowLabel: 'Oct 1, 2026 to Oct 8, 2026', kpis: [],` inside the object.
- In every existing assertion (lines 12 to 105) wrap each `groundingFlags(...)` call in `legacy(...)`, for example line 16 becomes `expect(legacy(groundingFlags(s, D, allowed))).toEqual(['why: "12.5%" is not in the Peec data'])` and line 48 becomes `const say = (why: string) => legacy(groundingFlags({ ...plain, why }, R, RT))`. The expected strings do not change.
- Append:
```ts
const KPIS = [{ label: 'AI visibility', value: '15.5%' }, { label: 'AI share of voice', value: '15.9%' }, { label: 'Average answer position', value: '#3.1' }, { label: 'Competitive rank', value: '#3 of 12 brands' }]
const RK = { ...R, kpis: KPIS } as unknown as SnapshotData
const RKT = dataBlock(RK)
const withKpi = (i: number, value: string, label?: string) => groundingFlags({ ...plain, kpis: KPIS.map((k, j) => (j === i ? { label: label ?? k.label, value } : k)) }, RK, RKT)

test("the KPI comparison: a value is compared with Peec's after removing %, # and commas, at Peec's displayed precision", () => {
  expect(withKpi(0, '16%')).toEqual([{ kind: 'kpi_changed', path: 'kpis.0.value', text: 'AI visibility shows 16% but Peec says 15.5%' }])
  expect(withKpi(0, '15.5')).toEqual([])
  expect(withKpi(0, '15.50%')).toEqual([])
  expect(withKpi(2, '3.1')).toEqual([])
  expect(withKpi(0, '15.5%', 'Visibility in AI answers')).toEqual([])
})

test('the KPI comparison: the rank card is compared by its number tokens, in order', () => {
  expect(withKpi(3, '#2 of 12 brands')).toEqual([{ kind: 'kpi_changed', path: 'kpis.3.value', text: 'Competitive rank shows #2 of 12 brands but Peec says #3 of 12 brands' }])
  expect(withKpi(3, '#3 of 12')).toEqual([])
  expect(withKpi(3, 'Third of 12')).toHaveLength(1)
})

test('a KPI value with words or another unit is reported, never thrown on', () => {
  for (const v of ['about 15%', '15.5 pts', '%', 'n/a']) expect(() => withKpi(0, v)).not.toThrow()
  expect(withKpi(0, 'about 15%')).toHaveLength(1)
  expect(withKpi(0, '15.5 pts')).toHaveLength(1)
})

test("the window label is compared as text with Peec's", () => {
  expect(groundingFlags({ ...plain, window_label: 'Oct 2, 2026 to Oct 8, 2026' }, R, RT)).toEqual([
    { kind: 'kpi_changed', path: 'window_label', text: 'Data window shows Oct 2, 2026 to Oct 8, 2026 but Peec says Oct 1, 2026 to Oct 8, 2026' },
  ])
})

test('the brand_changed note counts the slots that still say the Peec name, and the edited brand is exempt', () => {
  const s = { ...plain, brand: 'Example 9 Co', headline: 'Example Co leads', why: 'Example 9 Co grows' }
  expect(groundingFlags(s, R, RT)).toEqual([{ kind: 'brand_changed', path: 'brand', text: 'The copy still says Example Co in 1 place' }])
  expect(groundingFlags({ ...s, summary: 'Example Co again' }, R, RT).at(-1)).toEqual({ kind: 'brand_changed', path: 'brand', text: 'The copy still says Example Co in 2 places' })
  expect(groundingFlags({ ...plain, brand: 'Example 9 Co' }, R, RT)).toEqual([])
})

test('avenuez.com is always an allowed domain, on every slot', () => {
  expect(groundingFlags({ ...plain, why: 'See avenuez.com for more', page: { footer_link: 'avenuez.com/aeo ↗' } }, R, RT)).toEqual([])
})

test('every slot is checked: a KPI label or page word with a number not in the data is flagged with its full path', () => {
  expect(groundingFlags({ ...plain, page: { opps_title: 'Seven 77 ideas' }, kpis: [{ label: 'Top 9 rank', value: '15.1%' }, { label: 'Average answer position', value: '#3.1' }] }, R, RT)).toEqual([
    { kind: 'number_not_in_data', path: 'kpis.0.label', text: '"9" is not in the Peec data' },
    { kind: 'number_not_in_data', path: 'page.opps_title', text: '"77" is not in the Peec data' },
  ])
})

test('next_step is set by code only when the row was generated with a fixed sentence: read from the row, never live settings', () => {
  const dash = String.fromCharCode(0x2014)
  const s = { ...plain, next_step: `Book a call ${dash} soon` }
  expect(groundingFlags(s, R, RT)).toEqual([{ kind: 'long_dash', path: 'next_step', text: 'contains a long dash; use a period or comma' }])
  const fixed = { ...R, schemaVersion: 2, settingsUsed: { rankAmong: null, peecOpportunityRows: 1, methodologyStatesPromptsAndModels: true, fixedNextStep: `Book a call ${dash} soon` } } as unknown as SnapshotData
  expect(groundingFlags(s, fixed, dataBlock(fixed))).toEqual([])
})
```
In `lib/aeo-outbound/v1-compat.test.ts` replace the flags test with:
```ts
test('a version 1 row keeps its version 1 grounding flags: the new keys read defaults that carry no numbers', () => {
  const legacy = (ns: { path?: string; text: string }[]) => [...new Set(ns.map((n) => `${(n.path ?? '').split('.')[0]}: ${n.text}`))]
  expect(legacy(groundingFlags(V1_SLOTS, V1_DATA, V1_DATA_BLOCK))).toEqual(V1_FLAGS)
})
```
Run: `perl -e 'alarm 590; exec @ARGV' -- npx vitest run lib/aeo-outbound/grounding.test.ts lib/aeo-outbound/v1-compat.test.ts` (FAIL).

- [ ] **Step 4: Implement grounding on every slot**

Replace `lib/aeo-outbound/grounding.ts` with:
```ts
// Post-generation checks (spec §6, v1.1 §3): numbers must appear in the Data block, domains must be Peec's, on every
// slot. A KPI value is compared with Peec's value and the window label with Peec's label instead. Modeled on
// lib/peec/content-impact-synopsis.ts:58-100. Runs on every save, so notes stay current. Flags are structured notes.
import { settingsUsedOf, type SnapshotData } from './metrics'
import type { Note, NoteKind } from './notes'
import { slotEntries, withDefaults, type Slots } from './slots'

const NUM = /#?\d[\d,]*(?:\.\d+)?%?/g
const DOMAIN = /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}\b/gi
/** The kind of a number token and its digits: "12%" is a percentage, "#3" a rank, "1,989" a bare count. */
const kindOf = (t: string): 'pct' | 'hash' | 'bare' => (t.endsWith('%') ? 'pct' : t.startsWith('#') ? 'hash' : 'bare')
const digitsOf = (t: string) => t.replace(/[#%,]/g, '')
const DASHES = new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`)
/** Avenue Z's own site, linked from the page itself (v1.1 §3). */
const ALWAYS_ALLOWED_DOMAINS = ['avenuez.com']
const RANK_CARD = /^#\d+ of \d+ brands$/

/**
 * True when a KPI value Ryan typed differs from Peec's (v1.1 §3). The rank card compares its number tokens in order;
 * every other card compares one number after removing %, # and commas, at Peec's displayed precision. Anything that is
 * not such a number differs.
 */
export function kpiDiffers(shown: string, peec: string): boolean {
  if (RANK_CARD.test(peec)) {
    const want = peec.match(/\d+/g) ?? []
    const got = shown.match(/\d+(?:\.\d+)?/g) ?? []
    return got.length !== want.length || got.some((g, i) => Number(g) !== Number(want[i]))
  }
  const p = peec.replace(/[%#,]/g, '').trim()
  const s = shown.replace(/[%#,]/g, '').trim()
  const places = (p.split('.')[1] ?? '').length
  const sn = Number(s)
  if (s === '' || !Number.isFinite(sn)) return true
  return sn.toFixed(places) !== Number(p).toFixed(places)
}

export function groundingFlags(slots: Slots, d: SnapshotData, dataText: string): Note[] {
  const full = withDefaults(slots, d)
  // Set by code, not by Glean: a dash there comes from Peec or a fixed sentence. Read from the row's own data (the
  // settings it was generated with), never from live settings, so a settings change never alters a draft's notes.
  const codeSet = new Set(['category', 'market', ...(settingsUsedOf(d).fixedNextStep !== null ? ['next_step'] : [])])
  const allowedDomains = new Set([...d.ownDomains, ...d.gapDomains.map((g) => g.domain), ...(dataText.match(DOMAIN) ?? []), ...ALWAYS_ALLOWED_DOMAINS].map((x) => x.toLowerCase()))
  // With no competitors tracked the Data block names no outside brand, so its digits are not exempt either.
  const brandNames = (d.competitorsTracked === 0 ? d.brands.filter((b) => b.isOwn) : d.brands).map((b) => b.name)
  // An edited brand name is exempt too (v1.1 §14). It is added only when it differs, so a version 1 row is unchanged.
  const renamed = full.brand !== d.brand ? [full.brand] : []
  const exemptNames = [...brandNames, ...renamed, ...allowedDomains].filter(Boolean).sort((a, b) => b.length - a.length)
  // Digits inside a name or a domain are not figures. The window's days and years are in the Data block, so they stay allowed as bare numbers.
  let figures = dataText
  for (const name of exemptNames) figures = figures.split(name).join(' ')
  const allowed = new Set((figures.match(NUM) ?? []).map((t) => `${kindOf(t)}:${digitsOf(t)}`))
  for (const y of [d.window.start, d.window.end]) allowed.add(`bare:${y.slice(0, 4)}`)
  const grounded = (t: string) => {
    const k = kindOf(t), v = digitsOf(t)
    return allowed.has(`${k}:${v}`) || (k === 'bare' && allowed.has(`hash:${v}`))
  }
  const out: Note[] = []
  const seen = new Set<string>()
  const add = (kind: NoteKind, path: string, text: string) => {
    const key = `${kind}|${path}|${text}`
    if (!seen.has(key)) { seen.add(key); out.push({ kind, path, text }) }
  }
  const entries = slotEntries(full)
  for (const [path, value] of entries) {
    // The page hides the context box when no competitor is tracked (render.ts), so its text is never shown.
    if (path === 'context' && d.competitorsTracked === 0) continue
    if (path === 'brand') continue
    const kpi = /^kpis\.(\d)\.value$/.exec(path)
    if (kpi) {
      const peec = d.kpis[Number(kpi[1])]
      if (peec && kpiDiffers(value, peec.value)) add('kpi_changed', path, `${peec.label} shows ${value} but Peec says ${peec.value}`)
      continue
    }
    if (path === 'window_label') {
      if (value !== d.windowLabel) add('kpi_changed', path, `Data window shows ${value} but Peec says ${d.windowLabel}`)
      continue
    }
    let text = value
    for (const name of exemptNames) text = text.split(name).join(' ')
    for (const m of value.match(DOMAIN) ?? []) if (!allowedDomains.has(m.toLowerCase())) add('domain_not_in_data', path, `"${m}" is not a domain in the Peec data`)
    for (const m of text.match(NUM) ?? []) if (!grounded(m)) add('number_not_in_data', path, `"${m}" is not in the Peec data`)
    if (!codeSet.has(path) && DASHES.test(text)) add('long_dash', path, 'contains a long dash; use a period or comma')
  }
  if (d.brand && full.brand !== d.brand) {
    const n = entries.filter(([p, v]) => p !== 'brand' && v.includes(d.brand)).length
    if (n > 0) add('brand_changed', 'brand', `The copy still says ${d.brand} in ${n} ${n === 1 ? 'place' : 'places'}`)
  }
  return out
}
```
Run the grounding and v1-compat tests: PASS.

- [ ] **Step 5: Write the failing stored-contract, generate, slots route and approve tests**

Append to `lib/aeo-outbound/store.test.ts`:
```ts
test('a stored row that breaks its contract is read as unreadable, with one log line naming the field; a sound row is not', async () => {
  vi.resetModules()
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  const good = { id: ID, status: 'draft', data: null, slots: { category: 'c', market: 'm', headline: 'h', summary: 's', context: 'c', competitive_bullets: [{ lead: 'a', text: 'b' }, { lead: 'a', text: 'b' }], sources_bullets: [{ lead: 'a', text: 'b' }, { lead: 'a', text: 'b' }], why: 'w', opportunities: [0, 1, 2].map(() => ({ signal: 's', opportunity: 'o', workstream: 'w' })), methodology: 'm', next_step: 'n' }, notes: ['old note'] }
  const bad = { ...good, slots: { ...good.slots, competitive_bullets: [{ lead: 'a', text: 'b' }] } }
  const select = vi.fn()
    .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: () => Promise.resolve([good]) }) }) })
    .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: () => Promise.resolve([bad]) }) }) })
  vi.doMock('@/lib/db/client', () => ({ db: { select } }))
  try {
    const store = await import('./store')
    expect((await store.getReport(ID))?.unreadable).toBe(false)
    expect((await store.getReport(ID))?.unreadable).toBe(true)
    expect(error.mock.calls.map((c) => String(c[0]))).toEqual(['[aeo-outbound] contract boundary=stored.slots field=competitive_bullets issue=too_small count=1 mode=enforce'])
  } finally {
    vi.doUnmock('@/lib/db/client')
    vi.resetModules()
    error.mockRestore()
  }
})
```

In `lib/aeo-outbound/generate.test.ts` change line 84 to `expect(r.ok && r.notes.map((n) => (typeof n === 'string' ? n : n.text)).join(' ')).toContain('"42.0%" is not in the Peec data')` and append:
```ts
test('a generated row stores every key: brand, window label and KPIs from its data, page words from the settings', async () => {
  const r = await generateSnapshot('or_a', deps(vi.fn(async () => reply(GOOD))), null, { ...SETTINGS_DEFAULTS, sectionTitles: ['Strengths', 'Gaps'], sidebarWordmark: 'Avenue Z' })
  if (!r.ok) throw new Error(r.error)
  expect(r.slots.brand).toBe('Example Co')
  expect(r.slots.window_label).toBe(r.data.windowLabel)
  expect(r.slots.kpis).toEqual(r.data.kpis)
  expect(r.slots.page).toMatchObject({ section_1_title: 'Strengths', section_2_title: 'Gaps', sidebar_wordmark: 'Avenue Z', series: 'AI Visibility Snapshot' })
})
```

In `app/api/aeo-outbound/reports/[id]/slots/route.test.ts`:
- Add `readSettings: vi.fn(async () => null)` to the `vi.hoisted` object and replace the settings-store mock added in Task 5 with `vi.mock('@/lib/aeo-outbound/settings-store', () => ({ readSettingsRow: m.readSettings }))`.
- Add imports `import { withDefaults } from '@/lib/aeo-outbound/slots'` and `import { V1_DATA, V1_SLOTS } from '@/lib/aeo-outbound/__fixtures__/v1-row'`.
- Replace the last test (lines 148 to 158) with:
```ts
test('200 with the new revision, the notes plus fresh grounding flags, and needsValidation; no slots for a plain save', async () => {
  const value = 'Needs validation: 99% of everything.'
  const res = await patch({ path: 'headline', value, revision: 3 })
  expect(res.status).toBe(200)
  const body = await res.json()
  const patched = withDefaults({ ...SLOTS, headline: value }, DATA)
  expect(body.revision).toBe(4)
  expect(body.notes).toEqual([...DATA.notes, ...groundingFlags(patched, DATA, dataBlock(DATA))])
  expect(body.needsValidation).toEqual(['headline'])
  expect(body).not.toHaveProperty('slots')
  expect(m.save).toHaveBeenCalledWith(ID, 3, patched, body.notes, undefined)
})
```
- Append:
```ts
test('the brand_name write: a brand save also writes brand_name; no other path does', async () => {
  await patch({ path: 'brand', value: ' New  Co ', revision: 3 })
  expect(m.save.mock.calls[0][4]).toBe('New Co')
  await patch({ path: 'page.series', value: 'Snapshot', revision: 3 })
  expect(m.save.mock.calls[1][4]).toBeUndefined()
})

test('a structural add returns the new slots and the new bullet as Needs validation; a remove from 2 is a 400', async () => {
  const res = await patch({ path: 'sources_bullets.add', value: 'structure', revision: 3 })
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.slots.sources_bullets).toHaveLength(3)
  expect(body.needsValidation).toEqual(['sources_bullets.2.lead', 'sources_bullets.2.text'])
  const bad = await patch({ path: 'sources_bullets.0.remove', value: 'structure', revision: 3 })
  expect(bad.status).toBe(400)
  expect(await bad.json()).toEqual({ error: 'A list needs at least two bullets.' })
})

test('an unreadable stored row is refused like a non-draft, with its own log reason', async () => {
  m.getReport.mockResolvedValue({ ...row(), unreadable: true })
  const res = await patch({ path: 'headline', value: 'x', revision: 3 })
  expect(res.status).toBe(409)
  expect(await res.json()).toEqual({ error: 'not-draft', revision: 3 })
  expect(logged()).toEqual([`[aeo-outbound] slots refused id=${ID} reason=unreadable`])
  expect(m.save).not.toHaveBeenCalled()
})

test('a version 1 row saves with its version 1 flags unchanged', async () => {
  m.getReport.mockResolvedValue({ id: ID, status: 'draft', data: V1_DATA, slots: V1_SLOTS, revision: 3 })
  const body = await (await patch({ path: 'summary', value: V1_SLOTS.summary, revision: 3 })).json()
  const flags = (body.notes as unknown[]).slice(V1_DATA.notes.length) as { path: string; text: string }[]
  expect([...new Set(flags.map((f) => `${f.path.split('.')[0]}: ${f.text}`))]).toEqual(['why: "rival.io" is not a domain in the Peec data', 'why: "42%" is not in the Peec data'])
  expect(body.notes.slice(0, V1_DATA.notes.length)).toEqual(V1_DATA.notes)
})

test('a settings change never alters an existing draft: words and code-set fields come from the row', async () => {
  m.readSettings.mockResolvedValueOnce({ id: true, users: [], admins: [], sectionTitles: ['Live title', 'Other'], fixedNextStep: 'A fixed sentence.', rankAmong: null, peecOpportunityRows: 1, methodologyStatesPromptsAndModels: true, sidebarWordmark: 'AIVx', updatedAt: new Date('2026-10-10T09:00:00.000Z'), updatedBy: 'ryan@avenuez.com' })
  const dash = String.fromCharCode(0x2014)
  m.getReport.mockResolvedValue(row({ slots: { ...SLOTS, page: { section_1_title: 'Strengths' } } }))
  const body = await (await patch({ path: 'next_step', value: `Book ${dash} now`, revision: 3 })).json()
  expect(body.notes).toContainEqual({ kind: 'long_dash', path: 'next_step', text: 'contains a long dash; use a period or comma' })
  expect(m.save.mock.calls[0][2].page.section_1_title).toBe('Strengths')
})
```
(`logged()` collects error and warn lines; the unreadable row in that test is a mock, so no contract line is logged.)

Append to `app/actions/aeo-outbound.test.ts`:
```ts
test('approve: a page word still saying Needs validation is refused too, and an unreadable row is not found', async () => {
  vi.mocked(store.getReport).mockResolvedValueOnce({ ...DRAFT, slots: { ...SLOTS, page: { opps_title: 'Needs validation' } } } as never)
  expect(await approveSnapshotAction(ID, 1, 'Ada')).toEqual({ ok: false, error: 'Fill in every "Needs validation" first.' })
  vi.mocked(store.getReport).mockResolvedValueOnce({ ...DRAFT, unreadable: true } as never)
  expect(await approveSnapshotAction(ID, 1, 'Ada')).toEqual(NOT_FOUND)
  noWrites()
})
```
Run: `perl -e 'alarm 590; exec @ARGV' -- npx vitest run lib/aeo-outbound/store.test.ts lib/aeo-outbound/generate.test.ts "app/api/aeo-outbound/reports/[id]/slots/route.test.ts" app/actions/aeo-outbound.test.ts` (FAIL).

- [ ] **Step 6: Implement stored contracts, generation with every key, the route and approve**

Append to `lib/aeo-outbound/contracts.ts` (and add `import { NOTE_KINDS } from './notes'` and `import { PAGE_KEYS } from './slots'` at the top):
```ts
const storedKpi = z.looseObject({ label: z.string(), value: z.string() })
const storedBrand = z.looseObject({ id: z.string(), name: z.string(), isOwn: z.boolean(), visibilityPct: z.number(), sovPct: z.number().nullable(), position: z.number().nullable(), rank: z.number() })
/** A row's notes: v1 strings or v1.1 Notes (spec v1.1 §4). */
export const STORED_NOTES = z.array(z.union([z.string(), z.looseObject({ kind: z.enum(NOTE_KINDS), path: z.string().optional(), text: z.string() })]))
/** Stored data, version 1 or 2 (v1.1 §10). Only the fields render, grounding and the editor read. */
export const STORED_DATA = z.looseObject({
  schemaVersion: z.literal(2).optional(),
  projectId: z.string(), projectName: z.string(), brand: z.string(), generatedAt: z.string(),
  window: z.looseObject({ start: z.string(), end: z.string() }), windowLabel: z.string(),
  category: z.string().nullable(), market: z.string().nullable(),
  brands: z.array(storedBrand), own: storedBrand, kpis: z.array(storedKpi),
  competitorsTracked: z.number(), rankN: z.number(),
  leaderGaps: z.array(z.looseObject({ name: z.string(), visibilityPoints: z.number(), sovPoints: z.number().nullable() })),
  ownDomains: z.array(z.string()), ownRetrievedChats: z.number(), ownRetrievedPct: z.number().nullable(),
  sourceMix: z.array(z.looseObject({ label: z.string(), weight: z.number(), pct: z.number() })),
  gapDomains: z.array(z.looseObject({ domain: z.string(), retrievedChats: z.number() })),
  actions: z.array(z.looseObject({ title: z.string(), impact: z.string(), type: z.string() })),
  promptCount: z.number().nullable(), models: z.array(z.string()), notes: STORED_NOTES,
})
const storedBullet = z.looseObject({ lead: z.string(), text: z.string() })
/** Stored slots: the copy keys always, the v1.1 keys when the row has them. */
export const STORED_SLOTS = z.looseObject({
  category: z.string(), market: z.string(), headline: z.string(), summary: z.string(), context: z.string(),
  competitive_bullets: z.array(storedBullet).min(2).max(3), sources_bullets: z.array(storedBullet).min(2).max(3),
  why: z.string(), opportunities: z.array(z.looseObject({ signal: z.string(), opportunity: z.string(), workstream: z.string() })).length(3),
  methodology: z.string(), next_step: z.string(),
  brand: z.string().optional(), window_label: z.string().optional(), kpis: z.array(storedKpi).optional(),
  page: z.partialRecord(z.enum(PAGE_KEYS), z.string()).optional(),
})
```

In `lib/aeo-outbound/store.ts`:
- add `import { checkContract, STORED_DATA, STORED_NOTES, STORED_SLOTS } from './contracts'` and `import type { ContractBoundary } from './config'` and `import type { ZodType } from 'zod'`
- replace lines 14 to 16 with:
```ts
/** A row with its JSON columns typed. The schema keeps them untyped so it never imports this folder. unreadable is true
 *  when a stored column breaks its contract (v1.1 §10): the editor then says so instead of rendering it. */
export type ReportRow = Omit<AeoOutboundRow, 'data' | 'slots' | 'notes'> & { data: SnapshotData | null; slots: Slots | null; notes: StoredNote[] | null; unreadable?: boolean }
const breaks = (boundary: ContractBoundary, schema: ZodType, value: unknown): boolean => value !== null && !checkContract(boundary, schema, value).ok
function typed(r: AeoOutboundRow): ReportRow {
  const unreadable = breaks('stored.data', STORED_DATA, r.data) || breaks('stored.slots', STORED_SLOTS, r.slots) || breaks('stored.notes', STORED_NOTES, r.notes)
  return { ...(r as unknown as Omit<ReportRow, 'unreadable'>), unreadable }
}
```

In `lib/aeo-outbound/generate.ts`:
- import `{ pageDefaults, validateGeneratedSlots, withDefaults, type FullSlots, type Slots } from './slots'` and `type Note` from `./notes`
- `GenerationResult` success: `slots: FullSlots`
- `groundedFallback` becomes `{ slots: FullSlots; flags: Note[] } | null`
- after `if (!checked.ok) { problems = checked.errors; continue }` replace the next lines with:
```ts
      // v1.1 §3: the row is created with every key: brand, window label and KPIs from its data, words from settings.
      const full: FullSlots = { ...withDefaults(checked.slots, data), page: pageDefaults(settings) }
      const flags = groundingFlags(full, data, block)
      if (!flags.length) return { ok: true, brandName, data, slots: full, notes: data.notes }
      groundedFallback = { slots: full, flags }
      if (attempt === 1 && deps.deadline - deps.now() >= 60_000) { problems = flags.map((f) => `${f.path ?? ''}: ${f.text}`); continue }
      break
```
(`Slots` stays imported for `validateGeneratedSlots`'s result type.)

Replace `app/api/aeo-outbound/reports/[id]/slots/route.ts` lines 1 to 52 with:
```ts
import { NextResponse, type NextRequest } from 'next/server'
import { auth } from '@/auth'
import { outboundAccess } from '@/lib/aeo-outbound/access'
import { checkContract, SLOTS_BODY } from '@/lib/aeo-outbound/contracts'
import { originAllowed } from '@/lib/aeo-outbound/permissions'
import { getReport, isReportId, saveSlotsQuery } from '@/lib/aeo-outbound/store'
import { applySlotPatch, applyStructure, isStructuralPath, needsValidationPaths, withDefaults } from '@/lib/aeo-outbound/slots'
import { groundingFlags } from '@/lib/aeo-outbound/grounding'
import { errorLabel } from '@/lib/aeo-outbound/log'
import type { StoredNote } from '@/lib/aeo-outbound/notes'
import { dataBlock } from '@/lib/aeo-outbound/prompt'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const unavailable = () => NextResponse.json({ error: 'unavailable' }, { status: 503 })
const refused = (id: string, reason: string) => console.warn(`[aeo-outbound] slots refused id=${id} reason=${reason}`)

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!(await outboundAccess(session?.user)).ok || !originAllowed(req.headers.get('origin'), req.headers.get('host'))) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const { id } = await ctx.params
  let body: unknown = null
  try { body = await req.json() } catch { /* below */ }
  // v1.1 §10: the body is a contract; a violation keeps the v1.0 400 body.
  if (!checkContract('request.slots', SLOTS_BODY, body).ok) return NextResponse.json({ error: 'bad-request' }, { status: 400 })
  const { path, value, revision } = body as { path: string; value: unknown; revision: number }
  if (!isReportId(id)) return NextResponse.json({ error: 'not-found' }, { status: 404 })
  let row: Awaited<ReturnType<typeof getReport>>
  try { row = await getReport(id) } catch (e) {
    console.error(`[aeo-outbound] slots read failed id=${id} reason=${errorLabel(e)}`)
    return unavailable()
  }
  if (!row) return NextResponse.json({ error: 'not-found' }, { status: 404 })
  if (row.status !== 'draft' || !row.slots || !row.data || row.unreadable) {
    refused(id, row.unreadable ? 'unreadable' : 'not-draft')
    return NextResponse.json({ error: 'not-draft', revision: row.revision }, { status: 409 })
  }
  // Missing keys read the row's own data and the v1.0 words, never live settings (v1.1 §3).
  const current = withDefaults(row.slots, row.data)
  const structural = isStructuralPath(path)
  const patched = structural ? applyStructure(current, path, value) : applySlotPatch(current, path, value)
  if (!patched.ok) return NextResponse.json({ error: patched.error }, { status: 400 })
  // The notes column: the row's data notes, then this save's grounding flags (v1.1 §4). Old rows' strings stay strings.
  const notes: StoredNote[] = [...row.data.notes, ...groundingFlags(patched.slots, row.data, dataBlock(row.data))]
  let saved: { revision: number }[]
  try { saved = await saveSlotsQuery(id, revision, patched.slots, notes, path === 'brand' ? patched.slots.brand : undefined) } catch (e) {
    console.error(`[aeo-outbound] slots save failed id=${id} reason=${errorLabel(e)}`)
    return unavailable()
  }
  if (!saved.length) {
    refused(id, 'stale')
    let latest: number | null
    try { latest = (await getReport(id))?.revision ?? null } catch (e) {
      console.error(`[aeo-outbound] slots read failed id=${id} reason=${errorLabel(e)}`)
      return unavailable()
    }
    return NextResponse.json({ error: 'stale', revision: latest }, { status: 409 })
  }
  return NextResponse.json({ revision: saved[0].revision, notes, needsValidation: needsValidationPaths(patched.slots), ...(structural ? { slots: patched.slots } : {}) })
}
```

In `app/actions/aeo-outbound.ts`: line 12 becomes `import { needsValidationPaths, withDefaults } from '@/lib/aeo-outbound/slots'`; replace lines 55 to 60 with:
```ts
    if (!row.data || !row.slots || row.unreadable) return NOT_FOUND
    const who = cleanRecipient(recipient)
    if (!who.ok) return { ok: false, error: who.error } as Fail
    const slots = withDefaults(row.slots, row.data)
    if (DECISIONS.needsValidationBlocksApprove && needsValidationPaths(slots).length) return { ok: false, error: 'Fill in every "Needs validation" first.' } as Fail
    const now = new Date()
    const html = renderSnapshotHtml(row.data, slots, 'final', fmtEasternDay(now))
```

In `app/tools/new-business/[reportId]/page.tsx`: line 6 becomes `import { needsValidationPaths, withDefaults } from '@/lib/aeo-outbound/slots'`; line 38 becomes `needsValidation={row.slots && row.data && !row.unreadable ? needsValidationPaths(withDefaults(row.slots, row.data)) : []}`.

Run the four test files, then the gate.

- [ ] **Step 7: Gate, commit, push**

Commit every file this task touched, by name, with subject `Make every word on the page a slot, ground every slot, and check stored rows against their contracts` and body:
```
Edge cases (slot values are untrusted input; saves touch shared state; stored jsonb may predate v1.1):
- external failure: none new: decline
- operator visibility: an unreadable stored row logs its boundary and field; the slots route logs reason=unreadable: fix
- bounds: bullet lists stay at two or three; values capped at 80, 120 or 1,000 characters by path: fix
- input boundaries: a closed path grammar with page keys spelled out, so no prototype key matches; a structural value must be non-empty text; KPI values with words compare as different and never throw: fix
- state and concurrency: a structural change is one revision-checked save like any other; old rows read defaults from their own data and v1.0's words, never live settings: fix
- security: labels use own-property lookups; every value stays escaped at render (Task 7): fix

Co-Authored-By: Claude <model> <noreply@anthropic.com>
```
Push.

---
### Task 7: Render v1.1 and the frame script

Covers v1.1 §2 (draft HTML marks slots without `contenteditable`; the frame makes them editable only in edit mode; the ready, mode, flush, focus, dirty, edit, locked and structure messages; links and the sidebar nav cancelled in edit mode; the CSS-only Edit chip and outlines), §3 (every word a slot, mirror or fixed marker; the wrapper spans and their reset; `user-select:text` on header slots; the add and remove controls; the brand used in all six places; the long-name rule from the slot; preview and final carry nothing, with a v1.0 parity golden), §9 (the sandbox string in the CSP header and the iframe attribute, the `contenteditable` fallback, the header clone between the AIVx script and the editor script, delegated listeners), round-2 MINORs 1, 3 and 13.

**Files:**
- Create: `lib/aeo-outbound/sandbox.ts`
- Modify: `lib/aeo-outbound/render.ts:1-187` (full replacement), `lib/aeo-outbound/render.test.ts`
- Create: `lib/aeo-outbound/render.frame.test.ts`
- Modify: `lib/aeo-outbound/charts.ts:87-90` (`embedFigure` attributes), `lib/aeo-outbound/v1-compat.test.ts`
- Modify: `app/api/aeo-outbound/reports/[id]/view/route.ts:12`, its test lines 85, 108, 122
- Modify: `app/snapshot/[token]/route.ts:23`, its test lines 79, 140
- Modify: `components/aeo-outbound/editor.tsx` (the `<iframe>`, at `06e68c0d` lines 302 to 309), `components/aeo-outbound/editor.test.tsx:60`

**Interfaces:**
- Consumes: `withDefaults`, `Slots`, `FullSlots` (Task 6).
- Produces:
  - `sandbox.ts`: `REPORT_SANDBOX = 'allow-scripts allow-popups allow-popups-to-escape-sandbox'`, `REPORT_CSP = 'sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox'`
  - `render.ts`: `renderSnapshotHtml(data: SnapshotData, slots: Slots, mode: RenderMode, preparedOn: string): string` (applies `withDefaults` itself), `EDITOR_STYLE`, `FRAME_SCRIPT_JS`, `HEADER_CLONE_JS`, `SHARE_BUTTON` (unchanged)
  - `charts.ts`: `embedFigure(id: string, fig: Figure, attrs = ''): string`
  - The frame protocol, consumed by the editor in Task 10:
    - frame to parent: `{ type: 'ready' }`; `{ type: 'dirty', path }`; `{ type: 'edit', path, value }`; `{ type: 'locked', what: 'chart' | 'fixed', path? }` (`path` only for a mirror: the slot it copies); `{ type: 'structure', op: 'add' | 'remove', path }` (`path` is the list for add, for example `competitive_bullets`, or the bullet for remove, for example `competitive_bullets.1`)
    - parent to frame: `{ type: 'mode', edit: boolean }`; `{ type: 'flush' }`; `{ type: 'focus', path }`
    - draft markup: `data-slot="{path}"` on each editable element (exactly one per path); `data-mirror="{path}"` (plus `data-upper` when shown uppercase) on each copy; `data-locked="chart"` on each chart; `data-locked="fixed"` on the nav numbers 01 to 05, the "02 / ", "03 / ", "04 / " prefixes and the Prepared date; `data-structure="add" | "remove"` with `data-path` on the bullet controls; wrapper spans carry `class="aeo-w"`

- [ ] **Step 1: Write the failing render tests**

In `lib/aeo-outbound/render.test.ts`:
- Line 3 becomes `import { EDITOR_STYLE, FRAME_SCRIPT_JS, HEADER_CLONE_JS, SHARE_BUTTON, renderSnapshotHtml } from './render'`, and add `import { AIVX_JS } from './aivx/js'`, `import { slotEntries, withDefaults } from './slots'`.
- Replace the test `'draft: every slot editable, editor script present, share hidden'` (lines 52 to 60) with:
```ts
const parse = (h: string) => new DOMParser().parseFromString(h, 'text/html')

test('draft: every slot is marked, none is editable until the frame says so, the frame script and style are present, share hidden', () => {
  const h = renderSnapshotHtml(DATA, SLOTS, 'draft', 'Oct 8, 2026')
  for (const p of ['headline', 'summary', 'context', 'category', 'market', 'why', 'methodology', 'next_step', 'competitive_bullets.0.lead', 'sources_bullets.1.text', 'opportunities.2.workstream', 'brand', 'window_label', 'kpis.0.label', 'kpis.3.value', 'page.series', 'page.footer_disclaimer']) {
    expect(h).toContain(`data-slot="${p}"`)
  }
  expect(parse(h).querySelectorAll('[contenteditable]')).toHaveLength(0)
  expect(h).toContain(FRAME_SCRIPT_JS)
  expect(h).toContain(EDITOR_STYLE)
  expect(h).not.toContain('class="share-btn"')
})
```
- Replace `'preview: no hooks and no share button'` (lines 62 to 66) with:
```ts
test('preview and final carry no editing markup at all', () => {
  for (const mode of ['preview', 'final'] as const) {
    const h = renderSnapshotHtml(DATA, SLOTS, mode, 'Oct 8, 2026')
    for (const s of ['data-slot', 'data-mirror', 'data-locked', 'data-structure', 'aeo-w', 'aeo-ctl', 'contenteditable', FRAME_SCRIPT_JS, EDITOR_STYLE]) expect(h, `${mode} ${s.slice(0, 20)}`).not.toContain(s)
  }
  expect(renderSnapshotHtml(DATA, SLOTS, 'preview', 'x')).not.toContain('class="share-btn"')
})
```
- Append:
```ts
const THREE: Slots = { ...SLOTS, competitive_bullets: [...SLOTS.competitive_bullets, { lead: 'L3:', text: 'T3.' }] }

test('every visible text in draft is a slot, a mirror, fixed by design, a chart or a bullet control', () => {
  for (const slots of [SLOTS, THREE]) {
    const doc = parse(renderSnapshotHtml(DATA, slots, 'draft', 'Oct 8, 2026'))
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT)
    const bare: string[] = []
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement!
      if (!/[A-Za-z0-9]/.test(n.textContent ?? '') || el.closest('script,style')) continue
      if (!el.closest('[data-slot],[data-mirror],[data-locked],[data-structure]')) bare.push((n.textContent ?? '').trim())
    }
    expect(bare).toEqual([])
  }
})

test('fixed by design means exactly the nav numbers, the section number prefixes and the Prepared date', () => {
  const doc = parse(renderSnapshotHtml(DATA, SLOTS, 'draft', 'Oct 8, 2026'))
  expect([...doc.querySelectorAll('[data-locked="fixed"]')].map((e) => e.textContent)).toEqual(['01', '02', '03', '04', '05', '02 / ', '03 / ', '04 / ', 'Oct 8, 2026'])
  expect(doc.querySelectorAll('[data-locked="chart"]')).toHaveLength(2)
})

test('exactly one editable element per path, every path present, and every mirror copies a path that has one', () => {
  const doc = parse(renderSnapshotHtml(DATA, SLOTS, 'draft', 'x'))
  const paths = [...doc.querySelectorAll('[data-slot]')].map((e) => e.getAttribute('data-slot'))
  expect(paths.length).toBe(new Set(paths).size)
  expect(new Set(paths)).toEqual(new Set(slotEntries(withDefaults(SLOTS, DATA)).map(([p]) => p)))
  const mirrors = new Set([...doc.querySelectorAll('[data-mirror]')].map((e) => e.getAttribute('data-mirror')))
  expect(mirrors).toEqual(new Set(['brand', 'page.series', 'page.headline_label', 'page.section_1_title', 'page.section_2_title', 'page.opps_label']))
  for (const m of mirrors) expect(paths).toContain(m)
  expect(doc.querySelectorAll('[data-mirror][data-slot]')).toHaveLength(0)
})

test('the brand slot is used in every place the brand shows: title, description, hero, sidebar, footer, bar label and bolding', () => {
  const own = { ...BRANDS[1], name: 'Own' }
  const d = { ...DATA, brand: 'Own', brands: [BRANDS[0], own], own } as SnapshotData
  const h = renderSnapshotHtml(d, { ...SLOTS, brand: 'Renamed Co', context: 'Alpha leads Renamed Co.' }, 'final', 'x')
  expect(h).toContain('<title>AI Visibility Snapshot: Renamed Co | Avenue Z</title>')
  expect(h).toContain('<meta name="description" content="AI Visibility Snapshot for Renamed Co. Powered by Avenue Z AEO Intelligence.">')
  expect(h).toContain('<span class="grad-text">Renamed Co</span>')
  expect(h).toContain('<span>Renamed Co</span>')
  expect(h).toContain('Renamed Co<br>Prepared x')
  expect(h).toContain('"Renamed Co"')
  expect(h).toContain('<strong>Alpha</strong> leads <strong>Renamed Co</strong>.')
  expect(h).not.toContain('>Own<')
})

test('the long-name rule reads the brand slot', () => {
  expect(renderSnapshotHtml(DATA, { ...SLOTS, brand: 'A Very Long Brand Name Incorporated' }, 'final', 'x')).toContain('<h1 class="hero-industry" style="font-size:72px">')
})

test('one key drives every place its words appear: the series in the title, the sidebar and the footer (uppercase there)', () => {
  const h = renderSnapshotHtml(DATA, { ...SLOTS, page: { series: 'Market Snapshot' } }, 'final', 'x')
  expect(h).toContain('<title>Market Snapshot: ')
  expect(h).toContain('content="Market Snapshot for ')
  expect(h).toContain('<div class="hero-series">Market Snapshot</div>')
  expect(h).toContain('\n    Market Snapshot\n    <span>')
  expect(h).toContain('\n        MARKET SNAPSHOT\n      </p>')
  const draft = renderSnapshotHtml(DATA, { ...SLOTS, page: { series: 'Market Snapshot' } }, 'draft', 'x')
  expect(draft).toContain('<span class="aeo-w" data-mirror="page.series" data-upper>MARKET SNAPSHOT</span>')
})

test('bullet controls: Add bullet under a list of 2, Remove on each bullet of a list of 3, in draft only', () => {
  const h = renderSnapshotHtml(DATA, THREE, 'draft', 'x')
  const doc = parse(h)
  expect([...doc.querySelectorAll('[data-structure="remove"]')].map((e) => e.getAttribute('data-path'))).toEqual(['competitive_bullets.0', 'competitive_bullets.1', 'competitive_bullets.2'])
  expect([...doc.querySelectorAll('[data-structure="add"]')].map((e) => [e.getAttribute('data-path'), e.textContent])).toEqual([['sources_bullets', 'Add bullet']])
  expect(doc.querySelector('[data-structure="remove"]')!.textContent).toBe('Remove')
  expect(renderSnapshotHtml(DATA, THREE, 'final', 'x')).not.toContain('data-structure')
})

test('the wrapper reset targets only wrapper spans and inherits spacing and case; the sidebar brand span keeps AIVx styling', () => {
  expect(EDITOR_STYLE).toContain('span.aeo-w,.sidebar-industry span.aeo-w{display:inline;font:inherit;color:inherit;letter-spacing:inherit;text-transform:inherit;margin:0}')
  expect(EDITOR_STYLE).toContain('th[data-slot]{user-select:text;-webkit-user-select:text}')
  const h = renderSnapshotHtml(DATA, SLOTS, 'draft', 'x')
  expect(h).toContain('<span class="aeo-w" data-mirror="page.series">AI Visibility Snapshot</span>')
  expect(h).toContain(`<span data-mirror="brand">${'Example &lt;Co&gt; &amp; &quot;Sons&quot;'}</span>`)
})

test('in every mode the header clone runs after the AIVx script; in draft the frame script runs after both', () => {
  for (const mode of ['draft', 'preview', 'final'] as const) {
    const h = renderSnapshotHtml(DATA, SLOTS, mode, 'x')
    const aivx = `<script>${AIVX_JS}</script>`
    const at = h.indexOf(aivx)
    expect(at).toBeGreaterThan(-1)
    expect(h.indexOf(`<script>${HEADER_CLONE_JS}</script>`)).toBe(at + aivx.length)
    if (mode === 'draft') expect(h.indexOf(FRAME_SCRIPT_JS)).toBeGreaterThan(at + aivx.length)
  }
})

test('the header clone removes the AIVx table sort from the opportunities table', () => {
  const hadInnerText = 'innerText' in HTMLElement.prototype
  if (!hadInnerText) Object.defineProperty(HTMLElement.prototype, 'innerText', { configurable: true, get() { return (this as HTMLElement).textContent } })
  try {
    const sortClass = (clone: boolean) => {
      const doc = parse(renderSnapshotHtml(DATA, SLOTS, 'final', 'x'))
      new Function('window', 'document', AIVX_JS)(new EventTarget(), doc)
      if (clone) new Function('document', HEADER_CLONE_JS)(doc)
      const th = doc.querySelector('.leaderboard thead th')!
      th.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      return th.className
    }
    expect(sortClass(false)).toBe('sort-asc')
    expect(sortClass(true)).toBe('')
  } finally {
    if (!hadInnerText) delete (HTMLElement.prototype as { innerText?: unknown }).innerText
  }
})
```
(`SnapshotData` and `Slots` are already imported as types at lines 5 and 6.)

Create `lib/aeo-outbound/render.frame.test.ts`:
```ts
import { afterEach, beforeEach, expect, test, vi, type MockInstance } from 'vitest'
import { FRAME_SCRIPT_JS, renderSnapshotHtml } from './render'
import { V1_DATA, V1_SLOTS } from './__fixtures__/v1-row'
import type { Slots } from './slots'

// The frame script runs against a parsed draft page. window is a stand-in event target for the frame's own window;
// parent is the test window, whose postMessage is spied, so nothing is really posted.
let post: MockInstance<typeof window.postMessage>
let win: EventTarget
let doc: Document
function boot(slots: Slots = V1_SLOTS) {
  doc = new DOMParser().parseFromString(renderSnapshotHtml(V1_DATA, slots, 'draft', 'Oct 8, 2026'), 'text/html')
  win = new EventTarget()
  new Function('window', 'document', 'parent', FRAME_SCRIPT_JS)(win, doc, window)
}
const sent = () => post.mock.calls.map((c) => c[0])
const fromParent = (data: unknown, source: Window | null = window) => { win.dispatchEvent(new MessageEvent('message', { data, source })) }
const slot = (p: string) => doc.querySelector(`[data-slot="${p}"]`) as HTMLElement
const type = (p: string, text: string) => { const el = slot(p); el.textContent = text; el.dispatchEvent(new Event('input', { bubbles: true })) }
const click = (el: Element) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

beforeEach(() => {
  vi.useFakeTimers()
  post = vi.spyOn(window, 'postMessage').mockImplementation(() => {})
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

test('the frame says ready on load, and the mode message makes every slot editable or not', () => {
  boot()
  expect(sent()).toEqual([{ type: 'ready' }])
  fromParent({ type: 'mode', edit: true })
  const slots = [...doc.querySelectorAll('[data-slot]')]
  expect(slots.every((e) => e.getAttribute('contenteditable') === 'plaintext-only')).toBe(true)
  expect(doc.documentElement.classList.contains('aeo-edit')).toBe(true)
  fromParent({ type: 'mode', edit: false })
  expect(doc.querySelectorAll('[contenteditable]')).toHaveLength(0)
  expect(doc.documentElement.classList.contains('aeo-edit')).toBe(false)
})

test('contenteditable falls back to true where plaintext-only is unsupported', () => {
  Object.defineProperty(HTMLElement.prototype, 'contentEditable', {
    configurable: true,
    get() { return 'inherit' },
    set(v: string) { if (v === 'plaintext-only') throw new DOMException('unsupported', 'SyntaxError') },
  })
  try {
    boot()
    fromParent({ type: 'mode', edit: true })
    expect(slot('headline').getAttribute('contenteditable')).toBe('true')
  } finally {
    delete (HTMLElement.prototype as { contentEditable?: unknown }).contentEditable
  }
})

test('typing in edit mode posts dirty at once and the edit after 800 ms, and every mirror of that path follows', () => {
  boot()
  fromParent({ type: 'mode', edit: true })
  type('page.series', '  New   series ')
  expect(sent().at(-1)).toEqual({ type: 'dirty', path: 'page.series' })
  vi.advanceTimersByTime(799)
  expect(sent().filter((m) => (m as { type: string }).type === 'edit')).toEqual([])
  vi.advanceTimersByTime(1)
  expect(sent().at(-1)).toEqual({ type: 'edit', path: 'page.series', value: '  New   series ' })
  expect(doc.querySelector('.sidebar-industry [data-mirror="page.series"]')!.textContent).toBe('New series')
  expect(doc.querySelector('[data-mirror="page.series"][data-upper]')!.textContent).toBe('NEW SERIES')
})

test('in Preview nothing is editable: typing and clicks post nothing, and links are left alone', () => {
  boot()
  type('headline', 'x')
  expect(click(doc.querySelector('[data-locked="chart"]')!)).toBe(true)
  expect(click(doc.querySelector('.footer-link')!)).toBe(true)
  vi.advanceTimersByTime(1000)
  expect(sent()).toEqual([{ type: 'ready' }])
})

test('in edit mode links and the sidebar nav never navigate', () => {
  boot()
  fromParent({ type: 'mode', edit: true })
  expect(click(doc.querySelector('.footer-link')!)).toBe(false)
  expect(click(doc.querySelector('.sidebar-nav a')!)).toBe(false)
})

test('locked: a chart posts chart, a nav number or the Prepared date posts fixed, a mirror posts fixed with the path it copies', () => {
  boot()
  fromParent({ type: 'mode', edit: true })
  click(doc.querySelector('[data-locked="chart"] .plotly-graph-div')!)
  click(doc.querySelector('.nav-num')!)
  click(doc.querySelector('.sidebar-industry [data-mirror="brand"]')!)
  click(slot('headline'))
  expect(sent().slice(1)).toEqual([
    { type: 'locked', what: 'chart' },
    { type: 'locked', what: 'fixed' },
    { type: 'locked', what: 'fixed', path: 'brand' },
  ])
})

test('a structural click sends the pending edit first', () => {
  boot()
  fromParent({ type: 'mode', edit: true })
  type('headline', 'Typed headline')
  click(doc.querySelector('[data-structure="add"][data-path="competitive_bullets"]')!)
  expect(sent().slice(1)).toEqual([
    { type: 'dirty', path: 'headline' },
    { type: 'edit', path: 'headline', value: 'Typed headline' },
    { type: 'structure', op: 'add', path: 'competitive_bullets' },
  ])
  vi.advanceTimersByTime(1000)
  expect(sent()).toHaveLength(4)
})

test('a Remove click names the bullet', () => {
  boot({ ...V1_SLOTS, sources_bullets: [...V1_SLOTS.sources_bullets, { lead: 'L3:', text: 'T3.' }] })
  fromParent({ type: 'mode', edit: true })
  click(doc.querySelector('[data-structure="remove"][data-path="sources_bullets.1"]')!)
  expect(sent().at(-1)).toEqual({ type: 'structure', op: 'remove', path: 'sources_bullets.1' })
})

test('flush from the parent sends every pending edit; the same message from anyone else is ignored', () => {
  boot()
  fromParent({ type: 'mode', edit: true })
  type('why', 'Typed')
  fromParent({ type: 'flush' }, null)
  expect(sent().at(-1)).toEqual({ type: 'dirty', path: 'why' })
  fromParent({ type: 'flush' })
  expect(sent().at(-1)).toEqual({ type: 'edit', path: 'why', value: 'Typed' })
})

test('focus flashes the field and focuses it; Enter never adds a line', () => {
  boot()
  fromParent({ type: 'mode', edit: true })
  fromParent({ type: 'focus', path: 'why' })
  expect(slot('why').classList.contains('aeo-flash')).toBe(true)
  vi.advanceTimersByTime(1200)
  expect(slot('why').classList.contains('aeo-flash')).toBe(false)
  const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
  expect(slot('why').dispatchEvent(enter)).toBe(false)
})

test('the listener is delegated: a node cloned after the script ran still posts its edits', () => {
  boot()
  fromParent({ type: 'mode', edit: true })
  const thead = doc.querySelector('.leaderboard thead')!
  thead.parentNode!.replaceChild(thead.cloneNode(true), thead)
  type('page.opps_col_1', 'Evidence')
  expect(sent().at(-1)).toEqual({ type: 'dirty', path: 'page.opps_col_1' })
})
```
Run: `perl -e 'alarm 590; exec @ARGV' -- npx vitest run lib/aeo-outbound/render.test.ts lib/aeo-outbound/render.frame.test.ts` (FAIL).

- [ ] **Step 2: Implement the sandbox constant, `embedFigure` attributes and render v1.1**

Create `lib/aeo-outbound/sandbox.ts`:
```ts
// The one sandbox for every place the report runs (spec v1.1 §9): the editor's iframe attribute, and the CSP header of
// the view route and the public link. allow-popups lets the avenuez.com links open. There is no allow-same-origin, so
// the report keeps an opaque origin everywhere (main spec §8).
export const REPORT_SANDBOX = 'allow-scripts allow-popups allow-popups-to-escape-sandbox'
export const REPORT_CSP = `sandbox ${REPORT_SANDBOX}`
```
In `lib/aeo-outbound/charts.ts` replace `embedFigure` (lines 87 to 90) with:
```ts
/** The wrapper plotly 6.8+ emits (golden html), with the figure height on the outer div. attrs is draft-only markup. */
export function embedFigure(id: string, fig: Figure, attrs = ''): string {
  const h = Number(fig.layout.height ?? 420)
  return `<div style="height:${h}px; width:100%;"${attrs}><div id="${id}" class="plotly-graph-div" style="height:100%; width:100%;"></div><script>window.PLOTLYENV=window.PLOTLYENV || {};if (document.getElementById("${id}")) {Plotly.newPlot("${id}", ${jsonForScript(fig.data)}, ${jsonForScript(fig.layout)}, ${jsonForScript(fig.config)})};</script></div>`
}
```
Replace `lib/aeo-outbound/render.ts` with:
```ts
// The snapshot page in the AIVx design (spec §5; v1.1 §2, §3, §9). Head and body structure follow aivx-reports@ff18697
// agent/renderer.py:2530-2556; blocks follow its builders. Every string is escaped; Peec text in figures is stripped of
// < and >. In draft every visible word carries data-slot (editable), data-mirror (a copy of a slot, edited where it first
// appears) or data-locked (a chart, or fixed by design). Preview and final carry none of it, so they stay AIVx.
import { AIVX_CSS } from './aivx/css'
import { AIVX_JS } from './aivx/js'
import { AIVX_FAVICON_TAG } from './aivx/favicon'
import { AIVX_SHARE_BLOCK } from './aivx/share'
import { embedFigure, sourceDonutFigure, visibilityBarFigure } from './charts'
import { esc } from './html'
import type { SnapshotData } from './metrics'
import { withDefaults, type Slots } from './slots'

export type RenderMode = 'draft' | 'preview' | 'final'
const UL = '<ul style="margin-top:10px;padding-left:20px;display:flex;flex-direction:column;gap:4px">' // renderer.py:2313

/** Draft only. Outlines and the Edit chip show only in edit mode (html.aeo-edit, set by the frame script). The chip is
 *  CSS ::after, so no element is added inside a slot and textContent stays exactly what Ryan typed (v1.1 §2). */
export const EDITOR_STYLE = '<style>' + [
  'html.aeo-edit [data-slot]{outline:1px dashed rgba(255,255,255,0.35);outline-offset:2px;cursor:text}',
  'html.aeo-edit [data-slot]:hover,html.aeo-edit [data-slot]:focus{outline:2px solid #60FFEA;position:relative}',
  'html.aeo-edit [data-slot]:hover::after,html.aeo-edit [data-slot]:focus::after{content:"Edit";position:absolute;top:-18px;right:0;padding:3px 5px;border-radius:3px;background:#60FFEA;color:#000;-webkit-text-fill-color:#000;font:700 10px/1 Avenir,sans-serif;letter-spacing:0.06em;text-transform:uppercase;pointer-events:none;z-index:5}',
  'html.aeo-edit [data-mirror],html.aeo-edit [data-locked]{cursor:not-allowed}',
  '.aeo-flash{outline:2px solid #FFFC60!important}',
  // AIVx styles .sidebar-industry span as a block; the wrapper spans must stay inline text (v1.1 §3, round-2 MINOR 1).
  'span.aeo-w,.sidebar-industry span.aeo-w{display:inline;font:inherit;color:inherit;letter-spacing:inherit;text-transform:inherit;margin:0}',
  'th[data-slot]{user-select:text;-webkit-user-select:text}',
  '.aeo-ctl{display:none}',
  'html.aeo-edit .aeo-ctl{display:inline-block;margin:8px 0 0 6px;padding:2px 8px;border:1px solid rgba(96,255,234,0.45);border-radius:4px;background:transparent;color:#60FFEA;font:600 11px Avenir,sans-serif;cursor:pointer}',
].join('') + '</style>'

/**
 * The draft frame's script (v1.1 §2). One delegated listener per event on document, so a node cloned or re-rendered
 * after it ran keeps working. Slots become contenteditable only in edit mode, plaintext-only where supported, else true
 * with plain-text paste. In edit mode, clicks inside links and the sidebar nav never navigate; a click on a chart, a
 * fixed word or a mirror posts locked. Preview posts nothing but ready.
 */
export const FRAME_SCRIPT_JS = String.raw`(function(){
var t={},edit=false;
var PLAIN=(function(){var d=document.createElement('div');try{d.contentEditable='plaintext-only'}catch(e){return false}return d.contentEditable==='plaintext-only'})();
function post(m){parent.postMessage(m,'*')}
function within(n,s){return n&&n.closest?n.closest(s):null}
function slotEl(p){var a=document.querySelectorAll('[data-slot]');for(var i=0;i<a.length;i++){if(a[i].getAttribute('data-slot')===p)return a[i]}return null}
function clean(s){return s.replace(/[\x00-\x1f\x7f]/g,' ').replace(/\s+/g,' ').trim()}
function mirror(p,v){var a=document.querySelectorAll('[data-mirror]');for(var i=0;i<a.length;i++){if(a[i].getAttribute('data-mirror')===p)a[i].textContent=a[i].hasAttribute('data-upper')?v.toUpperCase():v}}
function send(p){clearTimeout(t[p]);delete t[p];var el=slotEl(p);if(!el)return;var v=el.textContent||'';post({type:'edit',path:p,value:v});var c=clean(v);if(c)mirror(p,c)}
function flush(){Object.keys(t).forEach(send)}
function setMode(on){edit=on===true;document.documentElement.classList.toggle('aeo-edit',edit);var a=document.querySelectorAll('[data-slot]');for(var i=0;i<a.length;i++){if(edit)a[i].setAttribute('contenteditable',PLAIN?'plaintext-only':'true');else a[i].removeAttribute('contenteditable')}if(!edit)flush()}
window.addEventListener('message',function(e){if(e.source!==parent||!e.data||typeof e.data!=='object')return;var d=e.data;
if(d.type==='mode')setMode(d.edit);
else if(d.type==='flush')flush();
else if(d.type==='focus'&&typeof d.path==='string'){var el=slotEl(d.path);if(!el)return;if(el.scrollIntoView)el.scrollIntoView({block:'center'});if(el.focus)el.focus();el.classList.add('aeo-flash');setTimeout(function(){el.classList.remove('aeo-flash')},1200)}});
document.addEventListener('input',function(e){var el=within(e.target,'[data-slot]');if(!el||!edit)return;var p=el.getAttribute('data-slot');post({type:'dirty',path:p});clearTimeout(t[p]);t[p]=setTimeout(function(){send(p)},800)});
document.addEventListener('keydown',function(e){var el=within(e.target,'[data-slot]');if(el&&e.key==='Enter'){e.preventDefault();if(el.blur)el.blur()}});
document.addEventListener('paste',function(e){var el=within(e.target,'[data-slot]');if(!el||!edit)return;e.preventDefault();var cd=e.clipboardData||window.clipboardData;var s=cd?cd.getData('text/plain'):'';if(document.execCommand)document.execCommand('insertText',false,s)});
document.addEventListener('drop',function(e){if(edit&&within(e.target,'[data-slot]'))e.preventDefault()});
document.addEventListener('click',function(e){if(!edit)return;var n=e.target;if(!n||!n.closest)return;
if(n.closest('a')||n.closest('.sidebar-nav'))e.preventDefault();
var c=n.closest('[data-structure]');if(c){e.preventDefault();flush();post({type:'structure',op:c.getAttribute('data-structure'),path:c.getAttribute('data-path')});return}
if(n.closest('[data-slot]'))return;
var m=n.closest('[data-mirror]');if(m){post({type:'locked',what:'fixed',path:m.getAttribute('data-mirror')});return}
var l=n.closest('[data-locked]');if(l)post({type:'locked',what:l.getAttribute('data-locked')})},true);
post({type:'ready'});
})();`
const FRAME_SCRIPT = `<script>${FRAME_SCRIPT_JS}</script>`

/** Removes AIVx's table sort (which strips text cells to digits) from the opportunities table, in every mode, by
 *  replacing the header with a listener-free clone. It runs after the AIVx script and before the frame script (v1.1 §9). */
export const HEADER_CLONE_JS = "(function(){var h=document.querySelector('.leaderboard thead');if(h&&h.parentNode)h.parentNode.replaceChild(h.cloneNode(true),h)})();"
const HEADER_CLONE = `<script>${HEADER_CLONE_JS}</script>`

/**
 * The final page's share button, exactly as rendered (with its leading newline and indent). Exported so the editor's
 * preview of a frozen page can remove this exact string (app/api/aeo-outbound/reports/[id]/view/route.ts).
 */
export const SHARE_BUTTON = `
    <button class="share-btn" type="button" aria-label="Copy shareable link to this report">
      <svg viewBox="0 0 24 24" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
        <polyline points="16 6 12 2 8 6"/>
        <line x1="12" y1="2" x2="12" y2="15"/>
      </svg>
      <span class="share-btn-label">Share Report</span>
    </button>`

export function renderSnapshotHtml(data: SnapshotData, stored: Slots, mode: RenderMode, preparedOn: string): string {
  const draft = mode === 'draft'
  const s = withDefaults(stored, data)
  const p = s.page
  /** An attribute only in draft. */
  const attr = (name: string, value: string) => (draft ? ` ${name}="${esc(value)}"` : '')
  const fixedMark = attr('data-locked', 'fixed')
  /** One editable element: in draft the element itself carries data-slot. */
  const slot = (tag: string, path: string, value: string, cls = '', attrs = '', html?: string) =>
    `<${tag}${cls ? ` class="${cls}"` : ''}${attrs}${attr('data-slot', path)}>${html ?? esc(value)}</${tag}>`
  /** The same, with the content on its own line, as v1.0 laid out the footer text blocks. */
  const block = (tag: string, path: string, value: string, cls: string, attrs: string, indent: string) =>
    `<${tag}${cls ? ` class="${cls}"` : ''}${attrs}${attr('data-slot', path)}>\n${indent}  ${esc(value)}\n${indent}</${tag}>`
  /** Text that shares its element with other text: wrapped in draft only. */
  const wrap = (path: string, value: string) => (draft ? `<span class="aeo-w" data-slot="${esc(path)}">${esc(value)}</span>` : esc(value))
  /** A copy of a slot edited elsewhere: plain text with data-mirror in draft. */
  const mirror = (path: string, value: string, upper = false) => (draft ? `<span class="aeo-w" data-mirror="${esc(path)}"${upper ? ' data-upper' : ''}>${esc(value)}</span>` : esc(value))
  /** Fixed by design (v1.1 §3): numbering and the Prepared date. */
  const fixed = (text: string) => (draft ? `<span class="aeo-w" data-locked="fixed">${esc(text)}</span>` : esc(text))
  const bullets = (key: 'competitive_bullets' | 'sources_bullets') => {
    const list = s[key]
    const items = list.map((b, i) => `<li><strong>${slot('span', `${key}.${i}.lead`, b.lead)}</strong> ${slot('span', `${key}.${i}.text`, b.text)}${draft && list.length === 3 ? `<button type="button" class="aeo-ctl" data-structure="remove" data-path="${key}.${i}">Remove</button>` : ''}</li>`).join('')
    return UL + items + '</ul>' + (draft && list.length === 2 ? `<button type="button" class="aeo-ctl" data-structure="add" data-path="${key}">Add bullet</button>` : '')
  }

  // The brand slot is used everywhere the brand shows (v1.1 §3). Peec's own name is replaced only when Ryan changed it,
  // so a row he has not renamed renders exactly as before.
  const renamed = s.brand !== data.brand ? s.brand : null
  const shownBrands = renamed ? data.brands.map((b) => (b.isOwn ? { ...b, name: renamed } : b)) : data.brands
  const names = shownBrands.map((b) => b.name).filter(Boolean).sort((a, b) => b.length - a.length)
  /** Bold exact roster names in the raw text (whole words only), escaping every piece. */
  const bolded = (text: string) => {
    if (!names.length) return esc(text)
    const alt = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
    const re = new RegExp(`(?<![A-Za-z0-9])(?:${alt})(?![A-Za-z0-9])`, 'g')
    let out = ''
    let last = 0
    for (const m of text.matchAll(re)) {
      out += esc(text.slice(last, m.index)) + `<strong>${esc(m[0])}</strong>`
      last = m.index! + m[0].length
    }
    return out + esc(text.slice(last))
  }

  const isLong = s.brand.length > 24 // renderer.py:1439-1458, read from the slot (v1.1 §3)
  const kpiCards = s.kpis.map((k, i) => `<div class="kpi-card">${slot('div', `kpis.${i}.label`, k.label, 'kpi-label')}${slot('div', `kpis.${i}.value`, k.value, 'kpi-value')}</div>`).join('')
  const kpiStrip = s.kpis.length === 4 ? '<div class="kpi-strip">' : `<div class="kpi-strip" style="grid-template-columns:repeat(${s.kpis.length}, 1fr)">`
  const t1 = p.section_1_title
  const t2 = p.section_2_title
  const brand = esc(s.brand)
  const chartMark = attr('data-locked', 'chart')

  const sidebar = `
<nav class="sidebar">
  <div class="sidebar-logo">
    ${slot('div', 'page.sidebar_wordmark', p.sidebar_wordmark, 'aivx-brand')}
    ${slot('div', 'page.sidebar_powered', p.sidebar_powered, 'powered')}
  </div>
  <div class="sidebar-industry">
    ${mirror('page.series', p.series)}
    <span${attr('data-mirror', 'brand')}>${brand}</span>
  </div>
  <nav class="sidebar-nav">
    <a href="#headline"><span class="nav-num"${fixedMark}>01</span> ${mirror('page.headline_label', p.headline_label)}</a>
    <a href="#category-data"><span class="nav-num"${fixedMark}>02</span> ${mirror('page.section_1_title', t1)}</a>
    <a href="#competitive-visibility"><span class="nav-num"${fixedMark}>03</span> ${mirror('page.section_2_title', t2)}</a>
    <a href="#opportunities"><span class="nav-num"${fixedMark}>04</span> ${mirror('page.opps_label', p.opps_label)}</a>
    <a href="#methodology"><span class="nav-num"${fixedMark}>05</span> ${wrap('page.method_nav', p.method_nav)}</a>
  </nav>
  <div class="sidebar-footer">${mode === 'final' ? SHARE_BUTTON : ''}
    ${slot('a', 'page.sidebar_link', p.sidebar_link, '', ' href="https://avenuez.com" target="_blank" rel="noopener"')}
  </div>
</nav>`

  const main = `
<header class="hero">
  ${slot('div', 'page.series', p.series, 'hero-series')}
  <h1 class="hero-industry"${isLong ? ' style="font-size:72px"' : ''}>${slot('span', 'brand', s.brand, 'grad-text')}</h1>
  <div class="hero-subtitle">${wrap('page.category_label', p.category_label)} ${slot('span', 'category', s.category)} &nbsp;·&nbsp; ${wrap('page.market_label', p.market_label)} ${slot('span', 'market', s.market)} &nbsp;·&nbsp; ${wrap('page.window_prefix', p.window_prefix)} ${wrap('window_label', s.window_label)}</div>
  <div class="hero-meta">
  </div>
</header>
<section id="headline" class="exec-summary">
  ${slot('div', 'page.headline_label', p.headline_label, 'exec-label')}
  ${slot('div', 'headline', s.headline, 'exec-headline')}
  ${slot('div', 'summary', s.summary, 'exec-subheadline')}
</section>
<section class="section">
  ${kpiStrip}${kpiCards}</div>
  ${data.competitorsTracked > 0 ? slot('div', 'context', s.context, 'insight-box', '', bolded(s.context)) : ''}
</section>
<section id="category-data" class="section">
  <div class="section-label">${fixed('02 / ')}${mirror('page.section_1_title', t1)}</div>
  ${slot('h2', 'page.section_1_title', t1, 'section-title')}
  <div class="two-col" style="margin-top:16px;align-items:stretch">
    <div><div class="insight-box">${bullets('competitive_bullets')}</div></div>
    <div><div class="chart-wrap">${slot('div', 'page.chart_1_title', p.chart_1_title, 'chart-title')}${embedFigure('aeo-chart-sources', sourceDonutFigure(data.sourceMix), chartMark)}</div></div>
  </div>
</section>
<section id="competitive-visibility" class="section">
  <div class="section-label">${fixed('03 / ')}${mirror('page.section_2_title', t2)}</div>
  ${slot('h2', 'page.section_2_title', t2, 'section-title')}
  <div class="two-col" style="margin-top:16px;align-items:stretch">
    <div><div class="insight-box">${bullets('sources_bullets')}</div></div>
    <div><div class="chart-wrap">${slot('div', 'page.chart_2_title', p.chart_2_title, 'chart-title')}${embedFigure('aeo-chart-visibility', visibilityBarFigure(shownBrands), chartMark)}</div></div>
  </div>
</section>
<section class="section">
  <div class="rec-global-bottom-line">
    ${slot('div', 'page.why_title', p.why_title, '', ' style="font-size:18px;font-weight:900;color:var(--white);margin-bottom:12px"')}
    ${slot('p', 'why', s.why, '', ' style="font-size:15px;color:rgba(255,255,255,0.75);line-height:1.75;margin:0"')}
  </div>
</section>
<section id="opportunities" class="section">
  <div class="section-label">${fixed('04 / ')}${wrap('page.opps_label', p.opps_label)}</div>
  ${slot('h2', 'page.opps_title', p.opps_title, 'section-title')}
  <div class="leaderboard-wrap">
    <table class="leaderboard">
      <thead><tr>${slot('th', 'page.opps_col_1', p.opps_col_1)}${slot('th', 'page.opps_col_2', p.opps_col_2)}${slot('th', 'page.opps_col_3', p.opps_col_3)}</tr></thead>
      <tbody>${s.opportunities.map((o, i) => `<tr>${slot('td', `opportunities.${i}.signal`, o.signal)}${slot('td', `opportunities.${i}.opportunity`, o.opportunity)}${slot('td', `opportunities.${i}.workstream`, o.workstream)}</tr>`).join('')}</tbody>
    </table>
  </div>
  ${slot('p', 'page.opps_takeaway', p.opps_takeaway, 'chart-takeaway')}
</section>
<section id="methodology" class="section">
  <div class="method-note">${slot('strong', 'page.method_label', p.method_label)} ${slot('span', 'methodology', s.methodology)} ${slot('strong', 'page.next_label', p.next_label)} ${slot('span', 'next_step', s.next_step)}</div>
</section>
<footer class="footer">
  <div class="footer-grad-line"></div>
  <div class="footer-content">
    <div class="footer-brand">
      ${slot('div', 'page.footer_name', p.footer_name, 'avz-name')}
      ${block('p', 'page.footer_desc', p.footer_desc, 'footer-desc', '', '      ')}
      ${block('a', 'page.footer_link', p.footer_link, 'footer-link', ' href="https://avenuez.com" target="_blank" rel="noopener"', '      ')}
    </div>
    <div>
      <p style="font-size:12px;color:var(--muted);font-weight:700;margin-bottom:6px">
        ${mirror('page.series', p.series.toUpperCase(), true)}
      </p>
      <p style="font-size:13px;color:rgba(255,255,255,0.5)">
        ${mirror('brand', s.brand)}<br>${wrap('page.prepared_label', p.prepared_label)} ${fixed(preparedOn)}
      </p>
    </div>
  </div>
  ${block('p', 'page.footer_disclaimer', p.footer_disclaimer, 'footer-disclaimer', '', '  ')}
</footer>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${AIVX_FAVICON_TAG}
  <title>${esc(p.series)}: ${brand} | Avenue Z</title>
  <script src="https://cdn.plot.ly/plotly-3.5.0.min.js" charset="utf-8" integrity="sha384-DPvk2KODrsA0CfBr4HTwAwhdDROPqqK2PvSSswJMQMpnUkwSTg4gLBxXc3wv2e5L" crossorigin="anonymous"></script>
  <meta name="description" content="${esc(p.series)} for ${brand}. Powered by Avenue Z AEO Intelligence.">
  <meta name="robots" content="noindex,nofollow">
  <style>${AIVX_CSS}</style>${draft ? EDITOR_STYLE : ''}
</head>
<body>
  ${sidebar}
  <div class="main">
    ${main}
  </div>
  <script>${AIVX_JS}</script>${HEADER_CLONE}${mode === 'final' ? `\n${AIVX_SHARE_BLOCK}` : ''}${draft ? FRAME_SCRIPT : ''}
</body>
</html>`
}
```
Run the render and frame tests: PASS.

- [ ] **Step 3: Update the parity golden test**

In `lib/aeo-outbound/v1-compat.test.ts` add `import { AIVX_JS } from './aivx/js'` and `import { HEADER_CLONE_JS } from './render'`, and replace the `v11` helper and the render test with:
```ts
// Deliberate differences from v1.0 (spec v1.1 §9), applied to the frozen v1.0 golden: the donut hover reads Retrievals,
// and the header clone script follows the AIVx script.
const v11 = (html: string) => {
  expect(html.split('Citations: %{value}')).toHaveLength(2)
  const aivx = `<script>${AIVX_JS}</script>`
  expect(html.split(aivx)).toHaveLength(2)
  return html.split('Citations: %{value}').join('Retrievals: %{value}').split(aivx).join(`${aivx}<script>${HEADER_CLONE_JS}</script>`)
}
// The footer description and disclaimer are one slot value each now, rendered on one line where v1.0 wrapped them over
// several; HTML collapses whitespace, so the page reads the same. Every other byte is compared as is.
const squash = (s: string) => s.replace(/\s+/g, ' ')
test('a version 1 row renders its final page as v1.0 did, apart from the deliberate changes', () => {
  expect(squash(renderSnapshotHtml(V1_DATA, V1_SLOTS, 'final', 'Oct 9, 2026'))).toBe(squash(v11(GOLDEN)))
})
```
Run it: PASS.

- [ ] **Step 4: One sandbox everywhere**

- `app/api/aeo-outbound/reports/[id]/view/route.ts`: add `import { REPORT_CSP } from '@/lib/aeo-outbound/sandbox'`; line 12's `'Content-Security-Policy': 'sandbox allow-scripts'` becomes `'Content-Security-Policy': REPORT_CSP`. In its test, lines 85, 108 and 122 expect `'sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox'`.
- `app/snapshot/[token]/route.ts`: add the same import; line 23's `'Content-Security-Policy': 'sandbox allow-scripts'` becomes `'Content-Security-Policy': REPORT_CSP`. In its test, lines 79 and 140 expect `'sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox'` (the exact CSP header).
- `components/aeo-outbound/editor.tsx`: import `REPORT_SANDBOX` from `@/lib/aeo-outbound/sandbox`; on the `<iframe>`, `sandbox="allow-scripts"` becomes `sandbox={REPORT_SANDBOX}` and the class `bg-white` becomes `bg-black` (the white flash, v1.1 §9; Task 10 adds the loading text). In `components/aeo-outbound/editor.test.tsx` line 60 expects `'allow-scripts allow-popups allow-popups-to-escape-sandbox'`.

Run those three test files, then the gate.

- [ ] **Step 5: Gate, commit, push**

Commit every file this task touched, by name, with subject `Render every word as a slot, mirror or fixed marker in draft, and drive edit mode from the frame` and body:
```
Preview and final carry no editing markup; a version 1 row's final page equals v1.0's apart from the donut
hover and the header clone (v1-compat.test.ts).

Edge cases (the frame posts messages across a process boundary; slot text is untrusted):
- external failure: a browser without contenteditable plaintext-only falls back to true with plain-text paste: fix
- operator visibility: none in the frame (no logging from a sandboxed page): decline
- bounds: one delegated listener per event, whatever the number of slots or clones: fix
- input boundaries: Enter and drops are refused in slots; paste is plain text; mirrors only take the cleaned, non-empty value: fix
- state and concurrency: a structural click flushes pending edits before posting structure; mode changes flush and never reload: fix
- security: every value escaped; one sandbox string with no allow-same-origin on the iframe and both CSP headers; parent messages accepted only from the parent window: fix

Co-Authored-By: Claude <model> <noreply@anthropic.com>
```
Push.

---
### Task 8: Opens events on the public link

Covers v1.1 §6 (every counted open also stored as an event with `ua_family`, `likely_automated` and `reason`; the three automated rules; `approved_at` from the live-token read; one statement for the counter and the event inside the 1.5 s budget; no IP and no full user agent), round-2 MINORs 6 and 13. The counting rule itself (HEAD, staff sessions and preview bots are not counted) is unchanged.

**Files:**
- Modify: `lib/aeo-outbound/opens.ts` (append `uaFamily`), `lib/aeo-outbound/opens.test.ts` (append)
- Modify: `app/snapshot/[token]/route.ts:7-8,37-61`, `app/snapshot/[token]/route.test.ts`
- Modify: `lib/aeo-outbound/store.ts` (delete `recordOpenQuery`), `lib/aeo-outbound/store.test.ts` (delete its test, lines 67 to 73, and its import)

**Interfaces:**
- Consumes: `recordOpen(id, now, { uaFamily, linkFresh })`, `getLiveByToken(token)` returning `approvedAt`, `LINK_FRESH_MS`, `OPEN_REASONS` (Task 2).
- Produces: `uaFamily(ua: string | null | undefined): string` (`opens.ts`): `"<Browser> on <System>"`, `"<Browser>"` when the system is unknown, or `"Other"`.

- [ ] **Step 1: Write the failing ua_family tests**

Append to `lib/aeo-outbound/opens.test.ts` (add `LINK_FRESH_MS, OPEN_REASONS, uaFamily` to the import):
```ts
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)'
const WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)'
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)'
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko)'
test.each([
  [`${MAC} Chrome/129.0.0.0 Safari/537.36`, 'Chrome on Mac'],
  [`${WIN} Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0`, 'Edge on Windows'],
  [`${WIN} Chrome/129.0.0.0 Safari/537.36 OPR/114.0.0.0`, 'Opera on Windows'],
  [`${IPHONE} Version/18.0 Mobile/15E148 Safari/604.1`, 'Safari on iOS'],
  [`${IPHONE} CriOS/129.0.6668.69 Mobile/15E148 Safari/604.1`, 'Chrome on iOS'],
  [`${IPHONE} FxiOS/131.0 Mobile/15E148 Safari/605.1.15`, 'Firefox on iOS'],
  [`${IPHONE} EdgiOS/129.0 Mobile/15E148 Safari/605.1.15`, 'Edge on iOS'],
  [`${ANDROID} Chrome/129.0.0.0 Mobile Safari/537.36`, 'Chrome on Android'],
  [`${ANDROID} Chrome/129.0.0.0 Mobile Safari/537.36 EdgA/129.0`, 'Edge on Android'],
  ['Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0', 'Firefox on Linux'],
  [`${MAC} Version/18.0 Safari/605.1.15`, 'Safari on Mac'],
  ['Mozilla/5.0 (Unknown OS) Gecko/20100101 Firefox/131.0', 'Firefox'],
  [`${MAC} HeadlessChrome/129.0.0.0 Safari/537.36`, 'Other'],
  ['curl/8.7.1', 'Other'],
  ['', 'Other'],
])('ua_family patterns: Edge and Opera before Chrome, CriOS is Chrome, FxiOS is Firefox (%s)', (ua, family) => {
  expect(uaFamily(ua)).toBe(family)
})

test('a missing user agent is Other, and the three reasons and the one-minute rule are fixed', () => {
  expect(uaFamily(null)).toBe('Other')
  expect(uaFamily(undefined)).toBe('Other')
  expect(LINK_FRESH_MS).toBe(60_000)
  expect(OPEN_REASONS).toEqual({
    fresh: 'Opened within a minute of the link being created',
    quick: 'Opened within 10 seconds of the previous open',
    unknown: 'Not a known browser',
  })
})
```
Run: `perl -e 'alarm 590; exec @ARGV' -- npx vitest run lib/aeo-outbound/opens.test.ts` (FAIL).

- [ ] **Step 2: Implement `uaFamily`**

Append to `lib/aeo-outbound/opens.ts`:
```ts
// The browser family of an open (spec v1.1 §6), from a fixed pattern list, first match wins. Edge and Opera carry
// "Chrome/" too, so they are tested first; CriOS is Chrome and FxiOS is Firefox (iOS). A headless browser is not a
// browser family. Only the family is stored: never the full user agent.
const BROWSERS: [RegExp, string][] = [
  [/\bEdg(?:e|A|iOS)?\//, 'Edge'],
  [/\bOPR\/|\bOPiOS\/|\bOpera\b/, 'Opera'],
  [/\bFirefox\/|\bFxiOS\//, 'Firefox'],
  [/\bChrome\/|\bCriOS\//, 'Chrome'],
  [/\bSafari\//, 'Safari'],
]
// iOS before Mac (an iPhone says "like Mac OS X"); Android before Linux (Android says "Linux").
const SYSTEMS: [RegExp, string][] = [
  [/iPhone|iPad|iPod/, 'iOS'],
  [/Android/, 'Android'],
  [/Windows/, 'Windows'],
  [/Macintosh|Mac OS X/, 'Mac'],
  [/Linux|X11/, 'Linux'],
]

export function uaFamily(ua: string | null | undefined): string {
  const s = ua ?? ''
  if (/HeadlessChrome/.test(s)) return 'Other'
  const browser = BROWSERS.find(([re]) => re.test(s))?.[1]
  if (!browser) return 'Other'
  const system = SYSTEMS.find(([re]) => re.test(s))?.[1]
  return system ? `${browser} on ${system}` : browser
}
```
Run the opens tests: PASS.

- [ ] **Step 3: Write the failing public route tests**

In `app/snapshot/[token]/route.test.ts`:
- Line 3 becomes `vi.mock('@/lib/aeo-outbound/store', () => ({ getLiveByToken: vi.fn(), recordOpen: vi.fn() }))`.
- Replace every `store.recordOpenQuery` with `store.recordOpen` (lines 29, 45, 66, 88, 94, 100, 115, 122, 131, 147, 149).
- After line 12 add `const APPROVED = new Date('2026-01-01T00:00:00Z')` and change line 28's resolved value to `{ id: ID, html: HTML, approvedAt: APPROVED }` (and line 38's live value the same way: `live ? { id: ID, html: HTML, approvedAt: APPROVED } : undefined`).
- In `'a GET with no cookie is counted without reading the session'` (line 88) the expectation becomes `expect(store.recordOpen).toHaveBeenCalledWith(ID, expect.any(Date), { uaFamily: 'Other', linkFresh: false })`.
- Append:
```ts
test('an open is classified: its browser family, and whether it came within a minute of the link being created', async () => {
  vi.setSystemTime(new Date('2026-10-08T15:00:30Z'))
  vi.mocked(store.getLiveByToken).mockResolvedValue({ id: ID, html: HTML, approvedAt: new Date('2026-10-08T15:00:00Z') })
  const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36'
  await settle(GET(req({ ua }), ctx()))
  expect(store.recordOpen).toHaveBeenLastCalledWith(ID, expect.any(Date), { uaFamily: 'Chrome on Mac', linkFresh: true })
  vi.setSystemTime(new Date('2026-10-08T15:01:01Z'))
  await settle(GET(req({ ua }), ctx()))
  expect(store.recordOpen).toHaveBeenLastCalledWith(ID, expect.any(Date), { uaFamily: 'Chrome on Mac', linkFresh: false })
})

test('the stored event gets the family only: never the IP address or the full user agent', async () => {
  const ua = 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0'
  await settle(GET(new Request('https://app.example/snapshot/' + TOKEN, { headers: { 'user-agent': ua, 'x-forwarded-for': '203.0.113.7' } }), ctx()))
  const args = JSON.stringify(vi.mocked(store.recordOpen).mock.calls)
  expect(args).toContain('Firefox on Linux')
  expect(args).not.toContain('203.0.113.7')
  expect(args).not.toContain('rv:131.0')
})
```
Run: `perl -e 'alarm 590; exec @ARGV' -- npx vitest run "app/snapshot/[token]/route.test.ts"` (FAIL).

- [ ] **Step 4: Implement the route change and remove the old writer**

In `app/snapshot/[token]/route.ts`:
- line 7 becomes `import { hasSessionCookie, LINK_FRESH_MS, shouldCountOpen, uaFamily } from '@/lib/aeo-outbound/opens'`; line 8 becomes `import { getLiveByToken, recordOpen } from '@/lib/aeo-outbound/store'`.
- Replace `recordOpen` (lines 37 to 53, the local function) with:
```ts
/** Counts the open when the viewer is a recipient, as the counter and one event in one statement (v1.1 §6). The session
 *  read and the write share one budget. Never throws. */
async function countOpen(req: Request, found: { id: string; approvedAt: Date | null }): Promise<void> {
  let reason: Reason | null = null
  let expired = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const work = (async () => {
    let staff = false
    if (hasSessionCookie(req.headers)) {
      try { staff = isStaff((await auth())?.user ?? {}) } catch { reason = 'session'; return }
    }
    if (expired || !shouldCountOpen(req, staff)) return
    const now = new Date()
    const linkFresh = found.approvedAt ? now.getTime() - found.approvedAt.getTime() < LINK_FRESH_MS : false
    try { await recordOpen(found.id, now, { uaFamily: uaFamily(req.headers.get('user-agent')), linkFresh }) } catch { reason = 'error' }
  })()
  const budget = new Promise<void>((resolve) => { timer = setTimeout(() => { expired = true; reason ??= 'timeout'; resolve() }, OPEN_BUDGET_MS) })
  try { await Promise.race([work, budget]) } finally { clearTimeout(timer) }
  if (reason) console.warn(`[aeo-outbound] open not recorded id=${found.id} reason=${reason}`)
}
```
- In `GET` (lines 55 to 61) replace `await recordOpen(req, found.id)` with `await countOpen(req, found)`.

In `lib/aeo-outbound/store.ts` delete `recordOpenQuery` (added back in Task 2 only to keep this route compiling); in `lib/aeo-outbound/store.test.ts` delete the test `'recording an open bumps the count on a live link only and leaves updated_at alone'` and `recordOpenQuery` from the import (the one-statement test from Task 2 replaces it).

Run the route, opens and store tests; then the gate.

- [ ] **Step 5: Gate, commit, push**

Commit every file this task touched, by name, with subject `Store every counted open as an event with its browser family and an automated flag` and body:
```
Edge cases (the public route reads an untrusted user agent and writes shared state):
- external failure: a failed or slow write is logged with the report id and the page is still served byte for byte: fix
- operator visibility: the existing "open not recorded" line, with the id and the reason: fix
- bounds: one statement per counted open, inside the 1.5 s budget: fix
- input boundaries: the user agent is matched against a fixed list and only the family is kept: fix
- state and concurrency: the counter and the event come from the same statement, so they agree; two opens in the same instant may miss each other's time: decline, best effort and stated in the hub caveat
- security: no IP address and no full user agent is stored; the token is never logged: fix

Co-Authored-By: Claude <model> <noreply@anthropic.com>
```
Push.

---
### Task 9: Shared UI pieces: failure text, progress, dialog, copy link, structural save-queue items

Covers v1.1 §7 (plain-words failure text per code with the next step and the row id; progress text and the elapsed clock), §11 (in-app dialogs with focus, trap, Escape and focus return; Copy link that awaits the clipboard with a live region and a read-only fallback field), §3 (the save queue's structural items: pending edits first, then the structural PATCH with the current revision, the returned revision taken like any save), round-2 MINORs 9 and 13, Review Focus 1.

**Files:**
- Create: `components/aeo-outbound/ui.ts`, `components/aeo-outbound/failure-text.ts`, `components/aeo-outbound/failure-text.test.ts`, `components/aeo-outbound/progress.ts`, `components/aeo-outbound/progress.test.ts`, `components/aeo-outbound/confirm-dialog.tsx`, `components/aeo-outbound/confirm-dialog.test.tsx`, `components/aeo-outbound/copy-link.tsx`, `components/aeo-outbound/copy-link.test.tsx`
- Modify: `components/aeo-outbound/hub.tsx:35-37` (move the class names to `ui.ts`, re-export), `components/aeo-outbound/messages.ts` (append), `components/aeo-outbound/save-queue.ts:5-97`, `components/aeo-outbound/save-queue.test.ts` (append)
- Modify: `lib/aeo-outbound/metrics.ts` (append `fmtEasternDateTime`), `lib/aeo-outbound/metrics.test.ts` (append)

**Interfaces:**
- Consumes: `MAX_WINDOW_DAYS` (`config.ts:34`); `ErrorCode` (Task 1).
- Produces:
  - `ui.ts`: `cardCls`, `btnCls`, `primaryBtnCls`, `inputCls` (hub.tsx re-exports `cardCls` and `btnCls`)
  - `failure-text.ts`: `failureText(code: string | null, error: string | null, id: string): string`
  - `progress.ts`: `PULLING = 'Pulling Peec data…'`, `WRITING = 'Writing the copy…'`, `USUALLY = 'Usually 35 to 45 seconds'`, `KEEP_OPEN = 'Keep this tab open until it finishes.'`, `elapsedLabel(ms: number): string`, `progressText(step: number, startedAtIso: string, nowMs: number): string`
  - `confirm-dialog.tsx`: `ConfirmDialog(props: ConfirmDialogProps)` with `{ title: string; children?: ReactNode; confirmLabel: string; cancelLabel: string; onConfirm: () => void; onCancel: () => void; busy?: boolean; error?: string | null; confirmDisabled?: boolean; initialFocus?: 'cancel' | 'input' }`
  - `copy-link.tsx`: `CopyLink({ url, showField }: { url: string; showField?: boolean })`
  - `save-queue.ts`: `SaveState` gains `structuring: boolean`; `SaveQueue.structure(path: string): void`
  - `messages.ts`: `COPY_LINK`, `COPIED`, `LINK_COPIED`, `COPY_FAILED`, `LINK_FIELD`, `BAD_REQUEST`, `OPENS_CAVEAT`
  - `metrics.ts`: `fmtEasternDateTime(d: Date): string` (for example `Oct 2, 2026, 11:00 AM`)

- [ ] **Step 1: Write the failing tests**

Create `components/aeo-outbound/failure-text.test.ts`:
```ts
import { expect, test } from 'vitest'
import { ERROR_CODES } from '@/lib/aeo-outbound/error-codes'
import { failureText } from './failure-text'

const ID = '00000000-0000-4000-8000-000000000001'
test.each([
  ['no_project', "This Peec project isn't available any more. Pick another."],
  ['own_brand_count', "In Peec, mark exactly one brand as the client's own brand, then Rerun."],
  ['no_data', 'Peec has no data for this project in that period. Pick other dates.'],
  ['own_brand_no_row', "Peec's report for this period is empty. Pick other dates or check the project in Peec."],
  ['zero_retrievals', "Peec's report for this period is empty. Pick other dates or check the project in Peec."],
  ['history_too_long', 'Peec took too long on the full history. Pick a start and end date (90 days at most) and generate again.'],
  ['timeout', 'Peec or the copy writer took too long. Rerun.'],
  ['copy_failed', `Writing the copy failed. Rerun. If it fails twice, send engineering this id: ${ID}.`],
  ['copy_outside_sources', `Writing the copy failed. Rerun. If it fails twice, send engineering this id: ${ID}.`],
  ['peec_error', 'Peec returned an error. Rerun in a few minutes.'],
  ['contract_violation', `Peec's data changed shape (peec.brands_report.visibility). Send engineering this id: ${ID}.`],
  ['stale', 'It stopped before finishing. Rerun.'],
  ['internal', `Something went wrong on our side. Rerun, or send engineering this id: ${ID}.`],
])('the code-to-text map: %s', (code, text) => {
  expect(failureText(code, 'peec.brands_report.visibility', ID)).toBe(text)
})
test('every error code has its own words, and a row with no code shows its stored text', () => {
  for (const c of ERROR_CODES) expect(failureText(c, 'stored', ID)).not.toBe('stored')
  expect(failureText(null, 'Copy generation failed. Rerun.', ID)).toBe('Copy generation failed. Rerun.')
  expect(failureText('some_future_code', 'Stored text.', ID)).toBe('Stored text.')
  expect(failureText(null, null, ID)).toBe('')
})
```

Create `components/aeo-outbound/progress.test.ts`:
```ts
import { expect, test } from 'vitest'
import { elapsedLabel, progressText } from './progress'

const START = '2026-10-08T15:00:00.000Z'
const at = (s: number) => Date.parse(START) + s * 1000
test('steps 0 to 8 read Pulling Peec data, step 9 Writing the copy, with minutes and seconds', () => {
  expect(progressText(4, START, at(18))).toBe('Pulling Peec data… 0:18')
  expect(progressText(0, START, at(2))).toBe('Pulling Peec data… 0:02')
  expect(progressText(9, START, at(41))).toBe('Writing the copy… 0:41')
  expect(progressText(9, START, at(65))).toBe('Writing the copy… 1:05')
})
test('a client clock behind the server shows 0:00', () => {
  expect(progressText(1, START, at(-5))).toBe('Pulling Peec data… 0:00')
  expect(elapsedLabel(Number.NaN)).toBe('0:00')
  expect(progressText(1, 'not a date', at(5))).toBe('Pulling Peec data… 0:00')
})
```

Create `components/aeo-outbound/confirm-dialog.test.tsx`:
```tsx
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { ConfirmDialog } from './confirm-dialog'

afterEach(() => cleanup())
function Harness({ onConfirm = vi.fn() }: { onConfirm?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Revoke</button>
      {open && (
        <ConfirmDialog title="Revoke the link for Acme sent to Jane Doe? It stops working right away and can't be turned back on." confirmLabel="Revoke link" cancelLabel="Keep link" onConfirm={onConfirm} onCancel={() => setOpen(false)} />
      )}
    </>
  )
}
test('the dialog names the consequence, focuses the safe button, traps focus, closes on Escape and returns focus', () => {
  render(<Harness />)
  const opener = screen.getByRole('button', { name: 'Revoke' })
  opener.focus()
  fireEvent.click(opener)
  const dialog = screen.getByRole('dialog')
  expect(dialog).toHaveTextContent("Revoke the link for Acme sent to Jane Doe? It stops working right away and can't be turned back on.")
  const keep = screen.getByRole('button', { name: 'Keep link' })
  const revoke = screen.getByRole('button', { name: 'Revoke link' })
  expect(document.activeElement).toBe(keep)
  revoke.focus()
  fireEvent.keyDown(dialog, { key: 'Tab' })
  expect(document.activeElement).toBe(keep)
  fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
  expect(document.activeElement).toBe(revoke)
  fireEvent.keyDown(dialog, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(document.activeElement).toBe(opener)
})
test('the verb button confirms; busy disables both and Escape', () => {
  const onConfirm = vi.fn()
  render(<Harness onConfirm={onConfirm} />)
  fireEvent.click(screen.getByRole('button', { name: 'Revoke' }))
  fireEvent.click(screen.getByRole('button', { name: 'Revoke link' }))
  expect(onConfirm).toHaveBeenCalledTimes(1)
  cleanup()
  const onCancel = vi.fn()
  render(<ConfirmDialog title="t" confirmLabel="Go" cancelLabel="Stop" onConfirm={vi.fn()} onCancel={onCancel} busy />)
  expect(screen.getByRole('button', { name: 'Go' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Stop' })).toBeDisabled()
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
  expect(onCancel).not.toHaveBeenCalled()
})
```

Create `components/aeo-outbound/copy-link.test.tsx`:
```tsx
import { afterEach, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { CopyLink } from './copy-link'

const URL_ = 'https://app.example/snapshot/tok_123'
afterEach(() => { cleanup(); vi.useRealTimers() })
const clip = (writeText: () => Promise<void>) => Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn(writeText) }, configurable: true })

test('Copy link awaits the clipboard, says Copied for 2 seconds and announces it', async () => {
  clip(async () => {})
  vi.useFakeTimers()
  render(<CopyLink url={URL_} />)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy link' })) })
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith(URL_)
  expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('Link copied')
  await act(async () => { vi.advanceTimersByTime(2000) })
  expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument()
})

test("a clipboard failure says so and shows the link in a read-only field", async () => {
  clip(async () => { throw new Error('denied') })
  render(<CopyLink url={URL_} />)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy link' })) })
  expect(screen.getByText("Couldn't copy. Select the link and copy it.")).toBeInTheDocument()
  const field = screen.getByRole('textbox', { name: 'Link' })
  expect(field).toHaveValue(URL_)
  expect(field).toHaveAttribute('readonly')
})

test('showField shows the link next to the button from the start', () => {
  render(<CopyLink url={URL_} showField />)
  expect(screen.getByRole('textbox', { name: 'Link' })).toHaveValue(URL_)
})
```

Append to `components/aeo-outbound/save-queue.test.ts`:
```ts
test('a structural item waits for every pending edit, then goes out with the revision the last save returned', async () => {
  const calls: [string, string, number][] = []
  let rev = 3
  const send = vi.fn(async (p: string, v: string, r: number): Promise<SendResult> => { calls.push([p, v, r]); return { kind: 'ok', revision: ++rev } })
  const states: boolean[] = []
  const q = new SaveQueue(send, 3, (s) => states.push(s.structuring))
  q.markDirty('headline'); q.edit('headline', 'a')
  q.structure('competitive_bullets.add')
  expect(q.state.structuring).toBe(true)
  await flush()
  expect(calls).toEqual([['headline', 'a', 3], ['competitive_bullets.add', 'structure', 4]])
  expect(q.state).toMatchObject({ structuring: false, dirty: false, saving: false, revision: 5 })
  expect(states).toContain(true)
})

test('a refused structural item is dropped with its error; a stop stops it', async () => {
  const q = new SaveQueue(vi.fn(async (): Promise<SendResult> => ({ kind: 'bad', error: 'A list needs at least two bullets.' })), 0, () => {})
  q.structure('sources_bullets.0.remove')
  await flush()
  expect(q.state).toMatchObject({ structuring: false, error: 'A list needs at least two bullets.' })
  const stopped = new SaveQueue(vi.fn(async (): Promise<SendResult> => ({ kind: 'stop' })), 0, () => {})
  stopped.structure('sources_bullets.add')
  await flush()
  expect(stopped.state).toMatchObject({ stopped: true, error: 'This snapshot changed. Reload.' })
})
```

Append to `lib/aeo-outbound/metrics.test.ts` (add `fmtEasternDateTime` to the import):
```ts
test('date and time in US Eastern, for the hub and the open list', () => {
  expect(fmtEasternDateTime(new Date('2026-10-02T15:00:00Z'))).toBe('Oct 2, 2026, 11:00 AM')
  expect(fmtEasternDateTime(new Date('2026-01-15T17:05:00Z'))).toBe('Jan 15, 2026, 12:05 PM')
})
```
Run: `perl -e 'alarm 590; exec @ARGV' -- npx vitest run components/aeo-outbound/failure-text.test.ts components/aeo-outbound/progress.test.ts components/aeo-outbound/confirm-dialog.test.tsx components/aeo-outbound/copy-link.test.tsx components/aeo-outbound/save-queue.test.ts lib/aeo-outbound/metrics.test.ts` (FAIL).

- [ ] **Step 2: Implement**

Create `components/aeo-outbound/ui.ts`:
```ts
// Class names shared by the hub, the editor, the dialogs and the settings page (dashboard look, app/tools/reporting/page.tsx:7-8).
export const cardCls = 'rounded-lg border border-white/[0.06] bg-bg-surface p-5'
export const btnCls = 'rounded-md border border-white/[0.08] px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50'
export const primaryBtnCls = 'rounded-md bg-white px-3 py-1 text-xs font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50'
export const inputCls = 'rounded-md border border-white/[0.08] bg-bg-base px-2 py-1.5 text-sm text-white'
```
In `components/aeo-outbound/hub.tsx` replace lines 35 to 37 with `import { btnCls, cardCls, inputCls } from './ui'` (placed with the other imports) and `export { btnCls, cardCls }`.

Append to `components/aeo-outbound/messages.ts`:
```ts
/** v1.1 §11: Copy link. */
export const COPY_LINK = 'Copy link'
export const COPIED = 'Copied'
export const LINK_COPIED = 'Link copied'
export const COPY_FAILED = "Couldn't copy. Select the link and copy it."
export const LINK_FIELD = 'Link'
/** v1.1 §9: a 400 bad-request shows its own message. */
export const BAD_REQUEST = "That request wasn't valid. Refresh the page and try again."
/** v1.1 §6: the visible caveat next to every open count (best effort, round-2 MINOR 6). */
export const OPENS_CAVEAT = 'Email security scanners can open links automatically. Opens marked automated are likely scanners. The marking is best effort.'
```

Create `components/aeo-outbound/failure-text.ts`:
```ts
// A failed generation's reason in plain words with the next step (spec v1.1 §7). The code travels on the row; the UI knows
// the row id. A row with no code (generated before v1.1) or a code this build does not know shows its stored text.
import { MAX_WINDOW_DAYS } from '@/lib/aeo-outbound/config'

export function failureText(code: string | null, error: string | null, id: string): string {
  switch (code) {
    case 'no_project': return "This Peec project isn't available any more. Pick another."
    case 'own_brand_count': return "In Peec, mark exactly one brand as the client's own brand, then Rerun."
    case 'no_data': return 'Peec has no data for this project in that period. Pick other dates.'
    case 'own_brand_no_row':
    case 'zero_retrievals': return "Peec's report for this period is empty. Pick other dates or check the project in Peec."
    case 'history_too_long': return `Peec took too long on the full history. Pick a start and end date (${MAX_WINDOW_DAYS} days at most) and generate again.`
    case 'timeout': return 'Peec or the copy writer took too long. Rerun.'
    case 'copy_failed':
    case 'copy_outside_sources': return `Writing the copy failed. Rerun. If it fails twice, send engineering this id: ${id}.`
    case 'peec_error': return 'Peec returned an error. Rerun in a few minutes.'
    case 'contract_violation': return `Peec's data changed shape (${error ?? 'unknown field'}). Send engineering this id: ${id}.`
    case 'stale': return 'It stopped before finishing. Rerun.'
    case 'internal': return `Something went wrong on our side. Rerun, or send engineering this id: ${id}.`
    default: return error ?? ''
  }
}
```

Create `components/aeo-outbound/progress.ts`:
```ts
// What a generating row shows (spec v1.1 §7): the step in words and the time since it started. Usually 35 to 45 seconds
// (measured: 34.7 s in the dev run, 35.8 s and 40.6 s in the trials).
export const PULLING = 'Pulling Peec data…'
export const WRITING = 'Writing the copy…'
export const USUALLY = 'Usually 35 to 45 seconds'
/** Whether a generation survives a closed tab is unverified (main spec §7a), so the copy says to keep it open. */
export const KEEP_OPEN = 'Keep this tab open until it finishes.'

/** m:ss, never negative: a browser clock behind the server shows 0:00. */
export function elapsedLabel(ms: number): string {
  const s = Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 1000)) : 0
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Steps 0 to 8 are the Peec pull; 9 is the copy (generate.ts WRITING_STEP). */
export function progressText(step: number, startedAtIso: string, nowMs: number): string {
  return `${step >= 9 ? WRITING : PULLING} ${elapsedLabel(nowMs - Date.parse(startedAtIso))}`
}
```

Create `components/aeo-outbound/confirm-dialog.tsx`:
```tsx
'use client'
// The in-app dialog that replaces every window.confirm (spec v1.1 §11): it names the consequence, uses verb buttons,
// focuses the safe button (or the first field), keeps Tab inside, closes on Escape and gives focus back to the opener.
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { btnCls, cardCls } from './ui'

export interface ConfirmDialogProps {
  title: string
  children?: ReactNode
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
  onCancel: () => void
  busy?: boolean
  error?: string | null
  confirmDisabled?: boolean
  initialFocus?: 'cancel' | 'input'
}

export function ConfirmDialog(p: ConfirmDialogProps) {
  const ref = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (p.initialFocus === 'input') ref.current?.querySelector<HTMLElement>('input,textarea')?.focus()
    else cancelRef.current?.focus()
    return () => { opener?.focus() }
    // Runs once per opening: focus moves in on open and back out on close.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.preventDefault()
      if (!p.busy) p.onCancel()
      return
    }
    if (e.key !== 'Tab' || !ref.current) return
    const items = [...ref.current.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),a[href]')]
    if (!items.length) return
    const first = items[0]
    const last = items[items.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="aeo-dialog-title" onKeyDown={onKeyDown} className={`${cardCls} w-full max-w-md`}>
        <p id="aeo-dialog-title" className="mb-4 text-sm text-white">{p.title}</p>
        {p.children}
        {p.error && <p role="alert" className="mt-2 text-xs text-[#FF6B6B]">{p.error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button ref={cancelRef} type="button" className={btnCls} disabled={p.busy} onClick={p.onCancel}>{p.cancelLabel}</button>
          <button type="button" className={btnCls} disabled={p.busy || p.confirmDisabled} onClick={p.onConfirm}>{p.confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
```

Create `components/aeo-outbound/copy-link.tsx`:
```tsx
'use client'
// Copy link with feedback (spec v1.1 §11): it awaits the clipboard, says Copied for 2 seconds and announces it; on
// failure it says so and shows the link in a read-only field to copy by hand.
import { useEffect, useState } from 'react'
import { COPIED, COPY_FAILED, COPY_LINK, LINK_COPIED, LINK_FIELD } from './messages'
import { btnCls, inputCls } from './ui'

export function CopyLink({ url, showField = false }: { url: string; showField?: boolean }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  useEffect(() => {
    if (state !== 'copied') return
    const t = setTimeout(() => setState('idle'), 2000)
    return () => clearTimeout(t)
  }, [state])
  async function copy() {
    try {
      if (!navigator.clipboard) throw new Error('no clipboard')
      await navigator.clipboard.writeText(url)
      setState('copied')
    } catch {
      setState('failed')
    }
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {(showField || state === 'failed') && (
        <input readOnly aria-label={LINK_FIELD} value={url} onFocus={(e) => e.currentTarget.select()} className={`${inputCls} w-72 text-xs`} />
      )}
      <button type="button" className={btnCls} onClick={() => void copy()}>{state === 'copied' ? COPIED : COPY_LINK}</button>
      {state === 'failed' && <span className="text-xs text-[#FF6B6B]">{COPY_FAILED}</span>}
      <span role="status" aria-live="polite" className="sr-only">{state === 'copied' ? LINK_COPIED : ''}</span>
    </span>
  )
}
```

Replace `components/aeo-outbound/save-queue.ts` with (the v1.0 behaviour is unchanged; the additions are `structuring`, `structure()` and the structural branch of `run`):
```ts
// The editor's single save queue (spec §9a, v1.1 §3): one PATCH at a time, newest value per path, the revision from each
// 200 carried into the next request. A field is dirty from its first keystroke until an edit sent after its last
// keystroke is saved, so Approve (disabled while dirty or saving) can never approve text Ryan is still typing.
// A 400 belongs to its own field: it is recorded, the field stays dirty, and every other pending field still sends.
// A structural item (a bullet add or remove) goes out after every pending edit, with the current revision; its 200's
// revision is taken like any save's, so the next keystroke carries the right one.
export type SendResult = { kind: 'ok'; revision: number } | { kind: 'bad'; error: string } | { kind: 'stop' } | { kind: 'retry' }
// badPaths: the fields with an outstanding 400, oldest first, so the newest is the one `error` describes.
export interface SaveState { dirty: boolean; saving: boolean; structuring: boolean; revision: number; error: string | null; stopped: boolean; badPaths: string[] }
export const RETRY_MESSAGE = "Couldn't save, retrying"
const BACKOFF = [1000, 2000, 4000]
type Item = { value: string; stamp: number }

export class SaveQueue {
  private pending = new Map<string, Item>()
  private typed = new Map<string, number>()
  private dirtyPaths = new Set<string>()
  private bad = new Map<string, string>()
  private structural: string[] = []
  private running = false
  private waiting = false
  private attempt = 0
  state: SaveState

  constructor(
    private readonly send: (path: string, value: string, revision: number) => Promise<SendResult>,
    revision: number,
    private readonly onState: (s: SaveState) => void,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {
    this.state = { dirty: false, saving: false, structuring: false, revision, error: null, stopped: false, badPaths: [] }
  }

  private set(p: Partial<SaveState>) {
    this.state = {
      ...this.state, ...p,
      dirty: this.dirtyPaths.size > 0 || this.pending.size > 0 || this.bad.size > 0,
      structuring: this.structural.length > 0,
      badPaths: [...this.bad.keys()],
    }
    this.onState(this.state)
  }

  // The message of the most recently recorded 400 that is still outstanding, or null.
  private outstandingBad(): string | null {
    let last: string | null = null
    for (const m of this.bad.values()) last = m
    return last
  }

  markDirty(path: string) {
    if (this.state.stopped) return
    this.typed.set(path, (this.typed.get(path) ?? 0) + 1)
    this.dirtyPaths.add(path)
    this.set({})
  }

  edit(path: string, value: string) {
    if (this.state.stopped) return
    this.bad.delete(path)
    this.pending.delete(path)
    this.pending.set(path, { value, stamp: this.typed.get(path) ?? 0 })
    this.set({ error: this.waiting || this.attempt > 0 ? RETRY_MESSAGE : this.outstandingBad() })
    void this.run()
  }

  structure(path: string) {
    if (this.state.stopped) return
    this.structural.push(path)
    this.set({})
    void this.run()
  }

  stop(message: string) { this.set({ stopped: true, saving: false, error: message }) }

  private async run() {
    if (this.running) return
    this.running = true
    try {
      while ((this.pending.size || this.structural.length) && !this.state.stopped) {
        const isStructure = this.pending.size === 0
        const [path, item]: [string, Item] = isStructure
          ? [this.structural[0], { value: 'structure', stamp: 0 }]
          : (this.pending.entries().next().value as [string, Item])
        this.set({ saving: true })
        const r = await Promise.resolve().then(() => this.send(path, item.value, this.state.revision)).catch((): SendResult => ({ kind: 'retry' }))
        if (this.state.stopped) return
        if (r.kind === 'ok') {
          if (isStructure) {
            this.structural.shift()
          } else {
            if (this.pending.get(path) === item) this.pending.delete(path)
            if ((this.typed.get(path) ?? 0) === item.stamp && !this.pending.has(path)) this.dirtyPaths.delete(path)
          }
          this.attempt = 0
          this.set({ revision: r.revision, saving: false, error: this.outstandingBad() })
        } else if (r.kind === 'bad') {
          this.attempt = 0
          if (isStructure) {
            // A refused structure (a list already at its limit) is dropped and its reason shown.
            this.structural.shift()
            this.set({ saving: false, error: r.error })
            continue
          }
          // Only this field is refused. It stays dirty until Ryan changes that text; the others keep sending.
          if (this.pending.get(path) === item) {
            this.pending.delete(path)
            this.bad.delete(path)
            this.bad.set(path, r.error)
          }
          this.set({ saving: false, error: this.outstandingBad() })
        } else if (r.kind === 'stop') {
          this.stop('This snapshot changed. Reload.')
          return
        } else {
          this.set({ saving: false, error: RETRY_MESSAGE })
          this.waiting = true
          try { await this.sleep(BACKOFF[this.attempt] ?? 10_000) } finally { this.waiting = false }
          this.attempt++
        }
      }
    } finally {
      this.running = false
    }
  }
}
```

Append to `lib/aeo-outbound/metrics.ts`:
```ts
/** 'Oct 2, 2026, 11:00 AM' in US Eastern, for the hub and the open list (spec v1.1 §5, §6). */
export function fmtEasternDateTime(d: Date): string {
  const time = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }).format(d).replace(/ /g, ' ')
  return `${fmtEasternDay(d)}, ${time}`
}
```
Run the six test files: PASS.

- [ ] **Step 3: Gate, commit, push**

Commit every file this task touched, by name, with subject `Add failure texts, progress, the in-app dialog, Copy link feedback and structural save-queue items` and body:
```
Edge cases (the save queue sends structural PATCHes; the clipboard is an external API):
- external failure: a clipboard that throws or is missing shows the link in a read-only field: fix
- operator visibility: a refused structure shows its reason: fix
- bounds: the queue sends one request at a time, structural items included: fix
- input boundaries: a browser clock behind the server shows 0:00, never a negative time: fix
- state and concurrency: a structural item goes after every pending edit and takes the returned revision, so the next keystroke carries the right one: fix
- security: none new: decline

Co-Authored-By: Claude <model> <noreply@anthropic.com>
```
Push.

---
### Task 10: The editor

Covers v1.1 §2 (the Edit button, Preview by default, Done editing, the banner, locked messages for 3 seconds, Edit a copy with its hint on Live and Revoked, the ready and mode handshake, path required only for dirty, edit and structure, structural items through the queue with the frame read-only meanwhile and a reload after), §4 (the "Before you send" panel: open by default on a draft, live count, the four groups, plain-words labels, Looks right ticks per session and cleared for a list after a structural change, click to focus, About this data, re-sync on status or revision change, Approve that opens the panel instead of being disabled), §6 (the open list for Live and Revoked), §7 (progress and plain failure text), §9 (the black loading frame), §11 (dialogs, Copy link, the leave dialog), round-2 MINORs 5 and 15.

**Files:**
- Create: `components/aeo-outbound/before-you-send.tsx`
- Modify: `components/aeo-outbound/editor.tsx:1-349` (full replacement), `components/aeo-outbound/editor.test.tsx`
- Modify: `components/aeo-outbound/messages.ts` (append)
- Modify: `lib/aeo-outbound/store.ts` (append `failureCode`), `lib/aeo-outbound/store.test.ts` (append)
- Modify: `app/tools/new-business/[reportId]/page.tsx:1-43`

**Interfaces:**
- Consumes: the frame protocol (Task 7); `SaveQueue.structure`, `SaveState.structuring` (Task 9); `ConfirmDialog`, `CopyLink`, `failureText`, `progressText`, `KEEP_OPEN`, `USUALLY`, `OPENS_CAVEAT` (Task 9); `fieldLabel` (Task 6); `isStructuralPath`, `cleanValue`, `withDefaults`, `needsValidationPaths` (Task 6); `noteGroup`, `noteText`, `isStoredNotes`, `StoredNote` (Task 3); `opensForReportQuery` (Task 2); `REPORT_SANDBOX` (Task 7); `fmtEasternDateTime` (Task 9); `outboundAccess` (Task 5).
- Produces:
  - `before-you-send.tsx`: `interface AboutInfo { projectId: string; projectName: string; projectStatus: string | null; windowLabel: string; models: string[] }`, `OWN_CHECKS`, `tickKey(n: StoredNote): string`, `openCount(needsValidation: string[], notes: StoredNote[], ticks: ReadonlySet<string>): number`, `aboutHeader(a: AboutInfo): string`, `BeforeYouSend(props)`
  - `editor.tsx`: `interface OpenEvent { openedAt: string; uaFamily: string; likelyAutomated: boolean; reason: string | null }`, `interface OutboundEditorProps { id; brand; projectId; status: DisplayStatus; revision; notes: StoredNote[]; needsValidation: string[]; token: string | null; error: string | null; errorCode: string | null; recipient: string | null; sectionTitles: [string, string]; about: AboutInfo | null; opens: OpenEvent[]; openCount: number; needsValidationBlocksApprove: boolean; unreadable: boolean; progressStep: number; createdAt: string }`
  - `store.ts`: `failureCode(row: Pick<AeoOutboundRow, 'status' | 'createdAt' | 'errorCode'>, nowMs: number): string | null`

- [ ] **Step 1: Messages**

Append to `components/aeo-outbound/messages.ts`:
```ts
/** v1.1 §2: the Edit button, its states, the banner and the locked messages. */
export const EDIT = 'Edit'
export const DONE_EDITING = 'Done editing'
export const EDIT_COPY = 'Edit a copy'
export const EDIT_COPY_HINT = 'This report is frozen. Editing makes a new draft.'
export const EDIT_BANNER = 'Editing. Click any outlined text to change it. Changes save automatically. Charts come from Peec: to change them, change the dates and Rerun.'
export const LOCKED_CHART = 'Charts come from Peec data. Change the dates and Rerun to update them.'
export const LOCKED_FIXED = 'This part is set automatically.'
export const LOCKED_MIRROR = 'Edit this where it first appears on the page.'
/** v1.1 §4: the Before you send panel. */
export const BEFORE_YOU_SEND = 'Before you send'
export const FILL_THESE = 'Fill these in'
export const CHECK_THESE = 'Check these'
export const OWN_CHECKS_TITLE = 'Your own checks'
export const ABOUT_DATA = 'About this data'
export const LOOKS_RIGHT = 'Looks right'
export const NOTHING_TO_FILL = 'Nothing to fill in.'
export const NOTHING_TO_CHECK = 'Nothing to check.'
export const fillFirst = (n: number): string => (n === 1 ? 'Fill in 1 item first' : `Fill in ${n} items first`)
/** v1.1 §11: dialogs with verb buttons that name the brand, the recipient and the consequence. */
export const APPROVE_AND_CREATE = 'Approve and create link'
export const CANCEL = 'Cancel'
export const revokeTitle = (brand: string, recipient: string | null): string =>
  `Revoke the link for ${brand}${recipient ? ` sent to ${recipient}` : ''}? It stops working right away and can't be turned back on.`
export const REVOKE_LINK = 'Revoke link'
export const KEEP_LINK = 'Keep link'
export const discardTitle = (brand: string): string => `Discard the snapshot for ${brand}? It is removed from the hub.`
export const DISCARD_SNAPSHOT = 'Discard snapshot'
export const KEEP_SNAPSHOT = 'Keep snapshot'
export const rerunTitle = (brand: string): string => `Rerun ${brand}? This makes a new draft with fresh Peec data and new copy. This draft stays as it is.`
export const MAKE_NEW_DRAFT = 'Make a new draft'
export const KEEP_DRAFT = 'Keep this draft'
export const LEAVE = 'Leave'
export const STAY = 'Stay'
/** v1.1 §9 and §10. */
export const LOADING_REPORT = 'Loading report…'
export const UNREADABLE = "This snapshot was saved by an older version and can't be shown. Rerun it."
/** v1.1 §6: the open list. */
export const OPENS_TITLE = 'Opens'
export const NO_OPENS = 'No opens yet.'
export const PERSON = 'Person'
export const AUTOMATED = 'Automated'
export const notClassified = (n: number): string => `${n} not classified`
```
(`LEAVE_UNSAVED` at line 47 is reused as the leave dialog's title. `REVOKE_CONFIRM` and `DISCARD_CONFIRM` stay until Task 11 moves the hub to the dialog, then Task 11 deletes them.)

- [ ] **Step 2: Write the failing editor tests**

In `components/aeo-outbound/editor.test.tsx`:
- Line 2 adds `within` to the testing-library import; add `import type { StoredNote } from '@/lib/aeo-outbound/notes'`.
- Replace `base` (lines 35 to 38) with:
```ts
const base: Props = {
  id: ID, brand: 'Acme', projectId: 'p1', status: 'draft', revision: 4,
  notes: ['Window used: Sep 1, 2026 to Sep 30, 2026'], needsValidation: [], token: null, error: null, errorCode: null, recipient: null,
  sectionTitles: ['Category data', 'Competitive visibility'], about: null, opens: [], openCount: 0,
  needsValidationBlocksApprove: true, unreadable: false, progressStep: 0, createdAt: '2026-10-08T15:00:00.000Z',
}
const panel = () => screen.getByRole('complementary', { name: 'Before you send' })
```
- In `'a draft loads the editable view into a sandboxed iframe'` add at the end: `expect(within(screen.getByRole('toolbar', { name: 'Snapshot actions' })).getAllByRole('button')[0]).toHaveTextContent('Edit')`.
- Replace `'Approve is disabled while Needs validation remains, and enables after a save returns none'` (lines 89 to 96) with:
```ts
test('Approve with open Fill these in items opens the panel at the first one and says how many', async () => {
  await setup({ needsValidation: ['market', 'category'] })
  fireEvent.click(screen.getByRole('button', { name: /^Before you send/ }))
  expect(screen.queryByRole('complementary', { name: 'Before you send' })).not.toBeInTheDocument()
  expect(approveBtn()).toBeEnabled()
  fireEvent.click(approveBtn())
  expect(screen.getByText('Fill in 2 items first')).toBeInTheDocument()
  expect(within(panel()).getByRole('button', { name: 'Market: Needs validation' })).toHaveAttribute('aria-current', 'true')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('one open item reads Fill in 1 item first; a build where Needs validation does not block opens the dialog', async () => {
  await setup({ needsValidation: ['market'] })
  fireEvent.click(approveBtn())
  expect(screen.getByText('Fill in 1 item first')).toBeInTheDocument()
  cleanup()
  await setup({ needsValidation: ['market'], needsValidationBlocksApprove: false })
  fireEvent.click(approveBtn())
  expect(await screen.findByRole('dialog')).toBeInTheDocument()
})
```
- Replace `"a save's response replaces the notes in the drawer"` (lines 98 to 106) with:
```ts
test("a save's response replaces the panel's items, named in plain words", async () => {
  patch = async () => json(200, { revision: 5, notes: [{ kind: 'number_not_in_data', path: 'why', text: '"41%" is not in the Peec data' }], needsValidation: [] })
  const { iframe } = await setup()
  expect(within(panel()).getByText('Window used: Sep 1, 2026 to Sep 30, 2026')).toBeInTheDocument()
  await fromFrame(iframe, { type: 'edit', path: 'summary', value: 'x' })
  expect(await within(panel()).findByText('Why it matters: "41%" is not in the Peec data')).toBeInTheDocument()
  expect(within(panel()).queryByText('Window used: Sep 1, 2026 to Sep 30, 2026')).not.toBeInTheDocument()
})
```
- In `'a 400 names the refused field in the save state'` (line 113) the expected text becomes `'Category data, bullet 1, bold lead-in: Keep this under 80 characters.'`.
- In every test that clicks the approve dialog's `Confirm` button (lines 150, 155, 173, 250, 266, 274, 312) the button name becomes `'Approve and create link'`. In `'the Approve dialog shows the confirm text and requires who it is for'` add after line 160: `expect(screen.getByRole('textbox', { name: 'Link' })).toHaveValue(`${window.location.origin}/snapshot/tok_123`)`.
- Replace `'Rerun posts the project and this id to generate and opens the new draft'` (lines 178 to 183) with:
```ts
test('Rerun over a draft asks first in the in-app dialog, then posts the project and this id; on a live row it does not ask', async () => {
  await setup()
  fireEvent.click(screen.getByRole('button', { name: 'Rerun' }))
  expect(screen.getByRole('dialog')).toHaveTextContent('Rerun Acme? This makes a new draft with fresh Peec data and new copy. This draft stays as it is.')
  fireEvent.click(screen.getByRole('button', { name: 'Make a new draft' }))
  await waitFor(() => expect(push).toHaveBeenCalledWith(`/tools/new-business/${NEW_ID}`))
  expect(fetchMock).toHaveBeenCalledWith('/api/aeo-outbound/generate', { method: 'POST', body: JSON.stringify({ projectId: 'p1', rerunOf: ID }) })
  cleanup(); push.mockReset()
  await setup({ status: 'live', token: 'tok_123' })
  fireEvent.click(screen.getByRole('button', { name: 'Rerun' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await waitFor(() => expect(push).toHaveBeenCalledWith(`/tools/new-business/${NEW_ID}`))
})
```
- In `'a live snapshot loads the preview, never saves, and offers Copy link, Revoke and Edit a copy'` replace line 195 with `await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/snapshot/tok_123`))`.
- Replace `'Revoke confirms, calls the action and refreshes'` (lines 200 to 209) with:
```ts
test('Revoke opens an in-app dialog naming the brand and the recipient, then revokes and refreshes', async () => {
  actions.revokeSnapshotAction.mockResolvedValue({ ok: true })
  await setup({ status: 'live', token: 'tok_123', recipient: 'Jane Doe, Acme' })
  fireEvent.click(screen.getByRole('button', { name: 'Revoke' }))
  expect(screen.getByRole('dialog')).toHaveTextContent("Revoke the link for Acme sent to Jane Doe, Acme? It stops working right away and can't be turned back on.")
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Keep link' }))
  fireEvent.click(screen.getByRole('button', { name: 'Revoke link' }))
  await waitFor(() => expect(actions.revokeSnapshotAction).toHaveBeenCalledWith(ID))
  await waitFor(() => expect(refresh).toHaveBeenCalled())
  expect(screen.queryByRole('button', { name: 'Copy link' })).not.toBeInTheDocument()
})
```
- Replace `'a generating snapshot shows the wait message and refreshes every 5s'` (lines 223 to 231) with:
```ts
test('a generating snapshot shows its progress, the usual time and the keep-open advice, and refreshes every 5s', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-08T15:00:18.000Z'))
  const { container } = render(<OutboundEditor {...base} status="generating" progressStep={4} />)
  expect(screen.getByText('Pulling Peec data… 0:18')).toBeInTheDocument()
  expect(screen.getByText('Usually 35 to 45 seconds')).toBeInTheDocument()
  expect(screen.getByText('Keep this tab open until it finishes.')).toBeInTheDocument()
  expect(container.querySelector('iframe')).toBeNull()
  await act(() => vi.advanceTimersByTimeAsync(10_000))
  expect(refresh).toHaveBeenCalledTimes(2)
  expect(screen.getByText('Pulling Peec data… 0:28')).toBeInTheDocument()
  expect(fetchMock).not.toHaveBeenCalled()
})
```
- In `'a failed snapshot shows its reason with Rerun and Discard and no iframe'` (lines 233 to 244) remove the `window.confirm` spy and replace lines 240 and 241 with `fireEvent.click(screen.getByRole('button', { name: 'Discard' }))`, `expect(screen.getByRole('dialog')).toHaveTextContent('Discard the snapshot for Acme? It is removed from the hub.')` and `fireEvent.click(screen.getByRole('button', { name: 'Discard snapshot' }))`.
- In the `test.each` for `'%s answered unavailable shows the lost connection message'` (lines 277 to 287) replace `if (confirms) vi.spyOn(window, 'confirm').mockReturnValue(true)` with nothing, and after `fireEvent.click(screen.getByRole('button', { name }))` add `if (confirms) fireEvent.click(screen.getByRole('button', { name: 'Revoke link' }))`.
- In `'Discard answered unavailable shows the lost connection message'` (lines 289 to 296) remove the confirm spy and click `'Discard snapshot'` after `'Discard'`.
- Replace `'with an unsaved edit, the browser warns on unload and Back and Rerun ask first'` (lines 330 to 349) with:
```ts
test('with an unsaved edit the browser warns on unload, and Back and Rerun open the in-app leave dialog', async () => {
  const confirm = vi.spyOn(window, 'confirm')
  const { iframe } = await setup()
  const clean = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(clean)
  expect(clean.defaultPrevented).toBe(false)
  await fromFrame(iframe, { type: 'dirty', path: 'headline' })
  const dirty = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(dirty)
  expect(dirty.defaultPrevented).toBe(true)
  expect(fireEvent.click(screen.getByRole('link', { name: 'Back' }))).toBe(false)
  expect(screen.getByRole('dialog')).toHaveTextContent('You have unsaved edits. Leave anyway?')
  fireEvent.click(screen.getByRole('button', { name: 'Stay' }))
  expect(push).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('link', { name: 'Back' }))
  fireEvent.click(screen.getByRole('button', { name: 'Leave' }))
  expect(push).toHaveBeenCalledWith('/tools/new-business')
  fireEvent.click(screen.getByRole('button', { name: 'Rerun' }))
  fireEvent.click(screen.getByRole('button', { name: 'Leave' }))
  await waitFor(() => expect(push).toHaveBeenCalledWith(`/tools/new-business/${NEW_ID}`))
  expect(confirm).not.toHaveBeenCalled()
})
```
- Append:
```ts
test('a draft opens in Preview; ready gets the mode; Edit switches to edit mode without reloading; Done editing switches back', async () => {
  const { iframe } = await setup()
  const post = vi.spyOn(iframe.contentWindow!, 'postMessage')
  await fromFrame(iframe, { type: 'ready' })
  expect(post).toHaveBeenLastCalledWith({ type: 'mode', edit: false }, '*')
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
  expect(post.mock.calls.slice(-2)).toEqual([[{ type: 'flush' }, '*'], [{ type: 'mode', edit: true }, '*']])
  expect(screen.getByText('Editing. Click any outlined text to change it. Changes save automatically. Charts come from Peec: to change them, change the dates and Rerun.')).toBeInTheDocument()
  await fromFrame(iframe, { type: 'ready' })
  expect(post).toHaveBeenLastCalledWith({ type: 'mode', edit: true }, '*')
  fireEvent.click(screen.getByRole('button', { name: 'Done editing' }))
  expect(post.mock.calls.slice(-2)).toEqual([[{ type: 'flush' }, '*'], [{ type: 'mode', edit: false }, '*']])
  expect(screen.queryByText(/^Editing\./)).not.toBeInTheDocument()
  expect(views()).toHaveLength(1)
})

test('a locked click shows its message for 3 seconds: a chart, a fixed word, a mirror', async () => {
  const { iframe } = await setup()
  vi.useFakeTimers()
  await fromFrame(iframe, { type: 'locked', what: 'chart' })
  expect(screen.getByText('Charts come from Peec data. Change the dates and Rerun to update them.')).toBeInTheDocument()
  await act(() => vi.advanceTimersByTimeAsync(3000))
  expect(screen.queryByText(/^Charts come from Peec data/)).not.toBeInTheDocument()
  await fromFrame(iframe, { type: 'locked', what: 'fixed' })
  expect(screen.getByText('This part is set automatically.')).toBeInTheDocument()
  await fromFrame(iframe, { type: 'locked', what: 'fixed', path: 'brand' })
  expect(screen.getByText('Edit this where it first appears on the page.')).toBeInTheDocument()
})

test('dirty, edit and structure need a path; ready and locked do not', async () => {
  const { iframe } = await setup()
  await fromFrame(iframe, { type: 'edit', value: 'x' })
  await fromFrame(iframe, { type: 'structure', op: 'add' })
  await fromFrame(iframe, { type: 'structure', op: 'explode', path: 'competitive_bullets' })
  await new Promise((r) => setTimeout(r, 20))
  expect(patches()).toHaveLength(0)
  await fromFrame(iframe, { type: 'locked', what: 'chart' })
  expect(screen.getByText(/^Charts come from Peec data/)).toBeInTheDocument()
})

test('Live and Revoked show Edit a copy, first, with the frozen hint', async () => {
  await setup({ status: 'revoked' })
  expect(within(screen.getByRole('toolbar', { name: 'Snapshot actions' })).getAllByRole('button')[0]).toHaveTextContent('Edit a copy')
  expect(screen.getByText('This report is frozen. Editing makes a new draft.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
})

const NOTES: StoredNote[] = [
  { kind: 'number_not_in_data', path: 'competitive_bullets.0.text', text: '"42%" is not in the Peec data' },
  { kind: 'high_visibility', text: "Alpha shows 95.0% AI visibility, which is unusually high. Check this brand's setup in Peec before sending: a name that is a common word can match unrelated answers." },
  { kind: 'rank_basis', text: 'Rank is by visibility among the 12 brands tracked in Peec.' },
  { kind: 'project', text: 'Peec project or_x (PITCH_ENDED). Window 2026-10-01 to 2026-10-08, all models: ChatGPT UI.' },
  'An old note',
]
const ABOUT = { projectId: 'or_x', projectName: 'Acme pitch', projectStatus: 'PITCH_ENDED', windowLabel: 'Oct 1, 2026 to Oct 8, 2026', models: ['ChatGPT UI'] }

test('Before you send is open on a draft, counts open items, groups them and names each field in plain words', async () => {
  await setup({ notes: NOTES, needsValidation: ['market'], about: ABOUT, sectionTitles: ['Strengths', 'Gaps'] })
  expect(screen.getByRole('button', { name: 'Before you send (4)' })).toHaveAttribute('aria-expanded', 'true')
  const p = panel()
  expect(within(p).getByText('Market: Needs validation')).toBeInTheDocument()
  expect(within(p).getByText('Strengths, bullet 1, text: "42%" is not in the Peec data')).toBeInTheDocument()
  expect(within(p).getByText('An old note')).toBeInTheDocument()
  for (const t of ['Every claim matches the numbers on the page', 'No mention of the discovery call, pricing or other agencies', 'Findings and hypotheses are kept apart']) expect(within(p).getByLabelText(t)).toBeInTheDocument()
  expect(within(p).getByText('Peec project: Acme pitch (pitch ended). Covers Oct 1, 2026 to Oct 8, 2026. Models: ChatGPT UI.')).toBeInTheDocument()
  expect(within(p).getByText('Rank is by visibility among the 12 brands tracked in Peec.')).toBeInTheDocument()
  expect(within(p).getByText('Project id or_x (for support).')).toBeInTheDocument()
  expect(within(p).queryByText(/^Peec project or_x/)).not.toBeInTheDocument()
  fireEvent.click(within(p).getAllByRole('checkbox', { name: 'Looks right' })[0])
  expect(screen.getByRole('button', { name: 'Before you send (3)' })).toBeInTheDocument()
  fireEvent.click(within(p).getByLabelText('Findings and hypotheses are kept apart'))
  expect(screen.getByRole('button', { name: 'Before you send (3)' })).toBeInTheDocument()
})

test("a version 1 row's About this data has no project status", async () => {
  await setup({ about: { ...ABOUT, projectStatus: null } })
  expect(within(panel()).getByText('Peec project: Acme pitch. Covers Oct 1, 2026 to Oct 8, 2026. Models: ChatGPT UI.')).toBeInTheDocument()
})

test('clicking an item enters edit mode and focuses its field', async () => {
  const { iframe } = await setup({ notes: NOTES })
  const post = vi.spyOn(iframe.contentWindow!, 'postMessage')
  fireEvent.click(within(panel()).getByRole('button', { name: /bullet 1, text: "42%"/ }))
  expect(post.mock.calls.map((c) => c[0])).toEqual([{ type: 'flush' }, { type: 'mode', edit: true }, { type: 'focus', path: 'competitive_bullets.0.text' }])
  expect(screen.getByRole('button', { name: 'Done editing' })).toBeInTheDocument()
})

test('the panel and Approve re-sync from the server when the revision changes', async () => {
  const { rerender } = await setup({ needsValidation: ['market'] })
  expect(screen.getByRole('button', { name: 'Before you send (2)' })).toBeInTheDocument()
  rerender(<OutboundEditor {...base} revision={9} needsValidation={[]} notes={[]} />)
  expect(screen.getByRole('button', { name: 'Before you send (0)' })).toBeInTheDocument()
})

test("a structure message waits for pending edits, makes the frame read-only, then reloads it and clears that list's ticks only", async () => {
  const notes: StoredNote[] = [
    { kind: 'number_not_in_data', path: 'competitive_bullets.1.text', text: '"9%" is not in the Peec data' },
    { kind: 'number_not_in_data', path: 'why', text: '"8%" is not in the Peec data' },
  ]
  const { iframe } = await setup({ notes, revision: 4 })
  const post = vi.spyOn(iframe.contentWindow!, 'postMessage')
  for (const box of within(panel()).getAllByRole('checkbox', { name: 'Looks right' })) fireEvent.click(box)
  expect(screen.getByRole('button', { name: 'Before you send (0)' })).toBeInTheDocument()
  let rev = 4
  patch = async () => json(200, { revision: ++rev, notes, needsValidation: [], slots: {} })
  await fromFrame(iframe, { type: 'edit', path: 'headline', value: 'H' })
  await fromFrame(iframe, { type: 'structure', op: 'add', path: 'competitive_bullets' })
  expect(post).toHaveBeenCalledWith({ type: 'mode', edit: false }, '*')
  await waitFor(() => expect(patches()).toHaveLength(2))
  expect(patches().map(([, init]) => JSON.parse(String(init?.body)))).toEqual([
    { path: 'headline', value: 'H', revision: 4 },
    { path: 'competitive_bullets.add', value: 'structure', revision: 5 },
  ])
  await waitFor(() => expect(views()).toHaveLength(2))
  // The competitive_bullets tick is dropped (its bullets moved); the why tick stays.
  expect(screen.getByRole('button', { name: 'Before you send (1)' })).toBeInTheDocument()
})


test('an unreadable draft says so, offers Rerun and shows no frame', () => {
  const { container } = render(<OutboundEditor {...base} unreadable />)
  expect(screen.getByText("This snapshot was saved by an older version and can't be shown. Rerun it.")).toBeInTheDocument()
  expect(container.querySelector('iframe')).toBeNull()
  expect(screen.getByRole('button', { name: 'Rerun' })).toBeInTheDocument()
  expect(fetchMock).not.toHaveBeenCalled()
})

test('a live row lists its opens with the caveat, and counts opens from before v1.1 as not classified', async () => {
  await setup({ status: 'live', token: 'tok_123', openCount: 3, opens: [
    { openedAt: '2026-10-02T15:00:00.000Z', uaFamily: 'Chrome on Mac', likelyAutomated: false, reason: null },
    { openedAt: '2026-10-02T14:00:30.000Z', uaFamily: 'Other', likelyAutomated: true, reason: 'Not a known browser' },
  ] })
  const list = screen.getByRole('region', { name: 'Opens' })
  expect(within(list).getByText('Email security scanners can open links automatically. Opens marked automated are likely scanners. The marking is best effort.')).toBeInTheDocument()
  expect(within(list).getByText('Oct 2, 2026, 11:00 AM')).toBeInTheDocument()
  expect(within(list).getByText('Person')).toBeInTheDocument()
  expect(within(list).getByText('Automated')).toBeInTheDocument()
  expect(within(list).getByText('Not a known browser')).toBeInTheDocument()
  expect(within(list).getByText('1 not classified')).toBeInTheDocument()
})

test('while the report loads, the frame area is black and says Loading report…', async () => {
  let release: (r: Response) => void = () => {}
  fetchMock.mockImplementationOnce(() => new Promise<Response>((r) => { release = r }))
  const { container } = render(<OutboundEditor {...base} />)
  expect(screen.getByText('Loading report…')).toBeInTheDocument()
  expect(container.querySelector('iframe')).toHaveClass('bg-black')
  await act(async () => release(new Response('<p>x</p>')))
  await waitFor(() => expect(screen.queryByText('Loading report…')).not.toBeInTheDocument())
})

test('a brand save renames the toolbar and the frame title', async () => {
  const { iframe } = await setup()
  await fromFrame(iframe, { type: 'edit', path: 'brand', value: '  New  Co ' })
  await waitFor(() => expect(iframe).toHaveAttribute('title', 'New Co'))
  expect(screen.getByText('New Co')).toBeInTheDocument()
})

test('a failed row shows its reason in plain words with the next step', () => {
  render(<OutboundEditor {...base} status="failed" errorCode="no_data" error="No day between 2026-09-01 and 2026-09-07 has any Peec data for this project" />)
  expect(screen.getByText('Peec has no data for this project in that period. Pick other dates.')).toBeInTheDocument()
})
```
Run: `perl -e 'alarm 590; exec @ARGV' -- npx vitest run components/aeo-outbound/editor.test.tsx` (FAIL).

- [ ] **Step 3: The Before you send panel**

Create `components/aeo-outbound/before-you-send.tsx`:
```tsx
'use client'
// The "Before you send" panel (spec v1.1 §4): Fill these in (blocks Approve), Check these (each with a per-session
// Looks right tick), your own checks (ticks, never block) and About this data (collapsed). Every field is named by the
// one label map; clicking an item with a field asks the editor to focus it.
import { fieldLabel } from '@/lib/aeo-outbound/labels'
import { noteGroup, noteText, type StoredNote } from '@/lib/aeo-outbound/notes'
import { ABOUT_DATA, BEFORE_YOU_SEND, CHECK_THESE, FILL_THESE, LOOKS_RIGHT, NOTHING_TO_CHECK, NOTHING_TO_FILL, OWN_CHECKS_TITLE } from './messages'

export interface AboutInfo { projectId: string; projectName: string; projectStatus: string | null; windowLabel: string; models: string[] }
/** From Ryan's skill's QA gate (v1.1 §4). Ticked per session; never stored; never block. */
export const OWN_CHECKS = ['Every claim matches the numbers on the page', 'No mention of the discovery call, pricing or other agencies', 'Findings and hypotheses are kept apart'] as const

/** A Check these item's identity for its Looks right tick: kind, full path and text. */
export const tickKey = (n: StoredNote): string => (typeof n === 'string' ? `legacy|${n}` : `${n.kind}|${n.path ?? ''}|${n.text}`)
const checkItems = (notes: StoredNote[]) => notes.filter((n) => noteGroup(n) === 'check')
/** Open Fill these in items plus Check these items produced by the latest save and not marked Looks right. */
export const openCount = (needsValidation: string[], notes: StoredNote[], ticks: ReadonlySet<string>): number =>
  needsValidation.length + checkItems(notes).filter((n) => !ticks.has(tickKey(n))).length
const statusWords = (s: string) => (s === 'PITCH' ? 'pitch' : s === 'PITCH_ENDED' ? 'pitch ended' : s.toLowerCase().replace(/_/g, ' '))
/** A version 1 row has no project status, so the parenthesis is left out (round-2 MINOR 5). */
export const aboutHeader = (a: AboutInfo): string =>
  `Peec project: ${a.projectName}${a.projectStatus ? ` (${statusWords(a.projectStatus)})` : ''}. Covers ${a.windowLabel}. Models: ${a.models.join(', ') || 'not reported'}.`

export interface BeforeYouSendProps {
  needsValidation: string[]
  notes: StoredNote[]
  titles: readonly [string, string]
  about: AboutInfo | null
  ticks: ReadonlySet<string>
  ownTicks: ReadonlySet<number>
  highlight: string | null
  onTick: (key: string) => void
  onOwnTick: (index: number) => void
  onGoTo: (path: string) => void
}

const itemBtn = 'text-left text-xs text-white underline-offset-2 hover:underline'
export function BeforeYouSend(p: BeforeYouSendProps) {
  const label = (path: string) => fieldLabel(path, p.titles)
  const about = p.notes.filter((n) => noteGroup(n) === 'about' && !(typeof n !== 'string' && n.kind === 'project'))
  const check = checkItems(p.notes)
  return (
    <aside aria-label={BEFORE_YOU_SEND} className="absolute right-0 top-0 z-10 max-h-full w-96 space-y-4 overflow-y-auto rounded-lg border border-white/[0.08] bg-bg-surface p-4 shadow-xl">
      <h2 className="text-sm font-semibold text-white">{BEFORE_YOU_SEND}</h2>
      <section>
        <h3 className="mb-1 text-xs font-semibold text-[#FFFC60]">{FILL_THESE}</h3>
        {p.needsValidation.length ? (
          <ul className="space-y-1">
            {p.needsValidation.map((path) => (
              <li key={path}>
                <button type="button" className={`${itemBtn} ${p.highlight === path ? 'rounded bg-[#FFFC60]/15 px-1' : ''}`} aria-current={p.highlight === path ? 'true' : undefined} onClick={() => p.onGoTo(path)}>
                  {`${label(path)}: Needs validation`}
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="text-xs text-text-muted">{NOTHING_TO_FILL}</p>}
      </section>
      <section>
        <h3 className="mb-1 text-xs font-semibold text-white">{CHECK_THESE}</h3>
        {check.length ? (
          <ul className="space-y-2">
            {check.map((n) => {
              const key = tickKey(n)
              const path = typeof n === 'string' ? undefined : n.path
              const text = path ? `${label(path)}: ${noteText(n)}` : noteText(n)
              return (
                <li key={key} className="flex items-start justify-between gap-2">
                  {path ? <button type="button" className={itemBtn} onClick={() => p.onGoTo(path)}>{text}</button> : <span className="text-xs text-white">{text}</span>}
                  <label className="flex shrink-0 items-center gap-1 text-xs text-text-muted">
                    <input type="checkbox" checked={p.ticks.has(key)} onChange={() => p.onTick(key)} />{LOOKS_RIGHT}
                  </label>
                </li>
              )
            })}
          </ul>
        ) : <p className="text-xs text-text-muted">{NOTHING_TO_CHECK}</p>}
      </section>
      <section>
        <h3 className="mb-1 text-xs font-semibold text-white">{OWN_CHECKS_TITLE}</h3>
        <ul className="space-y-1">
          {OWN_CHECKS.map((t, i) => (
            <li key={t}>
              <label className="flex items-center gap-2 text-xs text-white">
                <input type="checkbox" checked={p.ownTicks.has(i)} onChange={() => p.onOwnTick(i)} />{t}
              </label>
            </li>
          ))}
        </ul>
      </section>
      {p.about && (
        <details>
          <summary className="cursor-pointer text-xs font-semibold text-white">{ABOUT_DATA}</summary>
          <div className="mt-1 space-y-1 text-xs text-text-muted">
            <p>{aboutHeader(p.about)}</p>
            {about.map((n, i) => <p key={i}>{noteText(n)}</p>)}
            <p>{`Project id ${p.about.projectId} (for support).`}</p>
          </div>
        </details>
      )}
    </aside>
  )
}
```

- [ ] **Step 4: The editor**

Replace `components/aeo-outbound/editor.tsx` with:
```tsx
'use client'
// The snapshot editor (spec §9a, §10; v1.1 §2, §4, §6, §7, §11). The report runs in a sandboxed srcdoc iframe that opens
// in Preview; Edit puts the frame in edit mode by message, never by reloading it. The frame never saves anything: it
// posts dirty, edit and structure here, and this page owns the one SaveQueue that PATCHes the slots route.
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { approveSnapshotAction, copySnapshotAsDraftAction, discardSnapshotAction, revokeSnapshotAction } from '@/app/actions/aeo-outbound'
import { fieldLabel } from '@/lib/aeo-outbound/labels'
import { fmtEasternDateTime } from '@/lib/aeo-outbound/metrics'
import { isStoredNotes, type StoredNote } from '@/lib/aeo-outbound/notes'
import { MAX_RECIPIENT } from '@/lib/aeo-outbound/recipient'
import { REPORT_SANDBOX } from '@/lib/aeo-outbound/sandbox'
import { cleanValue, isStructuralPath } from '@/lib/aeo-outbound/slots'
import type { DisplayStatus } from '@/lib/aeo-outbound/store'
import { BeforeYouSend, openCount, type AboutInfo } from './before-you-send'
import { ConfirmDialog } from './confirm-dialog'
import { CopyLink } from './copy-link'
import { failureText } from './failure-text'
import { requestGenerate } from './generate-client'
import { StatusPill } from './hub'
import {
  ACTION_FAILED, APPROVE_AND_CREATE, APPROVE_CONFIRM, AUTOMATED, BEFORE_YOU_SEND, CANCEL, DISCARD_SNAPSHOT, DONE_EDITING, EDIT,
  EDIT_BANNER, EDIT_COPY, EDIT_COPY_HINT, FLUSH_WAIT, GONE, KEEP_DRAFT, KEEP_LINK, KEEP_SNAPSHOT, LEAVE, LEAVE_UNSAVED, LOADING_REPORT,
  LOCKED_CHART, LOCKED_FIXED, LOCKED_MIRROR, MAKE_NEW_DRAFT, NO_OPENS, OPENS_CAVEAT, OPENS_TITLE, PERSON, RECIPIENT_EXAMPLE,
  RECIPIENT_LABEL, REVOKE_LINK, STALE, STAY, UNREADABLE, VIEW_FAILED, actionError, discardTitle, fillFirst, notClassified,
  rerunTitle, revokeTitle,
} from './messages'
import { KEEP_OPEN, USUALLY, progressText } from './progress'
import { RETRY_MESSAGE, SaveQueue, type SaveState, type SendResult } from './save-queue'
import { snapshotUrl } from './status'
import { btnCls, cardCls, inputCls, primaryBtnCls } from './ui'

export interface OpenEvent { openedAt: string; uaFamily: string; likelyAutomated: boolean; reason: string | null }
export interface OutboundEditorProps {
  id: string
  brand: string
  projectId: string
  status: DisplayStatus
  revision: number
  notes: StoredNote[]
  needsValidation: string[]
  token: string | null
  error: string | null
  errorCode: string | null
  recipient: string | null
  sectionTitles: [string, string]
  about: AboutInfo | null
  opens: OpenEvent[]
  openCount: number
  needsValidationBlocksApprove: boolean
  unreadable: boolean
  progressStep: number
  createdAt: string
}

const FLUSH_WAIT_MS = 2000
const POLL_MS = 100
const LOCKED_MS = 3000
const OPENS_SHOWN = 200
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string')

type Mode = 'preview' | 'edit'
type Dialog =
  | { kind: 'approve'; recipient: string; error: string | null; sending: boolean }
  | { kind: 'revoke' | 'discard' | 'rerun' }
  | { kind: 'leave'; then: () => void }

export function OutboundEditor(props: OutboundEditorProps) {
  const { id, projectId } = props
  const router = useRouter()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const queueRef = useRef<SaveQueue | null>(null)
  const modeRef = useRef<Mode>('preview')

  // Local status and token follow the server's on each refresh, and move ahead of it after an approve or revoke.
  const [status, setStatus] = useState(props.status)
  const [seenStatus, setSeenStatus] = useState(props.status)
  if (props.status !== seenStatus) { setSeenStatus(props.status); setStatus(props.status) }
  const [approvedToken, setApprovedToken] = useState<string | null>(null)
  const token = approvedToken ?? props.token

  // v1.1 §4: the panel, Approve, the brand and the section titles re-sync from the server whenever the row's status or
  // revision changes, so nothing goes stale after a refresh.
  const [notes, setNotes] = useState(props.notes)
  const [needsValidation, setNeedsValidation] = useState(props.needsValidation)
  const [brand, setBrand] = useState(props.brand)
  const [titles, setTitles] = useState<[string, string]>(props.sectionTitles)
  const sync = `${props.status}|${props.revision}`
  const [seenSync, setSeenSync] = useState(sync)
  if (sync !== seenSync) {
    setSeenSync(sync); setNotes(props.notes); setNeedsValidation(props.needsValidation); setBrand(props.brand); setTitles(props.sectionTitles)
  }

  const [html, setHtml] = useState<string | null>(null)
  const [viewError, setViewError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [save, setSave] = useState<SaveState | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [mode, setMode] = useState<Mode>('preview')
  const [locked, setLocked] = useState<{ text: string; n: number } | null>(null)
  const [panelOpen, setPanelOpen] = useState(props.status === 'draft')
  const [ticks, setTicks] = useState<ReadonlySet<string>>(new Set())
  const [ownTicks, setOwnTicks] = useState<ReadonlySet<number>>(new Set())
  const [highlight, setHighlight] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [origin, setOrigin] = useState('')
  useEffect(() => { setOrigin(window.location.origin) }, [])

  const showsReport = !props.unreadable && (status === 'draft' || status === 'live' || status === 'revoked')
  const toFrame = (m: unknown) => iframeRef.current?.contentWindow?.postMessage(m, '*')
  /** Edit mode, unless a structural change is queued or in flight: the frame is read-only then (v1.1 §3). */
  const frameEditable = () => modeRef.current === 'edit' && !queueRef.current?.state.structuring

  // The report HTML: the draft page (editing hooks, Preview until Edit) for a draft, the frozen preview otherwise.
  useEffect(() => {
    if (!showsReport) return
    let live = true
    const url = `/api/aeo-outbound/reports/${id}/view${status === 'draft' ? '' : '?mode=preview'}`
    setViewError(null)
    setHtml(null)
    fetch(url)
      .then(async (res) => {
        if (!live) return
        if (res.status === 404) return setViewError(GONE)
        if (!res.ok) return setViewError(VIEW_FAILED)
        const text = await res.text()
        if (live) setHtml(text)
      })
      .catch(() => { if (live) setViewError(VIEW_FAILED) })
    return () => { live = false }
  }, [id, status, showsReport, reloadKey])

  // One save queue per draft. Leaving draft (an approve) stops it.
  useEffect(() => {
    if (status !== 'draft') return
    const dropTicksFor = (list: string) => setTicks((t) => new Set([...t].filter((k) => !(k.split('|')[1] ?? '').startsWith(`${list}.`))))
    const send = async (path: string, value: string, revision: number): Promise<SendResult> => {
      const res = await fetch(`/api/aeo-outbound/reports/${id}/slots`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, value, revision }),
      })
      if (res.status === 200) {
        const b = (await res.json()) as { revision?: unknown; notes?: unknown; needsValidation?: unknown }
        if (!Number.isInteger(b.revision)) return { kind: 'retry' }
        if (isStoredNotes(b.notes)) setNotes(b.notes)
        if (isStrings(b.needsValidation)) setNeedsValidation(b.needsValidation)
        if (isStructuralPath(path)) {
          // The list's indices changed: its Looks right ticks no longer point at the same bullets (v1.1 §3).
          dropTicksFor(path.split('.')[0])
          setReloadKey((k) => k + 1)
        } else if (path === 'brand') setBrand(cleanValue(value))
        else if (path === 'page.section_1_title') setTitles(([, two]): [string, string] => [cleanValue(value), two])
        else if (path === 'page.section_2_title') setTitles(([one]): [string, string] => [one, cleanValue(value)])
        return { kind: 'ok', revision: b.revision as number }
      }
      if (res.status === 400) {
        const b = (await res.json().catch(() => ({}))) as { error?: unknown }
        return { kind: 'bad', error: typeof b.error === 'string' ? b.error : 'bad-request' }
      }
      if (res.status === 403 || res.status === 404 || res.status === 409) return { kind: 'stop' }
      return { kind: 'retry' }
    }
    const q = new SaveQueue(send, props.revision, setSave)
    queueRef.current = q
    setSave(q.state)
    return () => {
      q.stop('')
      if (queueRef.current === q) queueRef.current = null
    }
    // The revision seeds the queue once; the queue carries every later revision itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, status])

  // Messages from the iframe, and only from it: a sandboxed iframe's origin is null, so its window is the check.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const frame = iframeRef.current?.contentWindow
      if (!frame || e.source !== frame) return
      const d = e.data as { type?: unknown; path?: unknown; value?: unknown; what?: unknown; op?: unknown } | null
      if (!d || typeof d !== 'object') return
      if (d.type === 'ready') { frame.postMessage({ type: 'mode', edit: frameEditable() }, '*'); return }
      if (d.type === 'locked') {
        const text = d.what === 'chart' ? LOCKED_CHART : typeof d.path === 'string' ? LOCKED_MIRROR : LOCKED_FIXED
        setLocked((l) => ({ text, n: (l?.n ?? 0) + 1 }))
        return
      }
      const q = queueRef.current
      if (!q || typeof d.path !== 'string') return
      if (d.type === 'dirty') q.markDirty(d.path)
      else if (d.type === 'edit' && typeof d.value === 'string') q.edit(d.path, d.value)
      else if (d.type === 'structure' && (d.op === 'add' || d.op === 'remove')) {
        const patchPath = `${d.path}.${d.op}`
        if (!isStructuralPath(patchPath)) return
        frame.postMessage({ type: 'mode', edit: false }, '*')
        q.structure(patchPath)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
    // Reads only refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!locked) return
    const t = setTimeout(() => setLocked(null), LOCKED_MS)
    return () => clearTimeout(t)
  }, [locked])

  useEffect(() => {
    if (status !== 'generating') return
    const refreshTimer = setInterval(() => router.refresh(), 5000)
    const clock = setInterval(() => setNow(Date.now()), 1000)
    return () => { clearInterval(refreshTimer); clearInterval(clock) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  /** Switching modes flushes pending edits first and never reloads the frame (v1.1 §2). */
  function switchMode(next: Mode) {
    toFrame({ type: 'flush' })
    modeRef.current = next
    setMode(next)
    toFrame({ type: 'mode', edit: frameEditable() })
  }
  function goTo(path: string) {
    if (modeRef.current !== 'edit') switchMode('edit')
    toFrame({ type: 'focus', path })
  }

  const count = openCount(needsValidation, notes, ticks)
  const blockedByValidation = props.needsValidationBlocksApprove && needsValidation.length > 0
  const busySaving = !save || save.dirty || save.saving || save.stopped || save.structuring
  const approveDisabled = busySaving || busy
  const approveTitle = busySaving ? FLUSH_WAIT : undefined

  async function onApprove() {
    const q = queueRef.current
    if (!q) return
    setMessage(null)
    // v1.1 §4: no disabled button without a reason. Open the panel at the first item and say how many.
    if (blockedByValidation) {
      setPanelOpen(true)
      setHighlight(needsValidation[0])
      setMessage(fillFirst(needsValidation.length))
      return
    }
    toFrame({ type: 'flush' })
    for (let waited = 0; waited < FLUSH_WAIT_MS; waited += POLL_MS) {
      await sleep(POLL_MS)
      if (!q.state.dirty && !q.state.saving) break
    }
    if (q.state.dirty || q.state.saving || q.state.stopped) return setMessage(FLUSH_WAIT)
    setDialog({ kind: 'approve', recipient: '', error: null, sending: false })
  }

  async function onConfirmApprove() {
    const q = queueRef.current
    if (dialog?.kind !== 'approve' || !q) return
    // The dialog re-checks before sending, and always sends the last saved revision (spec §9a).
    if (q.state.dirty || q.state.saving || q.state.stopped || q.state.structuring) return setDialog({ ...dialog, error: FLUSH_WAIT })
    setDialog({ ...dialog, error: null, sending: true })
    let r: Awaited<ReturnType<typeof approveSnapshotAction>>
    try {
      r = await approveSnapshotAction(id, q.state.revision, dialog.recipient)
    } catch {
      return setDialog({ ...dialog, sending: false, error: ACTION_FAILED })
    }
    if (!r.ok && r.error === 'stale') {
      // Someone else changed it: stop saving and offer the reload, the same as a save's 409.
      setDialog(null)
      return q.stop(STALE)
    }
    if (!r.ok) return setDialog({ ...dialog, sending: false, error: actionError(r.error) })
    setDialog(null)
    setApprovedToken(r.token)
    setStatus('live')
    router.refresh()
  }

  async function run(fn: () => Promise<void>) {
    setMessage(null)
    setBusy(true)
    try { await fn() } catch { setMessage(ACTION_FAILED) } finally { setBusy(false) }
  }

  // An edit not yet saved: the browser warns on unload, and in-app navigation asks first in the in-app dialog.
  const unsaved = status === 'draft' && !!save && (save.dirty || save.saving || save.structuring)
  useEffect(() => {
    if (!unsaved) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [unsaved])
  const guard = (then: () => void) => (unsaved ? setDialog({ kind: 'leave', then }) : then())

  const doRerun = () => run(async () => {
    const out = await requestGenerate({ projectId, rerunOf: id })
    if (out.kind === 'open') return router.push(`/tools/new-business/${out.id}`)
    setMessage(out.text || null)
    if (out.kind === 'message' && out.refresh) router.refresh()
  })
  const onRerun = () => {
    if (unsaved) return setDialog({ kind: 'leave', then: () => void doRerun() })
    if (status === 'draft') return setDialog({ kind: 'rerun' })
    void doRerun()
  }
  const onEditCopy = () => guard(() => void run(async () => {
    const r = await copySnapshotAsDraftAction(id)
    if (r.ok) router.push(`/tools/new-business/${r.id}`)
    else setMessage(actionError(r.error))
  }))
  const doRevoke = () => run(async () => {
    const r = await revokeSnapshotAction(id)
    if (!r.ok) return setMessage(actionError(r.error))
    setStatus('revoked')
    router.refresh()
  })
  const doDiscard = () => run(async () => {
    const r = await discardSnapshotAction(id)
    if (r.ok) router.push('/tools/new-business')
    else setMessage(actionError(r.error))
  })

  let saveText: string | null = null
  if (status === 'draft' && save && !save.stopped) {
    if (save.error) {
      const field = save.error !== RETRY_MESSAGE ? save.badPaths.at(-1) : undefined
      saveText = field ? `${fieldLabel(field, titles)}: ${save.error}` : save.error
    } else if (save.saving || save.dirty || save.structuring) saveText = 'Saving…'
    else if (save.revision !== props.revision) saveText = 'Saved'
  }
  const sent = status === 'live' || status === 'revoked'
  const notClassifiedCount = props.opens.length < OPENS_SHOWN ? Math.max(0, props.openCount - props.opens.length) : 0

  return (
    <div>
      <div className="sticky top-0 z-20 -mx-8 -mt-8 mb-4 border-b border-white/[0.06] bg-black px-8 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/tools/new-business" onClick={(e) => { if (unsaved) { e.preventDefault(); setDialog({ kind: 'leave', then: () => router.push('/tools/new-business') }) } }} className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-white">
            <ArrowLeft className="h-4 w-4" aria-hidden />Back
          </Link>
          <span className="text-sm font-semibold text-white">{brand}</span>
          <StatusPill status={status} error={props.error} />
          {saveText && <span className="text-xs text-text-muted" aria-live="polite">{saveText}</span>}
          {status === 'draft' && save?.stopped && (
            <span className="inline-flex items-center gap-2 text-xs text-[#FF6B6B]">
              {save.error}
              <button type="button" className={btnCls} onClick={() => window.location.reload()}>Reload</button>
            </span>
          )}
          {message && <span className="text-xs text-[#FF6B6B]">{message}</span>}
          <div role="toolbar" aria-label="Snapshot actions" className="ml-auto flex flex-wrap items-center gap-1.5">
            {status === 'draft' && (
              <button type="button" className={primaryBtnCls} disabled={props.unreadable} onClick={() => switchMode(mode === 'edit' ? 'preview' : 'edit')}>
                {mode === 'edit' ? DONE_EDITING : EDIT}
              </button>
            )}
            {sent && (
              <>
                <button type="button" className={primaryBtnCls} disabled={busy} title={EDIT_COPY_HINT} onClick={onEditCopy}>{EDIT_COPY}</button>
                <span className="text-xs text-text-muted">{EDIT_COPY_HINT}</span>
              </>
            )}
            {status === 'draft' && (
              <button type="button" className={btnCls} disabled={approveDisabled} title={approveTitle} onClick={() => void onApprove()}>Approve</button>
            )}
            {status === 'live' && token && origin && <CopyLink url={snapshotUrl(origin, token)} showField />}
            {status === 'live' && <button type="button" className={btnCls} disabled={busy} onClick={() => setDialog({ kind: 'revoke' })}>Revoke</button>}
            {status !== 'generating' && <button type="button" className={btnCls} disabled={busy} onClick={onRerun}>Rerun</button>}
            {status === 'failed' && <button type="button" className={btnCls} disabled={busy} onClick={() => setDialog({ kind: 'discard' })}>Discard</button>}
            {showsReport && (
              <>
                <button type="button" className={btnCls} aria-expanded={panelOpen} onClick={() => setPanelOpen((o) => !o)}>{`${BEFORE_YOU_SEND} (${count})`}</button>
                <a href={`/api/aeo-outbound/reports/${id}/view?mode=preview`} target="_blank" rel="noopener noreferrer" className={`${btnCls} inline-flex items-center gap-1`}>
                  Open full size<ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              </>
            )}
          </div>
        </div>
        {status === 'draft' && mode === 'edit' && <p role="status" className="mt-2 text-xs text-[#60FFEA]">{EDIT_BANNER}</p>}
        {locked && <p role="status" className="mt-2 text-xs text-[#FFFC60]">{locked.text}</p>}
      </div>

      {status === 'generating' && (
        <div className={cardCls}>
          <p className="text-sm text-white">{progressText(props.progressStep, props.createdAt, now)}</p>
          <p className="mt-1 text-xs text-text-muted">{USUALLY}</p>
          <p className="mt-1 text-xs text-text-muted">{KEEP_OPEN}</p>
        </div>
      )}
      {status === 'failed' && <div className={cardCls}><p className="text-sm text-[#FF6B6B]">{failureText(props.errorCode, props.error, id)}</p></div>}
      {props.unreadable && <div className={cardCls}><p className="text-sm text-[#FF6B6B]">{UNREADABLE}</p></div>}

      {showsReport && (
        <div className="relative">
          {viewError && (
            <p className="mb-2 flex items-center gap-2 text-sm text-[#FF6B6B]">
              {viewError}
              {viewError !== GONE && <button type="button" className={btnCls} onClick={() => window.location.reload()}>Reload</button>}
            </p>
          )}
          <iframe ref={iframeRef} title={brand} sandbox={REPORT_SANDBOX} srcDoc={html ?? ''} className="w-full rounded-lg bg-black" style={{ height: 'calc(100vh - 140px)' }} />
          {html === null && !viewError && <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black text-sm text-text-muted">{LOADING_REPORT}</div>}
          {panelOpen && (
            <BeforeYouSend
              needsValidation={needsValidation} notes={notes} titles={titles} about={props.about} ticks={ticks} ownTicks={ownTicks} highlight={highlight}
              onTick={(key) => setTicks((t) => { const n = new Set(t); if (n.has(key)) n.delete(key); else n.add(key); return n })}
              onOwnTick={(i) => setOwnTicks((t) => { const n = new Set(t); if (n.has(i)) n.delete(i); else n.add(i); return n })}
              onGoTo={goTo}
            />
          )}
        </div>
      )}

      {sent && (
        <section aria-label={OPENS_TITLE} className={`${cardCls} mt-4`}>
          <h2 className="mb-1 text-sm font-semibold text-white">{OPENS_TITLE}</h2>
          <p className="mb-2 text-xs text-text-muted">{OPENS_CAVEAT}</p>
          {props.opens.length === 0 ? <p className="text-xs text-text-muted">{NO_OPENS}</p> : (
            <table className="w-full text-left text-xs text-white">
              <thead className="text-text-muted"><tr><th className="py-1">Opened</th><th>Browser</th><th>Likely</th><th>Why</th></tr></thead>
              <tbody>
                {props.opens.map((o, i) => (
                  <tr key={i} className="border-t border-white/[0.06]">
                    <td className="py-1">{fmtEasternDateTime(new Date(o.openedAt))}</td>
                    <td>{o.uaFamily}</td>
                    <td>{o.likelyAutomated ? AUTOMATED : PERSON}</td>
                    <td>{o.reason ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {notClassifiedCount > 0 && <p className="mt-2 text-xs text-text-muted">{notClassified(notClassifiedCount)}</p>}
        </section>
      )}

      {dialog?.kind === 'approve' && (
        <ConfirmDialog
          title={APPROVE_CONFIRM} confirmLabel={APPROVE_AND_CREATE} cancelLabel={CANCEL} initialFocus="input"
          busy={dialog.sending} error={dialog.error} confirmDisabled={!dialog.recipient.trim()}
          onCancel={() => setDialog(null)} onConfirm={() => void onConfirmApprove()}
        >
          <label htmlFor="aeo-recipient" className="mb-1 block text-xs text-text-muted">{RECIPIENT_LABEL}</label>
          <input
            id="aeo-recipient" className={`${inputCls} w-full`} maxLength={MAX_RECIPIENT} placeholder={RECIPIENT_EXAMPLE}
            value={dialog.recipient} disabled={dialog.sending}
            onChange={(e) => setDialog({ ...dialog, recipient: e.target.value, error: null })}
          />
        </ConfirmDialog>
      )}
      {dialog?.kind === 'revoke' && (
        <ConfirmDialog title={revokeTitle(brand, props.recipient)} confirmLabel={REVOKE_LINK} cancelLabel={KEEP_LINK} onCancel={() => setDialog(null)} onConfirm={() => { setDialog(null); void doRevoke() }} />
      )}
      {dialog?.kind === 'discard' && (
        <ConfirmDialog title={discardTitle(brand)} confirmLabel={DISCARD_SNAPSHOT} cancelLabel={KEEP_SNAPSHOT} onCancel={() => setDialog(null)} onConfirm={() => { setDialog(null); void doDiscard() }} />
      )}
      {dialog?.kind === 'rerun' && (
        <ConfirmDialog title={rerunTitle(brand)} confirmLabel={MAKE_NEW_DRAFT} cancelLabel={KEEP_DRAFT} onCancel={() => setDialog(null)} onConfirm={() => { setDialog(null); void doRerun() }} />
      )}
      {dialog?.kind === 'leave' && (
        <ConfirmDialog title={LEAVE_UNSAVED} confirmLabel={LEAVE} cancelLabel={STAY} onCancel={() => setDialog(null)} onConfirm={() => { const then = dialog.then; setDialog(null); then() }} />
      )}
    </div>
  )
}
```
Notes for the implementer: `GENERATING_EDITOR`, `NEEDS_VALIDATION_FIRST`, `REVOKE_CONFIRM` and `DISCARD_CONFIRM` are no longer imported here; `NEEDS_VALIDATION` from config is no longer used. The approve dialog's busy state disables Cancel and Escape while sending, as before.

- [ ] **Step 5: The editor page and `failureCode`**

Append to `lib/aeo-outbound/store.ts`:
```ts
/** The code shown for a failed row; a generating row past the stale limit reads stale (spec v1.1 §7). */
export function failureCode(row: Pick<AeoOutboundRow, 'status' | 'createdAt' | 'errorCode'>, nowMs: number): string | null {
  if (row.errorCode) return row.errorCode
  return row.status === 'generating' && nowMs - new Date(row.createdAt).getTime() > STALE_GENERATING_MS ? 'stale' : null
}
```
Append to `lib/aeo-outbound/store.test.ts` (add `failureCode` to the import):
```ts
test('failure code: the stored code, else stale for a generating row past the limit', () => {
  const t = NOW.getTime()
  expect(failureCode(row({ status: 'failed', errorCode: 'no_data' }), t)).toBe('no_data')
  expect(failureCode(row({ status: 'generating', errorCode: null }), t + 6 * 60_000 + 1)).toBe('stale')
  expect(failureCode(row({ status: 'generating', errorCode: null }), t + 60_000)).toBeNull()
  expect(failureCode(row({ status: 'failed', errorCode: null }), t)).toBeNull()
})
```
Replace `app/tools/new-business/[reportId]/page.tsx` with:
```tsx
import { notFound } from 'next/navigation'
import { requireStaff } from '@/lib/auth/page-access'
import { outboundAccess } from '@/lib/aeo-outbound/access'
import { DECISIONS, PAGE_WORDS_V1 } from '@/lib/aeo-outbound/config'
import { errorLabel } from '@/lib/aeo-outbound/log'
import { displayStatus, failureCode, failureReason, getReport, isReportId, opensForReportQuery } from '@/lib/aeo-outbound/store'
import { needsValidationPaths, withDefaults } from '@/lib/aeo-outbound/slots'
import { OutboundEditor, type OpenEvent } from '@/components/aeo-outbound/editor'
import { NoAccess } from '@/components/aeo-outbound/no-access'

export default async function NewBusinessEditorPage({
  params,
}: {
  params: Promise<{ reportId: string }>
}) {
  const { reportId } = await params
  const session = await requireStaff()
  const access = await outboundAccess(session.user)
  if (!access.ok) return <NoAccess admins={access.admins} />
  if (!isReportId(reportId)) notFound()
  let row: Awaited<ReturnType<typeof getReport>>
  try {
    row = await getReport(reportId)
  } catch (e) {
    // A database failure is not a missing snapshot: log it and let the error boundary show.
    console.error(`[aeo-outbound] editor read failed id=${reportId} reason=${errorLabel(e)}`)
    throw e
  }
  if (!row) notFound()
  const now = Date.now()
  const status = displayStatus(row, now)
  const full = row.data && row.slots && !row.unreadable ? withDefaults(row.slots, row.data) : null
  let opens: OpenEvent[] = []
  if (status === 'live' || status === 'revoked') {
    try {
      opens = (await opensForReportQuery(row.id)).map((o) => ({ openedAt: o.openedAt.toISOString(), uaFamily: o.uaFamily, likelyAutomated: o.likelyAutomated, reason: o.reason }))
    } catch (e) {
      // The open list is a detail: the editor still shows the row and its counter.
      console.error(`[aeo-outbound] editor opens read failed id=${row.id} reason=${errorLabel(e)}`)
    }
  }
  // Every prop is plain data (strings, numbers, booleans, null, arrays and objects of those): check:rsc.
  return (
    <OutboundEditor
      key={row.id}
      id={row.id}
      brand={row.brandName ?? row.peecProjectName}
      projectId={row.peecProjectId}
      status={status}
      revision={row.revision}
      notes={row.notes ?? []}
      needsValidation={full ? needsValidationPaths(full) : []}
      token={row.status === 'approved' && !row.shareRevokedAt ? row.shareToken : null}
      error={failureReason(row, now)}
      errorCode={failureCode(row, now)}
      recipient={row.shareRecipient}
      sectionTitles={full ? [full.page.section_1_title, full.page.section_2_title] : [PAGE_WORDS_V1.section_1_title, PAGE_WORDS_V1.section_2_title]}
      about={row.data ? { projectId: row.data.projectId, projectName: row.data.projectName, projectStatus: row.data.projectStatus ?? null, windowLabel: row.data.windowLabel, models: row.data.models } : null}
      opens={opens}
      openCount={row.openCount}
      needsValidationBlocksApprove={DECISIONS.needsValidationBlocksApprove}
      unreadable={row.status === 'draft' && !!row.unreadable}
      progressStep={row.progressStep}
      createdAt={row.createdAt.toISOString()}
    />
  )
}
```
Run the editor and store tests; then the gate (it includes `check:rsc` and `protected-pages.test.ts`).

- [ ] **Step 6: Gate, commit, push**

Commit every file this task touched, by name, with subject `Rebuild the editor around Edit mode, Before you send, dialogs and the open list` and body:
```
Edge cases (the editor receives postMessage from a sandboxed frame and PATCHes shared state):
- external failure: the view, slot and action calls keep their v1.0 retry, stop and message rules; the open-list read failing logs one line and the page still shows: fix
- operator visibility: the editor read and the open-list read log the id and the error code: fix
- bounds: the open list shows at most 200 events; locked messages last 3 seconds: fix
- input boundaries: frame messages need their source to be the frame; dirty, edit and structure need a path; a structure must name a known list and op: fix
- state and concurrency: structural items wait for pending edits and keep the frame read-only until the reload; the panel re-syncs on status or revision change: fix
- security: every prop is plain data; no new origin is trusted: fix

Co-Authored-By: Claude <model> <noreply@anthropic.com>
```
Push.

---
### Task 11: The hub and Show older

Covers v1.1 §5 (the subtitle, status tabs with server counts, one server-side search box over brand, project, recipient and creator, sortable columns, 50 rows a page, every live row plus the newest 500 others with Show older, the empty states, failed reasons as visible text with Open, the requested range under the project), §6 (opens split into likely people and automated with "not classified", first and last opened as date and time, the visible caveat), §7 (per-project pending generation, progress per row, "Draft ready: {brand}. Open", never jumping to a page Ryan left, "Keep this tab open until it finishes."), §9 (the date `min` and `max`, the range error clearing, a 400 bad-request with its own message), §11 (the searchable project picker, dialogs, Copy link), round-2 MINORs 13 and 14, Review Focus 3.

**Files:**
- Create: `lib/aeo-outbound/hub-rows.ts`, `lib/aeo-outbound/hub-rows.test.ts`
- Create: `app/api/aeo-outbound/reports/route.ts`, `app/api/aeo-outbound/reports/route.test.ts`
- Create: `components/aeo-outbound/project-picker.tsx`
- Modify: `components/aeo-outbound/hub.tsx:1-279` (full replacement), `components/aeo-outbound/hub.test.tsx` (full replacement)
- Modify: `components/aeo-outbound/generate-client.ts:2,24-31`, `components/aeo-outbound/status.ts:19`, `components/aeo-outbound/status.test.ts:8`, `components/aeo-outbound/messages.ts`
- Modify: `app/tools/new-business/page.tsx:1-28` (full replacement)

**Interfaces:**
- Consumes: `listReportSummaries({ q, before })`, `hubCounts(q, now)`, `projectStats()`, `HubCursor`, `HubCounts`, `ProjectStat`, `ReportSummary`, `failureCode`, `failureReason`, `displayStatus`, `isReportId` (Tasks 2 and 10); `outboundAccess` (Task 5); `ConfirmDialog`, `CopyLink`, `failureText`, `progressText`, `KEEP_OPEN`, `USUALLY`, `OPENS_CAVEAT`, `BAD_REQUEST`, `revokeTitle`, `discardTitle` and the dialog verbs (Tasks 9 and 10); `fmtEasternDateTime` (Task 9); `defaultRange` (`range.ts:20`).
- Produces:
  - `hub-rows.ts`: `interface HubRow { id; brand; projectId; projectName; status: DisplayStatus; createdAt: string; createdBy: string; approvedAt: string | null; error: string | null; errorCode: string | null; progressStep: number; token: string | null; recipient: string | null; openCount: number; opensPerson: number; opensAutomated: number; firstOpenedAt: string | null; lastOpenedAt: string | null; requestedStart: string | null; requestedEnd: string | null }`, `toHubRow(r: ReportSummary, nowMs: number): HubRow`, `MAX_SEARCH = 100`, `cleanSearch(q: unknown): string | null`
  - Show older: `GET /api/aeo-outbound/reports?before=<ISO time>&beforeId=<report id>&q=<search>` answers `200 { rows: HubRow[], cursor: { before: string, beforeId: string } | null }` (`cursor` null when nothing older is left), `400 { error: 'bad-request' }` for a missing or malformed cursor, `403 { error: 'forbidden' }`, `503 { error: 'unavailable' }`
  - `hub.tsx`: `interface OutboundHubProps { rows: HubRow[]; counts: HubCounts; cursor: HubCursor | null; q: string; projectStats: Record<string, ProjectStat>; isAdmin: boolean }`, `OutboundHub`, `StatusPill` (unchanged), `opensSummary(r): string`, re-exports `HubRow`, `btnCls`, `cardCls`
  - `project-picker.tsx`: `interface PickerProject { id: string; name: string; status: string }`, `projectLine(p, stat): string`, `ProjectPicker(props)`
  - `status.ts`: failed rows get `['open', 'rerun', 'discard']`

- [ ] **Step 1: Messages**

Append to `components/aeo-outbound/messages.ts`, and delete `REVOKE_CONFIRM`, `DISCARD_CONFIRM`, `SCANNER_NOTE`, `GENERATING_EDITOR` and `NEEDS_VALIDATION_FIRST` (nothing imports them after this task; confirm with `grep -rn "REVOKE_CONFIRM\|DISCARD_CONFIRM\|SCANNER_NOTE\|GENERATING_EDITOR\|NEEDS_VALIDATION_FIRST" components app lib`):
```ts
/** v1.1 §5: the hub. */
export const HUB_SUBTITLE = 'One-page AI visibility snapshots for prospects. Generate, edit, approve, send and track.'
export const SETTINGS = 'Settings'
export const SEARCH_LABEL = 'Search'
export const SEARCH_PLACEHOLDER = 'Brand, project, recipient or creator'
export const EMPTY_FIRST = 'No snapshots yet. Pick a Peec project above and click Generate.'
export const EMPTY_MATCH = 'No snapshots match.'
export const CLEAR_FILTERS = 'Clear filters'
export const SHOW_OLDER = 'Show older'
export const OLDER_FAILED = "Couldn't load older snapshots. Try again."
export const PREVIOUS = 'Previous'
export const NEXT = 'Next'
export const pageOf = (page: number, pages: number): string => `Page ${page} of ${pages}`
export const createdByLine = (email: string): string => `by ${email}`
export const draftReady = (brand: string): string => `Draft ready: ${brand}.`
export const OPEN = 'Open'
export const firstOpened = (when: string): string => `First opened ${when}`
export const lastOpened = (when: string): string => `Last opened ${when}`
export const NO_OPENS_SHORT = 'No opens yet'
/** v1.1 §11: the project picker. */
export const PROJECT_LABEL = 'Peec project'
export const PICK_PROJECT = 'Pick a Peec project'
export const LOADING_PROJECTS = 'Loading Peec projects…'
export const NO_PROJECT_MATCH = 'No Peec project matches.'
```

- [ ] **Step 2: Write the failing hub-rows and Show older route tests**

Create `lib/aeo-outbound/hub-rows.test.ts`:
```ts
import { expect, test } from 'vitest'
import { cleanSearch, toHubRow } from './hub-rows'
import type { ReportSummary } from './store'

const NOW = Date.parse('2026-10-08T15:00:00Z')
const S = {
  id: 'c7d8e0a1-1111-4111-8111-111111111111', peecProjectId: 'or_a', peecProjectName: 'Acme pitch', brandName: null, status: 'generating',
  error: null, errorCode: null, progressStep: 4, shareToken: 'tok', shareRecipient: null, openCount: 0, firstOpenedAt: null, lastOpenedAt: null,
  createdAt: new Date('2026-10-08T14:50:00Z'), createdBy: 'ryan@avenuez.com', approvedAt: null, approvedBy: null, shareRevokedAt: null,
  requestedStart: '2026-09-01', requestedEnd: '2026-09-30', opensPerson: 0, opensAutomated: 0,
} as unknown as ReportSummary

test('a hub row is plain data: the project name stands in for a missing brand, a stale generating row reads failed with the stale code', () => {
  expect(toHubRow(S, NOW)).toEqual({
    id: S.id, brand: 'Acme pitch', projectId: 'or_a', projectName: 'Acme pitch', status: 'failed',
    createdAt: '2026-10-08T14:50:00.000Z', createdBy: 'ryan@avenuez.com', approvedAt: null,
    error: 'Timed out', errorCode: 'stale', progressStep: 4, token: null, recipient: null,
    openCount: 0, opensPerson: 0, opensAutomated: 0, firstOpenedAt: null, lastOpenedAt: null,
    requestedStart: '2026-09-01', requestedEnd: '2026-09-30',
  })
  const live = toHubRow({ ...S, status: 'approved', brandName: 'Acme', approvedAt: new Date('2026-10-02T15:00:00Z'), openCount: 3, opensPerson: 1, opensAutomated: 2 } as ReportSummary, NOW)
  expect(live).toMatchObject({ status: 'live', brand: 'Acme', token: 'tok', approvedAt: '2026-10-02T15:00:00.000Z', opensPerson: 1, opensAutomated: 2 })
})

test('search text is trimmed, collapsed, capped at 100 characters, the first of several, and empty means none', () => {
  expect(cleanSearch('  Acme \n  Co ')).toBe('Acme Co')
  expect(cleanSearch(['one', 'two'])).toBe('one')
  expect(cleanSearch('x'.repeat(150))).toHaveLength(100)
  for (const v of [undefined, null, '', '   ', 5]) expect(cleanSearch(v)).toBeNull()
})
```

Create `app/api/aeo-outbound/reports/route.test.ts`:
```ts
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { NextRequest } from 'next/server'

const m = vi.hoisted(() => ({ list: vi.fn() }))
vi.mock('@/lib/aeo-outbound/store', async (o) => ({ ...(await o<object>()), listReportSummaries: m.list }))
vi.mock('@/lib/aeo-outbound/settings-store', () => ({ readSettingsRow: vi.fn(async () => null) }))

import { GET } from './route'
import { auth } from '@/auth'

const ID = 'c7d8e0a1-1111-4111-8111-111111111111'
const get = (qs: string) => GET(new NextRequest(`https://app.example/api/aeo-outbound/reports${qs}`))
const as = (email: string) => vi.mocked(auth).mockResolvedValue({ user: { role: 'INTERNAL_ANALYST', email, clientSlug: null } } as never)
const summary = { id: ID, peecProjectId: 'or_a', peecProjectName: 'Acme pitch', brandName: 'Acme', status: 'draft', error: null, errorCode: null, progressStep: 0, shareToken: null, shareRecipient: null, openCount: 0, firstOpenedAt: null, lastOpenedAt: null, createdAt: new Date('2026-08-01T00:00:00Z'), createdBy: 'ryan@avenuez.com', approvedAt: null, approvedBy: null, shareRevokedAt: null, requestedStart: null, requestedEnd: null, opensPerson: 0, opensAutomated: 0 }

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.stubEnv('AEO_OUTBOUND_USERS', 'ryan@avenuez.com')
  as('ryan@avenuez.com')
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.clearAllMocks() })

test('403 without access, before any read', async () => {
  as('other@avenuez.com')
  expect((await get(`?before=2026-09-01T00:00:00.000Z&beforeId=${ID}`)).status).toBe(403)
  expect(m.list).not.toHaveBeenCalled()
})

test('400 for a missing or malformed cursor', async () => {
  for (const qs of ['', `?beforeId=${ID}`, '?before=2026-09-01T00:00:00.000Z', `?before=yesterday&beforeId=${ID}`, '?before=2026-09-01T00:00:00.000Z&beforeId=nope']) {
    const res = await get(qs)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'bad-request' })
  }
  expect(m.list).not.toHaveBeenCalled()
})

test('Show older: the rows below the cursor for the same search, as hub rows, with the next cursor', async () => {
  m.list.mockResolvedValue({ rows: [summary], cursor: { before: '2026-07-01T00:00:00.000Z', beforeId: ID } })
  const res = await get(`?before=2026-09-01T00:00:00.000Z&beforeId=${ID}&q=%20acme%20`)
  expect(res.status).toBe(200)
  expect(res.headers.get('Cache-Control')).toBe('no-store')
  expect(m.list).toHaveBeenCalledWith({ q: 'acme', before: { createdAt: new Date('2026-09-01T00:00:00.000Z'), id: ID } })
  const body = await res.json()
  expect(body.cursor).toEqual({ before: '2026-07-01T00:00:00.000Z', beforeId: ID })
  expect(body.rows).toHaveLength(1)
  expect(body.rows[0]).toMatchObject({ id: ID, brand: 'Acme', status: 'draft', createdAt: '2026-08-01T00:00:00.000Z', createdBy: 'ryan@avenuez.com' })
})

test('503 with one safe log line when the read fails', async () => {
  m.list.mockRejectedValue(Object.assign(new Error('params ryan@avenuez.com'), { code: '57P01' }))
  const res = await get(`?before=2026-09-01T00:00:00.000Z&beforeId=${ID}`)
  expect(res.status).toBe(503)
  expect(vi.mocked(console.error).mock.calls.map((c) => c.map(String).join(' '))).toEqual(['[aeo-outbound] hub older read failed reason=57P01'])
})
```
Run: `perl -e 'alarm 590; exec @ARGV' -- npx vitest run lib/aeo-outbound/hub-rows.test.ts app/api/aeo-outbound/reports/route.test.ts` (FAIL).

- [ ] **Step 3: Implement hub-rows, the Show older route and the hub page**

Create `lib/aeo-outbound/hub-rows.ts`:
```ts
// The hub's row as plain data (check:rsc), shared by the hub page and the Show older route (spec v1.1 §5).
import { displayStatus, failureCode, failureReason, type DisplayStatus, type ReportSummary } from './store'

export interface HubRow {
  id: string
  brand: string
  projectId: string
  projectName: string
  status: DisplayStatus
  createdAt: string
  createdBy: string
  approvedAt: string | null
  error: string | null
  errorCode: string | null
  progressStep: number
  token: string | null
  recipient: string | null
  openCount: number
  opensPerson: number
  opensAutomated: number
  firstOpenedAt: string | null
  lastOpenedAt: string | null
  requestedStart: string | null
  requestedEnd: string | null
}

export function toHubRow(r: ReportSummary, nowMs: number): HubRow {
  return {
    id: r.id,
    brand: r.brandName ?? r.peecProjectName,
    projectId: r.peecProjectId,
    projectName: r.peecProjectName,
    status: displayStatus(r, nowMs),
    createdAt: r.createdAt.toISOString(),
    createdBy: r.createdBy,
    approvedAt: r.approvedAt?.toISOString() ?? null,
    error: failureReason(r, nowMs),
    errorCode: failureCode(r, nowMs),
    progressStep: r.progressStep,
    token: r.status === 'approved' && !r.shareRevokedAt ? r.shareToken : null,
    recipient: r.shareRecipient,
    openCount: r.openCount,
    opensPerson: r.opensPerson,
    opensAutomated: r.opensAutomated,
    firstOpenedAt: r.firstOpenedAt?.toISOString() ?? null,
    lastOpenedAt: r.lastOpenedAt?.toISOString() ?? null,
    requestedStart: r.requestedStart,
    requestedEnd: r.requestedEnd,
  }
}

export const MAX_SEARCH = 100
/** The hub's ?q=: the first value if repeated, control characters and runs of whitespace collapsed, capped; empty is none. */
export function cleanSearch(q: unknown): string | null {
  const raw = Array.isArray(q) ? q[0] : q
  if (typeof raw !== 'string') return null
  const s = raw.replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_SEARCH)
  return s || null
}
```

Create `app/api/aeo-outbound/reports/route.ts`:
```ts
// GET /api/aeo-outbound/reports?before=<ISO>&beforeId=<id>&q=<search>: Show older (spec v1.1 §5). The next 500 rows that
// are not live, older than the cursor and matching the same search, as hub rows, and the next cursor (null when none are
// left). Live rows are never here: the hub already lists every one of them.
import { NextResponse, type NextRequest } from 'next/server'
import { auth } from '@/auth'
import { outboundAccess } from '@/lib/aeo-outbound/access'
import { cleanSearch, toHubRow } from '@/lib/aeo-outbound/hub-rows'
import { errorLabel } from '@/lib/aeo-outbound/log'
import { isReportId, listReportSummaries } from '@/lib/aeo-outbound/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!(await outboundAccess(session?.user)).ok) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const sp = req.nextUrl.searchParams
  const before = sp.get('before')
  const beforeId = sp.get('beforeId')
  const at = before ? new Date(before) : null
  if (!at || Number.isNaN(at.getTime()) || !isReportId(beforeId)) return NextResponse.json({ error: 'bad-request' }, { status: 400 })
  const now = Date.now()
  try {
    const list = await listReportSummaries({ q: cleanSearch(sp.get('q')), before: { createdAt: at, id: beforeId } })
    return NextResponse.json({ rows: list.rows.map((r) => toHubRow(r, now)), cursor: list.cursor }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error(`[aeo-outbound] hub older read failed reason=${errorLabel(e)}`)
    return NextResponse.json({ error: 'unavailable' }, { status: 503 })
  }
}
```

Replace `app/tools/new-business/page.tsx` with:
```tsx
import { requireStaff } from '@/lib/auth/page-access'
import { outboundAccess } from '@/lib/aeo-outbound/access'
import { cleanSearch, toHubRow } from '@/lib/aeo-outbound/hub-rows'
import { hubCounts, listReportSummaries, projectStats } from '@/lib/aeo-outbound/store'
import { OutboundHub } from '@/components/aeo-outbound/hub'
import { NoAccess } from '@/components/aeo-outbound/no-access'

export default async function NewBusinessHubPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>
}) {
  const { q } = await searchParams
  const session = await requireStaff()
  const access = await outboundAccess(session.user)
  if (!access.ok) return <NoAccess admins={access.admins} />
  // v1.1 §5: search is server-side over every row; the tab counts cover every row that matches it.
  const search = cleanSearch(q)
  const now = Date.now()
  const [list, counts, stats] = await Promise.all([listReportSummaries({ q: search }), hubCounts(search, new Date(now)), projectStats()])
  // Every prop is plain data (strings, numbers, null, arrays and objects of those): nothing here may be a function (check:rsc).
  return (
    <OutboundHub rows={list.rows.map((r) => toHubRow(r, now))} cursor={list.cursor} counts={counts} q={search ?? ''} projectStats={stats} isAdmin={access.admin} />
  )
}
```
Run the hub-rows and route tests: PASS.

- [ ] **Step 4: Write the failing hub tests**

Replace `components/aeo-outbound/hub.test.tsx` with:
```tsx
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { OutboundHub, opensSummary, type HubRow, type OutboundHubProps } from './hub'

const { refresh, push, actions } = vi.hoisted(() => ({
  refresh: vi.fn(),
  push: vi.fn(),
  actions: { approveSnapshotAction: vi.fn(), revokeSnapshotAction: vi.fn(), discardSnapshotAction: vi.fn(), copySnapshotAsDraftAction: vi.fn() },
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push }) }))
vi.mock('@/app/actions/aeo-outbound', () => actions)

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const PROJECTS = [{ id: 'p1', name: 'Acme pitch', status: 'PITCH' }, { id: 'p2', name: 'Globex pitch', status: 'PITCH_ENDED' }]
const COUNTS = { all: 0, draft: 0, live: 0, revoked: 0, failed: 0 }
const row = (over: Partial<HubRow>): HubRow => ({
  id: ID(1), brand: 'Acme', projectId: 'p1', projectName: 'Acme pitch', status: 'draft',
  createdAt: '2026-10-01T15:00:00.000Z', createdBy: 'ryan@avenuez.com', approvedAt: null, error: null, errorCode: null, progressStep: 0,
  token: null, recipient: null, openCount: 0, opensPerson: 0, opensAutomated: 0, firstOpenedAt: null, lastOpenedAt: null,
  requestedStart: null, requestedEnd: null, ...over,
})
const props = (over: Partial<OutboundHubProps> = {}): OutboundHubProps => ({ rows: [], counts: COUNTS, cursor: null, q: '', projectStats: {}, isAdmin: false, ...over })
const hub = (over: Partial<OutboundHubProps> = {}) => render(<OutboundHub {...props(over)} />)

let generate: () => Promise<Response>
let projects: () => Promise<Response>
let older: (url: string) => Promise<Response>
const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
  if (url === '/api/aeo-outbound/projects') return projects()
  if (url === '/api/aeo-outbound/generate') return generate()
  if (url.startsWith('/api/aeo-outbound/reports?')) return older(url)
  throw new Error(`unexpected fetch ${url}`)
})
const bodies = () => fetchMock.mock.calls.filter(([u]) => u === '/api/aeo-outbound/generate').map(([, init]) => JSON.parse(String(init?.body)))

beforeEach(() => {
  refresh.mockReset(); push.mockReset(); fetchMock.mockClear()
  Object.values(actions).forEach((a) => a.mockReset())
  projects = async () => json(200, PROJECTS)
  generate = async () => json(200, { id: ID(9), status: 'draft' })
  older = async () => json(200, { rows: [], cursor: null })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

const box = () => screen.getByRole('combobox', { name: 'Peec project' })
const loaded = () => waitFor(() => expect(box()).toBeEnabled())
async function pick(name = 'Acme pitch') {
  await loaded()
  fireEvent.focus(box())
  fireEvent.click(screen.getByRole('option', { name: new RegExp(`^${name}`) }))
}
async function pickAndGenerate(rows: HubRow[] = []) {
  const r = hub({ rows, counts: { ...COUNTS, all: rows.length } })
  await pick()
  fireEvent.click(screen.getByRole('button', { name: 'Generate' }))
  return r
}
const rowEl = (id: string) => within(screen.getByTestId(`row-${id}`))

test('the header has the title and subtitle, refreshes on mount, and admins get a Settings link', async () => {
  hub()
  expect(screen.getByRole('heading', { name: 'AEO Outbound Snapshot' })).toBeInTheDocument()
  expect(screen.getByText('One-page AI visibility snapshots for prospects. Generate, edit, approve, send and track.')).toBeInTheDocument()
  expect(refresh).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument()
  await loaded()
  cleanup()
  hub({ isAdmin: true })
  expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/tools/new-business/settings')
  await loaded()
})

test('refreshes every 5s only while a row is generating', async () => {
  vi.useFakeTimers()
  const { unmount } = hub({ rows: [row({ status: 'generating' })] })
  expect(refresh).toHaveBeenCalledTimes(1)
  await act(() => vi.advanceTimersByTimeAsync(5000))
  expect(refresh).toHaveBeenCalledTimes(2)
  await act(() => vi.advanceTimersByTimeAsync(5000))
  expect(refresh).toHaveBeenCalledTimes(3)
  unmount()
  refresh.mockReset()
  hub({ rows: [row({ status: 'draft' })] })
  await act(() => vi.advanceTimersByTimeAsync(15000))
  expect(refresh).toHaveBeenCalledTimes(1)
})

test('the empty-date helper names the full history, and the dates are limited to the last 400 days', async () => {
  hub()
  expect(screen.getByText("Left empty, the report covers the project's full history, up to 400 days back.")).toBeInTheDocument()
  const today = new Date().toISOString().slice(0, 10)
  const earliest = new Date(Date.parse(`${today}T00:00:00Z`) - 400 * 86_400_000).toISOString().slice(0, 10)
  for (const label of ['Start date', 'End date']) {
    expect(screen.getByLabelText(label)).toHaveAttribute('max', today)
    expect(screen.getByLabelText(label)).toHaveAttribute('min', earliest)
  }
  await loaded()
})

test('the project picker is a searchable combobox showing each status and snapshot history', async () => {
  let release: (r: Response) => void = () => {}
  projects = () => new Promise((r) => { release = r })
  hub({ projectStats: { p1: { count: 3, last: '2026-10-05T15:00:00.000Z' } } })
  expect(box()).toBeDisabled()
  expect(box()).toHaveAttribute('placeholder', 'Loading Peec projects…')
  await act(async () => release(json(200, PROJECTS)))
  await loaded()
  fireEvent.focus(box())
  expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Acme pitchPitch · 3 snapshots, last Oct 5, 2026', 'Globex pitchPitch ended · No snapshots yet'])
  fireEvent.change(box(), { target: { value: 'glo' } })
  expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Globex pitchPitch ended · No snapshots yet'])
  fireEvent.keyDown(box(), { key: 'Enter' })
  expect(box()).toHaveValue('Globex pitch')
})

test('Generate shows a local progress row with the keep-open advice, and 200 draft opens the new draft', async () => {
  let release: (r: Response) => void = () => {}
  generate = () => new Promise((r) => { release = r })
  await pickAndGenerate()
  expect(await screen.findByText(/^Pulling Peec data… 0:0\d$/)).toBeInTheDocument()
  expect(screen.getByText('Keep this tab open until it finishes.')).toBeInTheDocument()
  expect(screen.getByText('Usually 35 to 45 seconds')).toBeInTheDocument()
  expect(bodies()).toEqual([{ projectId: 'p1' }])
  await act(async () => release(json(200, { id: ID(9), status: 'draft' })))
  await waitFor(() => expect(push).toHaveBeenCalledWith(`/tools/new-business/${ID(9)}`))
})

test('200 failed shows the reason in plain words when it has a code, else the stored text, and refreshes', async () => {
  generate = async () => json(200, { id: ID(9), status: 'failed', error: 'No day between 2026-09-01 and 2026-09-30 has any Peec data for this project', code: 'no_data' })
  await pickAndGenerate()
  expect(await screen.findByText('Peec has no data for this project in that period. Pick other dates.')).toBeInTheDocument()
  expect(refresh).toHaveBeenCalledTimes(2)
  cleanup()
  generate = async () => json(200, { id: ID(9), status: 'failed', error: 'Copy generation failed. Rerun.' })
  await pickAndGenerate()
  expect(await screen.findByText('Copy generation failed. Rerun.')).toBeInTheDocument()
  expect(push).not.toHaveBeenCalled()
})

test.each([
  [400, { error: "This Peec project can't be used.", code: 'bad-project' }, "This Peec project can't be used."],
  [400, { error: 'bad-request', code: 'bad-request' }, "That request wasn't valid. Refresh the page and try again."],
  [403, { error: 'forbidden' }, 'This tool is limited to the New Business team.'],
  [404, { error: "That snapshot can't be rerun. Refresh the list.", code: 'bad-rerun' }, "That snapshot can't be rerun. Refresh the list."],
  [500, { error: 'Could not start generation. Try again.' }, 'Could not start generation. Try again.'],
  [502, { error: "Peec isn't configured on this server. Tell engineering." }, "Peec isn't configured on this server. Tell engineering."],
])('a %i answer shows its message', async (status, body, text) => {
  generate = async () => json(status, body)
  await pickAndGenerate()
  expect(await screen.findByText(text)).toBeInTheDocument()
  expect(push).not.toHaveBeenCalled()
  expect(screen.queryByText(/^Pulling Peec data/)).not.toBeInTheDocument()
  expect(refresh).toHaveBeenCalledTimes(2)
})

test('a 400 bad-range shows inline by the dates, and clears when a date changes', async () => {
  generate = async () => json(400, { error: 'Pick at most 90 days.', code: 'bad-range' })
  await pickAndGenerate()
  const msg = await screen.findByText('Pick at most 90 days.')
  expect(msg.closest('[data-range]')).not.toBeNull()
  fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-09-01' } })
  expect(screen.queryByText('Pick at most 90 days.')).not.toBeInTheDocument()
})

test('a 409 opens the snapshot already generating, or refreshes when its id is unknown', async () => {
  generate = async () => json(409, { error: 'already-generating', id: ID(7) })
  await pickAndGenerate()
  await waitFor(() => expect(push).toHaveBeenCalledWith(`/tools/new-business/${ID(7)}`))
  cleanup(); push.mockReset(); refresh.mockReset()
  generate = async () => json(409, { error: 'already-generating', id: null })
  await pickAndGenerate()
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2))
  expect(push).not.toHaveBeenCalled()
})

test('a network error or a 5xx with no JSON is a lost connection that refreshes', async () => {
  generate = async () => { throw new TypeError('Failed to fetch') }
  await pickAndGenerate()
  expect(await screen.findByText('Lost connection. Refreshing')).toBeInTheDocument()
  cleanup()
  generate = async () => new Response('<html>gateway</html>', { status: 504 })
  await pickAndGenerate()
  expect(await screen.findByText('Lost connection. Refreshing')).toBeInTheDocument()
})

test('each filled date is sent, so a lone date reaches the route and its 400 shows inline; no dates sends only the project', async () => {
  generate = async () => json(400, { error: 'Pick both a start and an end date, or neither.', code: 'bad-range' })
  hub()
  await pick()
  fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-09-01' } })
  fireEvent.click(screen.getByRole('button', { name: 'Generate' }))
  expect((await screen.findByText('Pick both a start and an end date, or neither.')).closest('[data-range]')).not.toBeNull()
  fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '' } })
  fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-09-30' } })
  fireEvent.click(screen.getByRole('button', { name: 'Generate' }))
  await waitFor(() => expect(bodies()).toHaveLength(2))
  generate = async () => json(200, { id: ID(9), status: 'draft' })
  fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-09-01' } })
  fireEvent.click(screen.getByRole('button', { name: 'Generate' }))
  await waitFor(() => expect(push).toHaveBeenCalledTimes(1))
  expect(bodies()).toEqual([{ projectId: 'p1', start: '2026-09-01' }, { projectId: 'p1', end: '2026-09-30' }, { projectId: 'p1', start: '2026-09-01', end: '2026-09-30' }])
  cleanup(); fetchMock.mockClear()
  await pickAndGenerate()
  await waitFor(() => expect(bodies()).toEqual([{ projectId: 'p1' }]))
})

test('a failed projects load shows "Peec is unavailable. Retry" and the table still renders', async () => {
  projects = async () => json(502, { error: 'Peec is unavailable. Try again.' })
  hub({ rows: [row({ brand: 'Initech' })], counts: { ...COUNTS, all: 1, draft: 1 } })
  const retry = await screen.findByRole('button', { name: 'Peec is unavailable. Retry' })
  expect(screen.getByText('Initech')).toBeInTheDocument()
  projects = async () => json(200, PROJECTS)
  fireEvent.click(retry)
  await loaded()
  expect(screen.queryByRole('button', { name: 'Peec is unavailable. Retry' })).not.toBeInTheDocument()
})

test('Rerun posts only the project and the row id, and opens the new draft', async () => {
  hub({ rows: [row({ status: 'live', token: 'tok', approvedAt: '2026-10-02T15:00:00.000Z', recipient: 'Jane Doe, Acme' })], counts: { ...COUNTS, all: 1, live: 1 } })
  await loaded()
  fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-09-01' } })
  fireEvent.click(screen.getByRole('button', { name: 'Rerun' }))
  await waitFor(() => expect(push).toHaveBeenCalledWith(`/tools/new-business/${ID(9)}`))
  expect(bodies()).toEqual([{ projectId: 'p1', rerunOf: ID(1) }])
})

test('each status shows exactly its actions; a failed row gets Open and shows its reason as visible text', async () => {
  hub({ rows: [
    row({ id: ID(1), status: 'draft' }),
    row({ id: ID(2), status: 'live', token: 't', recipient: 'R', approvedAt: '2026-10-02T15:00:00.000Z' }),
    row({ id: ID(3), status: 'revoked', recipient: 'R', approvedAt: '2026-10-02T15:00:00.000Z' }),
    row({ id: ID(4), status: 'failed', error: 'Peec project needs exactly one own brand (found 2)', errorCode: 'own_brand_count' }),
    row({ id: ID(5), status: 'generating' }),
  ], counts: { ...COUNTS, all: 5 } })
  const labels = (id: string) => Array.from(rowEl(id).getAllByRole('cell').at(-1)!.querySelectorAll('a,button')).map((e) => e.textContent)
  await loaded()
  expect(labels(ID(1))).toEqual(['Open', 'Rerun', 'Discard'])
  expect(labels(ID(2))).toEqual(['Open', 'Copy link', 'Revoke', 'Edit a copy', 'Rerun'])
  expect(labels(ID(3))).toEqual(['Open', 'Edit a copy', 'Rerun'])
  expect(labels(ID(4))).toEqual(['Open', 'Rerun', 'Discard'])
  expect(labels(ID(5))).toEqual([])
  expect(rowEl(ID(4)).getByRole('link', { name: 'Open' })).toHaveAttribute('href', `/tools/new-business/${ID(4)}`)
  expect(rowEl(ID(4)).getByText("In Peec, mark exactly one brand as the client's own brand, then Rerun.")).toBeInTheDocument()
})

test('the columns: created with who, sent as date and time, sent to, the requested range, and opens split by likely people and automated', async () => {
  hub({ rows: [
    row({ id: ID(1), status: 'draft', requestedStart: '2026-09-01', requestedEnd: '2026-09-30' }),
    row({ id: ID(2), status: 'live', token: 't', recipient: 'Jane Doe, Acme', approvedAt: '2026-10-02T15:00:00.000Z', openCount: 3, opensPerson: 1, opensAutomated: 2, firstOpenedAt: '2026-10-03T15:00:00.000Z', lastOpenedAt: '2026-10-05T15:00:00.000Z' }),
  ], counts: { ...COUNTS, all: 2 } })
  const cells = (id: string) => rowEl(id).getAllByRole('cell')
  expect(cells(ID(1))[1]).toHaveTextContent('Sep 1, 2026 to Sep 30, 2026')
  for (const i of [4, 5, 6]) expect(cells(ID(1))[i].textContent).toBe('')
  expect(cells(ID(2))[3]).toHaveTextContent('Oct 1, 2026, 11:00 AM')
  expect(cells(ID(2))[3]).toHaveTextContent('by ryan@avenuez.com')
  expect(cells(ID(2))[4].textContent).toBe('Oct 2, 2026, 11:00 AM')
  expect(cells(ID(2))[5].textContent).toBe('Jane Doe, Acme')
  expect(cells(ID(2))[6]).toHaveTextContent('3 opens: 1 likely person, 2 likely automated')
  expect(cells(ID(2))[6]).toHaveTextContent('First opened Oct 3, 2026, 11:00 AM')
  expect(cells(ID(2))[6]).toHaveTextContent('Last opened Oct 5, 2026, 11:00 AM')
  expect(screen.getByText('Email security scanners can open links automatically. Opens marked automated are likely scanners. The marking is best effort.')).toBeInTheDocument()
  await loaded()
})

test('opensSummary: people and automated, and opens from before v1.1 counted as not classified', () => {
  expect(opensSummary({ openCount: 0, opensPerson: 0, opensAutomated: 0 })).toBe('No opens yet')
  expect(opensSummary({ openCount: 3, opensPerson: 1, opensAutomated: 2 })).toBe('3 opens: 1 likely person, 2 likely automated')
  expect(opensSummary({ openCount: 1, opensPerson: 0, opensAutomated: 0 })).toBe('1 open: 0 likely people, 0 likely automated, 1 not classified')
  expect(opensSummary({ openCount: 5, opensPerson: 2, opensAutomated: 1 })).toBe('5 opens: 2 likely people, 1 likely automated, 2 not classified')
})

test('a generating row shows its step and time', async () => {
  hub({ rows: [row({ status: 'generating', progressStep: 9, createdAt: new Date(Date.now() - 41_000).toISOString() })], counts: { ...COUNTS, all: 1 } })
  expect(rowEl(ID(1)).getByText(/^Writing the copy… 0:4[12]$/)).toBeInTheDocument()
  await loaded()
})

test('status tabs show the server counts and filter the list', async () => {
  hub({ counts: { all: 12, draft: 3, live: 4, revoked: 1, failed: 2 }, rows: [row({ id: ID(1), status: 'draft' }), row({ id: ID(2), status: 'live', token: 't' }), row({ id: ID(3), status: 'failed' })] })
  expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['All (12)', 'Drafts (3)', 'Sent (4)', 'Revoked (1)', 'Failed (2)'])
  fireEvent.click(screen.getByRole('tab', { name: 'Sent (4)' }))
  expect(screen.getAllByTestId(/^row-/).map((r) => r.dataset.testid)).toEqual([`row-${ID(2)}`])
  expect(screen.getByRole('tab', { name: 'Sent (4)' })).toHaveAttribute('aria-selected', 'true')
  await loaded()
})

test('search is server-side: typing sends ?q= after a pause, and the box starts with the current search', async () => {
  hub({ q: 'globex' })
  const search = screen.getByRole('searchbox', { name: 'Search' })
  expect(search).toHaveValue('globex')
  fireEvent.change(search, { target: { value: ' Acme & co ' } })
  await waitFor(() => expect(push).toHaveBeenCalledWith('/tools/new-business?q=Acme%20%26%20co'))
  fireEvent.change(search, { target: { value: '' } })
  await waitFor(() => expect(push).toHaveBeenLastCalledWith('/tools/new-business'))
  await loaded()
})

test('empty states: first use, and no match with Clear filters', async () => {
  hub()
  expect(screen.getByText('No snapshots yet. Pick a Peec project above and click Generate.')).toBeInTheDocument()
  await loaded()
  cleanup()
  hub({ q: 'zzz' })
  expect(screen.getByText('No snapshots match.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
  expect(push).toHaveBeenCalledWith('/tools/new-business')
  await loaded()
  cleanup()
  hub({ rows: [row({ status: 'draft' })], counts: { ...COUNTS, all: 1, draft: 1 } })
  fireEvent.click(screen.getByRole('tab', { name: 'Failed (0)' }))
  expect(screen.getByText('No snapshots match.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
  expect(screen.getByRole('tab', { name: 'All (1)' })).toHaveAttribute('aria-selected', 'true')
  await loaded()
})

test('columns sort: Created newest first by default; Brand ascending, then descending', async () => {
  hub({ rows: [
    row({ id: ID(1), brand: 'Beta', createdAt: '2026-10-01T15:00:00.000Z' }),
    row({ id: ID(2), brand: 'alpha', createdAt: '2026-10-03T15:00:00.000Z' }),
    row({ id: ID(3), brand: 'Gamma', createdAt: '2026-10-02T15:00:00.000Z' }),
  ], counts: { ...COUNTS, all: 3 } })
  const order = () => screen.getAllByTestId(/^row-/).map((r) => within(r).getAllByRole('cell')[0].textContent)
  expect(order()).toEqual(['alpha', 'Gamma', 'Beta'])
  fireEvent.click(screen.getByRole('button', { name: 'Brand' }))
  expect(order()).toEqual(['alpha', 'Beta', 'Gamma'])
  expect(screen.getByRole('columnheader', { name: 'Brand' })).toHaveAttribute('aria-sort', 'ascending')
  fireEvent.click(screen.getByRole('button', { name: 'Brand' }))
  expect(order()).toEqual(['Gamma', 'Beta', 'alpha'])
  await loaded()
})

test('50 rows a page', async () => {
  const many = Array.from({ length: 120 }, (_, i) => row({ id: ID(i + 1), brand: `Brand ${String(i).padStart(3, '0')}`, createdAt: new Date(Date.UTC(2026, 8, 1) + i * 60_000).toISOString() }))
  hub({ rows: many, counts: { ...COUNTS, all: 120, draft: 120 } })
  expect(screen.getAllByTestId(/^row-/)).toHaveLength(50)
  expect(screen.getByText('Page 1 of 3')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  expect(screen.getAllByTestId(/^row-/)).toHaveLength(20)
  expect(screen.getByText('Page 3 of 3')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  await loaded()
})

test('Show older appends older rows once each and follows the next cursor', async () => {
  const cursor = { before: '2026-09-01T00:00:00.000Z', beforeId: ID(5) }
  const asked: Record<string, string>[] = []
  older = async (url) => {
    asked.push(Object.fromEntries(new URLSearchParams(url.split('?')[1])))
    return json(200, { rows: [row({ id: ID(1) }), row({ id: ID(6), brand: 'Older Co' })], cursor: null })
  }
  hub({ q: 'acme', rows: [row({ id: ID(1), status: 'live', token: 't' })], cursor, counts: { ...COUNTS, all: 2 } })
  fireEvent.click(screen.getByRole('button', { name: 'Show older' }))
  expect(await screen.findByText('Older Co')).toBeInTheDocument()
  expect(asked).toEqual([{ before: cursor.before, beforeId: ID(5), q: 'acme' }])
  expect(screen.getAllByTestId(`row-${ID(1)}`)).toHaveLength(1)
  expect(screen.queryByRole('button', { name: 'Show older' })).not.toBeInTheDocument()
  await loaded()
})

test('a failed Show older says so and keeps the button', async () => {
  older = async () => json(503, { error: 'unavailable' })
  hub({ rows: [row({})], cursor: { before: '2026-09-01T00:00:00.000Z', beforeId: ID(5) }, counts: { ...COUNTS, all: 1 } })
  fireEvent.click(screen.getByRole('button', { name: 'Show older' }))
  expect(await screen.findByText("Couldn't load older snapshots. Try again.")).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Show older' })).toBeEnabled()
  await loaded()
})

test('pending generation is per project; Rerun is disabled only on the row being rerun', async () => {
  let release: (r: Response) => void = () => {}
  generate = () => new Promise((r) => { release = r })
  hub({ rows: [row({ id: ID(1), projectId: 'p1', status: 'live', token: 't' }), row({ id: ID(2), projectId: 'p2', projectName: 'Globex pitch', brand: 'Globex', status: 'draft' })], counts: { ...COUNTS, all: 2 } })
  await pick('Acme pitch')
  fireEvent.click(screen.getByRole('button', { name: 'Generate' }))
  expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled()
  await pick('Globex pitch')
  expect(screen.getByRole('button', { name: 'Generate' })).toBeEnabled()
  expect(rowEl(ID(1)).getByRole('button', { name: 'Rerun' })).toBeEnabled()
  fireEvent.click(rowEl(ID(2)).getByRole('button', { name: 'Rerun' }))
  expect(rowEl(ID(2)).getByRole('button', { name: 'Rerun' })).toBeDisabled()
  expect(rowEl(ID(1)).getByRole('button', { name: 'Rerun' })).toBeEnabled()
  await act(async () => release(json(200, { id: ID(9), status: 'draft' })))
})

test('a generation that finishes while another runs says Draft ready on its row instead of leaving the hub', async () => {
  const releases: ((r: Response) => void)[] = []
  generate = () => new Promise((r) => { releases.push(r) })
  const { rerender } = hub()
  await pick('Acme pitch')
  fireEvent.click(screen.getByRole('button', { name: 'Generate' }))
  await pick('Globex pitch')
  fireEvent.click(screen.getByRole('button', { name: 'Generate' }))
  await act(async () => releases[0](json(200, { id: ID(8), status: 'draft' })))
  expect(push).not.toHaveBeenCalled()
  rerender(<OutboundHub {...props({ rows: [row({ id: ID(8), brand: 'Acme', status: 'draft' })], counts: { ...COUNTS, all: 1, draft: 1 } })} />)
  expect(rowEl(ID(8)).getByText('Draft ready: Acme.')).toBeInTheDocument()
  expect(rowEl(ID(8)).getAllByRole('link', { name: 'Open' })[0]).toHaveAttribute('href', `/tools/new-business/${ID(8)}`)
  await act(async () => releases[1](json(200, { id: ID(9), status: 'draft' })))
  expect(push).toHaveBeenCalledWith(`/tools/new-business/${ID(9)}`)
})

test('the hub never jumps Ryan to a draft after he left it', async () => {
  let release: (r: Response) => void = () => {}
  generate = () => new Promise((r) => { release = r })
  const { unmount } = await pickAndGenerate()
  unmount()
  await act(async () => release(json(200, { id: ID(9), status: 'draft' })))
  expect(push).not.toHaveBeenCalled()
})

test('Copy link writes the public link and says Copied', async () => {
  const writeText = vi.fn(async () => {})
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  hub({ rows: [row({ status: 'live', token: 'tok_123', recipient: 'R', approvedAt: '2026-10-02T15:00:00.000Z' })], counts: { ...COUNTS, all: 1 } })
  fireEvent.click(await screen.findByRole('button', { name: 'Copy link' }))
  await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/snapshot/tok_123`))
  expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument()
  await loaded()
})

test('Revoke and Discard open in-app dialogs naming the brand and recipient, then act and refresh', async () => {
  actions.revokeSnapshotAction.mockResolvedValue({ ok: true })
  actions.discardSnapshotAction.mockResolvedValue({ ok: true })
  hub({ rows: [row({ id: ID(2), status: 'live', token: 't', recipient: 'R', approvedAt: '2026-10-02T15:00:00.000Z' }), row({ id: ID(4), status: 'failed', error: 'Timed out' })], counts: { ...COUNTS, all: 2 } })
  await loaded()
  fireEvent.click(screen.getByRole('button', { name: 'Revoke' }))
  expect(screen.getByRole('dialog')).toHaveTextContent("Revoke the link for Acme sent to R? It stops working right away and can't be turned back on.")
  fireEvent.click(screen.getByRole('button', { name: 'Keep link' }))
  expect(actions.revokeSnapshotAction).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Revoke' }))
  fireEvent.click(screen.getByRole('button', { name: 'Revoke link' }))
  await waitFor(() => expect(actions.revokeSnapshotAction).toHaveBeenCalledWith(ID(2)))
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2))
  fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
  expect(screen.getByRole('dialog')).toHaveTextContent('Discard the snapshot for Acme? It is removed from the hub.')
  fireEvent.click(screen.getByRole('button', { name: 'Discard snapshot' }))
  await waitFor(() => expect(actions.discardSnapshotAction).toHaveBeenCalledWith(ID(4)))
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(3))
})

test.each([
  ['Revoke', 'revokeSnapshotAction', 'live', 'Revoke link'],
  ['Discard', 'discardSnapshotAction', 'draft', 'Discard snapshot'],
  ['Edit a copy', 'copySnapshotAsDraftAction', 'revoked', null],
] as const)('%s answered unavailable shows the lost connection message', async (name, action, status, verb) => {
  actions[action].mockResolvedValue({ ok: false, error: 'unavailable' })
  hub({ rows: [row({ status, token: status === 'draft' ? null : 't', recipient: status === 'draft' ? null : 'R', approvedAt: status === 'draft' ? null : '2026-10-02T15:00:00.000Z' })], counts: { ...COUNTS, all: 1 } })
  await loaded()
  fireEvent.click(screen.getByRole('button', { name }))
  if (verb) fireEvent.click(screen.getByRole('button', { name: verb }))
  expect(await screen.findByText('Lost connection. Try again.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name })).toBeEnabled()
})

test('Edit a copy is disabled while pending and opens the new draft; a refusal shows its error', async () => {
  let release: (v: unknown) => void = () => {}
  actions.copySnapshotAsDraftAction.mockReturnValueOnce(new Promise((r) => { release = r }))
  hub({ rows: [row({ status: 'revoked', recipient: 'R', approvedAt: '2026-10-02T15:00:00.000Z' })], counts: { ...COUNTS, all: 1 } })
  await loaded()
  const btn = screen.getByRole('button', { name: 'Edit a copy' })
  fireEvent.click(btn)
  await waitFor(() => expect(btn).toBeDisabled())
  await act(async () => release({ ok: true, id: ID(8) }))
  await waitFor(() => expect(push).toHaveBeenCalledWith(`/tools/new-business/${ID(8)}`))
  actions.copySnapshotAsDraftAction.mockResolvedValueOnce({ ok: false, error: 'forbidden' })
  fireEvent.click(screen.getByRole('button', { name: 'Edit a copy' }))
  expect(await screen.findByText('This tool is limited to the New Business team.')).toBeInTheDocument()
})

test('a revoke or Edit a copy that throws shows a message and unlocks the row', async () => {
  actions.revokeSnapshotAction.mockRejectedValue(new Error('dropped'))
  actions.copySnapshotAsDraftAction.mockRejectedValue(new Error('dropped'))
  hub({ rows: [row({ status: 'live', token: 't', recipient: 'R', approvedAt: '2026-10-02T15:00:00.000Z' })], counts: { ...COUNTS, all: 1 } })
  await loaded()
  fireEvent.click(screen.getByRole('button', { name: 'Revoke' }))
  fireEvent.click(screen.getByRole('button', { name: 'Revoke link' }))
  expect(await screen.findByText('Lost connection. Try again.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Revoke' })).toBeEnabled()
  fireEvent.click(screen.getByRole('button', { name: 'Edit a copy' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Edit a copy' })).toBeEnabled())
  expect(push).not.toHaveBeenCalled()
})
```
In `components/aeo-outbound/status.test.ts` line 8 becomes `expect(actionsFor('failed')).toEqual(['open', 'rerun', 'discard'])`.
Run: `perl -e 'alarm 590; exec @ARGV' -- npx vitest run components/aeo-outbound/hub.test.tsx components/aeo-outbound/status.test.ts` (FAIL).

- [ ] **Step 5: Implement the picker, the client mapping, the status table and the hub**

`components/aeo-outbound/status.ts` line 19 becomes `failed: ['open', 'rerun', 'discard'],` (v1.1 §5: a failed row gets Open).

In `components/aeo-outbound/generate-client.ts`: line 2 becomes `import { ACCESS_MESSAGE, BAD_PROJECT, BAD_REQUEST, BAD_RERUN, LOST_CONNECTION } from './messages'` plus `import { failureText } from './failure-text'`; replace lines 24 to 31 with:
```ts
    case 200: {
      const id = str(b.id)
      if (b.status === 'draft' && id) return { kind: 'open', id }
      // 200 failed: the reason in plain words (its code, else its stored text), and a refresh so the row shows it too.
      return { kind: 'message', text: id ? failureText(str(b.code), str(b.error), id) : str(b.error) ?? '', refresh: true }
    }
    case 400:
      if (b.code === 'bad-range' && str(b.error)) return { kind: 'range', text: str(b.error)! }
      // v1.1 §9: a malformed request has its own message; any other 400 is the project.
      return { kind: 'message', text: b.code === 'bad-request' ? BAD_REQUEST : BAD_PROJECT, refresh: false }
```

Create `components/aeo-outbound/project-picker.tsx`:
```tsx
'use client'
// The searchable project picker (spec v1.1 §11). Each project shows its status and "{n} snapshots, last {date}" from the
// hub's own rows; while Peec answers it says "Loading Peec projects…".
import { useId, useMemo, useState } from 'react'
import { fmtEasternDay } from '@/lib/aeo-outbound/metrics'
import type { ProjectStat } from '@/lib/aeo-outbound/store'
import { LOADING_PROJECTS, NO_PROJECT_MATCH, PEEC_DOWN_RETRY, PICK_PROJECT, PROJECT_LABEL } from './messages'
import { btnCls, inputCls } from './ui'

export interface PickerProject { id: string; name: string; status: string }
const statusLabel = (s: string) => (s === 'PITCH' ? 'Pitch' : s === 'PITCH_ENDED' ? 'Pitch ended' : s)
export function projectLine(p: PickerProject, stat: ProjectStat | undefined): string {
  const history = stat ? `${stat.count} ${stat.count === 1 ? 'snapshot' : 'snapshots'}, last ${fmtEasternDay(new Date(stat.last))}` : 'No snapshots yet'
  return `${statusLabel(p.status)} · ${history}`
}

export interface ProjectPickerProps {
  projects: PickerProject[] | null
  failed: boolean
  onRetry: () => void
  value: string
  onChange: (id: string) => void
  stats: Record<string, ProjectStat>
}

export function ProjectPicker({ projects, failed, onRetry, value, onChange, stats }: ProjectPickerProps) {
  const inputId = useId()
  const listId = useId()
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const selected = projects?.find((p) => p.id === value) ?? null
  const shown = useMemo(() => (projects ?? []).filter((p) => p.name.toLowerCase().includes(text.trim().toLowerCase())), [projects, text])
  const choose = (p: PickerProject) => { onChange(p.id); setText(''); setOpen(false) }
  return (
    <div className="relative flex flex-col gap-1">
      <label htmlFor={inputId} className="text-xs text-text-muted">{PROJECT_LABEL}</label>
      {failed ? (
        <button type="button" className={btnCls} onClick={onRetry}>{PEEC_DOWN_RETRY}</button>
      ) : (
        <input
          id={inputId} role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list"
          className={`${inputCls} w-72`} disabled={!projects} placeholder={projects ? PICK_PROJECT : LOADING_PROJECTS}
          value={open ? text : selected?.name ?? ''}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onChange={(e) => { setText(e.target.value); setOpen(true); setActive(0) }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, Math.max(shown.length - 1, 0))) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
            else if (e.key === 'Enter' && open && shown[active]) { e.preventDefault(); choose(shown[active]) }
            else if (e.key === 'Escape') setOpen(false)
          }}
        />
      )}
      {open && projects && !failed && (
        <ul id={listId} role="listbox" className="absolute top-full z-30 mt-1 max-h-72 w-96 overflow-y-auto rounded-md border border-white/[0.08] bg-bg-surface py-1">
          {shown.length === 0 && <li className="px-3 py-2 text-xs text-text-muted">{NO_PROJECT_MATCH}</li>}
          {shown.map((p, i) => (
            <li key={p.id} role="option" aria-selected={p.id === value} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(p)}
              className={`cursor-pointer px-3 py-1.5 ${i === active ? 'bg-white/[0.06]' : ''}`}>
              <span className="block text-sm text-white">{p.name}</span>
              <span className="block text-xs text-text-muted">{projectLine(p, stats[p.id])}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

Replace `components/aeo-outbound/hub.tsx` with:
```tsx
'use client'
// The New Business hub (spec §10; v1.1 §5, §6, §7, §11): an itinerary of every snapshot. Status tabs with the server's
// counts, one server-side search box (?q=), sortable columns, 50 rows a page, Show older, plain failure reasons, progress
// per generating row, opens split into likely people and likely automated, and in-app dialogs. The table comes from the
// database through the page; this component refreshes it (on mount, after every action, every 5s while a row is
// generating), because the client Router Cache would otherwise keep a stale list for 180s.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { copySnapshotAsDraftAction, discardSnapshotAction, revokeSnapshotAction } from '@/app/actions/aeo-outbound'
import { MAX_LOOKBACK_DAYS } from '@/lib/aeo-outbound/config'
import type { HubRow } from '@/lib/aeo-outbound/hub-rows'
import { fmtDay, fmtEasternDateTime } from '@/lib/aeo-outbound/metrics'
import { defaultRange } from '@/lib/aeo-outbound/range'
import type { DisplayStatus, HubCounts, HubCursor, ProjectStat } from '@/lib/aeo-outbound/store'
import { ConfirmDialog } from './confirm-dialog'
import { CopyLink } from './copy-link'
import { failureText } from './failure-text'
import { requestGenerate, type GenerateBody } from './generate-client'
import {
  ACTION_FAILED, CLEAR_FILTERS, DISCARD_SNAPSHOT, EMPTY_FIRST, EMPTY_MATCH, HUB_SUBTITLE, KEEP_LINK, KEEP_SNAPSHOT, NEXT, OLDER_FAILED, OPEN,
  OPENS_CAVEAT, PREVIOUS, REVOKE_LINK, SEARCH_LABEL, SEARCH_PLACEHOLDER, SETTINGS, SHOW_OLDER, actionError, createdByLine, discardTitle,
  draftReady, firstOpened, lastOpened, pageOf, revokeTitle,
} from './messages'
import { KEEP_OPEN, USUALLY, progressText } from './progress'
import { ProjectPicker, type PickerProject } from './project-picker'
import { STATUS_UI, actionsFor, snapshotUrl } from './status'
import { btnCls, cardCls, inputCls, primaryBtnCls } from './ui'

export { btnCls, cardCls }
export type { HubRow }

export interface OutboundHubProps {
  rows: HubRow[]
  counts: HubCounts
  cursor: HubCursor | null
  q: string
  projectStats: Record<string, ProjectStat>
  isAdmin: boolean
}

type Tab = 'all' | 'draft' | 'live' | 'revoked' | 'failed'
const TABS: { id: Tab; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'draft', label: 'Drafts' }, { id: 'live', label: 'Sent' }, { id: 'revoked', label: 'Revoked' }, { id: 'failed', label: 'Failed' },
]
type SortKey = 'brand' | 'project' | 'status' | 'created' | 'sent' | 'recipient' | 'opens'
const COLUMNS: { key: SortKey | null; label: string }[] = [
  { key: 'brand', label: 'Brand' }, { key: 'project', label: 'Peec project' }, { key: 'status', label: 'Status' }, { key: 'created', label: 'Created' },
  { key: 'sent', label: 'Sent' }, { key: 'recipient', label: 'Sent to' }, { key: 'opens', label: 'Opens' }, { key: null, label: 'Actions' },
]
const SORT_VALUE: Record<SortKey, (r: HubRow) => string | number> = {
  brand: (r) => r.brand.toLowerCase(), project: (r) => r.projectName.toLowerCase(), status: (r) => r.status, created: (r) => r.createdAt,
  sent: (r) => r.approvedAt ?? '', recipient: (r) => (r.recipient ?? '').toLowerCase(), opens: (r) => r.openCount,
}
const PAGE_SIZE = 50
type Pending = { projectName: string; startedAt: string; rerunOf: string | null }
type HubDialog = { kind: 'revoke' | 'discard'; row: HubRow }

export function StatusPill({ status, error }: { status: DisplayStatus; error?: string | null }) {
  const ui = STATUS_UI[status]
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${ui.className}`} title={status === 'failed' && error ? error : undefined}>
      {status === 'generating' && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
      {ui.label}
    </span>
  )
}

/** "3 opens: 1 likely person, 2 likely automated", plus opens from before v1.1 as "not classified" (v1.1 §6). */
export function opensSummary(r: Pick<HubRow, 'openCount' | 'opensPerson' | 'opensAutomated'>): string {
  if (r.openCount === 0) return 'No opens yet'
  const head = `${r.openCount} ${r.openCount === 1 ? 'open' : 'opens'}: ${r.opensPerson} likely ${r.opensPerson === 1 ? 'person' : 'people'}, ${r.opensAutomated} likely automated`
  const rest = r.openCount - r.opensPerson - r.opensAutomated
  return rest > 0 ? `${head}, ${rest} not classified` : head
}

export function OutboundHub({ rows, counts, cursor, q, projectStats, isAdmin }: OutboundHubProps) {
  const router = useRouter()
  const mounted = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const [projects, setProjects] = useState<PickerProject[] | null>(null)
  const [projectsFailed, setProjectsFailed] = useState(false)
  const [projectId, setProjectId] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [limits, setLimits] = useState<{ min: string; max: string } | null>(null)
  const pendingRef = useRef<Record<string, Pending>>({})
  const [pending, setPendingState] = useState<Record<string, Pending>>({})
  const [ready, setReady] = useState<ReadonlySet<string>>(new Set())
  const [message, setMessage] = useState<string | null>(null)
  const [rangeError, setRangeError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('all')
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'created', dir: 'desc' })
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState(q)
  const [older, setOlder] = useState<{ q: string; rows: HubRow[]; cursor: HubCursor | null } | null>(null)
  const [olderLoading, setOlderLoading] = useState(false)
  const [olderError, setOlderError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<HubDialog | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [origin, setOrigin] = useState('')

  const loadProjects = useCallback(async () => {
    setProjectsFailed(false)
    try {
      const res = await fetch('/api/aeo-outbound/projects')
      if (res.status !== 200) throw new Error(String(res.status))
      const list: unknown = await res.json()
      if (!Array.isArray(list)) throw new Error('shape')
      setProjects(list.filter((p): p is PickerProject => typeof p?.id === 'string' && typeof p?.name === 'string').map((p) => ({ id: p.id, name: p.name, status: typeof p.status === 'string' ? p.status : '' })))
    } catch {
      setProjectsFailed(true)
    }
  }, [])

  useEffect(() => {
    router.refresh()
    void loadProjects()
    setOrigin(window.location.origin)
    // v1.1 §9: the same bounds checkRange enforces, today minus MAX_LOOKBACK_DAYS through today (UTC).
    const r = defaultRange(Date.now())
    setLimits({ min: r.start, max: r.end })
    // Mount only: router is a new object on each render in tests and stable in Next.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadProjects])

  // v1.1 §5: search is server-side, through ?q=, after a short pause.
  useEffect(() => {
    const next = search.trim()
    if (next === q) return
    const t = setTimeout(() => router.push(next ? `/tools/new-business?q=${encodeURIComponent(next)}` : '/tools/new-business'), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, q])
  useEffect(() => { setPage(1) }, [q, tab, sort])

  const anyGenerating = rows.some((r) => r.status === 'generating')
  const anyPending = Object.keys(pending).length > 0
  useEffect(() => {
    if (!anyGenerating) return
    const t = setInterval(() => router.refresh(), 5000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anyGenerating])
  useEffect(() => {
    if (!anyGenerating && !anyPending) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [anyGenerating, anyPending])

  const setPending = (fn: (p: Record<string, Pending>) => Record<string, Pending>) => { pendingRef.current = fn(pendingRef.current); setPendingState(pendingRef.current) }

  async function generate(body: GenerateBody, projectName: string) {
    setMessage(null)
    setRangeError(null)
    setNow(Date.now())
    setPending((p) => ({ ...p, [body.projectId]: { projectName, startedAt: new Date().toISOString(), rerunOf: body.rerunOf ?? null } }))
    const out = await requestGenerate(body)
    setPending((p) => { const next = { ...p }; delete next[body.projectId]; return next })
    // Every answer refreshes the list (spec §10 "after every action"), so a row the request created always shows.
    router.refresh()
    // v1.1 §7: never jump Ryan to a page he left.
    if (!mounted.current) return
    if (out.kind === 'open') {
      // Another generation still running here: say this one is ready instead of leaving the hub.
      if (Object.keys(pendingRef.current).length) { setReady((r) => new Set(r).add(out.id)); return }
      router.push(`/tools/new-business/${out.id}`)
      return
    }
    if (out.kind === 'range') { setRangeError(out.text); return }
    setMessage(out.text || null)
  }

  function onGenerate() {
    if (!projectId || pending[projectId]) return
    const body: GenerateBody = { projectId }
    // Each filled date is sent, so a lone date reaches the route and its 400 bad-range shows inline (spec §7 step 4, §14).
    if (start) body.start = start
    if (end) body.end = end
    void generate(body, projects?.find((p) => p.id === projectId)?.name ?? projectId)
  }

  async function runAction(id: string, run: () => Promise<{ ok: true; id?: string } | { ok: false; error: string }>, open?: boolean) {
    setMessage(null)
    setBusy(id)
    try {
      const r = await run()
      if (!r.ok) setMessage(actionError(r.error))
      else if (open && r.id) router.push(`/tools/new-business/${r.id}`)
    } catch {
      setMessage(ACTION_FAILED)
    } finally {
      setBusy(null)
      router.refresh()
    }
  }

  const olderRows = older && older.q === q ? older.rows : []
  const nextCursor = older && older.q === q ? older.cursor : cursor
  async function showOlder() {
    if (!nextCursor) return
    setOlderLoading(true)
    setOlderError(null)
    try {
      const qs = new URLSearchParams({ before: nextCursor.before, beforeId: nextCursor.beforeId, ...(q ? { q } : {}) })
      const res = await fetch(`/api/aeo-outbound/reports?${qs.toString()}`)
      if (res.status !== 200) throw new Error(String(res.status))
      const b = (await res.json()) as { rows?: unknown; cursor?: unknown }
      if (!Array.isArray(b.rows)) throw new Error('shape')
      setOlder({ q, rows: [...olderRows, ...(b.rows as HubRow[])], cursor: (b.cursor as HubCursor | null) ?? null })
    } catch {
      setOlderError(OLDER_FAILED)
    } finally {
      setOlderLoading(false)
    }
  }

  const all = useMemo(() => {
    // A row can come back from Show older after it moved to the live list: each row is listed once.
    const seen = new Set<string>()
    return [...rows, ...olderRows].filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
  }, [rows, olderRows])
  const sorted = useMemo(() => {
    const value = SORT_VALUE[sort.key]
    return all.filter((r) => tab === 'all' || r.status === tab).sort((a, b) => {
      const x = value(a), y = value(b)
      const c = x < y ? -1 : x > y ? 1 : 0
      return (sort.dir === 'asc' ? c : -c) || (a.id < b.id ? -1 : 1)
    })
  }, [all, tab, sort])
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const shown = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'created' || key === 'sent' || key === 'opens' ? 'desc' : 'asc' }))
  const clearFilters = () => { setTab('all'); setSearch(''); if (q) router.push('/tools/new-business') }
  const localPending = Object.entries(pending).filter(([pid]) => !rows.some((r) => r.projectId === pid && r.status === 'generating'))
  const generatingHere = !!projectId && (!!pending[projectId] || rows.some((r) => r.projectId === projectId && r.status === 'generating'))
  const rerunPending = (id: string) => Object.values(pending).some((p) => p.rerunOf === id)
  const progress = (step: number, startedAt: string) => (
    <div className="mt-1 text-xs text-text-muted">
      <div>{progressText(step, startedAt, now)}</div>
      <div>{USUALLY}</div>
      <div>{KEEP_OPEN}</div>
    </div>
  )

  return (
    <>
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">AEO Outbound Snapshot</h1>
          <p className="mt-1 text-sm text-text-muted">{HUB_SUBTITLE}</p>
        </div>
        {isAdmin && <Link href="/tools/new-business/settings" className={btnCls}>{SETTINGS}</Link>}
      </div>

      <section className={`${cardCls} mb-6`}>
        <h2 className="mb-3 text-sm font-semibold text-white">New snapshot</h2>
        <div className="flex flex-wrap items-end gap-3">
          <ProjectPicker projects={projects} failed={projectsFailed} onRetry={() => void loadProjects()} value={projectId} onChange={setProjectId} stats={projectStats} />
          <div className="flex flex-col gap-1" data-range>
            <div className="flex gap-3">
              <label className="flex flex-col gap-1 text-xs text-text-muted">
                Start date
                <input id="aeo-start" type="date" className={inputCls} value={start} min={limits?.min} max={limits?.max} onChange={(e) => { setStart(e.target.value); setRangeError(null) }} />
              </label>
              <label className="flex flex-col gap-1 text-xs text-text-muted">
                End date
                <input id="aeo-end" type="date" className={inputCls} value={end} min={limits?.min} max={limits?.max} onChange={(e) => { setEnd(e.target.value); setRangeError(null) }} />
              </label>
            </div>
            {rangeError && <p className="text-xs text-[#FF6B6B]">{rangeError}</p>}
          </div>
          <button type="button" className={primaryBtnCls} onClick={onGenerate} disabled={!projectId || generatingHere}>Generate</button>
        </div>
        <p className="mt-2 text-xs text-text-muted">Left empty, the report covers the project's full history, up to {MAX_LOOKBACK_DAYS} days back.</p>
        {message && <p className="mt-2 text-sm text-[#FF6B6B]">{message}</p>}
      </section>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Snapshot status" className="flex flex-wrap gap-1">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`${btnCls} ${tab === t.id ? 'bg-white/[0.08]' : ''}`} onClick={() => setTab(t.id)}>
              {`${t.label} (${counts[t.id]})`}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          {SEARCH_LABEL}
          <input type="search" className={`${inputCls} w-72`} placeholder={SEARCH_PLACEHOLDER} value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
      </div>
      <p className="mb-2 text-xs text-text-muted">{OPENS_CAVEAT}</p>

      <div className={`${cardCls} overflow-x-auto p-0`}>
        <table className="w-full text-left text-sm text-white">
          <thead className="text-xs text-text-muted">
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.label} className="px-4 py-3 font-medium" aria-sort={c.key && sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                  {c.key ? <button type="button" className="hover:text-white" onClick={() => toggleSort(c.key!)}>{c.label}</button> : c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {localPending.map(([pid, p]) => (
              <tr key={`pending-${pid}`} className="border-t border-white/[0.06] align-top">
                <td className="px-4 py-3">{p.projectName}</td>
                <td className="px-4 py-3">{p.projectName}</td>
                <td className="px-4 py-3"><StatusPill status="generating" />{progress(0, p.startedAt)}</td>
                <td colSpan={5} />
              </tr>
            ))}
            {shown.map((r) => {
              const sentRow = r.status === 'live' || r.status === 'revoked'
              return (
                <tr key={r.id} data-testid={`row-${r.id}`} className="border-t border-white/[0.06] align-top">
                  <td className="px-4 py-3 font-semibold">{r.brand}</td>
                  <td className="px-4 py-3 text-text-muted">
                    <div>{r.projectName}</div>
                    {r.requestedStart && r.requestedEnd && <div className="text-xs">{`${fmtDay(r.requestedStart)} to ${fmtDay(r.requestedEnd)}`}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={r.status} error={r.error} />
                    {r.status === 'failed' && <p className="mt-1 max-w-xs text-xs text-[#FF6B6B]">{failureText(r.errorCode, r.error, r.id)}</p>}
                    {r.status === 'generating' && progress(r.progressStep, r.createdAt)}
                    {ready.has(r.id) && (
                      <p className="mt-1 text-xs text-[#60FF80]">{draftReady(r.brand)} <Link href={`/tools/new-business/${r.id}`} className="underline">{OPEN}</Link></p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-text-muted">
                    <div>{fmtEasternDateTime(new Date(r.createdAt))}</div>
                    <div className="text-xs">{createdByLine(r.createdBy)}</div>
                  </td>
                  <td className="px-4 py-3 text-text-muted">{sentRow && r.approvedAt ? fmtEasternDateTime(new Date(r.approvedAt)) : ''}</td>
                  <td className="px-4 py-3">{sentRow ? r.recipient ?? '' : ''}</td>
                  <td className="px-4 py-3">
                    {sentRow && (
                      <div>
                        <div>{opensSummary(r)}</div>
                        {r.firstOpenedAt && <div className="text-xs text-text-muted">{firstOpened(fmtEasternDateTime(new Date(r.firstOpenedAt)))}</div>}
                        {r.lastOpenedAt && <div className="text-xs text-text-muted">{lastOpened(fmtEasternDateTime(new Date(r.lastOpenedAt)))}</div>}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {actionsFor(r.status).map((a) => {
                        const disabled = busy === r.id
                        switch (a) {
                          case 'open':
                            return <Link key={a} href={`/tools/new-business/${r.id}`} className={btnCls}>{OPEN}</Link>
                          case 'copy':
                            return r.token && origin ? <CopyLink key={a} url={snapshotUrl(origin, r.token)} /> : null
                          case 'revoke':
                            return <button key={a} type="button" className={btnCls} disabled={disabled} onClick={() => setDialog({ kind: 'revoke', row: r })}>Revoke</button>
                          case 'edit':
                            return <button key={a} type="button" className={btnCls} disabled={disabled} onClick={() => void runAction(r.id, () => copySnapshotAsDraftAction(r.id), true)}>Edit a copy</button>
                          case 'rerun':
                            return (
                              <button key={a} type="button" className={btnCls} disabled={disabled || rerunPending(r.id)}
                                onClick={() => void generate({ projectId: r.projectId, rerunOf: r.id }, r.projectName)}>Rerun</button>
                            )
                          case 'discard':
                            return <button key={a} type="button" className={btnCls} disabled={disabled} onClick={() => setDialog({ kind: 'discard', row: r })}>Discard</button>
                        }
                      })}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {counts.all === 0 && !q && all.length === 0 && localPending.length === 0 && <p className="px-4 py-6 text-sm text-text-muted">{EMPTY_FIRST}</p>}
        {!(counts.all === 0 && !q && all.length === 0) && sorted.length === 0 && localPending.length === 0 && (
          <p className="flex items-center gap-2 px-4 py-6 text-sm text-text-muted">
            {EMPTY_MATCH}
            <button type="button" className={btnCls} onClick={clearFilters}>{CLEAR_FILTERS}</button>
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-text-muted">
        {pages > 1 && (
          <>
            <button type="button" className={btnCls} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>{PREVIOUS}</button>
            <span>{pageOf(page, pages)}</span>
            <button type="button" className={btnCls} disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>{NEXT}</button>
          </>
        )}
        {nextCursor && <button type="button" className={btnCls} disabled={olderLoading} onClick={() => void showOlder()}>{SHOW_OLDER}</button>}
        {olderError && <span className="text-[#FF6B6B]">{olderError}</span>}
      </div>

      {dialog?.kind === 'revoke' && (
        <ConfirmDialog title={revokeTitle(dialog.row.brand, dialog.row.recipient)} confirmLabel={REVOKE_LINK} cancelLabel={KEEP_LINK}
          onCancel={() => setDialog(null)} onConfirm={() => { const r = dialog.row; setDialog(null); void runAction(r.id, () => revokeSnapshotAction(r.id)) }} />
      )}
      {dialog?.kind === 'discard' && (
        <ConfirmDialog title={discardTitle(dialog.row.brand)} confirmLabel={DISCARD_SNAPSHOT} cancelLabel={KEEP_SNAPSHOT}
          onCancel={() => setDialog(null)} onConfirm={() => { const r = dialog.row; setDialog(null); void runAction(r.id, () => discardSnapshotAction(r.id)) }} />
      )}
    </>
  )
}
```
Run the hub, status and editor tests (the editor imports `StatusPill` from here), then the gate.

- [ ] **Step 6: Gate, commit, push**

Commit every file this task touched, by name, with subject `Turn the hub into an itinerary with tabs, server search, paging, Show older and per-project generation` and body:
```
Edge cases (search text from the URL reaches SQL; Show older reads shared state; generation is concurrent per project):
- external failure: a failed Show older or projects load says so and leaves the rest of the hub working; the route logs one line and answers 503: fix
- operator visibility: the route's log names the error code: fix
- bounds: 50 rows a page; Show older reads 500 at a time; search is capped at 100 characters: fix
- input boundaries: the cursor must be a valid time and a report id, else 400; search text is cleaned and matched literally: fix
- state and concurrency: pending generation is tracked per project; a row returned twice is listed once; the hub never navigates after it unmounts: fix
- security: hub rows are plain data with no data, slots, notes or html; the route needs the same access as the page: fix

Co-Authored-By: Claude <model> <noreply@anthropic.com>
```
Push.

---
### Task 12: The Settings page

Covers v1.1 §8 (a Settings page for tool admins at `/tools/new-business/settings`, every field and limit validated on save, every change logged, the env floor, the last-admin rule), §14 ("Last admin removes themself: refused, the env admins always remain"), round-2 MINOR 8 (the second of two concurrent saves gets "changed by someone else, reload").

**Files:**
- Create: `app/actions/aeo-outbound-settings.ts`, `app/actions/aeo-outbound-settings.test.ts`
- Create: `components/aeo-outbound/settings-form.tsx`, `components/aeo-outbound/settings-form.test.tsx`
- Create: `app/tools/new-business/settings/page.tsx`
- Modify: `components/aeo-outbound/no-access.tsx` (add `NotAdmin`), `components/aeo-outbound/messages.ts` (append)

**Interfaces:**
- Consumes: `outboundAccess` (Task 5) with `settings`, `settingsUpdatedAt`, `settingsInvalid`, `settingsReadFailed`; `validateSettingsInput`, `settingsChanges`, `settingsToInput`, `SETTINGS_ERRORS`, `SETTINGS_FIELD_LABELS`, `SETTINGS_LIMITS` (Task 5); `saveSettings`, `recentSettingsLogQuery` (Task 2); `outboundUsers`, `originAllowed` (`permissions.ts`); `fmtEasternDateTime` (Task 9).
- Produces:
  - `saveSettingsAction(input: SettingsInput, expectedUpdatedAt: string | null): Promise<SaveSettingsResult>` with `type SaveSettingsResult = { ok: true; updatedAt: string | null } | { ok: false; error: string; fieldErrors?: SettingsErrors }`; `error` is `'forbidden'`, `'invalid'` (with `fieldErrors`), `'unavailable'`, `SETTINGS_ERRORS.conflict` or `SETTINGS_ERRORS.readFailed`
  - `SettingsForm(props: { initial: OutboundSettings; updatedAt: string | null; readFailed: boolean; invalid: boolean; envAdmins: string[]; log: SettingsLogEntry[] })`, `type SettingsLogEntry = { changedAt: string; changedBy: string; field: string }`
  - `NotAdmin({ admins }: { admins: string[] })`

- [ ] **Step 1: Messages**

Append to `components/aeo-outbound/messages.ts`:
```ts
/** v1.1 §8: the Settings page. */
export const SETTINGS_TITLE = 'Settings'
export const SETTINGS_NOTE = 'Changes apply to snapshots generated from now on. Existing drafts and sent links keep their words.'
export const SETTINGS_INVALID = "The saved settings couldn't be read, so the defaults are shown. Saving replaces them."
export const NOT_ADMIN = 'Only New Business admins can change these settings.'
export const adminsLine = (admins: string[]): string => (admins.length ? `Admins: ${admins.join(', ')}.` : '')
export const USERS_HELP = 'One @avenuez.com email per line. People in AEO_OUTBOUND_USERS can always use the tool.'
export const ADMINS_HELP = 'Admins can change these settings. People in AEO_OUTBOUND_USERS are always admins.'
export const alwaysAdmins = (emails: string[]): string => (emails.length ? `Always admins: ${emails.join(', ')}.` : '')
export const FIRST_SECTION = 'First section title'
export const SECOND_SECTION = 'Second section title'
export const NEXT_WRITTEN = 'Written for each report'
export const NEXT_FIXED = 'The same sentence on every report'
export const NEXT_SENTENCE = 'Next-step sentence'
export const RANK_ALL = 'Every brand tracked in Peec'
export const RANK_TOP = 'The brand and its top competitors'
export const RANK_COUNT = 'Brands in all'
export const SAVE_SETTINGS = 'Save settings'
export const SAVING = 'Saving…'
export const SAVED = 'Saved'
export const RECENT_CHANGES = 'Recent changes'
export const NO_CHANGES = 'No changes yet.'
export const changeLine = (when: string, who: string, field: string): string => `${when}: ${who} changed ${field}`
```

- [ ] **Step 2: Write the failing action and form tests**

Create `app/actions/aeo-outbound-settings.test.ts`:
```ts
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

vi.mock('next/cache', () => ({ updateTag: vi.fn() }))
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers({ host: 'app.example' })) }))
const m = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn() }))
vi.mock('@/lib/aeo-outbound/settings-store', () => ({ readSettingsRow: m.read, saveSettings: m.save }))

import { auth } from '@/auth'
import { headers } from 'next/headers'
import { updateTag } from 'next/cache'
import { SETTINGS_DEFAULTS, settingsToInput } from '@/lib/aeo-outbound/settings'
import { saveSettingsAction } from './aeo-outbound-settings'

// Every email is invented.
const AT = '2026-10-10T09:00:00.000Z'
const ROW = { id: true, users: ['ana@avenuez.com'], admins: ['boss@avenuez.com'], sectionTitles: ['Category data', 'Competitive visibility'], fixedNextStep: null, rankAmong: null, peecOpportunityRows: 1, methodologyStatesPromptsAndModels: true, sidebarWordmark: 'AIVx', updatedAt: new Date(AT), updatedBy: 'boss@avenuez.com' }
const STORED = { ...SETTINGS_DEFAULTS, users: ['ana@avenuez.com'], admins: ['boss@avenuez.com'] }
const as = (email: string, role = 'INTERNAL_ANALYST') => vi.mocked(auth).mockResolvedValue({ user: { role, email } } as never)

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  process.env.AEO_OUTBOUND_USERS = 'ryan@avenuez.com'
  vi.mocked(headers).mockResolvedValue(new Headers({ host: 'app.example' }) as never)
  m.read.mockResolvedValue(ROW)
  m.save.mockResolvedValue(true)
  as('boss@avenuez.com')
})
afterEach(() => { vi.restoreAllMocks() })

test('only admins on a same-host request can save: a plain user, non-staff and a foreign Origin are forbidden and write nothing', async () => {
  for (const arrange of [
    () => as('ana@avenuez.com'),
    () => as('boss@avenuez.com', 'CLIENT_ADMIN'),
    () => vi.mocked(headers).mockResolvedValue(new Headers({ host: 'app.example', origin: 'https://evil.example' }) as never),
  ]) {
    arrange()
    expect(await saveSettingsAction(settingsToInput(STORED), AT)).toEqual({ ok: false, error: 'forbidden' })
    as('boss@avenuez.com')
    vi.mocked(headers).mockResolvedValue(new Headers({ host: 'app.example' }) as never)
  }
  expect(m.save).not.toHaveBeenCalled()
})

test('an env admin can save even with no settings row; the save inserts with no expected time', async () => {
  as('ryan@avenuez.com')
  m.read.mockResolvedValue(null)
  const r = await saveSettingsAction({ ...settingsToInput(SETTINGS_DEFAULTS), users: 'ana@avenuez.com' }, null)
  expect(r.ok).toBe(true)
  const [values, changes, by, now, expected] = m.save.mock.calls[0]
  expect(values).toEqual({ ...SETTINGS_DEFAULTS, users: ['ana@avenuez.com'] })
  expect(changes).toEqual([{ field: 'users', oldValue: [], newValue: ['ana@avenuez.com'] }])
  expect([by, expected]).toEqual(['ryan@avenuez.com', null])
  expect(r.ok && r.updatedAt).toBe((now as Date).toISOString())
  expect(updateTag).toHaveBeenCalledWith('db')
})

test('a save logs each changed field, against the updated_at the page loaded', async () => {
  const r = await saveSettingsAction({ ...settingsToInput(STORED), section1: 'Strengths', rankMode: 'top', rankAmong: '7' }, AT)
  expect(r.ok).toBe(true)
  expect(m.save.mock.calls[0][1]).toEqual([
    { field: 'sectionTitles', oldValue: ['Category data', 'Competitive visibility'], newValue: ['Strengths', 'Competitive visibility'] },
    { field: 'rankAmong', oldValue: null, newValue: 7 },
  ])
  expect(m.save.mock.calls[0][4]).toBe(AT)
})

test('concurrent saves: a page loaded before another save, or a write that matched nothing, gets the reload message', async () => {
  const conflict = { ok: false, error: 'Someone else changed these settings. Reload to see their changes.' }
  expect(await saveSettingsAction(settingsToInput(STORED), '2026-10-01T00:00:00.000Z')).toEqual(conflict)
  expect(m.save).not.toHaveBeenCalled()
  m.save.mockResolvedValue(false)
  expect(await saveSettingsAction({ ...settingsToInput(STORED), section2: 'Gaps' }, AT)).toEqual(conflict)
  expect(updateTag).not.toHaveBeenCalled()
})

test('validation errors come back per field and nothing is written', async () => {
  const r = await saveSettingsAction({ ...settingsToInput(STORED), users: 'ana@gmail.com', section1: '' }, AT)
  expect(r).toEqual({ ok: false, error: 'invalid', fieldErrors: { users: 'Each email must end in @avenuez.com.', sectionTitles: 'Section titles need 1 to 60 characters.' } })
  expect(m.save).not.toHaveBeenCalled()
})

test('the last admin: with no env admins the settings must keep one; with env admins an admin may remove themself', async () => {
  process.env.AEO_OUTBOUND_USERS = ''
  expect(await saveSettingsAction({ ...settingsToInput(STORED), admins: '' }, AT)).toEqual({ ok: false, error: 'invalid', fieldErrors: { admins: 'Keep at least one admin.' } })
  expect(m.save).not.toHaveBeenCalled()
  process.env.AEO_OUTBOUND_USERS = 'ryan@avenuez.com'
  expect((await saveSettingsAction({ ...settingsToInput(STORED), admins: '' }, AT)).ok).toBe(true)
})

test('nothing changed: ok, with no write and no log', async () => {
  expect(await saveSettingsAction(settingsToInput(STORED), AT)).toEqual({ ok: true, updatedAt: AT })
  expect(m.save).not.toHaveBeenCalled()
})

test('a settings read failure refuses the save; a row that broke its contract is replaced field by field', async () => {
  as('ryan@avenuez.com')
  m.read.mockRejectedValue(Object.assign(new Error('x'), { code: '57P01' }))
  expect(await saveSettingsAction(settingsToInput(STORED), null)).toEqual({ ok: false, error: "The settings couldn't be loaded, so they can't be saved now. Reload and try again." })
  m.read.mockResolvedValue({ ...ROW, sectionTitles: ['Only one'] })
  expect((await saveSettingsAction(settingsToInput(SETTINGS_DEFAULTS), AT)).ok).toBe(true)
  expect(m.save.mock.calls[0][1].map((c: { field: string }) => c.field)).toEqual(['users', 'admins', 'sectionTitles', 'fixedNextStep', 'rankAmong', 'peecOpportunityRows', 'methodologyStatesPromptsAndModels', 'sidebarWordmark'])
})

test('a failed write is unavailable, with one log line and no value in it', async () => {
  m.save.mockRejectedValue(Object.assign(new Error('params boss@avenuez.com'), { code: '57P01' }))
  expect(await saveSettingsAction({ ...settingsToInput(STORED), section2: 'Gaps' }, AT)).toEqual({ ok: false, error: 'unavailable' })
  const lines = vi.mocked(console.error).mock.calls.map((c) => c.map(String).join(' '))
  expect(lines).toEqual(['[aeo-outbound] settings save failed reason=57P01'])
})
```

Create `components/aeo-outbound/settings-form.test.tsx`:
```tsx
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SETTINGS_DEFAULTS } from '@/lib/aeo-outbound/settings'
import { SettingsForm } from './settings-form'

const { save } = vi.hoisted(() => ({ save: vi.fn() }))
vi.mock('@/app/actions/aeo-outbound-settings', () => ({ saveSettingsAction: save }))

const AT = '2026-10-10T09:00:00.000Z'
const base = { initial: { ...SETTINGS_DEFAULTS, users: ['ana@avenuez.com'] }, updatedAt: AT, readFailed: false, invalid: false, envAdmins: ['ryan@avenuez.com'], log: [] }
beforeEach(() => { save.mockReset() })
afterEach(() => cleanup())

test('the form shows the current settings, the env admins and the note', () => {
  render(<SettingsForm {...base} />)
  expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
  expect(screen.getByText('Changes apply to snapshots generated from now on. Existing drafts and sent links keep their words.')).toBeInTheDocument()
  expect(screen.getByLabelText('Who can use the tool')).toHaveValue('ana@avenuez.com')
  expect(screen.getByText('Always admins: ryan@avenuez.com.')).toBeInTheDocument()
  expect(screen.getByLabelText('First section title')).toHaveValue('Category data')
  expect(screen.getByLabelText('Written for each report')).toBeChecked()
  expect(screen.getByLabelText('Every brand tracked in Peec')).toBeChecked()
  expect(screen.getByLabelText('Opportunities based on Peec recommendations')).toHaveValue('1')
  expect(screen.getByLabelText('Methodology names the prompt count and the AI models')).toBeChecked()
  expect(screen.getByLabelText('Menu wordmark')).toHaveValue('AIVx')
  expect(screen.getByText('No changes yet.')).toBeInTheDocument()
})

test('Save sends the form and the loaded time, then says Saved and carries the new time into the next save', async () => {
  save.mockResolvedValueOnce({ ok: true, updatedAt: '2026-10-11T12:00:00.000Z' }).mockResolvedValueOnce({ ok: true, updatedAt: '2026-10-11T12:05:00.000Z' })
  render(<SettingsForm {...base} />)
  fireEvent.change(screen.getByLabelText('First section title'), { target: { value: 'Strengths' } })
  fireEvent.click(screen.getByLabelText('The same sentence on every report'))
  fireEvent.change(screen.getByLabelText('Next-step sentence'), { target: { value: 'Book a working session.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
  expect(await screen.findByText('Saved')).toBeInTheDocument()
  expect(save.mock.calls[0]).toEqual([expect.objectContaining({ section1: 'Strengths', nextStepMode: 'fixed', nextStep: 'Book a working session.', users: 'ana@avenuez.com' }), AT])
  fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2))
  expect(save.mock.calls[1][1]).toBe('2026-10-11T12:00:00.000Z')
})

test('field errors show next to their fields; a conflict offers Reload', async () => {
  save.mockResolvedValueOnce({ ok: false, error: 'invalid', fieldErrors: { users: 'Each email must end in @avenuez.com.' } })
  render(<SettingsForm {...base} />)
  fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
  expect(await screen.findByText('Each email must end in @avenuez.com.')).toBeInTheDocument()
  save.mockResolvedValueOnce({ ok: false, error: 'Someone else changed these settings. Reload to see their changes.' })
  fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
  expect(await screen.findByText('Someone else changed these settings. Reload to see their changes.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
})

test('a failed read disables Save and says why; an unreadable stored row says the defaults are shown', () => {
  render(<SettingsForm {...base} readFailed />)
  expect(screen.getByText("The settings couldn't be loaded, so they can't be saved now. Reload and try again.")).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Save settings' })).toBeDisabled()
  cleanup()
  render(<SettingsForm {...base} invalid />)
  expect(screen.getByText("The saved settings couldn't be read, so the defaults are shown. Saving replaces them.")).toBeInTheDocument()
})

test('recent changes list who changed which field and when', () => {
  render(<SettingsForm {...base} log={[{ changedAt: '2026-10-02T15:00:00.000Z', changedBy: 'boss@avenuez.com', field: 'sectionTitles' }]} />)
  expect(screen.getByText('Oct 2, 2026, 11:00 AM: boss@avenuez.com changed Section titles')).toBeInTheDocument()
})
```
Run: `perl -e 'alarm 590; exec @ARGV' -- npx vitest run app/actions/aeo-outbound-settings.test.ts components/aeo-outbound/settings-form.test.tsx` (FAIL).

- [ ] **Step 3: Implement the action, the form, the page and NotAdmin**

Create `app/actions/aeo-outbound-settings.ts`:
```ts
'use server'
// Saves the tool's settings (spec v1.1 §8). Admins only, same host only. Every change is one statement with its log rows,
// guarded by the updated_at the page loaded, so the second of two concurrent saves is told to reload.
import { headers } from 'next/headers'
import { updateTag } from 'next/cache'
import { auth } from '@/auth'
import { outboundAccess } from '@/lib/aeo-outbound/access'
import { errorLabel } from '@/lib/aeo-outbound/log'
import { originAllowed, outboundUsers } from '@/lib/aeo-outbound/permissions'
import { SETTINGS_ERRORS, settingsChanges, validateSettingsInput, type SettingsErrors, type SettingsInput } from '@/lib/aeo-outbound/settings'
import { saveSettings } from '@/lib/aeo-outbound/settings-store'

export type SaveSettingsResult = { ok: true; updatedAt: string | null } | { ok: false; error: string; fieldErrors?: SettingsErrors }

export async function saveSettingsAction(input: SettingsInput, expectedUpdatedAt: string | null): Promise<SaveSettingsResult> {
  const session = await auth()
  const access = await outboundAccess(session?.user)
  const h = await headers()
  if (!access.ok || !access.admin || !originAllowed(h.get('origin'), h.get('host'))) return { ok: false, error: 'forbidden' }
  if (access.settingsReadFailed) return { ok: false, error: SETTINGS_ERRORS.readFailed }
  if (expectedUpdatedAt !== access.settingsUpdatedAt) return { ok: false, error: SETTINGS_ERRORS.conflict }
  const checked = validateSettingsInput(input)
  if (!checked.ok) return { ok: false, error: 'invalid', fieldErrors: checked.errors }
  // v1.1 §14: AEO_OUTBOUND_USERS are always admins, so nobody is locked out. With that list empty, keep one settings admin.
  if (outboundUsers(process.env.AEO_OUTBOUND_USERS).size === 0 && checked.values.admins.length === 0) {
    return { ok: false, error: 'invalid', fieldErrors: { admins: SETTINGS_ERRORS.lastAdmin } }
  }
  const changes = settingsChanges(access.settingsInvalid ? null : access.settings, checked.values)
  if (!changes.length) return { ok: true, updatedAt: expectedUpdatedAt }
  const now = new Date()
  let saved: boolean
  try {
    saved = await saveSettings(checked.values, changes, access.email, now, expectedUpdatedAt)
  } catch (e) {
    console.error(`[aeo-outbound] settings save failed reason=${errorLabel(e)}`)
    return { ok: false, error: 'unavailable' }
  }
  if (!saved) return { ok: false, error: SETTINGS_ERRORS.conflict }
  updateTag('db')
  return { ok: true, updatedAt: now.toISOString() }
}
```

Create `components/aeo-outbound/settings-form.tsx`:
```tsx
'use client'
// The Settings page's form (spec v1.1 §8). It sends what the admin typed; the server validates, saves and logs.
import { useState } from 'react'
import { saveSettingsAction } from '@/app/actions/aeo-outbound-settings'
import { fmtEasternDateTime } from '@/lib/aeo-outbound/metrics'
import { SETTINGS_ERRORS, SETTINGS_FIELD_LABELS, SETTINGS_LIMITS, settingsToInput, type OutboundSettings, type SettingsErrors, type SettingsField, type SettingsInput } from '@/lib/aeo-outbound/settings'
import {
  ACTION_FAILED, ADMINS_HELP, FIRST_SECTION, NEXT_FIXED, NEXT_SENTENCE, NEXT_WRITTEN, NO_CHANGES, RANK_ALL, RANK_COUNT, RANK_TOP,
  RECENT_CHANGES, SAVED, SAVE_SETTINGS, SAVING, SECOND_SECTION, SETTINGS_INVALID, SETTINGS_NOTE, SETTINGS_TITLE, USERS_HELP, alwaysAdmins, changeLine,
} from './messages'
import { btnCls, cardCls, inputCls, primaryBtnCls } from './ui'

export type SettingsLogEntry = { changedAt: string; changedBy: string; field: string }
export interface SettingsFormProps { initial: OutboundSettings; updatedAt: string | null; readFailed: boolean; invalid: boolean; envAdmins: string[]; log: SettingsLogEntry[] }

const fieldName = (f: string) => (Object.prototype.hasOwnProperty.call(SETTINGS_FIELD_LABELS, f) ? SETTINGS_FIELD_LABELS[f as SettingsField] : f)

export function SettingsForm(p: SettingsFormProps) {
  const [form, setForm] = useState<SettingsInput>(() => settingsToInput(p.initial))
  const [loadedAt, setLoadedAt] = useState(p.updatedAt)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<SettingsErrors>({})
  const set = (patch: Partial<SettingsInput>) => { setForm((f) => ({ ...f, ...patch })); setSaved(false) }
  const err = (f: SettingsField) => fieldErrors[f] && <p className="mt-1 text-xs text-[#FF6B6B]">{fieldErrors[f]}</p>

  async function onSave() {
    setSaving(true); setSaved(false); setError(null); setFieldErrors({})
    try {
      const r = await saveSettingsAction(form, loadedAt)
      if (r.ok) { setLoadedAt(r.updatedAt); setSaved(true) }
      else if (r.error === 'invalid') setFieldErrors(r.fieldErrors ?? {})
      else setError(r.error === 'unavailable' || r.error === 'forbidden' ? ACTION_FAILED : r.error)
    } catch {
      setError(ACTION_FAILED)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">{SETTINGS_TITLE}</h1>
        <p className="mt-1 text-sm text-text-muted">{SETTINGS_NOTE}</p>
      </div>
      {p.readFailed && <p className="text-sm text-[#FF6B6B]">{SETTINGS_ERRORS.readFailed}</p>}
      {p.invalid && <p className="text-sm text-[#FFFC60]">{SETTINGS_INVALID}</p>}
      <section className={`${cardCls} space-y-4`}>
        <div>
          <label htmlFor="s-users" className="block text-xs text-text-muted">{SETTINGS_FIELD_LABELS.users}</label>
          <textarea id="s-users" rows={4} className={`${inputCls} w-full`} value={form.users} onChange={(e) => set({ users: e.target.value })} />
          <p className="mt-1 text-xs text-text-muted">{USERS_HELP}</p>{err('users')}
        </div>
        <div>
          <label htmlFor="s-admins" className="block text-xs text-text-muted">{SETTINGS_FIELD_LABELS.admins}</label>
          <textarea id="s-admins" rows={3} className={`${inputCls} w-full`} value={form.admins} onChange={(e) => set({ admins: e.target.value })} />
          <p className="mt-1 text-xs text-text-muted">{ADMINS_HELP}</p>
          {p.envAdmins.length > 0 && <p className="text-xs text-text-muted">{alwaysAdmins(p.envAdmins)}</p>}
          {err('admins')}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="s-t1" className="block text-xs text-text-muted">{FIRST_SECTION}</label>
            <input id="s-t1" className={`${inputCls} w-full`} maxLength={SETTINGS_LIMITS.title} value={form.section1} onChange={(e) => set({ section1: e.target.value })} />
          </div>
          <div>
            <label htmlFor="s-t2" className="block text-xs text-text-muted">{SECOND_SECTION}</label>
            <input id="s-t2" className={`${inputCls} w-full`} maxLength={SETTINGS_LIMITS.title} value={form.section2} onChange={(e) => set({ section2: e.target.value })} />
          </div>
        </div>
        {err('sectionTitles')}
        <fieldset>
          <legend className="text-xs text-text-muted">{SETTINGS_FIELD_LABELS.fixedNextStep}</legend>
          <label className="mr-4 text-sm text-white"><input type="radio" name="s-next" checked={form.nextStepMode === 'written'} onChange={() => set({ nextStepMode: 'written' })} /> {NEXT_WRITTEN}</label>
          <label className="text-sm text-white"><input type="radio" name="s-next" checked={form.nextStepMode === 'fixed'} onChange={() => set({ nextStepMode: 'fixed' })} /> {NEXT_FIXED}</label>
          <label htmlFor="s-next-text" className="mt-2 block text-xs text-text-muted">{NEXT_SENTENCE}</label>
          <textarea id="s-next-text" rows={2} className={`${inputCls} w-full`} maxLength={SETTINGS_LIMITS.nextStep} disabled={form.nextStepMode !== 'fixed'} value={form.nextStep} onChange={(e) => set({ nextStep: e.target.value })} />
          {err('fixedNextStep')}
        </fieldset>
        <fieldset>
          <legend className="text-xs text-text-muted">{SETTINGS_FIELD_LABELS.rankAmong}</legend>
          <label className="mr-4 text-sm text-white"><input type="radio" name="s-rank" checked={form.rankMode === 'all'} onChange={() => set({ rankMode: 'all' })} /> {RANK_ALL}</label>
          <label className="text-sm text-white"><input type="radio" name="s-rank" checked={form.rankMode === 'top'} onChange={() => set({ rankMode: 'top' })} /> {RANK_TOP}</label>
          <label htmlFor="s-rank-n" className="mt-2 block text-xs text-text-muted">{RANK_COUNT}</label>
          <input id="s-rank-n" type="number" min={SETTINGS_LIMITS.rankMin} max={SETTINGS_LIMITS.rankMax} className={`${inputCls} w-24`} disabled={form.rankMode !== 'top'} value={form.rankAmong} onChange={(e) => set({ rankAmong: e.target.value })} />
          {err('rankAmong')}
        </fieldset>
        <div>
          <label htmlFor="s-rows" className="block text-xs text-text-muted">{SETTINGS_FIELD_LABELS.peecOpportunityRows}</label>
          <select id="s-rows" className={inputCls} value={form.peecOpportunityRows} onChange={(e) => set({ peecOpportunityRows: e.target.value })}>
            {['0', '1', '2', '3'].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          {err('peecOpportunityRows')}
        </div>
        <label className="flex items-center gap-2 text-sm text-white">
          <input type="checkbox" checked={form.methodologyStatesPromptsAndModels} onChange={(e) => set({ methodologyStatesPromptsAndModels: e.target.checked })} />
          {SETTINGS_FIELD_LABELS.methodologyStatesPromptsAndModels}
        </label>
        <div>
          <label htmlFor="s-wordmark" className="block text-xs text-text-muted">{SETTINGS_FIELD_LABELS.sidebarWordmark}</label>
          <select id="s-wordmark" className={inputCls} value={form.sidebarWordmark} onChange={(e) => set({ sidebarWordmark: e.target.value })}>
            <option value="AIVx">AIVx</option>
            <option value="Avenue Z">Avenue Z</option>
          </select>
          {err('sidebarWordmark')}
        </div>
        <div className="flex items-center gap-3">
          <button type="button" className={primaryBtnCls} disabled={p.readFailed || saving} onClick={() => void onSave()}>{SAVE_SETTINGS}</button>
          {saving && <span className="text-xs text-text-muted">{SAVING}</span>}
          {saved && <span className="text-xs text-[#60FF80]" role="status">{SAVED}</span>}
          {error && (
            <span className="inline-flex items-center gap-2 text-xs text-[#FF6B6B]">
              {error}
              {error === SETTINGS_ERRORS.conflict && <button type="button" className={btnCls} onClick={() => window.location.reload()}>Reload</button>}
            </span>
          )}
        </div>
      </section>
      <section className={cardCls}>
        <h2 className="mb-2 text-sm font-semibold text-white">{RECENT_CHANGES}</h2>
        {p.log.length === 0 ? <p className="text-xs text-text-muted">{NO_CHANGES}</p> : (
          <ul className="space-y-1 text-xs text-text-muted">
            {p.log.map((l, i) => <li key={i}>{changeLine(fmtEasternDateTime(new Date(l.changedAt)), l.changedBy, fieldName(l.field))}</li>)}
          </ul>
        )}
      </section>
    </div>
  )
}
```

Append to `components/aeo-outbound/no-access.tsx` (and add `NOT_ADMIN, adminsLine` to its messages import):
```tsx
/** Shown on the Settings page to users who are not admins (v1.1 §8). */
export function NotAdmin({ admins }: { admins: string[] }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface p-5">
      <p className="text-sm text-white">{NOT_ADMIN}</p>
      <p className="mt-2 text-sm text-text-muted">{adminsLine(admins)}</p>
    </div>
  )
}
```

Create `app/tools/new-business/settings/page.tsx`:
```tsx
import { requireStaff } from '@/lib/auth/page-access'
import { outboundAccess } from '@/lib/aeo-outbound/access'
import { errorLabel } from '@/lib/aeo-outbound/log'
import { outboundUsers } from '@/lib/aeo-outbound/permissions'
import { recentSettingsLogQuery } from '@/lib/aeo-outbound/settings-store'
import { NoAccess, NotAdmin } from '@/components/aeo-outbound/no-access'
import { SettingsForm, type SettingsLogEntry } from '@/components/aeo-outbound/settings-form'

export default async function NewBusinessSettingsPage() {
  const session = await requireStaff()
  const access = await outboundAccess(session.user)
  if (!access.ok) return <NoAccess admins={access.admins} />
  if (!access.admin) return <NotAdmin admins={access.admins} />
  let log: SettingsLogEntry[] = []
  try {
    log = (await recentSettingsLogQuery(20)).map((l) => ({ changedAt: l.changedAt.toISOString(), changedBy: l.changedBy, field: l.field }))
  } catch (e) {
    // The log is a detail: the form still shows and saves.
    console.error(`[aeo-outbound] settings log read failed reason=${errorLabel(e)}`)
  }
  // Every prop is plain data: check:rsc.
  return (
    <SettingsForm
      initial={access.settings} updatedAt={access.settingsUpdatedAt} readFailed={access.settingsReadFailed} invalid={access.settingsInvalid}
      envAdmins={[...outboundUsers(process.env.AEO_OUTBOUND_USERS)].sort()} log={log}
    />
  )
}
```
Run the action and form tests, then `perl -e 'alarm 590; exec @ARGV' -- npx vitest run lib/auth/protected-pages.test.ts` (the new page must pass its walk), then the gate.

- [ ] **Step 4: Gate, commit, push**

Commit every file this task touched, by name, with subject `Add the Settings page with validated, logged, conflict-safe saves` and body:
```
Edge cases (settings are shared state written from the browser):
- external failure: a failed read refuses saving with its own message; a failed write answers unavailable with one log line: fix
- operator visibility: every saved change is a row in aeo_outbound_settings_log with who, when, field, old and new: fix
- bounds: 50 people per list, 200 characters per email, titles 60, the sentence 300, rank 2 to 50, rows 0 to 3: fix
- input boundaries: everything is validated on the server, whatever the form sent: fix
- state and concurrency: a save matches the updated_at the page loaded, so the second of two concurrent saves gets the reload message: fix
- security: admins only, same host only; AEO_OUTBOUND_USERS stays the floor, and with it empty the last admin cannot be removed: fix

Co-Authored-By: Claude <model> <noreply@anthropic.com>
```
Push.

---

### Task 13: Migration notes and the final gate

Covers v1.1 §13 (the `MIGRATIONS-PENDING.md` entry with the dry-run expectations and the numbering note) and closes the plan.

**Files:**
- Modify: `MIGRATIONS-PENDING.md` (append after the `aeo_outbound_reports` entry, which ends at line 320)

**Interfaces:** none.

- [ ] **Step 1: Append the 0027 entry**

Append to `MIGRATIONS-PENDING.md`:
```markdown

## Add the AEO Outbound v1.1 tables and columns (delivered, awaiting apply)

`drizzle/0027_aeo_outbound_v1_1.sql` creates `aeo_outbound_opens` (one row per counted open of a live link: `report_id`
with a foreign key to `aeo_outbound_reports`, `opened_at`, `ua_family`, `likely_automated`, `reason`; no IP address and no
user agent), `aeo_outbound_settings` (at most one row: its key is `id boolean primary key default true` with the check
`aeo_outbound_settings_single_row`) and `aeo_outbound_settings_log`, and adds `progress_step integer not null default 0`
and `error_code text` to `aeo_outbound_reports`. Additive: no existing column, constraint or row changes, and only
`lib/aeo-outbound/store.ts` and `lib/aeo-outbound/settings-store.ts` read these, so the `clients` 42703 risk above does
not apply. Apply with the hash-checked `scripts/migrate-http.ts`, each environment only on my written go, dev first, with
the same host guard as `0026`.

Dry runs (read-only) before applying: dev must list exactly `0027_aeo_outbound_v1_1` (dev already has `0026`); staging
lists `0026_aeo_outbound_reports` and `0027_aeo_outbound_v1_1`; production lists `0025_chart_notes`,
`0026_aeo_outbound_reports` and `0027_aeo_outbound_v1_1`, and needs `0025` applied first, on my go. `0026` is applied on
dev, so it keeps its number: if `dev` gains another `0026`, mine keeps its number and the other is renumbered.

Read-back after applying: the three new tables with their columns, the foreign key, both new indexes and the single-row
check; the two new `aeo_outbound_reports` columns, with `progress_step` 0 on every existing row; the ledger up by one
with nothing pending. Until it is applied, the code that reads these tables must not reach that environment.

Not applied anywhere yet.
```

- [ ] **Step 2: Final checks**

1. No em or en dash anywhere this plan touched: `perl -e 'alarm 60; exec @ARGV' -- git diff 06e68c0d -U0 -- . ':(exclude)lib/aeo-outbound/__fixtures__/v1-0-final.html' | grep -nP '[\x{2013}\x{2014}]'` prints nothing (the golden is v1.0's page verbatim; see Global Constraints).
2. Nothing imports a removed export: `grep -rn "outboundEmail\|recordOpenQuery\|REVOKE_CONFIRM\|DISCARD_CONFIRM\|SCANNER_NOTE\|GENERATING_EDITOR" app lib components` prints nothing.
3. `package.json` changed by exactly one line since `06e68c0d`: `git diff 06e68c0d -- package.json` shows only `+    "zod": "4.3.6",`.
4. No shared file outside the allowed list changed: `git diff 06e68c0d --name-only` shows only paths under `lib/aeo-outbound/`, `components/aeo-outbound/`, `app/api/aeo-outbound/`, `app/snapshot/`, `app/actions/aeo-outbound*.ts`, `app/actions/aeo-outbound*.test.ts`, `app/tools/new-business/`, plus `lib/db/schema.ts`, `drizzle/0027_aeo_outbound_v1_1.sql`, `drizzle/meta/0027_snapshot.json`, `drizzle/meta/_journal.json`, `MIGRATIONS-PENDING.md`, `package.json`, `package-lock.json`. Anything else: stop and report.
5. The migration was never applied: no command in this plan ran `drizzle-kit migrate`, `drizzle-kit push` or `scripts/migrate-http.ts`.
6. The full gate: `DATABASE_URL=postgresql://ci:ci@db.invalid/ci perl -e 'alarm 590; exec @ARGV' -- make check` exits 0.

- [ ] **Step 3: Commit, push, sweep**

Commit `MIGRATIONS-PENDING.md` with subject `Record migration 0027 as delivered and awaiting apply` and body `Dev first on my written go, with the 0026 host guard; staging and production dry runs listed.` plus the trailer. Push. Then run the sweep my global rules ask for, after checking it points at no iCloud path: `grep -nE 'Desktop|/Documents|Mobile Documents|iCloud' ~/code/push-check.sh` (no output expected; if it prints anything, do not run it and say so), then `perl -e 'alarm 120; exec @ARGV' -- ~/code/push-check.sh` and paste its output, unedited, in the hand-off.

---
## Spec coverage (self-review)

| v1.1 section | Tasks |
|---|---|
| §1 Goal | all |
| §2 Edit mode and the Edit button | 7 (frame script, markers, sandbox), 10 (button, banner, locked, handshake, Edit a copy) |
| §3 Every piece of text is editable | 6 (keys, grammar, limits, defaults, structure, grounding, brand_name), 7 (render, mirrors, wrappers, controls, golden), 9 (structural queue items), 10 (structural flow, ticks) |
| §4 Before you send | 3 (note kinds), 6 (labels, flags, PATCH response), 10 (panel, count, re-sync, Approve) |
| §5 The hub is an itinerary | 2 (columns, counts, search, paging SQL), 11 (UI, Show older route) |
| §6 Opens | 2 (table, one statement), 8 (family, freshness), 10 (open list), 11 (hub summary), 9 (caveat) |
| §7 Generation that explains itself | 1 (codes), 2 (columns), 4 (codes, progress writer, step 9), 9 (texts, progress), 10 and 11 (display, per-project pending, Draft ready) |
| §8 Self-service settings | 2 (tables, save SQL), 5 (model, access, fallback, threading), 12 (page, action, log) |
| §9 Data correctness | 3 (chart, top 5, own domains, single-brand card, decimals, gap cap, hover), 4 (actions paging, missing key), 7 (sandbox, fallback, header clone, black frame), 11 (date limits, range error, 400 message) |
| §10 Data contracts | 1 (core, Peec schemas, kill switch), 4 (Peec wiring, Glean, generate body), 5 (settings row), 6 (stored rows, slots body), 3 (schema version 2) |
| §11 Copy link, dialogs, picker | 9 (dialog, Copy link), 10 (editor dialogs, leave dialog), 11 (hub dialogs, picker) |
| §12 Parked | nothing to build |
| §13 Migrations | 2 (generated, never applied), 13 (notes) |
| §14 Edge cases | 6 (old row, empty field, KPI change, brand change), 8 (open within 60 s), 5 (settings missing), 12 (last admin), 4 (Peec field missing) |
| §15 Tests | each task's test steps |

Interpretations the reviewer should confirm (the spec allows them but does not spell them out):
- The tab counts are one statement with one `count(*) filter (...)` per status (Task 2), which covers every row as §5 asks; the spec says "one count query per status".
- The "Ryan's own checks" group is titled "Your own checks" in the UI (Task 10), because settings make the tool usable by more than Ryan.
- A mirror updates from the cleaned value the frame sends (Task 7), which equals the saved value for every save the server accepts; the frame has no "saved" message in the spec's protocol.
- `window_label` drift is reported with the `kpi_changed` kind (Task 6): the spec's closed kind list has no separate kind for it.
- Unverified until a database runs the statements: the open classification rules inside the SQL (10-second and unknown-browser rules) and the counter equalling the event count; the tests pin the statement text only.
