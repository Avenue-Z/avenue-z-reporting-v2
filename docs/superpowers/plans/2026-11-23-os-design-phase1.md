# Organic Social design overhaul, Phases 1 and 2: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax for tracking.

Author: Thomas Chang. "I", "me" and "my" in this doc mean me.

**Goal:** Give the Organic Social tabs the Social Listening look, one new part version at a time (Phase 1), and give
their Insights and Recommendations boxes the same look (Phase 2, Task 11), with every number and every word unchanged
and no client seeing it until they are pinned.

**Architecture:** Each task is a new version of one part (for example `top-content@4`), added beside the old version
(registered in its PR's own `parts/kit/` file, which `components/report-sections/organic-social/parts/registry.ts`
merges in), with the old version's file left untouched
(`components/report-sections/peec-ai/MAINTAINING.md`). A new version draws with the design kit
(`components/report-sections/organic-social/design/`, from Phase 0) and the shared line chart's `shaded` and `frameless`
options. A client gets it only when its `report_section_config[<key>].versions` pins it (`lib/report-sections/resolve.ts:44`).

**Tech Stack:** Next.js 16, React 19, Recharts 3.7, CSS modules, Vitest with jsdom.

**Spec:** `docs/superpowers/specs/2026-11-23-organic-social-design-overhaul.md` (approved in #484), sections 6 to 8, with
decisions 2, 5, (b), (d) and (f) as recommended there and in the #484 decisions comment.

## Global Constraints

- **Two review rounds, eight PRs.** Every PR is its own feature branch off `dev`. No PR is built on another open PR (no
  stacking): a PR starts only once everything it needs has merged to `dev`, then branches from the updated `dev`.
  Already merged (2026-11-23): #486 (the kit), #488 (the line chart options) and #489 (the AEO `design` key).
  - **Round 1, one PR, the foundation:** Task 1 (the parity helper), the kit tile options from Task 2 (`tooltip`,
    `noPrior`, `zeroDash`, `noChange`, `oneDecimal`, used by four round 2 PRs), and the registration slots below. Nothing on screen
    changes.
  - **Round 2, seven PRs in parallel**, once round 1 has merged:

    | PR | Tasks | Covers |
    |---|---|---|
    | Tiles | 2 (the versions), 5 | `platform-headlines@4`, `@5`, `@6`; `engagement-breakdown@2` |
    | Trend graphs | 3, 4 | `follower-graph@3`; `engagement-trend@3`, `@4`; `ChannelTrendChart`'s two props |
    | Year to date | 6 | `ytd-review@5` and the kit's count column chart |
    | Posts | 7, 8 | `top-content@4`, `@5`; `influencer-posts@2` |
    | KPI Check-In | 9 | `kpi-check-in@2` |
    | AEO Informed Social | 10 | the tab with `design: "kit"` |
    | Boxes | 11 | `CommentaryPanel`'s `look`, `commentary@2`, `recommendations@2` |

    Tasks that depended on each other (3 and 4, 7 and 8, 2 and 5) now share a PR, so no round 2 PR waits on another.
- **Zero-conflict registration (round 1 sets it up).** Today every new version would add lines to the same two shared
  files: the registry, whose entries sit on neighbouring lines (`parts/registry.ts:18-37`), and the export layout, one
  object (`parts/export-layout.ts:5-22`). Seven PRs editing them would conflict as each one merged. So round 1 adds one
  pair of files per parts PR under `parts/kit/`: `tiles`, `trends`, `ytd`, `posts`, `kpi-check-in`, each
  `<name>.parts.ts` (exporting an empty `PartRegistry`) and `<name>.layout.ts` (exporting an empty layout map).
  - `registry.ts` adds them to its `mergeRegistries(...)` call. `mergeRegistries` merges versions per part id
    (`lib/report-sections/registry.ts:4-11`), so a kit file can add `top-content@4` beside the existing versions.
  - `export-layout.ts` spreads each layout map into `EXPORT_LAYOUT`. The layout files hold plain values only.
    `export-layout.ts` is imported only by `organic-social/index.tsx:12`, and no part file imports it, so no import loop
    can form.
  - A round 2 PR then edits only its own two `parts/kit/` files plus its own new files. The Tiles PR also changes the
    one version-list line in `parts/outline-parts.test.tsx:53`. The AEO and Boxes PRs touch no registry. So no two round
    2 PRs share a file, and they merge in any order. Before round 2 is sent, every pair is proven to merge cleanly into
    `dev`.
  - **Trial (2026-11-23, throwaway, deleted):** with two empty slots wired into `registry.ts` and `export-layout.ts`
    on `dev`, all 304 parts tests passed. Two branches, each filling a different slot with a version, merged cleanly in
    both orders, and the export layout test passed with both in. The only test that failed was the version-list line,
    `outline-parts.test.tsx:53`, which is why the Tiles PR, and only it, changes that line.
  - Styles: each round 2 PR puts its new styles in its own CSS module beside its files. The kit's colours are CSS
    variables on `.root` and inherit through the page, so no PR edits `design/kit.module.css` after round 1.
- **Finished before Paul sees it.** A round is sent to Paul in one Slack message, only when every PR in it has passing
  tests and gates, the local look (below) with screenshots in the PR, my self-review and label, green CI, and the
  merge-clean proof.
- **Review records.** CLAUDE.md asks for one review record per feature. To keep Paul's load sane I'm proposing one
  combined record per round, with a section per PR. That's Paul's call; until he agrees, it's one per PR.
- A new version only, and every new **Organic Social part** version is `published: false`, like the outline versions
  today (`parts/outline-data.tsx`, `parts/ytd-review-sheet.tsx`). An unpublished version can't be frozen into a
  client's snapshot or promoted into the shared template (`lib/report-sections/registry.ts:30`,
  `lib/report-sections/validate.ts:11`), so the template every other client and Renaissance read can never pick it up by
  accident. A client still pins them through `versions` or `extraParts`, which accept unpublished parts
  (`validate.ts:78`). The two **shared** parts in Task 11 are the exception and are `published: true` (see Task 11).
