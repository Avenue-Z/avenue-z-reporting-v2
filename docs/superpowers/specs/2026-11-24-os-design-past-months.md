# Organic Social design overhaul: what past months look like (decision and option B)

Addition to `docs/superpowers/specs/2026-11-23-organic-social-design-overhaul.md`. That spec and the round 2 plan
(`docs/superpowers/plans/2026-11-23-os-design-phase1.md`) never say what the new look does to months that were already
reported. This document states what the round 2 code does today, puts the choice to Paul and me, and specifies option B
so it can be reviewed before anything is pinned. Every line reference is to the round 2 code as it merges (dev plus
#497 to #503).

## 1. The decision

**Decision 1: when a client moves to the new look, do its past months change too?**

| | A. By client (what round 2 does as built) | B. By month (this document) |
|---|---|---|
| Past months | Redrawn in the new look. Same numbers, same analysis text. | Drawn exactly as they were reported. |
| New months | New look | New look, from a month we choose |
| Code | None beyond round 2 | One more PR (section 4), cut after round 2 merges |
| What a client sees during the switch | One design | For one month, two designs: the last old month and the first new one (clients see two months) |
| PDF of a past month | New look | The look it was delivered in |
| Undo | Remove the pins | Remove one setting (back to A), or the pins (back to today) |

**I lean B.** The team reported and the clients approved August to October in today's look, and the way the team
writes up a month is about to change (decision 2). A past month should read the way it was delivered.

**Decision 2: per-chart analysis (Phase 3) is by month.** Not built in round 2. When it ships, months before it keep the
one Insights box at the top with their text, and new months get a box per chart. This matches Paul's recommendation in
the overhaul spec (section 8, item 6). Confirming it here so the two decisions are made together.

## 2. What round 2 does today (read from the code)

- **The look is chosen per client, never per month.** A client's setting for a tab (`SectionOverride`,
  `lib/report-sections/types.ts`) has no month in it. The page picks the setting by tab only
  (`components/report-sections/organic-social/index.tsx:143`) and resolves it once (`:179`), whatever month is on
  screen.
- **Locked months freeze numbers, not the look.** A lock stores Dash's raw answer (`dash_response_locks`,
  `lib/db/schema.ts:479`) and every render draws it with whatever version is pinned now. So under A a past month keeps
  its exact numbers in the new look.
- **The boxes follow the client too.** Insights and Recommendations are opted in once on the base `organic-social` key
  (`index.tsx:80`, `:85`), so `commentary@2` and `recommendations@2` change every tab and every month at once (overhaul
  spec section 6).
- **Nothing the team saved changes.** Analysis is one row per box per month in `report_commentary`, written with the
  same editor, approval and history; chart notes stay in `chart_notes`. Round 2 changes only how they are drawn.
- **Every Organic Social view already knows its month.** The body (`index.tsx:170`), the boxes
  (`components/report-sections/commentary/monthly.tsx:35`) and the AEO Informed Social tab (`index.tsx:112`) all call
  `lockedRangeFor(client, role, requestedRange, requestClock())` and get the same served month.

## 3. Option B: behaviour

One new per-client setting, `dash_social_config.designFrom`, a reporting month such as `"2026-11"`.

- **Absent:** exactly A. Nothing about a client without it changes, Renaissance included.
- **Present:** a served month **on or after** `designFrom` draws the new look; a served month **before** it draws the
  old look, byte for byte as today.
- **The kit pins stay as round 2 writes them.** For a month before `designFrom`, each kit version on the page is drawn
  as the version it wraps (table below), which is exactly today's output: every kit version is the old version's own
  render with the frame swapped (round 2 parity tests).
