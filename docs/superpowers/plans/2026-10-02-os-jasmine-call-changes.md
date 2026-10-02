# Jasmine's 2026-10-02 walkthrough changes, and Renaissance annotations and YTD: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship every change the 2026-10-02 walkthrough call settled (spec S1 to S15) as one standalone PR into `dev`, plus the guarded staging data writes that switch them on, without changing Renaissance beyond S8 and S9 and without changing any outline client's Dash request or lock key.

**Architecture:** Every behaviour is per client and off by default. The footnote change touches only the outline builder (`buildOutlineKpis`). The influencer section reads a new `dash_social_config.influencerSection` key, but only from `top-content@3`, which Renaissance never renders. The tiles read the YTD sheet only in the outline Data block, and only for a finished whole month of a client on locked months. Notes for live clients sit behind a new `dash_social_config.chartNotes` switch. Renaissance's YTD is a new unpublished part, `ytd-review@3`, that refuses to run for a locked-months client. Renaissance changes only when the guarded staging script writes its config, after the code has merged and been promoted.

**Tech Stack:** Next.js 16 (App Router, RSC), TypeScript strict, Vitest plus Testing Library, Drizzle on Neon Postgres, Google Sheets API (read only, existing `readYtdTab`).

**Spec:** `docs/superpowers/specs/2026-10-02-os-jasmine-call-changes-design.md`, plus its review log `docs/superpowers/specs/2026-10-02-os-jasmine-call-changes-review-log.md` (the 26 minors this plan rules on are listed there). Both are on branch `docs/os-jasmine-call-changes-spec`, which this branch starts from.

Code is cited at `origin/dev` 7243ec7f. Every file, function, signature and test pattern named below was read there on 2026-10-02.

## Global Constraints

- Renaissance changes only as S8 and S9 say, and only through the staging (and later production) data write. Nothing in this PR may change what Renaissance renders today. These guards must pass **unedited**: `lib/organic-social/lock-key-pin.test.ts`, `components/report-sections/organic-social/v1-render.golden.test.tsx`, `parts/composition.golden.test.tsx`, `parts/top-content-v2.golden.test.tsx`, `parts/top-content.golden.test.tsx`, `parts/platform-headlines.golden.test.tsx`, `parts/follower-graph.golden.test.tsx`, `parts/engagement-trend.golden.test.tsx`, `lib/organic-social/headline-build.test.ts`, `lib/organic-social/metrics.test.ts`, `lib/organic-social/outline-fixes-parity.test.ts` (and its snapshot).
- The outline clients' Dash requests and lock keys do not change. The sheet is read beside the Dash request, never instead of it, and `getOutlineKpis` is always called with exactly today's arguments.
- Public repo: no brand ids, sheet ids, tab names that identify a sheet, client figures, secrets or login details in code, tests, commits, the PR or this plan. Tests use made-up ids and numbers only.
- Log lines carry the slug (and channel, year, month or status). They never carry the sheet id, the tab or a value (`ytd-sheet.ts:1-3`).
- New `dash_social_config` keys are `unknown` in the type and validated at runtime. Absent means today's behaviour.
- Copy: the Akara heading is exactly `Partnership Posts`. Today's default heading is exactly `Influencer Posts`, and the region name is exactly `Influencer posts`.
- Writing: plain English, first person as Thomas, sentence case, no em or en dashes, in code comments, commits and the PR.
- Every command that can take more than a few seconds is bounded with `perl -e 'alarm N; exec @ARGV' --`, and exit 142 means it timed out, never a pass. No background tasks.
- The CI gate is `make check` (`npm run typecheck`, `npm test`, `npm run check:rsc`, `npm run build`), with `DATABASE_URL=postgresql://ci:ci@db.invalid/ci` for the build (`.github/workflows/ci.yml`).

## Review Focus

These are the five inputs most likely to bite someone, which the spec implies but no single feature test would exercise. Each has a test in the task that owns it.

1. **A Renaissance tab after the staging write, picker on "Last 30 days".** Expected: the YTD block shows January through the current month marked "(live)", whatever the picker range. The graphs, the tiles and Top Content otherwise look exactly as they do now. Test: Task 12 `picker range is ignored`, and Task 12 composition test.
2. **An outline client's finished month where Dash returned all null but the sheet has the month.** Expected: the Data block still says No data. It never shows two sheet tiles next to zeros. Test: Task 6 `noData stays No data`.
3. **January, or a `previous-year` client, where the prior year has no sheet entry.** Expected: the tile shows the sheet's number with no arrow, never a sheet number compared against Dash. Test: Task 6 `January with no prior-year tab`, and Task 7 `prior-year read failure`.
4. **A sheet tab that cannot be read (429, timeout, layout changed) while a client is looking.** Expected: the tiles show the dashboard's numbers, the page never blanks, and one log line names the slug and status, never the sheet. Test: Task 7 failure tests and Task 8 `sheet loader returns null`.
5. **The 1st of a month between 00:00 and 04:00 UTC on Renaissance.** Expected: the previous month still says "(live)", because its Dash window is still open. Test: Task 11 `liveDayInProgress keeps (live)`.

## Rulings on the review minors (spec review log 1 to 26)

| Minor | Ruling in this plan |
|---|---|
| 1 | `SortableTopContent` is shared with top-content@2. The new prop is optional, and when it is absent the markup is byte for byte today's. `top-content-v2.golden.test.tsx` and `top-content.golden.test.tsx` are the guards (Task 3). The heading is one per section: a label applies only on a platform tab whose channel has a label. Overview always gets the default (Task 2 `influencerLabel`). |
| 2 | The one-way trap on Piper Instagram is accepted. If staff mark an owned post as Influencer there, it moves into the hidden section. The way back is deleting that post's row from the designations table on my go. Recorded in CLAUDE.md follow-ups (Task 13) and the SOP list (Task 15). |
| 3 | The sheet is read in parallel with `getOutlineKpis`, in the same `Promise.all` (Task 8). |
| 4 | The tile failure list includes `YtdSheetLayoutError` and an invalid entry, each with its own log line (Task 7). |
| 5 | Section 2's claim about the Day list is corrected: the list ends at min(today UTC, range end) (`parts/chart-notes.ts:92`). On a Renaissance range that ends today, the Day list includes today. That's accepted: notes for a day still in progress are allowed. `validateNoteInput` refuses only the future (`validate.ts:46`). |
| 6 | Notes gate precedence: a client with a `reportingMonths` key follows the locked-months rules even if `chartNotes` is true, so a malformed `firstMonth` still refuses a save (Task 10 test). |
| 7 | @3 with an invalid `ytdSheets` entry: one warning, then every month from live Dash. A layout or read error shows the error card, as in @2 (Task 12). |
| 8, 14 | @3's live month: the month runs to the last complete UTC day, and "(live)" stays on while `liveDayInProgress` is true (Task 11). The Dash fetch cache is one hour, so "(live)" can be up to an hour old, and past months re-read at most hourly. Accepted, and recorded in the CLAUDE.md follow-ups (Task 13). |
| 9, 26 | Accepted mismatches, recorded in the CLAUDE.md follow-ups and the SOP list: Renaissance's YTD points against its rolling tiles, and the sheet's Total Followers change against Dash's Net New Followers. |
| 10 | The new Renaissance Dash requests are listed in the PR body for the Renaissance proof (Task 13). |
| 11 | S7: an invalid cell is always named and ends the leading run. If no month has a point, the card shows No data with no gap sentence, because every month was in the leading run. The 2027 v1 path (`ytdSeries`) is not changed: the spec keeps version 1 as it is. |
| 12 | Release step 3 says Jasmine copies from the locked dashboard. "From production" is my decision. Recorded in the SOP list (Task 15). |
| 13 | Tests added: @3 with a Dash failure shows the fallback card (Task 12); the NY/UTC boundary (Task 11); S4 January and `previous-year` (Tasks 6, 7); top-content@3 reads `influencerSection` and passes it on (Task 4). |
| 15 | "Logs once" means one log line per render (Tasks 4, 12). |
| 16 | A failed read of the prior year's sheet logs the same line with `year=` (Task 7). |
| 17, 18, 19 | The Renaissance staging script validates against `REGISTRIES['organic-social:platform']` and the DB template's part ids. It prints `resolveSection(dbTemplate, newOverride)` and refuses unless it equals the five pins. It keeps every other `dash_social_config` key byte for byte, and refuses if `reportingMonths` is present (Task 16). |
| 20, 21, 22, 23 | SOP list and release steps (Task 15). Maddie is told before the Renaissance staging write, not only before production (Task 16 step 1). |
| 24, 25 | Already done in the spec. |

---

## File structure

| File | Change | Responsibility |
|---|---|---|
| `lib/organic-social/outline-headlines.ts` | Modify `:42` | Outline tiles stop copying the footnote (S1). |
| `lib/organic-social/influencer-section.ts` | Create | Parse `influencerSection`. Hidden platforms, and the label for the tab (S2, S3). |
| `components/report-sections/organic-social/sortable-top-content.tsx` | Modify `:73-93, :154-158` | Optional `influencerHeading` prop (heading and region name). |
| `components/report-sections/organic-social/parts/top-content-outline.tsx` | Modify `:16-46` | top-content@3 applies `influencerSection`. |
| `lib/organic-social/ytd.ts` | Modify | Export `cellAt` and `addMonths`, the S7 leading run in `ytdSheetSeries`, `ytdLiveMonths`, `YtdMonth.compareRange` widened to `string \| null`. |
| `lib/organic-social/tiles-from-sheet.ts` | Create | Pure: the finished month on screen, the comparison month, and putting sheet numbers into the tiles (S4). |
| `lib/organic-social/tile-sheets.ts` | Create | Loader: the client config plus one or two cached sheet reads. Never throws, logs every failure (S4, S5). |
| `components/report-sections/organic-social/parts/outline-data.tsx` | Modify `:15-31` | Data block reads the sheet beside Dash and applies it. |
| `lib/organic-social/chart-notes/enabled.ts` | Create | `notesOn(client)`: locked months, or `chartNotes === true` (S8). |
| `components/report-sections/organic-social/parts/chart-notes.ts` | Modify `:5, :59-61` | Graph notes follow `notesOn`. |
| `app/actions/chart-notes.ts` | Modify `:9, :21-23, :50-55, :86, :106, :131` | Actions follow `notesOn`; first-month floor only on locked months. |
| `lib/db/schema.ts` | Modify `:132-147` | Document `influencerSection` and `chartNotes` (typed `unknown`). |
| `components/report-sections/organic-social/parts/ytd-review-sheet.tsx` | Modify `:56-64` | Extract `ytdReviewBlock` for reuse (no behaviour change). |
| `components/report-sections/organic-social/parts/ytd-review-live.tsx` | Create | `ytd-review@3`, live mode (S9). |
| `components/report-sections/organic-social/parts/registry.ts` | Modify `:7, :25` | Register `ytd-review@3`. |
| `CLAUDE.md` | Modify (append a section) | Known follow-ups from this work. |

Tests: one test file per new module, plus edits to the existing test files named in each task.

---

### Task 0: Branch, worktree, baseline

**Files:** none changed.

- [ ] **Step 1: Create the worktree from the spec branch**

The spec branch is `origin/dev` 7243ec7f plus docs-only commits (`git log origin/dev..origin/docs/os-jasmine-call-changes-spec` lists only `docs(spec)` commits). This PR carries the spec, its review log and this plan with the code, the way #286 carried its spec. So the feature branch starts at the spec branch tip. It does not stack on any open PR.

```bash
cd /Users/thomaschangavenuez/code/reporting-ren-add-overview
perl -e 'alarm 60; exec @ARGV' -- git fetch origin --prune -q
git log --oneline origin/dev..origin/docs/os-jasmine-call-changes-spec
git worktree add -b feat/os-jasmine-call-changes /Users/thomaschangavenuez/code/worktrees/reporting-ren-add-overview-feat-os-jasmine-call-changes origin/docs/os-jasmine-call-changes-spec
cd /Users/thomaschangavenuez/code/worktrees/reporting-ren-add-overview-feat-os-jasmine-call-changes
git merge-base --is-ancestor origin/dev HEAD && echo "based on dev"
```
Expected: the log lists only `docs(spec)` commits, and the last line prints `based on dev`.

- [ ] **Step 2: Install and take the baseline**

```bash
perl -e 'alarm 300; exec @ARGV' -- npm ci
perl -e 'alarm 590; exec @ARGV' -- npx vitest run > /private/tmp/claude-501/baseline-vitest.txt 2>&1; echo "exit $?"; tail -6 /private/tmp/claude-501/baseline-vitest.txt
perl -e 'alarm 300; exec @ARGV' -- npm run typecheck
```
Expected: vitest exit 0 with the pass and fail counts on the last lines, and typecheck exit 0. Record both counts in the ledger. A failing baseline test is reported by name before Task 1 starts and is never "fixed" inside this branch.

- [ ] **Step 3: Push the branch**

```bash
perl -e 'alarm 60; exec @ARGV' -- git push -u origin feat/os-jasmine-call-changes
```
Expected: the branch exists on origin, tracking set.

---

### Task 1: S1, the outline tiles drop the Facebook footnote

**Files:**
- Modify: `lib/organic-social/outline-headlines.ts:42`
- Test: `lib/organic-social/outline-headlines.test.ts:61-72`

**Interfaces:**
- Consumes: nothing new.
- Produces: `buildOutlineKpis(...)` returns kpis whose `footnote` is always undefined. `PLATFORM_KPIS` and `outlineSpecsFor` are unchanged and still carry the footnote, and Renaissance's `headline-build.ts:73` still copies it.

- [ ] **Step 1: Write the failing test**

Replace the test at `lib/organic-social/outline-headlines.test.ts:61-72` with:

```ts
test('percents scale by 100, deltas come from the context value; outline tiles carry no footnote (Jasmine, 2026-10-02)', () => {
  const metrics = allOf('FACEBOOK')
  metrics.AVG_ENGAGEMENT_RATE_V2 = m(0.25)
  metrics.PAID_AND_ORGANIC_VIDEO_VIEWS = m(150, 100)
  metrics.REACTIONS = m(5, 0)
  const b = buildOutlineKpis('FACEBOOK', metrics, outlineSpecsFor('FACEBOOK'))
  expect(b.noData).toBe(false)
  expect(b.kpis.engagementRate.value).toBe(25)
  expect(b.kpis.videoViews.delta).toBe(50)
  expect(b.kpis.reactions.delta).toBeUndefined()
  for (const k of Object.values(b.kpis)) expect(k.footnote).toBeUndefined()
  // The shared spec keeps it: Renaissance's Facebook tile still shows it (headline-build.test.ts).
  expect(outlineSpecsFor('FACEBOOK').find((s) => s.key === 'engagements')?.footnote).toMatch(/Influencer/)
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `perl -e 'alarm 120; exec @ARGV' -- npx vitest run lib/organic-social/outline-headlines.test.ts`
Expected: FAIL. The new test fails on `expect(k.footnote).toBeUndefined()`, which receives `"Includes engagement on posts marked Influencer (Dash reports Facebook totals inclusive)."`.

- [ ] **Step 3: Implement**

In `lib/organic-social/outline-headlines.ts`, delete line 42:

```ts
      footnote: spec.footnote, // outline tabs are always one channel, where footnotes show
```

so the object reads:

```ts
    kpis[spec.key] = {
      key: spec.key,
      label: spec.label,
      format: spec.format,
      value: spec.format === 'percent' ? raw * 100 : raw,
      delta: outlineDelta(m),
      // No footnote: Jasmine removed the Facebook one from the outline tabs (2026-10-02). Renaissance's
      // tiles (headline-build.ts) still show it.
    }
```

- [ ] **Step 4: Run the tests and the Renaissance guards**

Run: `perl -e 'alarm 180; exec @ARGV' -- npx vitest run lib/organic-social/outline-headlines.test.ts lib/organic-social/headline-build.test.ts lib/organic-social/metrics.test.ts lib/organic-social/outline-fixes-parity.test.ts lib/organic-social/outline-layout.test.ts components/report-sections/organic-social/parts/outline-parts.test.tsx components/report-sections/organic-social/parts/platform-headlines.golden.test.tsx`
Expected: PASS, with no snapshot written or updated (the output says nothing about snapshots).

- [ ] **Step 5: Commit**

```bash
git add lib/organic-social/outline-headlines.ts lib/organic-social/outline-headlines.test.ts
git commit -m "feat(organic-social): outline tiles drop the Facebook influencer footnote

