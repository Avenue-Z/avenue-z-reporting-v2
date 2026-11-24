# Organic Social design overhaul, round 2 (#497 to #503): code review record

Author: Thomas Chang. "I", "me" and "my" mean me. Date: 2026-11-24.

**Scope.** One combined record for the round, a section per PR, as Paul agreed on #490. The seven round 2 PRs of
`docs/superpowers/plans/2026-11-23-os-design-phase1.md`, each against `dev`, no unrelated code:

| PR | Branch | Diff range | Plan tasks |
|---|---|---|---|
| #497 | `feat/os-kit-tiles` | `a55cadef..794fdba0` | 2, 5 |
| #498 | `feat/os-kit-trends` | `ef32da9b..4fbf61f9` | 3, 4 |
| #499 | `feat/os-kit-ytd` | `ef32da9b..d91a0614` | 6 |
| #500 | `feat/os-kit-posts` | `ef32da9b..c08e4d66` | 7, 8 |
| #501 | `feat/os-kit-kpi-check-in` | `ef32da9b..89c06dd3` | 9 |
| #502 | `feat/os-kit-aeo` | `ef32da9b..61897594` | 10 |
| #503 | `feat/os-kit-boxes` | `ef32da9b..d0c8f4ab` | 11 |

This record changes no code. Fixes it names are follow-ups.

> [!CAUTION]
> One decision is open before any of these is pinned: what the new look does to months already reported (finding 5).
> It is asked on the spec PR, `docs/superpowers/specs/2026-11-24-os-design-past-months.md`.

## 1. How it works

**The goal:** the Organic Social tabs in the look Jasmine approved, the Social Listening artifact and tab (overhaul spec
section 1), with every number and saved word unchanged.

**One pattern for every part.** Each new version is the old version's own `render` with only the drawing swapped. The
old render returns `<Suspense fallback={skeleton}><Section/></Suspense>`; the kit version keeps the Suspense and the
skeleton, and swaps the section for one that awaits the old section as it is and redraws only the elements it returns.
So the data reads, the routing, the locked months, the failure logs and the fallback cards are the old code running,
not a copy. Old files are untouched.

| PR | New version: draws | What is swapped |
|---|---|---|
| #497 | `platform-headlines@4`: `@2`, `@5`: `@3`, `@6`: `@1`; `engagement-breakdown@2`: `@1` (`parts/tiles-kit.tsx:58-65`) | `KpiCard` to `KpiTile` (proven equal in #494), the kit's `.root` and heading |
| #498 | `follower-graph@3`: `@2`; `engagement-trend@3`: `@2`, `@4`: `@1` (`parts/trends-kit.tsx:69-73`) | The graph in a kit card, the line shaded and frameless (#488's props), live and PDF |
| #499 | `ytd-review@5`: `@2` (`parts/ytd-kit.tsx`) | `ChartCard` to the kit card, lines shaded, a one-month year as the kit's count columns |
| #500 | `top-content@4`: `@3`, `@5`: `@2`; `influencer-posts@2`: `@1` (`parts/posts-kit.tsx:85-89`) | Post cards in the kit frame, sort buttons as kit pills, Influencer totals as kit tiles |
| #501 | `kpi-check-in@2`: `@1` (`parts/kpi-kit.tsx`) | Each platform card's frame; the rings keep their look (decision (d)) |
| #502 | The AEO Informed Social tab, only with `design: "kit"` (`aeo-informed/section.tsx:84`) | Tiles as `KpiTile`, graphs in kit cards with a shaded line; tables and controls unchanged |
| #503 | `commentary@2`, `recommendations@2` (`shared/parts/registry.tsx:57-58`) | `CommentaryPanel`'s `look="kit"`: frame, label, buttons, badges. Same Tiptap editor (decision (a)) |

**How a client gets it.** Only by a pin in its `report_section_config` (no schema change). Every Organic Social version
is `published: false`, so no template or snapshot can pick it up by accident; the two shared box versions are published
because a `sharedParts` pin must be (`lib/report-sections/validate.ts:85`).