- The old version's file and golden stay untouched. Every new `id@version` still needs an export layout entry, `own` or
  `block` (checked by `parts/export-layout.test.ts:10`), now in its PR's own `parts/kit/<name>.layout.ts`. Each task
  names its choice.
- Numbers unchanged: same getters, same requests, same locked months, same strings, proven by a value-equality test
  (Task 1) for every new version. Same requests also means the request-shape pins stay untouched
  (`lib/organic-social/lock-key-pin.test.ts`, `lib/organic-social/aeo-tab/aeo-lock-key-pin.test.ts`): a new version that
  changed a request would orphan every locked month stored under the old key.
- Empty and error states kept: `NoData`, `ytd-failure`, the per-part `Suspense` fallback and `safe()`.
- Files only under `components/report-sections/organic-social/`, except Task 11's commentary files (named there). The
  line chart options (#488) and the AEO key (#489) are already merged.
- Standard gates on each PR: `npx tsc --noEmit`, `npm test`, `npm run lint` on changed files, `npm run check:rsc`, and the
  per-PR review record (`docs/qa/<feature>-code-review.md`, spec section 6).
- **A local look before review.** Each PR that changes something visible is run on the local app against the dev
  database and checked in the browser before it goes to Paul: the applied styles against the kit stylesheet, no console
  or server errors, and a screenshot. I see it there before staging.
- Controls the artifact has no equivalent for (KPI rings, annotations and chart notes, channel toggles, the Top Content
  sort toolbar, the owned or influencer designation) keep how they work and take only the kit's colours, borders and
  pill and button styles (decision (d)).

## Pinning (spec section 6)

- **Staging:** once round 2 has merged, `dev` is promoted to `staging` once, and APFM is pinned to every new version
  and both boxes in one guarded write on my go. Jasmine is then asked to review the finished tab once, not piece by
  piece.
- **Production:** a client is pinned only once every part on the tabs it shows has a new version **and** Task 11's two
  boxes are done, all at once, so no tab is half old and half new (new cards under an old Insights box would be). Read-only check (2026-11-23): Akara Living, Joy of Life, PIMCO and Piper Aircraft hide
  Overview, so this batch covers every part on their tabs. APFM shows Overview, so Overview's three template parts are in
  this batch too (Tasks 2, 4 and 7). Renaissance shows Overview and also pins `ytd-review@4`, so it waits for the
  Renaissance step.
- **Who runs it:** each production write is a guarded script (dry run, client-only check, rollback, read-back), run by me
  or by the Claude Code session I am working in, only on my written go. The AEO Informed Social key
  (`aeoInformedSocial.design`) is written the same way, and only once #489 has reached `main`.
- No `section_templates` change: every task reuses an existing part id. Never run `scripts/seed.ts`.

## Review Focus

- **The kit's colour variables.** The kit reads its colours from `.root` (`design/kit.module.css`, the variables block at
  the top). Every new version wraps its own output in an element carrying `.root`, so it never depends on a page wrapper.