Jasmine asked for it to go on the outline tabs (call 2026-10-02, 12:24 to
13:46, and 18:07 for Joy of Life). The shared spec keeps it, so
Renaissance's Facebook tile is unchanged.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
perl -e 'alarm 60; exec @ARGV' -- git push -q
```

---

### Task 2: The `influencerSection` setting

**Files:**
- Create: `lib/organic-social/influencer-section.ts`
- Create: `lib/organic-social/influencer-section.test.ts`
- Modify: `lib/db/schema.ts:144-146` (doc only)

**Interfaces:**
- Consumes: `CHANNELS`, `CHANNEL_LABEL`, `DashChannel` from `lib/organic-social/metrics.ts:22-30`.
- Produces:
  - `type InfluencerSetting = { hidden: true } | { label: string }`
  - `type InfluencerSection = Partial<Record<DashChannel, InfluencerSetting>>`
  - `parseInfluencerSection(value: unknown): { kind: 'ok'; section: InfluencerSection } | { kind: 'none' } | { kind: 'invalid' }`
  - `hiddenInfluencerPlatforms(section: InfluencerSection): Set<string>` (platform labels such as `'Instagram'`, matching `PlatformGroup.platform`)
  - `influencerLabel(section: InfluencerSection, channel: DashChannel | null): string | undefined`

- [ ] **Step 1: Write the failing test**

Create `lib/organic-social/influencer-section.test.ts`:

```ts
import { expect, test } from 'vitest'
import { hiddenInfluencerPlatforms, influencerLabel, parseInfluencerSection } from './influencer-section'

test('absent is none; a valid hide and a valid label parse', () => {
  expect(parseInfluencerSection(undefined)).toEqual({ kind: 'none' })
  expect(parseInfluencerSection({ INSTAGRAM: { hidden: true } })).toEqual({ kind: 'ok', section: { INSTAGRAM: { hidden: true } } })
  expect(parseInfluencerSection({ INSTAGRAM: { label: '  Partnership Posts ' } })).toEqual({ kind: 'ok', section: { INSTAGRAM: { label: 'Partnership Posts' } } })
  expect(parseInfluencerSection({})).toEqual({ kind: 'ok', section: {} })
})

test('an unknown channel key is ignored, the rest still applies', () => {
  expect(parseInfluencerSection({ instagram: { hidden: true }, MYSPACE: { hidden: true }, FACEBOOK: { hidden: true } }))
    .toEqual({ kind: 'ok', section: { FACEBOOK: { hidden: true } } })
})

test('anything malformed is invalid', () => {
  for (const bad of [null, 'x', 1, [], { INSTAGRAM: true }, { INSTAGRAM: { hidden: false } }, { INSTAGRAM: { hidden: 'yes' } },
    { INSTAGRAM: { label: '' } }, { INSTAGRAM: { label: '   ' } }, { INSTAGRAM: { label: 'x'.repeat(41) } }, { INSTAGRAM: { label: 5 } },
    { INSTAGRAM: { hidden: true, label: 'Both' } }, { INSTAGRAM: {} }, { INSTAGRAM: [] }]) {
    expect(parseInfluencerSection(bad)).toEqual({ kind: 'invalid' })
  }
})

test('hidden platforms are the display labels the gallery groups by', () => {
  expect(hiddenInfluencerPlatforms({ INSTAGRAM: { hidden: true }, FACEBOOK: { label: 'P' }, TWITTER: { hidden: true } }))
    .toEqual(new Set(['Instagram', 'X']))
  expect(hiddenInfluencerPlatforms({})).toEqual(new Set())
})

test('the label applies only on that channel\'s tab; Overview and other tabs get the default (undefined)', () => {
  const s = { INSTAGRAM: { label: 'Partnership Posts' } } as const
  expect(influencerLabel(s, 'INSTAGRAM')).toBe('Partnership Posts')
  expect(influencerLabel(s, 'FACEBOOK')).toBeUndefined()
  expect(influencerLabel(s, null)).toBeUndefined()
  expect(influencerLabel({ INSTAGRAM: { hidden: true } }, 'INSTAGRAM')).toBeUndefined()
})
```

`CHANNEL_LABEL.TWITTER` is `'X'` (`lib/organic-social/metrics.ts:28`).

- [ ] **Step 2: Run it and watch it fail**

Run: `perl -e 'alarm 120; exec @ARGV' -- npx vitest run lib/organic-social/influencer-section.test.ts`
Expected: FAIL with `Failed to resolve import "./influencer-section"`.

- [ ] **Step 3: Implement**

Create `lib/organic-social/influencer-section.ts`:

```ts
// dash_social_config.influencerSection (spec docs/superpowers/specs/2026-10-02-os-jasmine-call-changes-design.md
// section 4): per channel, hide top-content@3's Influencer Posts section or rename it. Read only by top-content@3, which
// Renaissance never renders. Absent: today's section. Invalid: today's section, and the part warns with the slug.
import { CHANNELS, CHANNEL_LABEL, type DashChannel } from './metrics'

export type InfluencerSetting = { hidden: true } | { label: string }
export type InfluencerSection = Partial<Record<DashChannel, InfluencerSetting>>

const MAX_LABEL = 40
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export function parseInfluencerSection(value: unknown): { kind: 'ok'; section: InfluencerSection } | { kind: 'none' } | { kind: 'invalid' } {
  if (value === undefined) return { kind: 'none' }
  if (!isObj(value)) return { kind: 'invalid' }
  const section: InfluencerSection = {}
  for (const [key, setting] of Object.entries(value)) {
    // Keys are Dash channel names. Anything else (a lowercase name, a channel we do not report) is ignored.
    if (!(CHANNELS as readonly string[]).includes(key)) continue
    if (!isObj(setting) || Object.keys(setting).length !== 1) return { kind: 'invalid' }
    if (setting.hidden === true) { section[key as DashChannel] = { hidden: true }; continue }
    if (typeof setting.label === 'string') {
      const label = setting.label.trim()
      if (label.length === 0 || label.length > MAX_LABEL) return { kind: 'invalid' }
      section[key as DashChannel] = { label }
      continue
    }
    return { kind: 'invalid' }
  }
  return { kind: 'ok', section }
}

/** The platforms whose influencer row is not rendered, as the gallery labels them (PlatformGroup.platform). */
export function hiddenInfluencerPlatforms(section: InfluencerSection): Set<string> {
  return new Set((Object.keys(section) as DashChannel[]).filter((c) => section[c] && 'hidden' in section[c]!).map((c) => CHANNEL_LABEL[c]))
}

/** The heading for the tab on screen, or undefined for today's. The heading is one per section, so only a platform tab
 *  whose channel has a label gets it; Overview (channel null) always keeps the default. */
export function influencerLabel(section: InfluencerSection, channel: DashChannel | null): string | undefined {
  const s = channel ? section[channel] : undefined
  return s && 'label' in s ? s.label : undefined
}
```

In `lib/db/schema.ts`, after the `ytdSheets?: unknown` member (line 146), add:

```ts
  /** Per channel, hide or rename top-content@3's Influencer Posts section (spec 2026-10-02 section 4):
   *  { "INSTAGRAM": { "hidden": true } } or { "INSTAGRAM": { "label": "Partnership Posts" } }. Validated at runtime
   *  (parseInfluencerSection), so typed unknown. */
  influencerSection?: unknown
```

- [ ] **Step 4: Run the test**

Run: `perl -e 'alarm 120; exec @ARGV' -- npx vitest run lib/organic-social/influencer-section.test.ts && perl -e 'alarm 300; exec @ARGV' -- npm run typecheck`
Expected: PASS (5 tests), and typecheck exit 0.

- [ ] **Step 5: Commit**

```bash
git add lib/organic-social/influencer-section.ts lib/organic-social/influencer-section.test.ts lib/db/schema.ts
git commit -m "feat(organic-social): influencerSection setting (hide or rename, per channel)