**Where each number comes from:** exactly where it came from before. No PR changes a getter, a request or a lock key.

## 2. Verification method

- **Value equality, per version:** the round 1 parity helper (`parts/version-parity.ts`, #494) compares every visible
  value, `aria-label` and `title` of the old and new version, for staff, a client and the PDF export, and fails on any
  fallback card. Each PR's description lists its cases.
- **Same requests:** asserted equal per version; the lock key pins (`lib/organic-social/lock-key-pin.test.ts`,
  `aeo-tab/aeo-lock-key-pin.test.ts`) are untouched.
- **Mutation checks:** each PR broke its own swap, look and fallback on purpose and saw tests fail (counts in each PR).
- **Merge-clean proof:** every pair and all seven together merge into `dev` with no conflict (`git merge-tree`; the
  seven together give tree `5f01d896`, 2026-11-24).
- **Full suite:** on #500's head after its fix, 443 files, 5,656 tests; tsc and eslint clean. CI green on all seven.
- **Local look:** each PR was pinned on the dev test client only (`notes-test`), with guarded dev-only writes, a
  rollback and Renaissance's dev row checked unchanged; then all seven together. What could not be seen on screen is
  finding 9.
- **Screenshots: withheld.** The plan asks for them in each PR. The test client shows a real client's data and this
  repo is public, so none are posted (decision N4 in `docs/superpowers/specs/2026-11-24-os-design-decisions-map.md`).

Status legend: CONFIRMED (proven in the tree), PLAUSIBLE (the code is right, not seen on screen), DECISION (needs Paul
and me). Sev: ● correctness, ○ cleanup or convention.

## 3. Findings

| # | Sev | Status | Location | Finding |
|---|---|---|---|---|
| 1 | ● | CONFIRMED, fixed in #500 (`c08e4d66`) | `lib/organic-social/influencer-tab.ts:36-45` | The Influencer split rule knew only `top-content@3` and `@2`, so a client on `@4` or `@5` would have split posts by another rule |
| 2 | ● | CONFIRMED, fixed in #498 (`602b90a3`) | `components/report-sections/organic-social/chart-look.ts` | A server module called a function from a `'use client'` module; every follower graph would have errored |
| 3 | ● | CONFIRMED, fixed in #498 and #499 | `design/kit.module.css` (the `.root svg` rule) | The kit's svg rule stretched Recharts' legend icon to 72px |
| 4 | ○ | CONFIRMED, fixed in #503 (`d0c8f4ab`) | `components/report-sections/commentary/commentary-kit.test.tsx:50` | Snapshots held New York times and failed in CI's UTC |
| 5 | ● | DECISION | `components/report-sections/organic-social/index.tsx:143`, `:179` | A pin redraws every month in the new look, past ones included |
| 6 | ○ | CONFIRMED | `parts/{tiles,trends,ytd,posts,kpi}-kit.tsx` | The section-swap helper exists in five files |
| 7 | ○ | CONFIRMED | `design/kit.module.css` | #498 and #499 both edit it (byte-identical), which the plan said no round 2 PR would |
| 8 | ○ | CONFIRMED | `design/kit.module.css:59` (`.kpi .t`, seen in #497) | A tile title's line height is 18px, not 16px |
| 9 | ○ | PLAUSIBLE | #497, #498, #499, #500, #501, #502 | Seven things are proven by tests but not seen on screen |
| 10 | ○ | CONFIRMED | `trends.tsx:166-212`, `designation-toggle.tsx:31`, `pill.ts:4-5` | The graph controls, note buttons and designation toggle keep their old style |
| 11 | ○ | CONFIRMED | `parts/registry.ts:26` | `follower-graph@1` has no kit form |
| 12 | ● | CONFIRMED (Paul), fixed in #498 (`4fbf61f9`) and #499 (`d91a0614`) | `design/kit.module.css:77` | The fix for 3 raised the svg rule's specificity, so it beat `.donutWrap svg` and stretched every Social Listening donut |
| 13 | ● | CONFIRMED (Paul, #506), fixed in #508 (`f2930199`) | `design/kit.module.css:27` | Kit blocks replaced the PDF export's font stack, so arrows and emoji could print as boxes |

## 4. Detail

1. **The split rule.** `influencerRulesFor` chose the outline rule only for an exact `top-content@3` and the author rule
   only for `@2`. The parity cases held the client's own pins fixed, so none pinned the platform as a moved client will
   be. Fixed: the rule reads `@4` as `@3` and `@5` as `@2` (`SPLIT_BASIS`, `:45`); two cases pin the platform the
   way a moved client will be, and fail without the fix. Suggested next: one table for "what each kit version draws",
   shared with option B if chosen (past-months spec section 4).
2. **Server and client.** `lookOf` moved to `chart-look.ts`, a plain module; `client-boundary.test.ts` now fails on any
   server module calling into a client module.
3. **The svg rule.** Now `.root svg:where(:not(:global(.recharts-surface)))`; `kit-svg-rule.test.ts` checks it the way
   CSS Modules hashes it. My first fix used a bare `:not()`, which changed Social Listening too: finding 12.
4. **Time zone.** Each timestamp is one placeholder (`clockFree`); everything else is still compared byte for byte.
5. **Past months.** The look is chosen per client, by tab, once per render, whatever month is on screen; locked months
   freeze numbers, not the look. The choice, A or B, and option B's design are in the past-months spec. Nothing is
   pinned until Paul answers.
6. **Five helpers.** They could not share one file without the PRs depending on each other. Fold them once all merge.
7. **The stylesheet.** Identical changes on both sides merge clean (proven).
8. **Line height.** The kit sets none. Visible, small, and the one difference besides the look.
9. **Not seen on screen:** `platform-headlines@6`, `engagement-trend@4` and `top-content@5` (the dev test client shows
   only Instagram); `influencer-posts@2` (same); `kpi-check-in@2` (APFM's dev row still names a KPI tab the sheet no
   longer has, so `@1` fails there too); the AEO kit tab (no dev client has a Peec project); the one-month YTD
   columns (no real month hits it). Each is covered for staff, a client and the PDF. They are seen on staging at the
   pin.
10. **Controls.** Plan decision (d), measured; a round 3 PR after #498 and #500 merge, because it edits their files.
11. **`follower-graph@1`.** Staging's platform template row pins `@1`. Any client drawing it needs a kit form; check
    Renaissance's pins at its step.

12. **The donuts (Paul's blocker).** A bare `:not()` counts its class, so the rule went from (0,1,1) to (0,2,1) and beat
    `.donutWrap svg`, which wins only by file order. `:where()` adds nothing, so it is back at (0,1,1). New tests resolve
    which rule wins, not only which match; in Chrome the donut went 168px (dev), 900px (the bare `:not()`), 168px (fixed).
13. **PDF fonts (#506).** `.root` sets its own font stack, which replaced the export's Noto fonts inside kit blocks.
    #508 adds `:global(.export-theme) .root { font-family: var(--font-sans); }`, its own PR off `dev`, needed before
    the first kit pin, not before round 2 merges.

## 5. Follow-ups

- **Before merge (block):** decision N4 (screenshots). Finding 5 is answered (B, #504); B is its own PR after round 2.
- **Before the first kit pin:** #508 (13) and B's PR.
- **Tests (#507):** the gaps Paul found in #500, #501 and #503, one tests-only PR after round 2 merges.
- **After merge:** fold the five helpers (6); the round 3 controls PR (10); the pin script compares against the
  version each client resolves (template row plus override), per the past-months spec.
- **The Renaissance step:** kit forms of `ytd-review@4` (plan) and `follower-graph@1` (11).
- **Needs me:** APFM's dev KPI setting (9).
- **Highest value:** 5. It decides what clients see for every month already delivered.