- **Visible strings the kit changes.** Five differences, all closed by the round 1 tile options so no tile's text
  changes:
  - the shared tile has a hover tooltip (`components/charts/kpi-card.tsx:49`);
  - with no prior it shows a greyed dash and "vs prior period" (`:73`), where the kit's `Change` shows "n/a";
  - a zero change reads "0% vs prior period" after a dash glyph (`:67`), where the kit's has no dash;
  - a tile with no change line today (an unavailable tile, `outline-tiles.tsx:23`; the Influencer totals,
    `parts/influencer-posts.tsx:51-54`) would gain one, because the kit's `Kpi` always renders `Change`
    (`design/charts.tsx`);
  - precision: the kit's `Change` always rounds whole from 1% (`design/charts.tsx:37-39`), like `KpiCard` with
    `wholeDelta`, while `KpiCard` without it shows one decimal (`kpi-card.tsx:41`, `:68`). `platform-headlines@1`
    uses one decimal (`headlinesV1(ctx)`, `parts/platform-headlines.tsx:35`), so on `@6` "↑ 12.3%" would become
    "↑ 12%" and a zero would lose its ".0". The Data block's fallback is whole (`headlinesV1(ctx, true)`,
    `outline-data.tsx:51`), so this is an option per call.
- **The PDF export.** Each card stays one `data-export-block`; the line chart's fill does not animate in the export
  (#488).
- **The client view.** No staff control (chart note forms, designation toggles, hide buttons) renders for a client,
  exactly as in the old version.
- **A month with no data.** Each new version renders the same `NoData` text the old version does, never a blank card.

---

### Task 1: The value-equality test helper

**Files:**
- Create: `components/report-sections/organic-social/parts/version-parity.ts` (test-only helper)
- Test: `components/report-sections/organic-social/parts/version-parity.test.ts`

**Interfaces:**
- Produces: `visibleValues(container: HTMLElement): string[]`: for every element in document order, its own text (its
  direct text nodes, whitespace collapsed), then its `aria-label` and `title`. Own text, not leaf text: a tooltip span
  holds its definition beside a child arrow element, so a leaf-only rule misses every tooltip (measured in the trial
  below). `expectSameValues(oldEl: HTMLElement, newEl: HTMLElement): void` asserts the two lists are equal, and fails
  when either list is empty or contains only a fallback ("Couldn't load this section.", `NoData`'s text).

**How every parity test is written** (Tasks 2 to 10):
- **Render the real section, awaited, with non-empty data**, as `parts/outline-parts.test.tsx:62` does, never the part's
  Suspense fallback. Feed every getter the section calls: the Instagram Data block also reads the media request, and
  without it the block shows its error card (`selectOutlineRows`, `lib/organic-social/outline-headlines.ts`).
- **Vary the data:** a normal change, a change of 1% or more with a non-zero tenth (such as 12.3%, which shows the
  precision difference), a zero change, a missing prior and an unavailable tile. The trial ran on `@2`, which is already
  whole, so it could not have shown a precision difference.
- **Three viewers:** staff (`INTERNAL_ADMIN`), client (`CLIENT_VIEWER`, the shared fixture's role,
  `parts/__fixtures__/organic-social-ctx.ts:9`) and the PDF export (`ExportModeProvider`).
- **Charts:** mock `ResponsiveContainer` to a fixed size (as `v1-render.golden.test.tsx:12`), or Recharts draws nothing in
  jsdom. Plotted values are geometry, not text, so also record the `data` and `yKeys` handed to the chart with a
  pass-through recorder (as `components/charts/line-chart.test.tsx:15` records `Line`) and assert they are equal.

**Trial (2026-11-23, throwaway, deleted):** `platform-headlines@2`'s Data block rendered with varied mocked data gave 36
values per view (titles, tooltip definitions, numbers, change lines, including the dash glyph before "0% vs prior period" and
before "vs prior period"), the same for staff, client and export, and a changed number was caught. With the media request unfed, every
view gave only "Couldn't load this section.", which a plain equality check would pass.

- [ ] **Step 1:** Tests: the same text in different markup is equal; a changed number, label or tooltip fails with the
  differing entries named; `aria-label`s count; an empty list or a fallback-only list fails.
- [ ] **Step 2:** Implement, run, commit `test(organic-social): a value-equality helper for new part versions`.

### Task 2: Kit tile options, and `platform-headlines@4`, `@5` and `@6`

**Files:** the kit tile options in `design/charts.tsx` (`Kpi`, `Change`) ship in round 1. This PR creates
`parts/outline-data-kit.tsx` and `parts/platform-headlines-kit.tsx`, registers the three versions in
`parts/kit/tiles.parts.ts` with their layouts in `parts/kit/tiles.layout.ts` (all three `own`, like `@1` to `@3`),
updates `parts/outline-parts.test.tsx:53`, and adds tests
`parts/outline-data-kit.test.tsx`, `parts/platform-headlines-kit.test.tsx`.

**Interfaces:**
- Produces: `Kpi` gains optional `tooltip?: string` (rendered with `HoverHint`, `components/charts/hover-hint.tsx`),
  `noPrior?: string` (the text shown instead of "n/a" when the change is null), `zeroDash?: boolean` (a zero change gets the same
  dash glyph before "0%" that `kpi-card.tsx:67` draws), `noChange?: boolean` (no change line at all) and
  `oneDecimal?: boolean` (always one decimal, as `KpiCard` without `wholeDelta`; absent: today's kit rounding, whole
  from 1%). These ship in round 1. All absent: Social Listening renders exactly as before, and its Phase 0 snapshots
  must not change.
- `platform-headlines@6` draws what `@1` draws (`parts/platform-headlines.tsx`, `headlinesV1`) with the kit's tiles,
  using `oneDecimal` as `@1` does: the Overview tiles, and Renaissance's platform tiles. The `@4`/`@5` fallback to these
  tiles stays whole, as `headlinesV1(ctx, true)` is today.
- `platform-headlines@4` draws what `@2` draws (`parts/outline-data.tsx`), `@5` what `@3` draws. Where `@2` and `@3` fall
  back to the v1 tiles, on Overview and on a channel no outline covers such as Piper's X (`outline-data.tsx:50-51`),
  `@4` and `@5` fall back to `@6`'s kit tiles, so no tab shows old-look tiles.

- [ ] **Step 1:** Failing tests: `expectSameValues` between `@1` and `@6`, `@2` and `@4`, `@3` and `@5`, written as
  Task 1 says, covering the fallback branch (Overview and an uncovered channel); the tooltip, no-prior, zero and
  unavailable texts equal the old tiles'; a 12.3% change keeps its one decimal on `@6` and stays whole on the `@4`/`@5`
  fallback.
- [ ] **Step 2:** Implement, run, confirm the Social Listening snapshots are unchanged, gates, commit.

### Task 3: `follower-graph@3`

Draws what `@2` draws (`parts/follower-graph.tsx`), in a kit card, with the line chart shaded and frameless (#488).
Annotations, chart notes and channel toggles work as in `@2` (decision (d)).

**How the options reach the chart:** `follower-graph` draws through `ChannelTrendChart` (`trends.tsx:46`), which calls
the shared `LineChart` without them (`:229`, `:277`) and is shared with `@1`, `@2`, `engagement-trend` and Renaissance's
`v1-render.golden.test.tsx`. So `ChannelTrendChart` gains the same two additive, default-off props, `shaded` and
`frameless`, passed through to `LineChart`. Not a fork. Every existing caller passes neither, and
`v1-render.golden.test.tsx` and the trends tests must stay byte-identical.

**Files:** `trends.tsx` (the two props), `parts/follower-graph.tsx` (the new version beside `@2`),
`parts/kit/trends.parts.ts` and `parts/kit/trends.layout.ts` (`follower-graph@3`: `own`), tests.

- [ ] Failing tests: `expectSameValues` against `@2`, written as Task 1 says, with annotations and notes on the fixture;
  the chart is shaded and frameless; the client view has no note controls; `ChannelTrendChart` without the props renders
  as before. Implement, gates, commit.

### Task 4: `engagement-trend@3` and `@4`

As Task 3, after it: `@3` from `@2` (the platform tabs) and `@4` from `@1` (Overview's template part,
`template.ts:5-9`), both in `parts/engagement-trend.tsx`, using `ChannelTrendChart`'s props from Task 3. Export layout:
both `own`.

### Task 5: `engagement-breakdown@2`

Draws what `@1` draws (`parts/engagement-breakdown.tsx`), with the kit's tiles from Task 2. Export layout: `block`,
like `@1`.

### Task 6: `ytd-review@5`

Draws what `@2` draws (`parts/ytd-review-sheet.tsx`). The columns use a new count-based column chart in the kit
(the kit's `YtdColumns` is sentiment-only, spec section 3); the line uses the shared `LineChart`, shaded and frameless
(decision 2, hybrid). Keeps `ytd-failure` and the year-to-date notes. It edits the kit (`design/charts.tsx`), so the
Social Listening snapshots must stay unchanged.

**What its parity test compares:** the axis ticks differ by design (the kit draws its own, Recharts draws its own), so
they are left out. Compared: each card's title, the values handed to each chart (the recorder), the notes, and the
column values as rendered labels. Export layout: `own`, like `@2`.

### Task 7: `top-content@4` and `@5`

`@4` draws what `@3` draws (`parts/top-content-outline.tsx`); `@5` what `@2` draws (`parts/top-content.tsx`, Overview's
template part and Renaissance's platform part). Both use the kit's post card frame and pill styles. The sort toolbar
and the owned or influencer designation keep how they work (decision (d)). Export layout: both `own`.

### Task 8: `influencer-posts@2`

Draws what `@1` draws (`parts/influencer-posts.tsx`), with the kit's tiles (the totals use `noChange`, as today they
have no change line) and the Task 7 card frame. Export layout: `own`.

### Task 9: `kpi-check-in@2`

Draws what `@1` draws (`parts/kpi-check-in.tsx`) inside a kit card. The rings keep their look and colours (decision (d);
the artifact has no rings). The start line and staff notes behave as in `@1`. Export layout: `own`.

### Task 10: AEO Informed Social with `design: "kit"`

Not on the parts system (`organic-social/index.tsx:107`), so it is gated by the setting key from #489. With
`design: "kit"` the tab draws its tiles with the kit and its graphs (Recharts directly, `aeo-informed/graphs.tsx:8`) with
the same fill and no inner box. Without it, the tab renders exactly as today (a byte-for-byte test, like Phase 0's).
With it, `expectSameValues` between today's tab and `design: "kit"`, written as Task 1 says (with the
`ResponsiveContainer` mock and the chart-data recorder).

### Task 11 (Phase 2): the Insights and Recommendations boxes

The boxes keep today's editor and behaviour, per decision (a), which Paul settled as Tiptap: all 69 live Organic Social
entries use formatting the Social Listening plain-text box would drop (spec section 5). Only their look changes.

**How it works today (traced):** both boxes are shared parts, `commentary@1` and `recommendations@1`
(`components/report-sections/shared/parts/registry.tsx:13-42`). Each renders `CommentarySection`
(`components/report-sections/commentary/index.tsx:15-62`). For an Organic Social view of a locked-months client, that
calls `monthlyCommentary`, which renders its `Panel` prop, `CommentaryPanel` by default
(`components/report-sections/commentary/monthly.tsx:21-26`). Otherwise it renders `CommentaryPanel` directly (`:52`).
`CommentaryPanel` (`components/report-sections/commentary/commentary-panel.tsx`, 243 lines, a client component) is
shared by every report that has commentary.

**The change:**
- `CommentaryPanel` gains one additive, default-off prop, `look?: 'kit'`. With it, the panel takes the kit's frame,
  label, button and badge styles, inside its own element carrying the kit's `.root`, so its colours never depend on
  the page around it. Every behaviour is unchanged: the Tiptap editor and its outline starter, the entry dropdown, the
  attribution line, approve, revoke, delete and the history. Without it, it renders exactly as today, so every other
  report is unchanged.
- **The PDF:** in export mode the panel returns `ExportCommentary` before anything else (`commentary-panel.tsx:75`,
  defined at `:231`), so `look` is passed to it too, and the printed box takes the kit look.
- **A guard:** the kit look applies only on an Organic Social view (`isOrganicSocialViewKey`, `lib/commentary/month.ts:6`).
  If `commentary@2` were ever pinned on another report, that report would keep today's panel.
- `CommentarySection` gains the same optional `look`, passed to `CommentaryPanel` on both paths (`monthlyCommentary`
  passes it through to its `Panel`). Its server-side redactions (`index.tsx:34-45`) don't change; `look` is a string, so
  no function crosses the server to client boundary (`check:rsc`).
- New shared part versions `commentary@2` and `recommendations@2` render `CommentarySection` with `look: 'kit'`,
  otherwise identical to `@1`, with Recommendations still at the bottom (`SHARED_PART_PLACEMENT`, `:45-48`).
- **Both are `published: true`.** Shared-part pins are validated as "shared parts must be published"
  (`lib/report-sections/validate.ts:85`, enforced at `:11`) on every save of a client's section config
  (`app/actions/report-sections.ts:88`, via `validateSectionOverride`, `lib/report-sections/mutations.ts:122-129`), so an
  unpublished pin would make the next save of that client's config fail. The reason Organic Social parts stay
  unpublished doesn't apply: shared parts have no template to be promoted into and no snapshot to be frozen into, and
  `resolveSharedParts` renders only the version a client pins (`components/report-sections/shared/parts/resolve.ts:6-16`).
  No screen offers shared-part versions to pick.
- A client gets them by pinning both in its `organic-social` config's `sharedParts`, which today holds
  `commentary@1` and `recommendations@1` for all six clients (read-only, 2026-11-23). Pinning them changes every
  Organic Social tab for that client at once (`organic-social/index.tsx:80`, `:85`); Social Listening renders neither box
  (`:53-61`). Every other report keeps `@1`.

**Files:** `commentary-panel.tsx` (including `ExportCommentary`), `commentary/index.tsx`, `commentary/monthly.tsx`
(pass-through only), `shared/parts/registry.tsx`, their tests.

- [ ] **Step 1:** Failing tests: `CommentaryPanel` without `look` renders byte for byte as before (a snapshot taken first,
  on today's code, like Phase 0's); with `look: 'kit'`, `expectSameValues` against today's panel for staff (editor
  closed), an approver (history open) and a client, with formatted entries (a list, a link, bold); the kit classes are
  applied; `commentary@2` and `recommendations@2` render through `CommentarySection` with `look`, and their placement is
  unchanged; the export view (`ExportCommentary`) is in the parity views too, with the kit look; on a non-Organic-Social
  view key, `look` is ignored; `validateSectionOverride` accepts a `sharedParts` pin of `commentary@2` and of
  `recommendations@2`.
- [ ] **Step 2:** Implement, gates, the local look, commit.

### Known differences from the artifact after Phases 1 and 2

Said plainly, so nobody expects them in this batch:
- **Analysis inside each chart** (Phase 3) is not in this plan. It needs decision 3 and Kyleah's sign-off first (spec
  section 8).
- **The page glow** behind every report is broken app-wide and filed as #487. The staging Social Listening page doesn't
  have it either.
- **Spacing between parts** stays at the tabs' 32px (`space-y-8`, `organic-social/index.tsx:55`, `:79`). The Social
  Listening page uses 40px between its sections (`.view`, `design/kit.module.css`). Changing it would change every
  client's tabs, Renaissance's included, so it isn't in this batch.

### Later, in the Renaissance step (not in this plan's batch)

Renaissance's `ytd-review@4` (a new `@6`), and pinning Renaissance itself, once the tasks above are on staging and
Jasmine has seen them, with a read-only before and after capture of Renaissance's numbers. Overview's template parts
are no longer here: they moved into Tasks 2, 4 and 7.

`follower-graph@1` is the platform template's default (`template.ts:24`), but no production client renders it: all six
pin `follower-graph@2` on their platform tabs (read-only, 2026-11-23), and Overview has no follower graph
(`template.ts:5-9`). So it gets no new version unless a client without that pin appears.