Read only by top-content@3, so Renaissance cannot change. Absent keeps
today's section; an unknown channel key is ignored; anything malformed is
invalid and the part will keep today's section.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
perl -e 'alarm 60; exec @ARGV' -- git push -q
```

---

### Task 3: `SortableTopContent` takes an optional heading

**Files:**
- Modify: `components/report-sections/organic-social/sortable-top-content.tsx:73-93, :154-158`
- Test: `components/report-sections/organic-social/sortable-top-content.test.tsx` (append)

**Interfaces:**
- Consumes: nothing new.
- Produces: an `influencerHeading?: string` prop on `SortableTopContent`. When absent, the heading is `Influencer Posts` and the region name is `Influencer posts` (today's markup). When set, both are that string.

- [ ] **Step 1: Write the failing test**

Append to `components/report-sections/organic-social/sortable-top-content.test.tsx`:

```tsx
test('the influencer heading and region name follow influencerHeading; absent, they are exactly today\'s', () => {
  const influencer = group([mk(100, 1)])
  const first = view({ influencer })
  expect(screen.getByRole('region', { name: 'Influencer posts' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Influencer Posts' })).toBeInTheDocument()
  first.unmount()
  view({ influencer, influencerHeading: 'Partnership Posts' })
  expect(screen.getByRole('region', { name: 'Partnership Posts' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Partnership Posts' })).toBeInTheDocument()
  expect(screen.queryByText('Influencer Posts')).toBeNull()
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `perl -e 'alarm 120; exec @ARGV' -- npx vitest run components/report-sections/organic-social/sortable-top-content.test.tsx`
Expected: FAIL. TypeScript accepts the unknown prop in the test's spread, but `getByRole('region', { name: 'Partnership Posts' })` finds nothing.

- [ ] **Step 3: Implement**

In `sortable-top-content.tsx`, add the prop to the destructuring and the type:

```tsx
export function SortableTopContent({
  owned,
  influencer,
  clientSlug,
  canEdit,
  pageSize = 15,
  ownedLimit,
  sortKeys,
  influencerHeading,
}: {
  owned: PlatformGroup[]
  influencer: PlatformGroup[]
  clientSlug: string
  canEdit: boolean
  pageSize?: number
  /** Cap each owned platform row at its top N (no pager). Absent: today's paging. Influencer rows
   *  always page. */
  ownedLimit?: number
  /** Only these sort buttons, in toolbar order. Absent: all four, as today. The type rules out an empty list, so
   *  the toolbar is never empty and an outline tab can't silently get all four back. */
  sortKeys?: readonly [SortKey, ...SortKey[]]
  /** The Influencer section's heading and region name, set per client by top-content@3 (Akara's "Partnership Posts").
   *  Absent: today's text, so top-content@2 (Renaissance) renders exactly as before. */
  influencerHeading?: string
}) {
```

and replace lines 154-158 with:

```tsx
      {influencer.length > 0 && (
        <section aria-label={influencerHeading ?? 'Influencer posts'} className="space-y-3">
          <h3 className="text-xs font-extrabold uppercase tracking-widest text-text-muted">{influencerHeading ?? 'Influencer Posts'}</h3>
          <div className="space-y-5">{rows(influencer, 'influencer')}</div>
        </section>
      )}
```

- [ ] **Step 4: Run the test and the shared-component guards**

Run: `perl -e 'alarm 240; exec @ARGV' -- npx vitest run components/report-sections/organic-social/sortable-top-content.test.tsx components/report-sections/organic-social/sortable-top-content.pagination.test.tsx components/report-sections/organic-social/parts/top-content-v2.golden.test.tsx components/report-sections/organic-social/parts/top-content.golden.test.tsx components/report-sections/organic-social/v1-render.golden.test.tsx`
Expected: PASS, with no snapshot written.

- [ ] **Step 5: Commit**

```bash
git add components/report-sections/organic-social/sortable-top-content.tsx components/report-sections/organic-social/sortable-top-content.test.tsx
git commit -m "feat(organic-social): optional influencer heading on the Top Content gallery

Absent, the markup is exactly today's, so top-content@2 (Renaissance) is
unchanged; the v2 golden tests pass untouched.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
perl -e 'alarm 60; exec @ARGV' -- git push -q
```

---

### Task 4: top-content@3 applies `influencerSection` (S2, S3)

**Files:**
- Modify: `components/report-sections/organic-social/parts/top-content-outline.tsx:1-46`
- Test: `components/report-sections/organic-social/parts/top-content-outline.test.tsx` (append)

**Interfaces:**
- Consumes: `parseInfluencerSection`, `hiddenInfluencerPlatforms`, `influencerLabel` (Task 2); `SortableTopContent`'s `influencerHeading` (Task 3).
- Produces: none new.

- [ ] **Step 1: Write the failing tests**

Append to `parts/top-content-outline.test.tsx` (it already mocks `getClientBySlug`, `fetchTopContentFrozen` and `SortableTopContent`, and defines `IG`, `post`, `props`, `show`):

```tsx
const withSection = (influencerSection: unknown) =>
  getClientBySlug.mockResolvedValue({ id: 'c1', dashSocialConfig: { brandId: 1, ownHandles: { instagram: 'brand_handle' }, influencerSection } })
const heading = () => (SortableTopContent.mock.calls.at(-1) as unknown as [{ influencerHeading?: string }])[0].influencerHeading

test('no influencerSection: the influencer row and the default heading, exactly as today', async () => {
  fetchTopContentFrozen.mockResolvedValue([post(1, { author: 'brand_handle' }), post(2, { author: 'creator_one' })])
  await show()
  expect(props().influencer[0].posts.map((x) => x.id)).toEqual([2])
  expect(heading()).toBeUndefined()
})

test('Instagram hidden (Piper): no influencer row on the Instagram tab; the owned top 5 is unchanged; the posts are not moved', async () => {
  withSection({ INSTAGRAM: { hidden: true } })
  fetchTopContentFrozen.mockResolvedValue([post(1, { author: 'brand_handle' }), post(2, { author: 'creator_one' }), post(3)])
  await show()
  expect(props().influencer).toEqual([])
  expect(props().owned[0].posts.map((x) => x.id)).toEqual([1, 3])
})

test('a hide on another channel leaves this tab alone', async () => {
  withSection({ FACEBOOK: { hidden: true } })
  fetchTopContentFrozen.mockResolvedValue([post(2, { author: 'creator_one' })])
  await show()
  expect(props().influencer[0].posts.map((x) => x.id)).toEqual([2])
})

test('Instagram label (Akara): the heading is "Partnership Posts" on the Instagram tab only', async () => {
  withSection({ INSTAGRAM: { label: 'Partnership Posts' } })
  fetchTopContentFrozen.mockResolvedValue([post(2, { author: 'creator_one' })])
  await show()
  expect(heading()).toBe('Partnership Posts')
  render(<>{await TopContentOutlineSection({ ctx: { ...IG, channel: 'FACEBOOK' }, ownedLimit: 5 })}</>)
  expect(heading()).toBeUndefined()
})

test('on Overview a hidden platform drops only its own row', async () => {
  withSection({ INSTAGRAM: { hidden: true } })
  fetchTopContentFrozen.mockResolvedValue([
    post(2, { author: 'creator_one' }),
    post(5, { channel: 'FACEBOOK', platform: 'Facebook', ugc: true }), // a tagged post is a collab post (outline-top-content.ts:29)
  ])
  render(<>{await TopContentOutlineSection({ ctx: { ...IG, channel: null }, ownedLimit: 5 })}</>)
  expect(props().influencer.map((g) => g.platform)).toEqual(['Facebook'])
})

test('an invalid influencerSection keeps today\'s section and warns once with the slug, never the value', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  withSection({ INSTAGRAM: { label: 'secret-looking-value', hidden: true } })
  fetchTopContentFrozen.mockResolvedValue([post(2, { author: 'creator_one' })])
  await show()
  expect(props().influencer[0].posts.map((x) => x.id)).toEqual([2])
  expect(heading()).toBeUndefined()
  const lines = warn.mock.calls.map((c) => c.join(' ')).filter((l) => l.includes('influencerSection'))
  expect(lines).toEqual(['[organic-social] influencerSection invalid slug=client-a; showing the default Influencer section'])
  expect(lines.join('')).not.toContain('secret-looking-value')
  warn.mockRestore()
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `perl -e 'alarm 120; exec @ARGV' -- npx vitest run components/report-sections/organic-social/parts/top-content-outline.test.tsx`
Expected: the "no influencerSection" and "a hide on another channel" tests PASS, because they pin today's behaviour. The hidden, label, Overview and invalid tests FAIL: `props().influencer` still has the row, `heading()` is undefined, and no warning appears.

- [ ] **Step 3: Implement**

In `parts/top-content-outline.tsx`, add the import:

```tsx
import { hiddenInfluencerPlatforms, influencerLabel, parseInfluencerSection } from '@/lib/organic-social/influencer-section'
```

Replace line 23 (`let own: OwnHandles = {}` and its `try`) with:

```tsx
  // One client read for both settings. A failed read keeps today's rules: no own handles, the default section.
  let dsc: unknown
  let own: OwnHandles = {}
  try {
    dsc = (await getClientBySlug(clientSlug))?.dashSocialConfig
    own = parseOwnHandles(dsc)
  } catch { own = {} }
  const parsed = parseInfluencerSection((dsc as { influencerSection?: unknown } | null | undefined)?.influencerSection)
  if (parsed.kind === 'invalid') console.warn(`[organic-social] influencerSection invalid slug=${clientSlug}; showing the default Influencer section`)
  const section = parsed.kind === 'ok' ? parsed.section : {}
```

Then replace the return (lines 40-46) with:

```tsx
  const hidden = hiddenInfluencerPlatforms(section)
  const label = influencerLabel(section, channel)
  return (
    <section className="space-y-6">
      <h2 className="text-sm font-extrabold uppercase tracking-widest text-text-muted">Top Performing Content</h2>
      {/* A hidden platform's influencer row is not rendered, for staff and clients alike (Piper's Instagram, spec section
          4). Its posts stay classified as influencer: they are not moved into the owned top 5. */}
      <SortableTopContent owned={groupPostsByPlatform(owned, channel)}
        influencer={groupPostsByPlatform(influencer, channel).filter((g) => !hidden.has(g.platform))}
        clientSlug={clientSlug} canEdit={canSetDesignation(role)} ownedLimit={ownedLimit} sortKeys={OUTLINE_SORT_KEYS}
        {...(label ? { influencerHeading: label } : {})} />
    </section>
  )
```

- [ ] **Step 4: Run the tests**

Run: `perl -e 'alarm 240; exec @ARGV' -- npx vitest run components/report-sections/organic-social/parts/top-content-outline.test.tsx components/report-sections/organic-social/parts/top-content-v2.golden.test.tsx components/report-sections/organic-social/parts/composition.golden.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/report-sections/organic-social/parts/top-content-outline.tsx components/report-sections/organic-social/parts/top-content-outline.test.tsx
git commit -m "feat(organic-social): top-content@3 hides or renames the influencer section per client

Piper's Instagram drops the section (call 2026-10-02, 20:13); Akara's
Instagram heading becomes Partnership Posts (23:13 to 24:23). The posts
stay influencer-classified and are not moved into the owned top 5. The
staff toggle is unchanged.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
perl -e 'alarm 60; exec @ARGV' -- git push -q
```

---

### Task 5: S7, YTD hides the months before an account had data

**Files:**
- Modify: `lib/organic-social/ytd.ts:111-138` (`ytdSheetSeries`)
- Test: `lib/organic-social/ytd.test.ts` (four existing tests updated, three added)
- Test: `components/report-sections/organic-social/parts/ytd-review-sheet.test.tsx:68-76` (one assertion updated)

**Interfaces:**
- Consumes: nothing new.
- Produces: `ytdSheetSeries(...)` with the same signature and return type. The `gaps` arrays no longer include a leading run of blank or N/A months before the first point. An invalid cell is always in `gaps` and ends the run.

The rule (spec section 6): per graph and per channel, months whose cell is blank or N/A (or whose column is missing) and that produced no point, before the first month with a point, are not listed. A gap after the first point is still named. An invalid cell is named, logged, and ends the leading run.

- [ ] **Step 1: Update the existing tests to the new rule, and add the new ones**

In `lib/organic-social/ytd.test.ts`, make these exact edits.

1. In `'ytdSheetSeries: the sheet wins; ...'`, change the followers gaps line to:
```ts
  // Jan is N/A before the first point (Feb): not listed (S7). Mar is invalid: always named.
  expect(s.followers.gaps).toEqual(['Mar', 'Apr', 'May', 'Jun', 'Jul'])
```
2. In `'a blank month whose Data block is noData is a gap; a missing built entry throws'`, rename it to `'a blank month whose Data block is noData is a gap after the first point; before it, it is not listed'` and change the gaps line to:
```ts
  // Jan to Jul blank before firstMonth and Aug noData all come before the first point (Sep): none is listed (S7).
  expect(s.followers.gaps).toEqual([])
```
3. In `'a sheet number on the live month keeps (live); ...'`, change the views gaps line to:
```ts
  // A missing column reads as blank: Jan to Jul come before the first point (Aug) and are not listed (S7).
  expect(s.views.gaps).toEqual([])
```
4. In `'N/A from firstMonth on is a gap even when our own value exists: ...'`, rename it to `'N/A from firstMonth on is never filled from Dash, even when our own value exists'` and replace its last line with:
```ts
  expect(s.followers.points.map((p) => p.label)).toEqual(['Sep']) // Aug's Dash value is not used
  expect(s.followers.gaps).toEqual([]) // Jan to Aug come before the first point: not listed (S7)
```

Then append:

```ts
test('S7: a leading run of blank and N/A months is not listed; a gap after the first point is named', () => {
  const months = ytdSheetMonths('custom:2026-09-01,2026-09-30', 'x', CFG)!
  const t = tabOf(col({ 1: NA, 2: B, 3: n(30), 4: NA, 5: B, 6: n(60), 7: n(70), 8: n(80), 9: n(90) }), col({}, n(1)))
  const s = ytdSheetSeries(months, t, 'INSTAGRAM', '2026-08', {})
  expect(s.followers.points.map((p) => p.label)).toEqual(['Mar', 'Jun', 'Jul', 'Aug', 'Sep'])
  expect(s.followers.gaps).toEqual(['Apr', 'May'])
  expect(s.views.gaps).toEqual([])
})
test('S7: an invalid cell is always named and ends the leading run', () => {
  const months = ytdSheetMonths('custom:2026-09-01,2026-09-30', 'x', CFG)!
  const t = tabOf(col({ 1: B, 2: BAD, 3: B, 4: n(40), 5: n(50), 6: n(60), 7: n(70), 8: n(80), 9: n(90) }), col({}, n(1)))
  const s = ytdSheetSeries(months, t, 'INSTAGRAM', '2026-08', {})
  expect(s.followers.gaps).toEqual(['Feb', 'Mar'])
  expect(s.invalid).toEqual([{ month: '2026-02', graph: 'followers' }])
})
test('S7: a graph with no point at all lists no gaps (the card shows No data)', () => {
  const months = ytdSheetMonths('custom:2026-09-01,2026-09-30', 'x', CFG)!
  const s = ytdSheetSeries(months, tabOf(col({}, NA), col({}, n(1))), 'INSTAGRAM', '2026-08', {})
  expect(s.followers.points).toEqual([])
  expect(s.followers.gaps).toEqual([])
})
```

In `parts/ytd-review-sheet.test.tsx`, test `'gaps are named under each graph; ...'`, replace line 73 with:

```tsx
  // Jan (N/A) and Feb to May (blank before firstMonth) come before the first point (Jun): not listed (S7).
  expect(container.textContent).not.toContain('No follower data')
```

and rename that test to `'a later gap is named under its graph; the months before the first point are not; a blank before firstMonth never calls Dash'`.

- [ ] **Step 2: Run them and watch them fail**

Run: `perl -e 'alarm 180; exec @ARGV' -- npx vitest run lib/organic-social/ytd.test.ts components/report-sections/organic-social/parts/ytd-review-sheet.test.tsx`
Expected: FAIL in exactly these: the four edited `ytd.test.ts` tests, the first and third new tests (gaps still include the leading months), and the edited `ytd-review-sheet` test. The invalid-cell test passes today, since every month before it is already named. That's fine: it pins the rule.

- [ ] **Step 3: Implement**

In `lib/organic-social/ytd.ts`, replace the docblock and body of `ytdSheetSeries` (lines 111-138) with:

```ts
/** Each graph decided separately per month (spec 4.3 table): the sheet's number wins; a blank from firstMonth uses
 *  the Data block's value (a gap when that month is noData); N/A, invalid and earlier blanks are gaps. Months before an
 *  account had data are not gaps (spec 2026-10-02 section 6, S7): per graph, the leading run of blank or N/A months
 *  that produced no point is not listed. An invalid cell is always listed and ends that run. */
export function ytdSheetSeries(
  months: YtdMonth[], tab: YtdTab, channel: DashChannel, firstMonth: string, built: Record<string, OutlineKpis | undefined>,
): { followers: YtdGraph; views: YtdGraph; invalid: { month: string; graph: YtdGraphKey }[]; missingColumn: YtdGraphKey[] } {
  const res = {
    followers: { points: [], gaps: [] } as YtdGraph,
    views: { points: [], gaps: [] } as YtdGraph,
    invalid: [] as { month: string; graph: YtdGraphKey }[],
    missingColumn: GRAPHS.filter((g) => !tab[g][channel]),
  }
  const leading: Record<YtdGraphKey, boolean> = { followers: true, views: true }
  for (const m of months) {
    const label = labelOf(m)
    for (const g of GRAPHS) {
      const c = cellAt(tab, g, channel, m.key) ?? { kind: 'blank' as const }
      if (c.kind === 'number') { res[g].points.push({ key: m.key, label, value: c.value }); leading[g] = false; continue }
      if (c.kind === 'invalid') { res.invalid.push({ month: m.key, graph: g }); leading[g] = false }
      if (c.kind === 'blank' && m.key >= firstMonth) {
        const b = built[m.key]
        const k = b?.kpis[g === 'followers' ? 'followers' : 'exposure']
        if (!b || !k) throw new Error(`YTD: no tiles for ${m.key}`)
        if (!b.noData) { res[g].points.push({ key: m.key, label, value: k.value }); leading[g] = false; continue }
      }
      if (!leading[g]) res[g].gaps.push(label)
    }
  }
  return res
}
```

- [ ] **Step 4: Run the tests**

Run: `perl -e 'alarm 180; exec @ARGV' -- npx vitest run lib/organic-social/ytd.test.ts components/report-sections/organic-social/parts/ytd-review-sheet.test.tsx components/report-sections/organic-social/parts/ytd-review.test.tsx components/report-sections/organic-social/parts/ytd-parity.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/organic-social/ytd.ts lib/organic-social/ytd.test.ts components/report-sections/organic-social/parts/ytd-review-sheet.test.tsx
git commit -m "feat(organic-social): YTD stops listing the months before an account had data

Jasmine removed those months from her sheet on purpose (call 2026-10-02,
10:32). Per graph, the leading run of blank or N/A months before the first
point is not listed; later gaps and every invalid cell are still named.
The months requested and the values plotted do not change.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
perl -e 'alarm 60; exec @ARGV' -- git push -q
```

---

### Task 6: S4, putting sheet numbers into the tiles (pure)

**Files:**
- Modify: `lib/organic-social/ytd.ts:21, :84` (export `addMonths` and `cellAt`)
- Create: `lib/organic-social/tiles-from-sheet.ts`
- Create: `lib/organic-social/tiles-from-sheet.test.ts`

**Interfaces:**
- Consumes: `OutlineKpis` (`outline-headlines.ts:13`), `outlineDelta(m: TotalMetric | undefined)` (`outline-delta.ts:9`), `TotalMetric` (`lib/dash-social/types.ts:30`), `lastOf` (`reporting-months.ts:56`), `YtdTab` (`ytd-sheet.ts:9`), `YtdConfig` (`ytd.ts:12`).
- Produces:
  - from `ytd.ts`: `export const addMonths(key: string, n: number): string` and `export const cellAt(tab: YtdTab, g: YtdGraphKey, ch: DashChannel, key: string): YtdCell | null`
  - `finishedMonthOnScreen(dateRange: string, lastCompleteUtcDay: string): string | null`
  - `comparisonMonth(key: string, comparison: YtdConfig['comparison']): string`
  - `type TileSheets = { current: YtdTab; prior: YtdTab | null }`
  - `applySheetToTiles(built: OutlineKpis, channel: DashChannel, key: string, compareKey: string, sheets: TileSheets): OutlineKpis`

- [ ] **Step 1: Write the failing test**

Create `lib/organic-social/tiles-from-sheet.test.ts`:

```ts
import { expect, test } from 'vitest'
import { applySheetToTiles, comparisonMonth, finishedMonthOnScreen } from './tiles-from-sheet'
import { buildOutlineKpis, selectOutlineRows } from './outline-headlines'
import { outlineSpecsFor, OUTLINE_DATA_ROWS } from './outline-layout'
import { metricFor, type DashChannel } from './metrics'
import type { YtdCell, YtdTab } from './ytd-sheet'

// Made-up numbers only.
const n = (value: number): YtdCell => ({ kind: 'number', value })
const B: YtdCell = { kind: 'blank' }
const col = (cells: Record<number, YtdCell>) => Array.from({ length: 12 }, (_, i) => cells[i + 1] ?? B)
const tab = (ch: DashChannel, f: Record<number, YtdCell>, v: Record<number, YtdCell>): YtdTab => ({ followers: { [ch]: col(f) }, views: { [ch]: col(v) } })
const built = (ch: DashChannel, value: number | null = 10, context: number | null = 8) => buildOutlineKpis(ch,
  Object.fromEntries(outlineSpecsFor(ch).map((s) => [metricFor(s), { value, context, context_change: null }])), outlineSpecsFor(ch))

test('finishedMonthOnScreen: a whole month that has ended; anything else is null', () => {
  expect(finishedMonthOnScreen('custom:2026-09-01,2026-09-30', '2026-10-01')).toBe('2026-09')
  expect(finishedMonthOnScreen('custom:2026-02-01,2026-02-28', '2026-03-05')).toBe('2026-02')
  expect(finishedMonthOnScreen('custom:2026-09-01,2026-09-30', '2026-09-30')).toBe('2026-09') // its last day is complete
  expect(finishedMonthOnScreen('custom:2026-09-01,2026-09-30', '2026-09-29')).toBeNull() // not over yet
  expect(finishedMonthOnScreen('custom:2026-10-01,2026-10-14', '2026-10-14')).toBeNull() // the live month
  expect(finishedMonthOnScreen('custom:2026-09-02,2026-09-30', '2026-10-05')).toBeNull()
  expect(finishedMonthOnScreen('custom:2026-08-01,2026-09-30', '2026-10-05')).toBeNull()
  expect(finishedMonthOnScreen('last_30_days', '2026-10-05')).toBeNull()
})

test('comparisonMonth: the month before, or the same month a year back', () => {
  expect(comparisonMonth('2026-09', 'previous-month')).toBe('2026-08')
  expect(comparisonMonth('2026-01', 'previous-month')).toBe('2025-12')
  expect(comparisonMonth('2026-09', 'previous-year')).toBe('2025-09')
})

test('the sheet has the month and the month before: both tiles take it, arrows are sheet against sheet, nothing else moves', () => {
  const b = built('INSTAGRAM')
  const out = applySheetToTiles(b, 'INSTAGRAM', '2026-09', '2026-08', { current: tab('INSTAGRAM', { 8: n(1000), 9: n(1100) }, { 8: n(200), 9: n(300) }), prior: null })
  expect(out.kpis.followers).toEqual({ ...b.kpis.followers, value: 1100, delta: 10 })
  expect(out.kpis.exposure).toEqual({ ...b.kpis.exposure, value: 300, delta: 50 })
  for (const k of Object.keys(b.kpis).filter((k) => k !== 'followers' && k !== 'exposure')) expect(out.kpis[k]).toBe(b.kpis[k])
  expect(out.noData).toBe(false)
})

test('each tile separately: a blank, N/A or invalid cell, or a missing column, keeps Dash\'s tile and arrow exactly', () => {
  const b = built('INSTAGRAM')
  for (const cell of [B, { kind: 'na' } as YtdCell, { kind: 'invalid' } as YtdCell]) {
    const out = applySheetToTiles(b, 'INSTAGRAM', '2026-09', '2026-08', { current: tab('INSTAGRAM', { 9: cell }, { 9: n(300) }), prior: null })
    expect(out.kpis.followers).toBe(b.kpis.followers)
    expect(out.kpis.exposure.value).toBe(300)
  }
  const noColumn = applySheetToTiles(b, 'INSTAGRAM', '2026-09', '2026-08', { current: tab('FACEBOOK', { 9: n(1) }, { 9: n(1) }), prior: null })
  expect(noColumn).toEqual(b)
})

test('the comparison month is not in the sheet: the sheet value with no arrow, never sheet against Dash', () => {
  const out = applySheetToTiles(built('INSTAGRAM'), 'INSTAGRAM', '2026-09', '2026-08', { current: tab('INSTAGRAM', { 9: n(1100) }, { 8: { kind: 'na' }, 9: n(300) }), prior: null })
  expect(out.kpis.followers.value).toBe(1100)
  expect(out.kpis.followers.delta).toBeUndefined()
  expect(out.kpis.exposure.delta).toBeUndefined()
})

test('January with no prior-year tab: no arrow; with one, the arrow reads the prior year\'s December', () => {
  const current = tab('INSTAGRAM', { 1: n(110) }, { 1: n(30) })
  expect(applySheetToTiles(built('INSTAGRAM'), 'INSTAGRAM', '2026-01', '2025-12', { current, prior: null }).kpis.followers.delta).toBeUndefined()
  const prior = tab('INSTAGRAM', { 12: n(100) }, { 12: n(20) })
  const out = applySheetToTiles(built('INSTAGRAM'), 'INSTAGRAM', '2026-01', '2025-12', { current, prior })
  expect(out.kpis.followers.delta).toBe(10)
  expect(out.kpis.exposure.delta).toBe(50)
})

test('previous-year: the arrow reads the same month of the prior year\'s tab', () => {
  const out = applySheetToTiles(built('LINKEDIN'), 'LINKEDIN', '2026-09', '2025-09', {
    current: tab('LINKEDIN', { 9: n(150) }, { 9: n(10) }), prior: tab('LINKEDIN', { 9: n(100) }, { 9: n(20) }),
  })
  expect(out.kpis.followers.delta).toBe(50)
  expect(out.kpis.exposure.delta).toBe(-50)
})

test('noData stays No data: a month Dash returned all null is returned untouched', () => {
  const b = built('INSTAGRAM', null, null)
  expect(b.noData).toBe(true)
  expect(applySheetToTiles(b, 'INSTAGRAM', '2026-09', '2026-08', { current: tab('INSTAGRAM', { 9: n(1) }, { 9: n(1) }), prior: null })).toBe(b)
})

test('TikTok Video Views reads Views, so it follows the sheet too', () => {
  const out = applySheetToTiles(built('TIKTOK'), 'TIKTOK', '2026-09', '2026-08', { current: tab('TIKTOK', {}, { 9: n(4321) }), prior: null })
  const rows = selectOutlineRows('TIKTOK', out, OUTLINE_DATA_ROWS.standard.TIKTOK!)
  expect(rows.kpis.find((k) => k.key === 'videoViews')?.value).toBe(4321)
  expect(rows.kpis.find((k) => k.key === 'exposure')?.value).toBe(4321)
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `perl -e 'alarm 120; exec @ARGV' -- npx vitest run lib/organic-social/tiles-from-sheet.test.ts`
Expected: FAIL with `Failed to resolve import "./tiles-from-sheet"`.

- [ ] **Step 3: Implement**

In `lib/organic-social/ytd.ts`, add `export` to two helpers. Nothing else in them changes.
- line 21: `const addMonths = (key: string, n: number) => {` becomes `export const addMonths = (key: string, n: number) => {`
- line 84: `const cellAt = (tab: YtdTab, g: YtdGraphKey, ch: DashChannel, key: string): YtdCell | null => {` becomes `export const cellAt = (tab: YtdTab, g: YtdGraphKey, ch: DashChannel, key: string): YtdCell | null => {`

Create `lib/organic-social/tiles-from-sheet.ts`:

```ts
// Total Followers and Views tiles from the team's YTD sheet (spec docs/superpowers/specs/2026-10-02-os-jasmine-call-
// changes-design.md section 5, S4). Pure: the loader (tile-sheets.ts) does the reads. The Dash request, its cache and
// its lock key are untouched; the sheet only replaces two values after Dash has answered.
import type { TotalMetric } from '@/lib/dash-social/types'
import type { DashChannel } from './metrics'
import type { OutlineKpis } from './outline-headlines'
import { outlineDelta } from './outline-delta'
import { lastOf } from './reporting-months'
import { addMonths, cellAt, type YtdConfig } from './ytd'
import type { YtdTab } from './ytd-sheet'

const WHOLE_MONTH = /^custom:(\d{4}-(?:0[1-9]|1[0-2]))-01,(\d{4}-\d{2}-\d{2})$/

/** The month on screen when the range is exactly one whole month whose last day is complete; otherwise null and the
 *  tiles keep Dash's numbers (the live month is never replaced). */
export function finishedMonthOnScreen(dateRange: string, lastCompleteUtcDay: string): string | null {
  const m = WHOLE_MONTH.exec(dateRange)
  if (!m || m[2] !== lastOf(m[1]) || m[2] > lastCompleteUtcDay) return null
  return m[1]
}

/** The month the tiles' arrow compares with, the way locked months compares a finished month. */
export function comparisonMonth(key: string, comparison: YtdConfig['comparison']): string {
  return addMonths(key, comparison === 'previous-year' ? -12 : -1)
}

/** The year on screen's tab, and the comparison month's year's tab when that is another year (null when it has no
 *  usable entry or could not be read). */
export type TileSheets = { current: YtdTab; prior: YtdTab | null }

const TILES = [['followers', 'followers'], ['views', 'exposure']] as const

/** Each tile separately: a sheet number replaces the value, and the arrow becomes the sheet's number against the
 *  sheet's number for the comparison month (outlineDelta), or no arrow when the sheet does not have that month. Never
 *  sheet against Dash. Any other cell leaves the tile exactly as Dash built it. A month Dash returned all null stays No
 *  data: the other tiles would read 0. TikTok's Video Views row reads `exposure` (outline-layout.ts), so it follows. */
export function applySheetToTiles(built: OutlineKpis, channel: DashChannel, key: string, compareKey: string, sheets: TileSheets): OutlineKpis {
  if (built.noData) return built
  const compareTab = compareKey.slice(0, 4) === key.slice(0, 4) ? sheets.current : sheets.prior
  let kpis = built.kpis
  for (const [graph, tile] of TILES) {
    const k = kpis[tile]
    const cell = cellAt(sheets.current, graph, channel, key)
    if (!k || cell?.kind !== 'number') continue
    const prior = compareTab ? cellAt(compareTab, graph, channel, compareKey) : null
    const m: TotalMetric = { value: cell.value, context: prior?.kind === 'number' ? prior.value : null, context_change: null }
    kpis = { ...kpis, [tile]: { ...k, value: cell.value, delta: outlineDelta(m) } }
  }
  return kpis === built.kpis ? built : { ...built, kpis }
}
```

Returning `built` itself when nothing changed is what lets the missing-column test use `toEqual(b)` and the noData test use `toBe(b)`.

- [ ] **Step 4: Run the tests**

Run: `perl -e 'alarm 180; exec @ARGV' -- npx vitest run lib/organic-social/tiles-from-sheet.test.ts lib/organic-social/ytd.test.ts && perl -e 'alarm 300; exec @ARGV' -- npm run typecheck`
Expected: PASS, and typecheck exit 0.

- [ ] **Step 5: Commit**

```bash
git add lib/organic-social/ytd.ts lib/organic-social/tiles-from-sheet.ts lib/organic-social/tiles-from-sheet.test.ts
git commit -m "feat(organic-social): Total Followers and Views from the sheet (pure)

For a finished month the sheet has filled, each of the two tiles takes the
sheet's number and an arrow against the sheet's comparison month (the
prior year's tab for January and previous-year), or no arrow. Never sheet
against Dash. A month Dash returned all null stays No data.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
perl -e 'alarm 60; exec @ARGV' -- git push -q
```

---

### Task 7: S4 and S5, the tile sheet loader

**Files:**
- Create: `lib/organic-social/tile-sheets.ts`
- Create: `lib/organic-social/tile-sheets.test.ts`

**Interfaces:**
- Consumes: `finishedMonthOnScreen`, `comparisonMonth`, `TileSheets` (Task 6); `getClientBySlug` (`lib/db/queries.ts`); `requestClock()` (`lib/organic-social/locked-range.ts:8`); `ytdConfig` (`ytd.ts:33`); `ytdSheetFor`, `readYtdTab`, `parseYtdGrid`, `YtdSheetLayoutError`, `YtdSheetReadError` (`ytd-sheet.ts`).
- Produces:
  - `type TileSheetPlan = { key: string; compareKey: string; sheets: TileSheets }`
  - `loadTileSheets(slug: string, dateRange: string): Promise<TileSheetPlan | null>`. It never rejects.

Because the sheet is read through the existing `readYtdTab` (`cached`, one read per tab an hour, failures replayed for 30 seconds, `ytd-sheet.ts:122-125`), an edit to the sheet shows on the tiles within the hour (S5).

- [ ] **Step 1: Write the failing test**

Create `lib/organic-social/tile-sheets.test.ts`:

```ts
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

const { getClientBySlug, readYtdTab } = vi.hoisted(() => ({ getClientBySlug: vi.fn(), readYtdTab: vi.fn() }))
vi.mock('@/lib/db/queries', () => ({ getClientBySlug }))
vi.mock('./ytd-sheet', async () => ({ ...(await vi.importActual<typeof import('./ytd-sheet')>('./ytd-sheet')), readYtdTab }))

import { loadTileSheets } from './tile-sheets'
import { YtdSheetReadError } from './ytd-sheet'

// Made-up sheet ids, tab names and numbers only.
const ID = 'TESTSHEETID_abcdefghij0123'
const ID25 = 'TESTSHEETID_abcdefghij2025'
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const GRID = [['CLIENT: Test Co'], ['FOLLOWER GROWTH'], ['', 'Instagram'], ...MONTHS.map((m, i) => [m, String(100 + i)]),
  [], ['VIEWS'], ['', 'Instagram'], ...MONTHS.map((m, i) => [m, String(10 + i)])]
const client = (dsc: Record<string, unknown>) => ({ id: 'c1', dashSocialConfig: { brandId: 1, ...dsc } })
const LOCKED = { reportingMonths: { firstMonth: '2026-08' } }
const SEPT = 'custom:2026-09-01,2026-09-30'
const logs = () => [...vi.mocked(console.warn).mock.calls, ...vi.mocked(console.error).mock.calls].map((c) => c.join(' '))

beforeEach(() => {
  vi.restoreAllMocks()
  getClientBySlug.mockReset(); readYtdTab.mockReset()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-15T12:00:00Z'))
  vi.spyOn(console, 'warn').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.useRealTimers())

test('a rolling range or the live month reads nothing, not even the client row', async () => {
  expect(await loadTileSheets('c', 'last_30_days')).toBeNull()
  expect(await loadTileSheets('c', 'custom:2026-10-01,2026-10-14')).toBeNull()
  expect(getClientBySlug).not.toHaveBeenCalled()
})

test('a client not on locked months (Renaissance) never reads the sheet', async () => {
  getClientBySlug.mockResolvedValue(client({ ytdSheets: { 2026: { sheetId: ID, tab: 'Test Co' } } }))
  expect(await loadTileSheets('c', SEPT)).toBeNull()
  expect(readYtdTab).not.toHaveBeenCalled()
})

test('no sheet for the year: null, no read, no log', async () => {
  getClientBySlug.mockResolvedValue(client(LOCKED))
  expect(await loadTileSheets('c', SEPT)).toBeNull()
  expect(readYtdTab).not.toHaveBeenCalled()
  expect(logs()).toEqual([])
})

test('September with a sheet: one read; the comparison month is August in the same tab', async () => {
  getClientBySlug.mockResolvedValue(client({ ...LOCKED, ytdSheets: { 2026: { sheetId: ID, tab: 'Test Co' } } }))
  readYtdTab.mockResolvedValue(GRID)
  const plan = await loadTileSheets('c', SEPT)
  expect(readYtdTab.mock.calls).toEqual([[ID, 'Test Co']])
  expect(plan?.key).toBe('2026-09')
  expect(plan?.compareKey).toBe('2026-08')
  expect(plan?.sheets.prior).toBeNull()
  expect(plan?.sheets.current.followers.INSTAGRAM?.[8]).toEqual({ kind: 'number', value: 108 })
})

test('an invalid entry: null and one warning with the slug and year, never the entry', async () => {
  getClientBySlug.mockResolvedValue(client({ ...LOCKED, ytdSheets: { 2026: { sheetId: 'bad', tab: 'Test Co' } } }))
  expect(await loadTileSheets('c', SEPT)).toBeNull()
  expect(logs()).toEqual(['[organic-social] ytd sheet config invalid (tiles) slug=c year=2026'])
})

test('a read failure or a layout error: null, logged with slug, year and status, never the sheet id or tab', async () => {
  getClientBySlug.mockResolvedValue(client({ ...LOCKED, ytdSheets: { 2026: { sheetId: ID, tab: 'Test Co' } } }))
  readYtdTab.mockRejectedValueOnce(new YtdSheetReadError('429'))
  expect(await loadTileSheets('c', SEPT)).toBeNull()
  readYtdTab.mockResolvedValueOnce(GRID.map((r) => (r[0] === 'September' ? ['Sept', '1'] : r)))
  expect(await loadTileSheets('c', SEPT)).toBeNull()
  readYtdTab.mockRejectedValueOnce(new Error('boom'))
  expect(await loadTileSheets('c', SEPT)).toBeNull()
  expect(logs()).toEqual([
    '[organic-social] ytd sheet read failed (tiles) slug=c year=2026 status=429',
    '[organic-social] ytd sheet layout not found (tiles) slug=c year=2026 missing=followers september',
    '[organic-social] ytd sheet read failed (tiles) slug=c year=2026 status=error',
  ])
  expect(logs().join('\n')).not.toContain(ID)
  expect(logs().join('\n')).not.toContain('Test Co')
})

test('January: the prior year\'s tab is read for the arrow; its failure is logged with its year and the current tab still applies', async () => {
  vi.setSystemTime(new Date('2026-02-10T12:00:00Z'))
  getClientBySlug.mockResolvedValue(client({ ...LOCKED, ytdSheets: { 2026: { sheetId: ID, tab: 'Test Co' }, 2025: { sheetId: ID25, tab: 'Test Co 25' } } }))
  readYtdTab.mockResolvedValue(GRID)
  let plan = await loadTileSheets('c', 'custom:2026-01-01,2026-01-31')
  expect(readYtdTab.mock.calls).toEqual([[ID, 'Test Co'], [ID25, 'Test Co 25']])
  expect(plan?.compareKey).toBe('2025-12')
  expect(plan?.sheets.prior).not.toBeNull()
  readYtdTab.mockReset()
  readYtdTab.mockImplementation(async (id: string) => { if (id === ID25) throw new YtdSheetReadError('timeout'); return GRID })
  plan = await loadTileSheets('c', 'custom:2026-01-01,2026-01-31')
  expect(plan?.sheets.prior).toBeNull()
  expect(plan?.sheets.current).toBeTruthy()
  expect(logs()).toContain('[organic-social] ytd sheet read failed (tiles) slug=c year=2025 status=timeout')
})

test('previous-year compares with the same month a year back, from that year\'s tab', async () => {
  getClientBySlug.mockResolvedValue(client({ reportingMonths: { firstMonth: '2026-08', comparison: 'previous-year' }, ytdSheets: { 2026: { sheetId: ID, tab: 'Test Co' } } }))
  readYtdTab.mockResolvedValue(GRID)
  const plan = await loadTileSheets('c', SEPT)
  expect(plan?.compareKey).toBe('2025-09')
  expect(readYtdTab).toHaveBeenCalledTimes(1) // no 2025 entry: no second read, no log
  expect(plan?.sheets.prior).toBeNull()
  expect(logs()).toEqual([])
})

test('a failed client read is null, not a thrown error', async () => {
  getClientBySlug.mockRejectedValue(new Error('db down'))
  await expect(loadTileSheets('c', SEPT)).resolves.toBeNull()
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `perl -e 'alarm 120; exec @ARGV' -- npx vitest run lib/organic-social/tile-sheets.test.ts`
Expected: FAIL with `Failed to resolve import "./tile-sheets"`.

- [ ] **Step 3: Implement**

Create `lib/organic-social/tile-sheets.ts`:

```ts
// The reads behind the tiles from the sheet (spec 2026-10-02 section 5): the client's config, then at most two cached
// sheet reads (the year on screen, and the comparison month's year when it differs). Never throws: every failure is
// logged with the slug and year, never the sheet id, the tab or a value (ytd-sheet.ts), and the tiles keep Dash's numbers.
import { getClientBySlug } from '@/lib/db/queries'
import { requestClock } from './locked-range'
import { comparisonMonth, finishedMonthOnScreen, type TileSheets } from './tiles-from-sheet'
import { ytdConfig } from './ytd'
import { parseYtdGrid, readYtdTab, ytdSheetFor, YtdSheetLayoutError, YtdSheetReadError, type YtdTab } from './ytd-sheet'

export type TileSheetPlan = { key: string; compareKey: string; sheets: TileSheets }

async function readYear(slug: string, ytdSheets: unknown, year: string): Promise<YtdTab | null> {
  const s = ytdSheetFor(ytdSheets, year)
  if (s.kind === 'none') return null
  if (s.kind === 'invalid') {
    console.warn(`[organic-social] ytd sheet config invalid (tiles) slug=${slug} year=${year}`)
    return null
  }
  try {
    return parseYtdGrid(await readYtdTab(s.entry.sheetId, s.entry.tab))
  } catch (e) {
    if (e instanceof YtdSheetLayoutError) console.error(`[organic-social] ytd sheet layout not found (tiles) slug=${slug} year=${year} missing=${e.missing}`)
    else console.error(`[organic-social] ytd sheet read failed (tiles) slug=${slug} year=${year} status=${e instanceof YtdSheetReadError ? e.status : 'error'}`)
    return null
  }
}

/** What the Data block needs to show Total Followers and Views from the sheet, or null when it keeps Dash's numbers:
 *  the range is not a finished whole month (checked first, so a rolling range never reads the client row), the client
 *  is not on locked months (Renaissance never is), or there is no usable sheet for that year. */
export async function loadTileSheets(slug: string, dateRange: string): Promise<TileSheetPlan | null> {
  const key = finishedMonthOnScreen(dateRange, requestClock().lastCompleteUtcDay)
  if (!key) return null
  let dsc: { reportingMonths?: unknown; ytdSheets?: unknown } | null | undefined
  // The tiles' own Dash request needs the same row; if it cannot be read, that request fails and shows the error card.
  try { dsc = (await getClientBySlug(slug))?.dashSocialConfig as typeof dsc } catch { return null }
  const cfg = ytdConfig(dsc?.reportingMonths)
  if (!cfg) return null
  const compareKey = comparisonMonth(key, cfg.comparison)
  const year = key.slice(0, 4)
  const priorYear = compareKey.slice(0, 4)
  const [current, prior] = await Promise.all([
    readYear(slug, dsc?.ytdSheets, year),
    priorYear === year ? Promise.resolve(null) : readYear(slug, dsc?.ytdSheets, priorYear),
  ])
  if (!current) return null
  return { key, compareKey, sheets: { current, prior } }
}
```

- [ ] **Step 4: Run the tests**

Run: `perl -e 'alarm 120; exec @ARGV' -- npx vitest run lib/organic-social/tile-sheets.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit, with the edge-case list in the body**

This code crosses a network boundary (the Sheets API), so the global rule applies and the list goes in the commit body.

```bash
git add lib/organic-social/tile-sheets.ts lib/organic-social/tile-sheets.test.ts
git commit -m "feat(organic-social): tile sheet loader that never blanks the Data block

Reads the client's config, then the year on screen's tab and, for January
or previous-year, the prior year's tab, through the existing hourly cached
reader (so a sheet edit shows within the hour, S5).

Edge cases in the code this touches and the code it calls:
- External failure (timeout, status, non-JSON, auth): readYtdTab throws
  YtdSheetReadError; caught here, logged, tiles keep Dash. fix (tested)
- Operator visibility: one line per failure with slug, year and status or
  missing; invalid config warns with slug and year. fix (tested)
- Bounds: at most two reads per render, each cached an hour per tab,
  failures replayed 30 s (ytd-sheet.ts). decline: already bounded
- Input boundaries: entries validated by ytdSheetFor, cells by
  classifyCell, layout by parseYtdGrid. decline: existing and tested
- State and concurrency: cached() shares one read per tab; a second render
  in the 30 s negative window gets the same failure. decline
- Security: no sheet id, tab or value in any log line. fix (tested)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
perl -e 'alarm 60; exec @ARGV' -- git push -q
```

---

### Task 8: The Data block reads the sheet beside Dash

**Files:**
- Modify: `components/report-sections/organic-social/parts/outline-data.tsx:1-31`
- Test: `components/report-sections/organic-social/parts/outline-parts.test.tsx` (mock added, two tests appended)

**Interfaces:**
- Consumes: `loadTileSheets` (Task 7); `applySheetToTiles` (Task 6).
- Produces: none new.

- [ ] **Step 1: Add the mock and write the failing tests**

In `parts/outline-parts.test.tsx`, after the `getOutlineMediaKpis` mock (line 14), add:

```tsx
const { loadTileSheets } = vi.hoisted(() => ({ loadTileSheets: vi.fn() }))
vi.mock('@/lib/organic-social/tile-sheets', () => ({ loadTileSheets }))
```

and change line 43 to:

```tsx
beforeEach(() => {
  getOutlineMediaKpis.mockReset(); getOutlineMediaKpis.mockResolvedValue(REELS)
  loadTileSheets.mockReset(); loadTileSheets.mockResolvedValue(null)
})
```

Append:

```tsx
const cells = (m: Record<number, number>) => Array.from({ length: 12 }, (_, i) => (m[i + 1] === undefined ? { kind: 'blank' as const } : { kind: 'number' as const, value: m[i + 1] }))
const SEPT_IG = { ...IG, dateRange: 'custom:2026-09-01,2026-09-30', compareRange: 'custom:2026-08-01,2026-08-31' }

test('a finished month the sheet has: Total Followers and Views show the sheet with sheet arrows; the Dash request is exactly today\'s', async () => {
  getOutlineKpis.mockReset(); getOutlineKpis.mockResolvedValueOnce(built(10))
  loadTileSheets.mockResolvedValueOnce({ key: '2026-09', compareKey: '2026-08', sheets: {
    current: { followers: { INSTAGRAM: cells({ 8: 1000, 9: 1100 }) }, views: { INSTAGRAM: cells({ 8: 200, 9: 300 }) } }, prior: null,
  } })
  const c = await text(OutlineDataSection({ ctx: SEPT_IG, channel: 'INSTAGRAM', rows: OUTLINE_DATA_ROWS.standard.INSTAGRAM! }))
  expect(getOutlineKpis.mock.calls).toEqual([[SEPT_IG.clientSlug, 'custom:2026-09-01,2026-09-30', 'custom:2026-08-01,2026-08-31', 'INSTAGRAM']])
  expect(loadTileSheets.mock.calls).toEqual([[SEPT_IG.clientSlug, 'custom:2026-09-01,2026-09-30']])
  expect(card(c, 'Total Followers')!.textContent).toContain('1,100')
  expect(card(c, 'Total Followers')!.textContent).toContain('↑ 10% vs prior period')
  expect(card(c, 'Views')!.textContent).toContain('300')
  expect(card(c, 'Views')!.textContent).toContain('↑ 50% vs prior period')
  expect(card(c, 'Net New Followers')!.textContent).toContain('10') // Dash, unchanged
})

test('with no sheet plan the tiles are exactly Dash\'s', async () => {
  getOutlineKpis.mockReset(); getOutlineKpis.mockResolvedValueOnce(built(10))
  const c = await text(OutlineDataSection({ ctx: SEPT_IG, channel: 'INSTAGRAM', rows: OUTLINE_DATA_ROWS.standard.INSTAGRAM! }))
  expect(card(c, 'Total Followers')!.textContent).toContain('10')
  expect(card(c, 'Total Followers')!.textContent).not.toContain('1,100')
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `perl -e 'alarm 180; exec @ARGV' -- npx vitest run components/report-sections/organic-social/parts/outline-parts.test.tsx`
Expected: the first new test FAILS. `loadTileSheets` was never called, and Total Followers shows `10`. The second new test and every existing test PASS.

- [ ] **Step 3: Implement**

In `parts/outline-data.tsx`, add the imports:

```tsx
import { loadTileSheets } from '@/lib/organic-social/tile-sheets'
import { applySheetToTiles } from '@/lib/organic-social/tiles-from-sheet'
```

Replace lines 13-31 (`OutlineDataSection`) with:

```tsx
/** The tiles' request, plus Views on Reels when the rows show it, plus the team's YTD sheet for a finished month (Total
 *  Followers and Views follow the sheet, spec 2026-10-02 section 5). A failed Reels request flags only its row; a failed
 *  sheet read keeps Dash's numbers (logged by the loader); a failed tiles request (or a row with no tile) is the
 *  section's fallback card, as today. */
export async function OutlineDataSection({ ctx, channel, rows }: { ctx: OrganicSocialCtx; channel: DashChannel; rows: readonly OutlineRow[] }) {
  const media = mediaRowsFor(channel, rows)
  // All three gate the block (one Suspense). The sheet read is cached hourly and has a 10 second deadline; the Dash
  // request, its cache and its lock key are exactly today's.
  const [r, m, sheet] = await Promise.all([
    safe(getOutlineKpis(ctx.clientSlug, ctx.dateRange, ctx.compareRange, channel)),
    media.length ? safe(getOutlineMediaKpis(ctx.clientSlug, ctx.dateRange, ctx.compareRange, channel)) : safe(Promise.resolve({})),
    loadTileSheets(ctx.clientSlug, ctx.dateRange).catch(() => null),
  ])
  if (!r.data) return <Fallback kind={r.error!} />
  if (!m.data) console.error(`[organic-social] Views on Reels failed slug=${ctx.clientSlug} channel=${channel} kind=${m.error}`)
  const failed = new Set(m.data ? [] : media.map((x) => x.key))
  const shown = rows.map((row) => (failed.has(row.key) ? { ...row, unavailable: MEDIA_FAILED } : row))
  const tiles = sheet ? applySheetToTiles(r.data, channel, sheet.key, sheet.compareKey, sheet.sheets) : r.data
  const built = { ...tiles, kpis: { ...tiles.kpis, ...(m.data ?? {}) } }
  let headline: OutlineHeadline
  try { headline = selectOutlineRows(channel, built, shown) } catch { return <Fallback kind="error" /> }
  return <OutlineHeadlines headline={headline} />
}
```

- [ ] **Step 4: Run every suite that renders the Data block**

Run: `perl -e 'alarm 300; exec @ARGV' -- npx vitest run components/report-sections/organic-social lib/organic-social`
Expected: PASS. Some test files render `OutlineDataSection` through the composition without mocking `tile-sheets` (for example `outline-composition.test.tsx`, `locked-months-parity.test.tsx`). Those reach the real loader. It returns null before any I/O for a rolling range, and reads only a mocked `getClientBySlug` otherwise. If a file fails because the real `getClientBySlug` is reached without a mock, add `vi.mock('@/lib/organic-social/tile-sheets', () => ({ loadTileSheets: vi.fn(async () => null) }))` to that file, and record each such file in the ledger as a ruling.

- [ ] **Step 5: Commit**

```bash
git add components/report-sections/organic-social/parts/outline-data.tsx components/report-sections/organic-social/parts/outline-parts.test.tsx
git commit -m "feat(organic-social): the Data block shows Total Followers and Views from the sheet

Jasmine's sheet is the source of truth for followers and views (call
2026-10-02, 09:22). The sheet is read beside the Dash request, which is
unchanged; a failed read keeps Dash's numbers.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
perl -e 'alarm 60; exec @ARGV' -- git push -q
```

---

### Task 9: S8, the `chartNotes` switch and the graph notes gate

**Files:**
- Create: `lib/organic-social/chart-notes/enabled.ts`
- Create: `lib/organic-social/chart-notes/enabled.test.ts`
- Modify: `components/report-sections/organic-social/parts/chart-notes.ts:5, :59-61`
- Modify: `lib/db/schema.ts` (doc only, after the Task 2 member)
- Test: `components/report-sections/organic-social/parts/chart-notes.test.ts` (append)

**Interfaces:**
- Consumes: `hasReportingMonths(client: unknown): boolean` (`reporting-months.ts:75`).
- Produces: `notesOn(client: unknown): boolean`.

- [ ] **Step 1: Write the failing tests**

Create `lib/organic-social/chart-notes/enabled.test.ts`:

```ts
import { expect, test } from 'vitest'
import { notesOn } from './enabled'

test('on for a client on locked months, whatever chartNotes says', () => {
  expect(notesOn({ dashSocialConfig: { brandId: 1, reportingMonths: { firstMonth: '2026-08' } } })).toBe(true)
  expect(notesOn({ dashSocialConfig: { brandId: 1, reportingMonths: 'broken', chartNotes: false } })).toBe(true)
})
test('on for a live client only when chartNotes is exactly true', () => {
  expect(notesOn({ dashSocialConfig: { brandId: 1, chartNotes: true } })).toBe(true)
  for (const v of [undefined, false, 'true', 1, {}, null]) expect(notesOn({ dashSocialConfig: { brandId: 1, chartNotes: v } })).toBe(false)
})
test('off for anything without a usable config', () => {
  for (const c of [undefined, null, 'x', {}, { dashSocialConfig: null }, { dashSocialConfig: [] }]) expect(notesOn(c)).toBe(false)
})
```

Append to `parts/chart-notes.test.ts`:

```ts
test('a live client with chartNotes on (Renaissance after the switch): notes are read and shown, with no first-month limit', async () => {
  getClientBySlug.mockResolvedValue({ id: 'client-uuid', dashSocialConfig: { brandId: 1, chartNotes: true } })
  getChartNotes.mockResolvedValue([row({ day: '2026-01-14', body: 'Launch' })])
  const r = await withNotes({ ...CLIENT, from: '2026-01-01', to: '2026-01-31', items: [], series: { channels: ['Instagram'], points: [] } })
  expect(getChartNotes).toHaveBeenCalledWith('client-uuid', 'INSTAGRAM')
  expect(r.items.map((a) => [a.date, a.note?.text])).toEqual([['2026-01-14', 'Launch']])
})
test('a live client without chartNotes (Renaissance today): the notes table is never read', async () => {
  getClientBySlug.mockResolvedValue({ id: 'client-uuid', dashSocialConfig: { brandId: 1 } })
  const r = await withNotes(EDITOR)
  expect(getChartNotes).not.toHaveBeenCalled()
  expect(r).toEqual({ items: EDITOR.items })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `perl -e 'alarm 120; exec @ARGV' -- npx vitest run lib/organic-social/chart-notes/enabled.test.ts components/report-sections/organic-social/parts/chart-notes.test.ts`
Expected: `enabled.test.ts` FAILS on the unresolved import. In `chart-notes.test.ts`, the chartNotes-on test FAILS because `getChartNotes` is not called. The without-chartNotes test PASSES, since it pins today's behaviour.

- [ ] **Step 3: Implement**

Create `lib/organic-social/chart-notes/enabled.ts`:

```ts
import { hasReportingMonths } from '../reporting-months'

/** Written notes on the v2 graphs are on for a client on locked months (the October set), or for a live client whose
 *  dash_social_config.chartNotes is exactly true (Renaissance, spec 2026-10-02 section 7; Paul approved it 2026-10-02).
 *  Synchronous, no I/O. A client with a reportingMonths key follows the locked-months rules even if chartNotes is set. */
export function notesOn(client: unknown): boolean {
  if (hasReportingMonths(client)) return true
  const cfg = typeof client === 'object' && client !== null ? (client as { dashSocialConfig?: unknown }).dashSocialConfig : undefined
  return typeof cfg === 'object' && cfg !== null && !Array.isArray(cfg) && (cfg as Record<string, unknown>).chartNotes === true
}
```

In `parts/chart-notes.ts`, replace line 5 with:

```ts
import { notesOn } from '@/lib/organic-social/chart-notes/enabled'
```

and lines 59-61 with:

```ts
    // Notes are on for clients on locked months, and for a live client with chartNotes switched on (Renaissance). For
    // anyone else the graphs never read the table, whoever renders them. Not an error: nothing to log.
    if (!notesOn(client)) return { items: args.items }
```

In `lib/db/schema.ts`, after `influencerSection?: unknown` (Task 2), add:

```ts
  /** Written notes on the v2 graphs for a client without reportingMonths (spec 2026-10-02 section 7). Only exactly
   *  `true` turns them on (notesOn), so typed unknown. */
  chartNotes?: unknown
```

- [ ] **Step 4: Run the tests**

Run: `perl -e 'alarm 180; exec @ARGV' -- npx vitest run lib/organic-social/chart-notes components/report-sections/organic-social/parts/chart-notes.test.ts components/report-sections/organic-social/parts/annotations-wiring.test.tsx components/report-sections/organic-social/parts/follower-graph.golden.test.tsx components/report-sections/organic-social/parts/engagement-trend.golden.test.tsx && perl -e 'alarm 300; exec @ARGV' -- npm run typecheck`
Expected: PASS, and typecheck exit 0.

- [ ] **Step 5: Commit**

```bash
git add lib/organic-social/chart-notes/enabled.ts lib/organic-social/chart-notes/enabled.test.ts components/report-sections/organic-social/parts/chart-notes.ts components/report-sections/organic-social/parts/chart-notes.test.ts lib/db/schema.ts
git commit -m "feat(organic-social): chartNotes switch turns written notes on for a live client

Renaissance gets notes exactly like the new clients (call 2026-10-02,
21:31; Paul approved). Off unless chartNotes is exactly true, so nothing
changes for Renaissance until its config is written.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
perl -e 'alarm 60; exec @ARGV' -- git push -q
```

---

### Task 10: S8, the note actions follow the switch

**Files:**
- Modify: `app/actions/chart-notes.ts:9, :21-23, :48-55, :86, :106, :131`
- Test: `app/actions/chart-notes.test.ts` (append)

**Interfaces:**
- Consumes: `notesOn` (Task 9).
- Produces: none new.

- [ ] **Step 1: Write the failing tests**

Append to `app/actions/chart-notes.test.ts`:

```ts
const LIVE = { id: 'client-uuid', dashSocialConfig: { brandId: 1, chartNotes: true } }
const NOT_ON = { ok: false, error: 'Notes are not on for this client.' }

test('a live client with chartNotes on: every action works, and any past day can take a note (no first month)', async () => {
  as('INTERNAL_ADMIN', 'approver@avenuez.com')
  vi.mocked(getClientBySlug).mockResolvedValue(LIVE as never)
  vi.mocked(m.findChartNote).mockResolvedValue({ ...ROW, id: ID } as never)
  expect(await saveChartNoteAction({ ...INPUT, day: '2026-01-05' })).toEqual({ ok: true })
  expect(m.insertDraft).toHaveBeenCalledWith(expect.objectContaining({ day: '2026-01-05', clientId: 'client-uuid' }))
  expect(await approveChartNoteAction('a-client', ID, SEEN)).toEqual({ ok: true })
  expect(await revokeChartNoteAction('a-client', ID)).toEqual({ ok: true })
  expect(await deleteChartNoteDraftAction('a-client', ID)).toEqual({ ok: true })
})

test('a live client: a future day is still refused, before any write', async () => {
  as('INTERNAL_ADMIN', 'approver@avenuez.com')
  vi.mocked(getClientBySlug).mockResolvedValue(LIVE as never)
  const r = await saveChartNoteAction({ ...INPUT, day: '2026-09-25' })
  expect(r.ok).toBe(false)
  for (const w of writes()) expect(w).not.toHaveBeenCalled()
})

test('chartNotes other than exactly true is refused by every action', async () => {
  as('INTERNAL_ADMIN', 'approver@avenuez.com')
  vi.mocked(getClientBySlug).mockResolvedValue({ id: 'client-uuid', dashSocialConfig: { brandId: 1, chartNotes: 'yes' } } as never)
  expect(await saveChartNoteAction(INPUT)).toEqual(NOT_ON)
  expect(await approveChartNoteAction('a-client', ID, SEEN)).toEqual(NOT_ON)
  expect(await revokeChartNoteAction('a-client', ID)).toEqual(NOT_ON)
  expect(await deleteChartNoteDraftAction('a-client', ID)).toEqual(NOT_ON)
})

test('locked-months rules win: a malformed reportingMonths with chartNotes true still refuses a save', async () => {
  as('INTERNAL_ADMIN', 'approver@avenuez.com')
  vi.mocked(getClientBySlug).mockResolvedValue({ id: 'client-uuid', dashSocialConfig: { brandId: 1, reportingMonths: 'broken', chartNotes: true } } as never)
  expect(await saveChartNoteAction(INPUT)).toEqual(NOT_ON)
  expect(m.insertDraft).not.toHaveBeenCalled()
})
```

The approve test relies on `approveNote` mocked to `true`, `revoke` on `findOpenDraft` returning undefined and `revokeNote` true (the file's `vi.mock`, lines 8-18), and `delete` on `ROW` (line 33) being a draft with no `deletedAt`, which `canDeleteDraft` accepts (`lib/commentary/mutations.ts:56-62`).

- [ ] **Step 2: Run them and watch them fail**

Run: `perl -e 'alarm 120; exec @ARGV' -- npx vitest run app/actions/chart-notes.test.ts`
Expected: the live-client test FAILS, because save returns `NOT_ON`. The future-day, chartNotes-yes and malformed tests PASS today, since they pin refusals that must survive. Every existing test PASSES.

- [ ] **Step 3: Implement**

In `app/actions/chart-notes.ts`:

1. Line 9 becomes:
```ts
import { firstOf, hasReportingMonths, parseReportingMonths } from '@/lib/organic-social/reporting-months'
import { notesOn } from '@/lib/organic-social/chart-notes/enabled'
```
2. Lines 21-23 become:
```ts
// Notes are on for clients on locked months (the October set) and for a live client with chartNotes switched on
// (Renaissance, spec 2026-10-02 section 7). For anyone else no action here can ever write a row, whoever calls it.
const NOT_ON: Result = { ok: false, error: 'Notes are not on for this client.' }
```
3. Lines 50-55 become:
```ts
  if (!notesOn(client)) return NOT_ON
  // On locked months, a day before the client's first reporting month is in no month the team can open, so a note there
  // would be an orphan draft no view reaches (Paul's review of #292). A firstMonth too broken to read means no months at
  // all. A live client (chartNotes) has no first month: any day up to today is fine, and validateNoteInput refuses the
  // future.
  if (hasReportingMonths(client)) {
    const months = parseReportingMonths(client.dashSocialConfig?.reportingMonths)
    if (!months.ok) return NOT_ON
    if (input.day < firstOf(months.cfg.firstMonth)) return { ok: false, error: "That day is before this client's first reporting month." }
  }
```
4. Lines 86, 106 and 131: `if (!hasReportingMonths(client)) return NOT_ON` becomes `if (!notesOn(client)) return NOT_ON`.

- [ ] **Step 4: Run the tests**

Run: `perl -e 'alarm 120; exec @ARGV' -- npx vitest run app/actions/chart-notes.test.ts && perl -e 'alarm 300; exec @ARGV' -- npm run typecheck`
Expected: PASS (every existing test, including `'a client not on locked months, shaped like Renaissance, is refused by every action'` and `'save: a day before the client\'s first reporting month is refused'`), and typecheck exit 0.

- [ ] **Step 5: Commit**

```bash
git add app/actions/chart-notes.ts app/actions/chart-notes.test.ts
git commit -m "feat(organic-social): note actions follow the chartNotes switch

A live client with chartNotes true can save, approve, revoke and delete
notes; it has no first month, and the future is still refused. A client
with reportingMonths keeps the locked-months rules even with chartNotes.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
perl -e 'alarm 60; exec @ARGV' -- git push -q
```

---

### Task 11: S9, the live YTD months

**Files:**
- Modify: `lib/organic-social/ytd.ts:13` (widen `YtdMonth.compareRange`), add `ytdLiveMonths`
- Test: `lib/organic-social/ytd.test.ts` (append)

**Interfaces:**
- Consumes: `Clock` (`reporting-months.ts:8`), `clockFor` in tests (`reporting-months.ts:82`).
- Produces:
  - `type YtdMonth = { key: string; dateRange: string; compareRange: string | null; partial: boolean }` (null only from `ytdLiveMonths`)
  - `ytdLiveMonths(clock: Pick<Clock, 'lastCompleteUtcDay' | 'liveDayInProgress'>): YtdMonth[]`

- [ ] **Step 1: Write the failing test**

Append to `lib/organic-social/ytd.test.ts` (add `ytdLiveMonths` to the import on line 2, and `import { clockFor } from './reporting-months'`):

```ts
const live = (iso: string) => ytdLiveMonths(clockFor(new Date(iso)))

test('ytdLiveMonths: January through the last complete UTC day\'s month; the last month is live and runs to that day; no comparison', () => {
  const r = live('2026-10-15T12:00:00Z')
  expect(keys(r)).toEqual(['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'])
  expect(r[8]).toEqual({ key: '2026-09', dateRange: 'custom:2026-09-01,2026-09-30', compareRange: null, partial: false })
  expect(r[9]).toEqual({ key: '2026-10', dateRange: 'custom:2026-10-01,2026-10-14', compareRange: null, partial: true })
})
test('ytdLiveMonths: on the 1st after 04:00 UTC the previous month is whole and no longer live', () => {
  const r = live('2026-11-01T12:00:00Z')
  expect(r.at(-1)).toEqual({ key: '2026-10', dateRange: 'custom:2026-10-01,2026-10-31', compareRange: null, partial: false })
})
test('ytdLiveMonths: liveDayInProgress keeps (live) on the 1st before 04:00 UTC, while that Dash window is still open', () => {
  expect(live('2026-11-01T02:00:00Z').at(-1)).toEqual({ key: '2026-10', dateRange: 'custom:2026-10-01,2026-10-31', compareRange: null, partial: true })
})
test('ytdLiveMonths: on January 1 the block shows the previous year, January to December', () => {
  const r = live('2027-01-01T12:00:00Z')
  expect(keys(r)).toHaveLength(12)
  expect(r[0].key).toBe('2026-01')
  expect(r.at(-1)).toEqual({ key: '2026-12', dateRange: 'custom:2026-12-01,2026-12-31', compareRange: null, partial: false })
  expect(keys(live('2027-01-02T12:00:00Z'))).toEqual(['2027-01'])
})
test('ytdLiveMonths: the New York evening of the last day is still that month (UTC is ahead)', () => {
  // 2026-09-30 22:00 New York = 2026-10-01 02:00 UTC: the last complete UTC day is Sep 30, still in progress.
  expect(live('2026-10-01T02:00:00Z').at(-1)).toEqual({ key: '2026-09', dateRange: 'custom:2026-09-01,2026-09-30', compareRange: null, partial: true })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `perl -e 'alarm 120; exec @ARGV' -- npx vitest run lib/organic-social/ytd.test.ts`
Expected: FAIL. `ytdLiveMonths` is not exported (`ytdLiveMonths is not a function`).

- [ ] **Step 3: Implement**

In `lib/organic-social/ytd.ts`:

1. Add the type import after line 6:
```ts
import type { Clock } from './reporting-months'
```
2. Line 13 becomes:
```ts
/** compareRange is null only for ytd-review@3's live months, which ask Dash with no comparison. */
export type YtdMonth = { key: string; dateRange: string; compareRange: string | null; partial: boolean }
```
3. After `ytdSheetMonths` (line 101), add:
```ts
/** ytd-review@3's months for a live client (spec 2026-10-02 section 8): January of the last complete UTC day's year
 *  through that day's month, whatever the date picker shows. Earlier months are whole. The last runs to that day and is
 *  partial ("(live)") unless that day ends the month and its Dash window has closed: every Dash window ends at a fixed
 *  T04:00:00Z (base.ts), so the day is still open while liveDayInProgress. So on the 1st the previous month is shown
 *  whole, and on January 1 the previous year is. No comparison: compareRange is null. */
export function ytdLiveMonths(clock: Pick<Clock, 'lastCompleteUtcDay' | 'liveDayInProgress'>): YtdMonth[] {
  const day = clock.lastCompleteUtcDay
  const key = day.slice(0, 7)
  const out: YtdMonth[] = []
  for (let k = `${key.slice(0, 4)}-01`; k < key; k = addMonths(k, 1)) {
    out.push({ key: k, dateRange: `custom:${k}-01,${lastOf(k)}`, compareRange: null, partial: false })
  }
  out.push({ key, dateRange: `custom:${key}-01,${day}`, compareRange: null, partial: day < lastOf(key) || clock.liveDayInProgress })
  return out
}
```

Here `lastOf` is `ytd.ts`'s own (line 26).

- [ ] **Step 4: Run the tests and the typecheck**

Run: `perl -e 'alarm 180; exec @ARGV' -- npx vitest run lib/organic-social/ytd.test.ts components/report-sections/organic-social/parts/ytd-review.test.tsx components/report-sections/organic-social/parts/ytd-review-sheet.test.tsx && perl -e 'alarm 300; exec @ARGV' -- npm run typecheck`
Expected: PASS, and typecheck exit 0. `getOutlineKpis` already takes `compareRange: string | null` (`outline-headlines.ts:63`), so v1 and v2 compile unchanged.

- [ ] **Step 5: Commit**

```bash
git add lib/organic-social/ytd.ts lib/organic-social/ytd.test.ts
git commit -m "feat(organic-social): live YTD months, January to the last complete UTC day

For Renaissance's YTD (Paul approved 2026-10-02): whatever the picker
shows; the last month stays live while its Dash window is open; on the 1st
the previous month is whole and on January 1 the previous year is shown.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
perl -e 'alarm 60; exec @ARGV' -- git push -q
```

---

### Task 12: S9, `ytd-review@3` (live mode) and Renaissance's composition

**Files:**
- Modify: `components/report-sections/organic-social/parts/ytd-review-sheet.tsx:53-66` (extract `ytdReviewBlock`)
- Create: `components/report-sections/organic-social/parts/ytd-review-live.tsx`
- Create: `components/report-sections/organic-social/parts/ytd-review-live.test.tsx`
- Modify: `components/report-sections/organic-social/parts/registry.ts:7, :25`
- Test: `components/report-sections/organic-social/parts/outline-composition.test.tsx` (append)

**Interfaces:**
- Consumes: `ytdLiveMonths` (Task 11); `ytdSheetSeries` with the S7 rule (Task 5); `monthsNeedingDash` (`ytd.ts:104`); `hasReportingMonths`; `requestClock`; `getOutlineKpis`; `readYtdTab`, `parseYtdGrid`, `ytdSheetFor`; `mapWithConcurrency` (`lib/concurrency.ts`).
- Produces:
  - `ytdReviewBlock(followers: YtdGraph, views: YtdGraph): JSX.Element`, exported from `ytd-review-sheet.tsx`
  - `YtdLiveReviewSection({ ctx }: { ctx: OrganicSocialCtx })` and `ytdReviewV3: PartImpl<OrganicSocialCtx>` (id `ytd-review`, version 3, `published: false`)

- [ ] **Step 1: Write the failing tests**

Append to `parts/outline-composition.test.tsx` (add `ORGANIC_SOCIAL_TEMPLATE` to the `../template` import):

```tsx
// Renaissance's override after the staging write (spec section 8): exactly this JSON goes into
// report_section_config['organic-social:platform']. Its 'organic-social' entry (Commentary) is left alone.
const RENAISSANCE_PLATFORM: SectionOverride = {
  versions: { 'follower-graph': 2, 'engagement-trend': 2 },
  extraParts: [{ id: 'ytd-review', version: 3 }],
  order: ['ytd-review', 'platform-headlines', 'follower-graph', 'engagement-trend', 'top-content'],
}

test("Renaissance's new platform override resolves to exactly the approved parts and passes the app's validator", () => {
  expect(pins(RENAISSANCE_PLATFORM)).toEqual(['ytd-review@3', 'platform-headlines@1', 'follower-graph@2', 'engagement-trend@2', 'top-content@2'])
  expect(() => validateSectionOverride(KEY, RENAISSANCE_PLATFORM, REGISTRIES, ORGANIC_SOCIAL_PLATFORM_TEMPLATE.order.map((p) => p.id))).not.toThrow()
})

test("Renaissance's Overview resolves exactly as today whatever its platform override says", () => {
  const ov = (o?: SectionOverride) => resolveSection(ORGANIC_SOCIAL_TEMPLATE, o).map((p) => `${p.id}@${p.version}`)
  const renaissance = { 'organic-social': { sharedParts: [{ id: 'commentary', version: 1 }] }, 'organic-social:platform': RENAISSANCE_PLATFORM } as Record<string, SectionOverride>
  expect(ov(renaissance['organic-social'])).toEqual(ov(undefined))
})
```

Create `parts/ytd-review-live.test.tsx`:

```tsx
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'

const { getOutlineKpis, getClientBySlug, readYtdTab } = vi.hoisted(() => ({ getOutlineKpis: vi.fn(), getClientBySlug: vi.fn(), readYtdTab: vi.fn() }))
vi.mock('@/lib/organic-social/outline-headlines', async () => ({
  ...(await vi.importActual<typeof import('@/lib/organic-social/outline-headlines')>('@/lib/organic-social/outline-headlines')),
  getOutlineKpis,
}))
vi.mock('@/lib/db/queries', () => ({ getClientBySlug }))
vi.mock('@/lib/organic-social/ytd-sheet', async () => ({
  ...(await vi.importActual<typeof import('@/lib/organic-social/ytd-sheet')>('@/lib/organic-social/ytd-sheet')),
  readYtdTab,
}))

import { YtdLiveReviewSection, ytdReviewV3 } from './ytd-review-live'
import { ytdReviewV1 } from './ytd-review'
import { ytdReviewV2 } from './ytd-review-sheet'
import { ORGANIC_SOCIAL_PARTS } from './registry'
import { YtdSheetReadError } from '@/lib/organic-social/ytd-sheet'
import { FIXTURE_ORGANIC_SOCIAL_CTX } from './__fixtures__/organic-social-ctx'

// Made-up sheet id and numbers only. A Renaissance-shaped client: no reportingMonths, no channel allowlist.
const ID = 'TESTSHEETID_abcdefghij0123'
const CTX = { ...FIXTURE_ORGANIC_SOCIAL_CTX, clientSlug: 'live-co', channel: 'INSTAGRAM' as const, dateRange: 'last_30_days', compareRange: 'previous_period' }
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const sheet = (f: (i: number) => string, v: (i: number) => string) => [
  ['CLIENT: Live Co'], ['FOLLOWER GROWTH'], ['', 'Instagram'], ...MONTHS.map((m, i) => [m, f(i)]),
  [], ['VIEWS'], ['', 'Instagram'], ...MONTHS.map((m, i) => [m, v(i)]),
]
const kpis = (followers: number, views: number, noData = false) => ({ noData, kpis: { followers: { key: 'followers', label: 'Total Followers', format: 'number', value: followers }, exposure: { key: 'exposure', label: 'Views', format: 'number', value: views } } }) as never
const client = (dsc: Record<string, unknown> = {}) => ({ id: 'c1', dashSocialConfig: { brandId: 1, ...dsc } })
const ENTRY = { ytdSheets: { 2026: { sheetId: ID, tab: 'Live Co' } } }

type Chart = { name: string; data: Record<string, unknown>[]; yKeys: { key: string }[] }
function charts(node: unknown, found: Chart[] = []): Chart[] {
  const el = node as ReactElement<Record<string, unknown>> | null
  if (!el || typeof el !== 'object') return found
  const type = (el as { type?: { name?: string } }).type
  if (typeof type === 'function' && (type.name === 'LineChart' || type.name === 'BarChart')) found.push({ name: type.name, ...(el.props as unknown as Omit<Chart, 'name'>) })
  const kids = (el.props as { children?: unknown } | undefined)?.children
  for (const k of Array.isArray(kids) ? kids : [kids]) charts(k, found)
  return found
}
const logs = () => [...vi.mocked(console.warn).mock.calls, ...vi.mocked(console.error).mock.calls].map((c) => c.join(' '))

beforeEach(() => {
  vi.restoreAllMocks()
  getOutlineKpis.mockReset(); getClientBySlug.mockReset(); readYtdTab.mockReset()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-15T12:00:00Z'))
  getClientBySlug.mockResolvedValue(client(ENTRY))
  vi.spyOn(console, 'warn').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.useRealTimers())

test('ytd-review@3 is registered unpublished; 1 and 2 are the same objects as before', () => {
  expect(ORGANIC_SOCIAL_PARTS['ytd-review'][3]).toBe(ytdReviewV3)
  expect(ytdReviewV3.published).toBe(false)
  expect(ORGANIC_SOCIAL_PARTS['ytd-review'][1]).toBe(ytdReviewV1)
  expect(ORGANIC_SOCIAL_PARTS['ytd-review'][2]).toBe(ytdReviewV2)
})

test('picker range is ignored: January to October (live); the sheet wins; blank months come from live Dash with no comparison', async () => {
  readYtdTab.mockResolvedValue(sheet((i) => (i < 8 ? String(100 + i) : ''), (i) => (i < 8 ? String(10 + i) : '')))
  getOutlineKpis.mockImplementation(async (_s: string, range: string) => (range.startsWith('custom:2026-09') ? kpis(900, 90) : kpis(1000, 100)))
  const el = await YtdLiveReviewSection({ ctx: CTX })
  expect(readYtdTab).toHaveBeenCalledWith(ID, 'Live Co')
  expect(getOutlineKpis.mock.calls).toEqual([
    ['live-co', 'custom:2026-09-01,2026-09-30', null, 'INSTAGRAM'],
    ['live-co', 'custom:2026-10-01,2026-10-14', null, 'INSTAGRAM'],
  ])
  const c = charts(el)
  expect(c[0].data.map((d) => d.month)).toEqual(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct (live)'])
  expect(c[0].data.slice(-2)).toEqual([{ month: 'Sep', followers: 900 }, { month: 'Oct (live)', followers: 1000 }])
  expect(c[1].data[0]).toEqual({ month: 'Jan', views: 10 })
  const { container } = render(<>{el}</>)
  expect(container.textContent).toContain('YTD Review')
})

test('no sheet for the year: every month from live Dash, and no column warnings', async () => {
  getClientBySlug.mockResolvedValue(client())
  getOutlineKpis.mockResolvedValue(kpis(5, 6))
  const el = await YtdLiveReviewSection({ ctx: CTX })
  expect(readYtdTab).not.toHaveBeenCalled()
  expect(getOutlineKpis).toHaveBeenCalledTimes(10)
  expect(charts(el)[0].data).toHaveLength(10)
  expect(logs()).toEqual([])
})

test('an invalid entry: one warning, then every month from live Dash', async () => {
  getClientBySlug.mockResolvedValue(client({ ytdSheets: { 2026: { sheetId: 'bad', tab: 'x' } } }))
  getOutlineKpis.mockResolvedValue(kpis(5, 6))
  await YtdLiveReviewSection({ ctx: CTX })
  expect(getOutlineKpis).toHaveBeenCalledTimes(10)
  expect(logs()).toEqual(['[organic-social] ytd sheet config invalid slug=live-co year=2026; using live Dash'])
})

test('a sheet read failure or a layout error is the error card, logged without the sheet id or tab', async () => {
  readYtdTab.mockRejectedValueOnce(new YtdSheetReadError('429'))
  let r = render(<>{await YtdLiveReviewSection({ ctx: CTX })}</>)
  expect(r.container.textContent).toContain("Couldn't load this section.")
  r.unmount()
  readYtdTab.mockResolvedValueOnce(sheet((i) => String(i), (i) => String(i)).map((row) => (row[0] === 'September' ? ['Sept', '1'] : row)))
  r = render(<>{await YtdLiveReviewSection({ ctx: CTX })}</>)
  expect(r.container.textContent).toContain("Couldn't load this section.")
  expect(logs()).toEqual([
    '[organic-social] ytd sheet read failed slug=live-co status=429',
    '[organic-social] ytd sheet layout not found slug=live-co missing=followers september',
  ])
  expect(getOutlineKpis).not.toHaveBeenCalled()
})

test('a Dash failure for a needed month is the fallback card', async () => {
  readYtdTab.mockResolvedValue(sheet((i) => (i < 8 ? '1' : ''), (i) => (i < 8 ? '1' : '')))
  getOutlineKpis.mockRejectedValue(new Error('dash down'))
  const r = render(<>{await YtdLiveReviewSection({ ctx: CTX })}</>)
  expect(r.container.textContent).toContain("Couldn't load this section.")
})

test('the X tab and Overview render nothing and read nothing', async () => {
  expect(await YtdLiveReviewSection({ ctx: { ...CTX, channel: 'TWITTER' as const } })).toBeNull()
  expect(await YtdLiveReviewSection({ ctx: { ...CTX, channel: null } })).toBeNull()
  expect(getClientBySlug).not.toHaveBeenCalled()
  expect(readYtdTab).not.toHaveBeenCalled()
})

test('a client on locked months renders nothing, logs one line, and asks Dash nothing', async () => {
  getClientBySlug.mockResolvedValue(client({ reportingMonths: { firstMonth: '2026-08' }, ...ENTRY }))
  expect(await YtdLiveReviewSection({ ctx: CTX })).toBeNull()
  expect(getOutlineKpis).not.toHaveBeenCalled()
  expect(readYtdTab).not.toHaveBeenCalled()
  expect(logs()).toEqual(['[organic-social] ytd-review@3 skipped (client has reportingMonths) slug=live-co'])
})

test('leading N/A months are not listed; a later gap is (S7)', async () => {
  readYtdTab.mockResolvedValue(sheet((i) => (i < 2 ? 'N/A' : i === 4 ? 'N/A' : i < 8 ? String(i) : ''), (i) => (i < 8 ? String(i) : '')))
  getOutlineKpis.mockResolvedValue(kpis(9, 9))
  const { container } = render(<>{await YtdLiveReviewSection({ ctx: CTX })}</>)
  expect(container.textContent).toContain('No follower data for May')
  expect(container.textContent).not.toContain('Jan')
})

test('on January 1 the block shows last year from last year\'s entry', async () => {
  vi.setSystemTime(new Date('2027-01-01T12:00:00Z'))
  readYtdTab.mockResolvedValue(sheet((i) => String(i + 1), (i) => String(i + 1)))
  const el = await YtdLiveReviewSection({ ctx: CTX })
  expect(readYtdTab).toHaveBeenCalledWith(ID, 'Live Co')
  expect(getOutlineKpis).not.toHaveBeenCalled()
  expect(charts(el)[0].data.map((d) => d.month)).toEqual(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'])
})

test('at most 3 Dash requests in flight', async () => {
  getClientBySlug.mockResolvedValue(client())
  let inFlight = 0, peak = 0
  getOutlineKpis.mockImplementation(async () => { inFlight++; peak = Math.max(peak, inFlight); await Promise.resolve(); await Promise.resolve(); inFlight--; return kpis(1, 1) })
  await YtdLiveReviewSection({ ctx: CTX })
  expect(peak).toBeLessThanOrEqual(3)
})
```

The concurrency test yields with microtasks instead of `setTimeout`, because fake timers are on for `Date` only (`toFake: ['Date']`), which leaves real timers working. If a microtask yield turns out too short to overlap calls, use `await new Promise((r) => setTimeout(r, 5))` as `ytd-review-sheet.test.tsx:130` does, and record that as a ruling.

- [ ] **Step 2: Run them and watch them fail**

Run: `perl -e 'alarm 180; exec @ARGV' -- npx vitest run components/report-sections/organic-social/parts/ytd-review-live.test.tsx components/report-sections/organic-social/parts/outline-composition.test.tsx`
Expected: FAIL. `ytd-review-live` doesn't resolve, and the composition test throws in `validateSectionOverride` because `ytd-review@3` is unknown (the Overview test passes).

- [ ] **Step 3: Implement**

In `parts/ytd-review-sheet.tsx`, replace lines 56-65 (from the `NoData` return to the end of the JSX) with:

```tsx
  if (s.followers.points.length === 0 && s.views.points.length === 0) return <NoData />
  return ytdReviewBlock(s.followers, s.views)
}

/** The YTD Review block from its two graphs. Shared by version 2 and version 3 (live), so both draw the same markup. */
export function ytdReviewBlock(followers: YtdGraph, views: YtdGraph) {
  return (
    <section className="space-y-4">
      <h2 className="text-sm font-extrabold uppercase tracking-widest text-text-muted">YTD Review</h2>
      <div className="grid gap-5 lg:grid-cols-2">
        {graph('Follower Growth, Year to Date', 'followers', 'Total Followers', 'follower', followers)}
        {graph('Views, Year to Date', 'views', 'Views', 'views', views)}
      </div>
    </section>
  )
}
```

Create `parts/ytd-review-live.tsx`:

```tsx
import { Suspense } from 'react'
import type { PartImpl } from '@/lib/report-sections/types'
import { getClientBySlug } from '@/lib/db/queries'
import { getOutlineKpis } from '@/lib/organic-social/outline-headlines'
import { OUTLINE_DATA_ROWS } from '@/lib/organic-social/outline-layout'
import { requestClock } from '@/lib/organic-social/locked-range'
import { hasReportingMonths } from '@/lib/organic-social/reporting-months'
import { monthsNeedingDash, ytdLiveMonths, ytdSheetSeries } from '@/lib/organic-social/ytd'
import { parseYtdGrid, readYtdTab, ytdSheetFor, YtdSheetLayoutError, YtdSheetReadError, type YtdTab } from '@/lib/organic-social/ytd-sheet'
import { mapWithConcurrency } from '@/lib/concurrency'
import { TrendSkeleton } from '../skeletons'
import { NoData } from '../no-data'
import type { OrganicSocialCtx } from '../ctx'
import { safe, Fallback } from './shared'
import { ytdReviewBlock } from './ytd-review-sheet'

const NO_SHEET: YtdTab = { followers: {}, views: {} }

/** YTD Review for a live client (spec docs/superpowers/specs/2026-10-02-os-jasmine-call-changes-design.md section 8,
 *  S9; Paul approved 2026-10-02). January through the current month whatever the date picker shows; the sheet's number
 *  wins, and any month it has not filled comes from live Dash with no comparison (a live client has no first month).
 *  Only for clients without reportingMonths: a locked-months client renders nothing, so this can never create new lock
 *  rows or requests for one. Log lines carry the slug, never the sheet id, the tab or a value. */
export async function YtdLiveReviewSection({ ctx }: { ctx: OrganicSocialCtx }) {
  const { clientSlug, channel } = ctx
  if (!channel || !OUTLINE_DATA_ROWS.standard[channel]) return null
  let client: Awaited<ReturnType<typeof getClientBySlug>>
  try { client = await getClientBySlug(clientSlug) } catch { return <Fallback kind="error" /> }
  if (hasReportingMonths(client)) {
    console.warn(`[organic-social] ytd-review@3 skipped (client has reportingMonths) slug=${clientSlug}`)
    return null
  }
  const months = ytdLiveMonths(requestClock())
  const year = months[0].key.slice(0, 4)
  const floor = `${year}-01`
  const sheet = ytdSheetFor((client?.dashSocialConfig as { ytdSheets?: unknown } | null | undefined)?.ytdSheets, year)
  let tab = NO_SHEET
  if (sheet.kind === 'invalid') console.warn(`[organic-social] ytd sheet config invalid slug=${clientSlug} year=${year}; using live Dash`)
  if (sheet.kind === 'ok') {
    try {
      tab = parseYtdGrid(await readYtdTab(sheet.entry.sheetId, sheet.entry.tab))
    } catch (e) {
      if (e instanceof YtdSheetLayoutError) console.error(`[organic-social] ytd sheet layout not found slug=${clientSlug} missing=${e.missing}`)
      else console.error(`[organic-social] ytd sheet read failed slug=${clientSlug} status=${e instanceof YtdSheetReadError ? e.status : 'error'}`)
      return <Fallback kind="error" />
    }
  }
  const need = monthsNeedingDash(months, tab, channel, floor)
  const r = await safe(mapWithConcurrency(need, 3, (m) => getOutlineKpis(clientSlug, m.dateRange, m.compareRange, channel))
    .then((all) => ytdSheetSeries(months, tab, channel, floor, Object.fromEntries(need.map((m, i) => [m.key, all[i]])))))
  if (!r.data) return <Fallback kind={r.error!} />
  const s = r.data
  if (sheet.kind === 'ok') for (const g of s.missingColumn) console.warn(`[organic-social] ytd sheet column missing slug=${clientSlug} channel=${channel} graph=${g}`)
  for (const x of s.invalid) console.warn(`[organic-social] ytd sheet cell invalid slug=${clientSlug} channel=${channel} month=${x.month} graph=${x.graph}`)
  if (s.followers.points.length === 0 && s.views.points.length === 0) return <NoData />
  return ytdReviewBlock(s.followers, s.views)
}

export const ytdReviewV3: PartImpl<OrganicSocialCtx> = {
  id: 'ytd-review',
  version: 3,
  published: false,
  defaultLabel: 'YTD Review',
  render: (ctx) => (
    <Suspense fallback={<TrendSkeleton />}>
      <YtdLiveReviewSection ctx={ctx} />
    </Suspense>
  ),
}
```

In `parts/registry.ts`, add the import after line 7:

```ts
import { ytdReviewV3 } from './ytd-review-live'
```

and change line 25 to:

```ts
  'ytd-review': { 1: ytdReviewV1, 2: ytdReviewV2, 3: ytdReviewV3 },
```

- [ ] **Step 4: Run the tests**

Run: `perl -e 'alarm 300; exec @ARGV' -- npx vitest run components/report-sections/organic-social lib/report-sections lib/organic-social`
Expected: PASS, including `ytd-review-sheet.test.tsx`, which exercises the extracted `ytdReviewBlock`, and every golden test.

- [ ] **Step 5: Commit, with the edge-case list in the body**

```bash
git add components/report-sections/organic-social/parts/ytd-review-sheet.tsx components/report-sections/organic-social/parts/ytd-review-live.tsx components/report-sections/organic-social/parts/ytd-review-live.test.tsx components/report-sections/organic-social/parts/registry.ts components/report-sections/organic-social/parts/outline-composition.test.tsx
git commit -m "feat(organic-social): ytd-review@3, YTD for a live client (Renaissance)

January to now whatever the picker shows, sheet first, live Dash for any
month the sheet has not filled, X tab none. Unpublished and refused for a
client with reportingMonths, so no outline client's requests or locks can
change. Renaissance gets it only when its config is written.

Edge cases in the code this touches and the code it calls:
- External failure: sheet read or layout error is the error card (logged);
  a Dash failure for any needed month is the fallback card. fix (tested)
- Operator visibility: invalid config, skipped client, read and layout
  failures, missing column and invalid cell each log the slug. fix
- Bounds: at most 12 months, 3 Dash requests in flight, each cached an
  hour (getOutlineKpis). decline: bounded
- All or nothing across up to 12 requests: already a CLAUDE.md follow-up
  for @2; same here. file (existing entry)
- Input boundaries: sheet entry, layout and cells validated by the
  existing reader and parser. decline
- Security: no sheet id, tab or value in any log line. fix (tested)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
perl -e 'alarm 60; exec @ARGV' -- git push -q
```

---

### Task 13: Whole-branch verification, follow-ups, PR

**Files:**
- Modify: `CLAUDE.md` (append one section)

- [ ] **Step 1: Prove the guards were not edited**

```bash
git diff --stat origin/dev -- lib/organic-social/lock-key-pin.test.ts components/report-sections/organic-social/v1-render.golden.test.tsx components/report-sections/organic-social/parts/composition.golden.test.tsx components/report-sections/organic-social/parts/top-content-v2.golden.test.tsx components/report-sections/organic-social/parts/top-content.golden.test.tsx components/report-sections/organic-social/parts/platform-headlines.golden.test.tsx components/report-sections/organic-social/parts/follower-graph.golden.test.tsx components/report-sections/organic-social/parts/engagement-trend.golden.test.tsx lib/organic-social/headline-build.test.ts lib/organic-social/metrics.test.ts lib/organic-social/outline-fixes-parity.test.ts lib/organic-social/__snapshots__ components/report-sections/organic-social/parts/__snapshots__ lib/organic-social/metrics.ts lib/organic-social/headline-build.ts lib/organic-social/base.ts lib/organic-social/locking-client.ts lib/organic-social/lock-day.ts components/report-sections/organic-social/template.ts
```
Expected: empty output.

- [ ] **Step 2: Append the follow-ups to CLAUDE.md**

Append at the end of `CLAUDE.md`:

```markdown
## Known Follow-ups: Organic Social (from the 2026-10-02 walkthrough changes)

- [ ] **A hidden influencer section is a one-way door for staff.** With `influencerSection.<CHANNEL>.hidden` (Piper's
  Instagram), a staff member who marks an owned post as Influencer moves it into a section nobody can see, and no page
  can undo it. The way back is deleting that post's row from the designations table, on my go. Accepted because Jasmine
  asked for the section to go (call 2026-10-02, 20:13). A staff-only greyed row would close it.
- [ ] **Renaissance's YTD points will not match its tiles.** `ytd-review@3` plots whole months (the sheet, or Dash for
  that month), while Renaissance's v1 tiles follow the rolling picker window. Accepted (spec 2026-10-02 section 8).
- [ ] **The sheet's Total Followers change will not equal Dash's Net New Followers.** On an outline client's finished
  month, Total Followers and Views follow the sheet and every other tile stays Dash. Accepted (spec section 5).
- [ ] **`ytd-review@3`'s "(live)" month can be up to an hour old, and its past months re-read Dash hourly.** The live
  range ends at the last complete UTC day, while the Dash window ends at a fixed `T04:00:00Z` (`base.ts`), so "(live)"
  stays on until 04:00 UTC on the 1st. Renaissance is not locked, so a past month taken from Dash can move if Dash
  revises it. Accepted for a live client.
```

- [ ] **Step 3: Run the CI gate exactly as CI does**

```bash
DATABASE_URL=postgresql://ci:ci@db.invalid/ci perl -e 'alarm 590; exec @ARGV' -- make check > /private/tmp/claude-501/make-check.txt 2>&1; echo "exit $?"; tail -25 /private/tmp/claude-501/make-check.txt
```
Expected: exit 0. The tail shows the vitest totals (more tests than the Task 0 baseline, and no new failures), `check:rsc` clean, and `next build` complete. If exit is 142, it timed out: rerun each target separately (`npm run typecheck`, `npx vitest run`, `npm run check:rsc`, `npm run build`), each bounded, and never read the timeout as a pass.

- [ ] **Step 4: Check copy and secrets in the diff**

```bash
git diff origin/dev -- . ':!docs' | perl -CSD -ne 'print if /^\+.*[\x{2013}\x{2014}]/' | wc -l   # dashes added by this branch
git diff origin/dev | grep -nE '1[A-Za-z0-9_-]{40,}|brandId: [0-9]{4,}|@[a-z-]+\.test' ; echo "secrets: $?"
```
Expected: the dash count is `0`, and the secrets line prints `secrets: 1` (no match). Anything else is fixed before going on.

- [ ] **Step 5: Commit the follow-ups and push**

```bash
git add CLAUDE.md
git commit -m "docs(claude-md): follow-ups from the 2026-10-02 walkthrough changes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
perl -e 'alarm 60; exec @ARGV' -- git push -q
```

- [ ] **Step 5b: Local look on our own app (dev database) before anyone reviews**

Standing rule: every feature runs on our local app against the dev database, and I see it there before staging.
1. Run a read-only, dev-guarded probe (host `still-tree`, pattern `~/.claude/organic-social-work/probes/dev-*.mts`) and print three things. Which migrations are applied. Whether `notes-test` (a copy of staging's akara-living setup) still exists. Renaissance's dev row md5, which is never touched.
2. Write a dev-only guarded script, dry run first, and apply it on my written go. It sets `notes-test`'s `influencerSection` to `{ "INSTAGRAM": { "label": "Partnership Posts" } }` and gives it a `ytdSheets["2026"]` entry pointing at the Kenect tab. It also creates one throwaway live client, `live-test`: a copy of Renaissance's `dash_social_config` (its brand, no channel allowlist, no `reportingMonths`), plus `chartNotes: true`, plus the Task 12 `organic-social:platform` override. Renaissance's own dev row stays byte for byte, checked by md5 before and after.
3. Start the app with the Browser pane's `preview_start` and the `reporting-dev` config, open `/login`, and let me sign in myself.
4. Walk spec section 11 on `notes-test` and `live-test` as far as dev data allows, and read values from page text: no footnote; "Partnership Posts"; tiles from the sheet on a finished month; YTD with the leading months hidden; `live-test` YTD January to now (live) on Last 30 days; a note added, approved and visible.
5. Note anything I want changed. It goes back into this branch before Step 6.
6. Remove `live-test` afterwards, on my go.

- [ ] **Step 6: Fresh whole-branch review before anyone else sees it**

Per superpowers:executing-plans "Final Review": one fresh reviewer on the most capable model, given the review package, this plan, the spec, its review log and the Review Focus section above. Critical and Important findings each get a RED to GREEN fix in one pass. Minors go to the ledger and the PR body.

- [ ] **Step 7: Open the PR as a draft into dev**

```bash
gh pr create --repo Avenue-Z/avenue-z-reporting-v2 --base dev --head feat/os-jasmine-call-changes --draft \
  --title "Organic Social: Jasmine's 2026-10-02 changes, plus Renaissance annotations and YTD (code only) → dev" \
  --body-file /private/tmp/claude-501/pr-body.md
```

Write `/private/tmp/claude-501/pr-body.md` first, in first person, with no em dashes, no figures, no ids and no sheet names. It contains:
1. **What and why:** one paragraph per scorecard row S1 to S9, citing the call timestamps and Paul's Slack approval.
2. **What changes on deploy:** for the outline clients, the Facebook footnote goes away, and finished months' Total Followers and Views follow the sheet. For Renaissance, nothing: every Renaissance change waits for the guarded data write after merge.
3. **Renaissance proof:** the unedited guard list from Step 1, and the requests Renaissance will add once its config is written (review minor 10):
   - follower graph: `GRAPH` `NET_NEW_FOLLOWERS` on UTC days, per platform tab (`getFollowerGraph(..., 'netNewFollowers', 'utc')`, `parts/follower-graph.tsx:59`)
   - engagement graph on UTC days (`parts/engagement-trend.tsx`)
   - one shared content read per tab for the graph posts (`graphPosts`)
   - up to 12 `TOTAL_GROUPED_METRIC` requests per Instagram, Facebook or LinkedIn tab for YTD (`getOutlineKpis`), only for months the sheet has not filled, three at a time, each cached an hour
   - the notes and hides tables
4. **Tests:** the raw tail of `make check` from Step 3.
5. **Edge cases:** copied from the Task 7 and Task 12 commit bodies.
6. **Deferred minors:** from the final review.
7. The closing line `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

Then call `mcp__ccd_pr__get_status`, bind the PR with `bind_pr` if it is not reported, read its CI, and request review from Paul (`gh pr edit <n> --add-reviewer paul-rl-ave`). Do not poll CI. Do not enable auto-merge.

- [ ] **Step 8: Merge to dev after sign-off**

The merge happens only after CI is green, every comment from Paul and me is resolved on the branch, and I have given my go. I run the tested merge script myself (claude-runs-merge-scripts). `main` is never touched.

---

### Task 14: Promote to staging

Runs only after Task 13 Step 8.

- [ ] **Step 1:** Open the `dev → staging` promotion PR the same way #305 was opened, and merge it on my go.
- [ ] **Step 2:** Confirm the staging deployment finished on the new staging tip (bounded `vercel inspect staging.reporting.avenuez.com`), and record its `dpl_` id.
- [ ] **Step 3:** With a staff session on staging, before any data write, check two things. The outline clients' Facebook tabs show no footnote. A finished month whose sheet cells are filled shows the sheet's Total Followers and Views, while a blank month shows the locked number. Read values from page text, not screenshots (handoff prompt section 7). Also confirm Renaissance's platform tabs render exactly as before (the v1 graphs, no YTD block), and run the read-only staging Renaissance digest probe (`gate-staging-readonly-2.mts` pattern) against `ren-baseline-before-qa-2026-10-02.json`. Expected: Renaissance matches its baseline.

---

### Task 15: Release steps and the SOP list

No code. These are carried into the release and the SOP rewrite.

- [ ] **Release steps (spec section 10), in order:**
  0. Dates. Code went to Paul on 2026-10-02. Staging is ready for the Whitney review on Tuesday 2026-10-06. Production is ready for A Place For Mom on Wednesday 2026-10-07, if Jasmine approves on Tuesday and I give my written go.
  1. Maddie gets the heads-up **before Task 16's Renaissance write** (review minor 21), with the three changes her client will see: approved notes show at once, the follower graph switches to daily gains, and a YTD block appears. Draft (I send it):
     > Hey Maddie, heads up on Renaissance's Organic Social: Jasmine asked for the same graph annotations and YTD Review the new organic social clients have, and Paul signed off. Renaissance stays live, nothing about its numbers changes. What her client will notice: the follower graph shows followers gained per day instead of the total, a YTD Review block sits at the top of each platform tab, and any note the team approves shows up right away. I'll let you know when it's on staging so you can take a look first.
  1a. Tell Jasmine and Paul (and Kylie through Jasmine): the locked Dash answer never changes, but a month's Total Followers and Views tiles and YTD points follow the sheet, so a sheet edit changes what that month shows. Draft (I send it):
     > Quick note on locking: the numbers we pull from Dash still lock on the 5th and never change. Total Followers and Views now follow the YTD sheet for any month it has filled, so if anyone edits the sheet for a past month, the dashboard shows the new number within the hour. Everything else stays as locked.
  2. No `.test` demo users in production.
  3. Jasmine copies September from the locked dashboard once production is live. "Production" is my decision (review minor 12).
  4. Tell Jasmine when Renaissance is updated (call 25:11), and Jasmine and Maddie before Renaissance reaches production.
- [ ] **SOP rewrite list (handoff section 6; spec section 10 step 4):** S4 to S7 as built; the Renaissance behaviour (live YTD, notes on at once, approvers as for the new clients); add no 2027 `ytdSheets` entry unless I decide otherwise (minor 20); why Renaissance's Overview has no annotations (minor 22); N/A marks "no data", and a blank before `firstMonth` is never filled from Dash (minor 23); the one-way Piper trap and its database fix (minor 2); the accepted mismatches (minors 9, 26).

---

### Task 16: Staging data writes (private scripts, each with a dry run and my go)

These scripts live in `~/.claude/organic-social-work/probes/`, never in the repo: they hold the sheet id and tab names. They follow the tested pattern of `staging-ytd-switch-on-2026-10-01.ts`:
- the staging host guard (`ep-restless-union`)
- a dry run by default, with `--write` as the only way to change anything
- a refusal unless `origin/staging` contains the code
- a refusal on any unexpected existing value
- one transaction whose closing statements divide by zero (rolling everything back) unless every row holds exactly the intended values and every other client row is byte-identical

Run them from the feature worktree after it merges (so `@/` imports resolve), bounded with `perl -e 'alarm 120; exec @ARGV' -- npx tsx <script> [--write]`. Paste each dry run's output to me and wait for my go before `--write`.

- [ ] **Step 1: Piper and Akara (`staging-influencer-section-2026-10-02.mts`)**

What it writes:
- `piper-aircraft`: `dash_social_config.influencerSection = { "INSTAGRAM": { "hidden": true } }`
- `akara-living`: `dash_social_config.influencerSection = { "INSTAGRAM": { "label": "Partnership Posts" } }`

It refuses in four cases:
- either client is missing
- either client already has `influencerSection`
- `origin/staging` lacks `lib/organic-social/influencer-section.ts`
- `parseInfluencerSection` (imported from the app) does not return `kind: 'ok'` for each planned value

In-transaction checks: both rows hold exactly the planned `dash_social_config`, and every other key of each row is identical to before. The md5 of every other client's row is unchanged, Renaissance's included. Reversal: remove the key.

- [ ] **Step 2: Maddie has been told** (Task 15 release step 1). I confirm before Step 3.

- [ ] **Step 3: Renaissance (`staging-renaissance-annotations-ytd-2026-10-02.mts`)**

What it writes, in one transaction:
- `report_section_config['organic-social:platform'] = { versions: { 'follower-graph': 2, 'engagement-trend': 2 }, extraParts: [{ id: 'ytd-review', version: 3 }], order: ['ytd-review', 'platform-headlines', 'follower-graph', 'engagement-trend', 'top-content'] }`. Every other `report_section_config` key, including `organic-social` with its Commentary `sharedParts`, stays byte for byte.
- `dash_social_config.chartNotes = true`, and `dash_social_config.ytdSheets = { "2026": { sheetId: <the YTD sheet>, tab: <Renaissance's tab> } }`. `brandId` and every other key stay byte for byte.

Before writing it does six things:
1. Reads the sheet id from the existing private script's constant, never retyped.
2. Takes the tab name from `--tab "<name>"`, reads that tab with the service account, parses it with the app's `parseYtdGrid`, and prints its CLIENT row and columns, so a wrong tab is caught.
3. Reads the DB template row `section_templates` where `section_slug = 'organic-social:platform'` (else the code template).
4. Prints `resolveSection(template, newOverride)` and refuses unless it equals exactly `['ytd-review@3', 'platform-headlines@1', 'follower-graph@2', 'engagement-trend@2', 'top-content@2']` (review minor 18).
5. Runs `validateSectionOverride('organic-social:platform', newOverride, REGISTRIES, template.order.map((p) => p.id))` (minor 17).
6. Prints the before and after of both columns.

It refuses in five cases:
- `organic-social:platform` already exists or carries `frozen`
- `reportingMonths` is present before or after the write (minor 19)
- `chartNotes` or `ytdSheets` already exists
- `origin/staging` lacks `parts/ytd-review-live.tsx`
- the Renaissance users digest or notes, commentary or locks counts differ from `ren-baseline-before-qa-2026-10-02.json`

In-transaction checks: Renaissance's two columns equal exactly the planned values, and every other client row's md5 is unchanged. After the transaction, run the read-only staging digest probe and record the new Renaissance fingerprint as the new baseline file `ren-baseline-after-annotations-ytd-2026-10-02.json`. Its users, notes, commentary and locks values must equal the old ones; only `client_row` changes.

Reversal: delete the `organic-social:platform` key and the two `dash_social_config` keys. That's exactly today's config, which the old baseline proves.

---

### Task 17: Staging check of every change (before Tuesday)

Use a staff session in Claude in Chrome, and client sessions in the app's browser pane (I type every password). Read values from page text and chart data, never small screenshots. Every case in spec section 11 is checked, and each result is recorded in a private `QA-2026-10-0X-jasmine-call-changes.md` with the page, what was expected, and what was seen.

- [ ] Outline Facebook tab: no footnote. Renaissance Facebook tab: the footnote as today.
- [ ] Piper Instagram: no influencer row or heading, owned top 5 unchanged. Piper Facebook, LinkedIn and X: as today.
- [ ] Akara Instagram with influencer posts: heading "Partnership Posts". As a client, the section's region name also reads "Partnership Posts" (read it from the accessibility tree).
- [ ] A finished month with the sheet filled: both tiles show the sheet's number, and the arrows compare against the sheet's prior month. A blank month: the locked dashboard value. The live month (team only): live Dash.
- [ ] Akara YTD: the leading blank months are not listed. Joy of Life: a leading N/A is not listed, and a later one is.
- [ ] Renaissance, picker on Last 30 days: YTD from January to the current month (live) on Instagram, Facebook and LinkedIn; no YTD block on X. The follower graph is titled "<Platform> Follower Growth Graph". Callouts show and Hide works.
- [ ] Renaissance note: added and approved by an approver, then visible right away as `qa-client@renaissance.test` on a range covering the day. A future day is refused. The test note is soft-deleted afterwards and recorded.
- [ ] Renaissance digest after the checks equals the new baseline (only the notes count may differ by the test note, which is soft-deleted. Record the exact counts).

Then I tell Jasmine that staging is ready for the Whitney review.

---

## Self-review (done 2026-10-02)

1. **Spec coverage.** Every spec section maps to a task:
   - S1 (section 3): Task 1
   - S2 and S3 (section 4): Tasks 2 to 4, data in Task 16 step 1
   - S4 and S5 (section 5): Tasks 6 to 8
   - S6: no change, pinned by the existing `ytd-review-sheet` tests
   - S7 (section 6): Task 5
   - S8 (section 7): Tasks 9 and 10, data in Task 16 step 3
   - S9 (section 8): Tasks 11 and 12, data in Task 16 step 3
   - S10 to S15: the Global Constraints, Task 13 step 1 and Task 15
   - Section 9 (unchanged list): Task 13 step 1
   - Section 10 (release steps): Task 15
   - Section 11 (edge cases): tests in Tasks 1 to 12, and Task 17
   - Section 12 (tests): each listed test is in its task
   - Section 13 (not in scope): untouched
2. **Placeholder scan.** No TBD or TODO, and no step without its code. The private scripts in Task 16 are specified by behaviour, refusal and check rather than pasted, because they carry the sheet id and must never be in this public file. Their pattern file is named and has been read.
3. **Type consistency.** These names and signatures are used identically in every task that defines or consumes them: `parseInfluencerSection`, `hiddenInfluencerPlatforms`, `influencerLabel`, `influencerHeading` (prop), `finishedMonthOnScreen`, `comparisonMonth`, `TileSheets`, `applySheetToTiles`, `TileSheetPlan`, `loadTileSheets`, `notesOn`, `ytdLiveMonths`, `YtdMonth.compareRange: string | null`, `ytdReviewBlock`, `YtdLiveReviewSection` and `ytdReviewV3`.
4. **Review Focus.** Five lines, each with its test in the owning task (Tasks 6, 7, 8, 11, 12).