- **The boxes:** before `designFrom`, `commentary@2` and `recommendations@2` render without the kit look, which is
  exactly `@1` (#503's snapshots).
- **AEO Informed Social:** its `design: "kit"` applies only from `designFrom` (`aeo-informed/section.tsx:84`, with the
  month from `index.tsx:112`).
- **Social Listening:** unchanged. It was built on the kit and has no old look.

**What each kit version draws (read from the code):**

| Part | Kit version: wraps | Source |
|---|---|---|
| platform-headlines | 4: 2, 5: 3, 6: 1 | `parts/tiles-kit.tsx:58-63` |
| engagement-breakdown | 2: 1 | `parts/tiles-kit.tsx:65` |
| follower-graph | 3: 2 | `parts/trends-kit.tsx:69` |
| engagement-trend | 3: 2, 4: 1 | `parts/trends-kit.tsx:71-73` |
| ytd-review | 5: 2 | `parts/ytd-kit.tsx` (`ytdReviewV5`) |
| top-content | 4: 3, 5: 2 | `parts/posts-kit.tsx:85-87` |
| influencer-posts | 2: 1 | `parts/posts-kit.tsx:89` |
| kpi-check-in | 2: 1 | `parts/kpi-kit.tsx` (`kpiCheckInV2`) |
| commentary, recommendations (shared) | 2: 1 | `shared/parts/registry.tsx:57-58` |

## 4. Option B: inputs, outputs, where it goes

**Input.** `designFrom`: a string `YYYY-MM`, read by a small pure parser beside the other Organic Social settings
(`lib/organic-social/`, same pattern as `chartNotes` and `aeoInformedSocial`). No app code writes `dash_social_config`
today, so a setting there cannot be lost to an admin save. (A field on `report_section_config` would be: an admin save
rebuilds the section from the parser's known fields, `app/actions/report-sections.ts:88-92`,
`lib/report-sections/validate.ts:64`.) Written only by the guarded pin script, in the same write as the pins.

**Output.** For each render: which version each part draws, and whether the boxes and the AEO tab take the kit look.

**Where it goes (one PR, off dev, after round 2 merges):**

1. `lib/organic-social/kit-wraps.ts`: the table above as data, and `drawnVersion(id, version, kitActive)`. Pure.
2. `lib/organic-social/design-from.ts`: the parser and `kitActive(client, monthKey)`.
3. `components/report-sections/organic-social/index.tsx`: after `resolveSection` (`:179`), map each part's version
   through `drawnVersion` with the served month (`locked.month.key`, `:170`). The export layout check
   (`wrapsAsBlock`, `:187`) then sees the old version too, so a past month's PDF is today's.
4. `components/report-sections/commentary/monthly.tsx`: drop `look` when the served month (`:35`) is before
   `designFrom`. The gate stays inside the Organic Social and locked-months branch (`commentary/index.tsx:22-26`);
   other reports are untouched.
5. `components/report-sections/organic-social/aeo-informed/section.tsx:84`: `kitLook` also requires `kitActive`.
6. `lib/organic-social/influencer-tab.ts`: `SPLIT_BASIS` reads from the same table, so the split rule has one source.
   The rule is the same for a kit version and the version it wraps (#500, `c08e4d66`), so it needs no month.
7. The staging and production pin scripts write `designFrom` in the same guarded write as the pins.

It cannot be a standalone PR before round 2 merges: its table names versions that only exist once #497 to #503 are in
`dev`. If B is chosen, it is the next PR after round 2, and the staging pin waits for it.

## 5. Failure behaviour

- **Malformed `designFrom`** (not `YYYY-MM`): the client draws the old look on every month, and the page logs the client
  and the bad value once per render. Old look is the safe side: it never shows a delivered month in a look it was not
  delivered in.
- **No served month** (the client is not on locked months, or the lock config could not be read, `index.tsx:170`):
  old look. The pin script refuses to write `designFrom` for a client without reporting months.
- **A kit version missing from the table:** a test fails (section 7), so it cannot ship.
- **Requests and locks:** unchanged. A version choice never changes a request (round 2's "same reads" tests), so no
  lock key moves.

## 6. Edge cases

| # | Case | Behaviour |
|---|---|---|
| 1 | Served month equals `designFrom` | New look (inclusive) |
| 2 | `designFrom` later than every open month | Old look everywhere until that month opens. Staff can open the month in progress, so Jasmine can review the new look on it while every delivered month stays as delivered |
| 3 | A client's two visible months straddle `designFrom` | One old, one new, for one month. Accepted and called out to Jasmine |
| 4 | Year to date block on a new month | Drawn in the new look, all its months included (it is one block, drawn by the served month) |
| 5 | Influencer tab | Same rule (`organic-social:influencer` resolves through the same body, `index.tsx:143`) |
| 6 | Overview, platform tabs, AEO Informed Social | Same served month, same rule |
| 7 | PDF export | Same render path, so the same look as the screen for that month |
| 8 | Client row cache | A changed setting shows within 5 minutes (`lib/db/queries.ts:34`) |
| 9 | Renaissance | No setting, no kit pins: byte-identical. Renaissance proof on the PR, as for any change on its path |
| 10 | Undo | Remove `designFrom`: A. Remove the pins as well: today |

## 7. Tests (written before the code)

1. Parser: valid month, absent, malformed (each with its behaviour above).
2. Table: its keys equal every kit version in the registries, and each entry names a version that exists.
3. Body: for a month before `designFrom`, every part renders exactly as the wrapped version (`expectSameValues` and
   markup), Overview, a platform tab and the Influencer tab; from `designFrom`, the kit.
4. Boxes: before, markup identical to `@1`; from, the kit look.
5. AEO tab: kit only from `designFrom`.
6. PDF: a past month's export is byte-identical to today's.
7. No setting: every snapshot from round 2's "without the kit" tests unchanged.
8. Reads: the same requests and lock keys before and after, for both a past and a new month.

## 8. Not in scope

Phase 3 itself (per-chart analysis boxes and their storage, overhaul spec section 5), any other department, any number.
