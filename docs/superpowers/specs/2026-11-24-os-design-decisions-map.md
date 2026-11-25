# Organic Social design overhaul: the goal, every decision, and how the team's saved work maps

Author: Thomas Chang. "I", "me" and "my" mean me. Date: 2026-11-24. No code, no data, no setting changes.

One page for Paul: what we're building and why, where round 2 stands against it, every decision (settled and open), and
how everything the team saves maps onto the new look. Line references are to the code as it will be once round 2
(#497 to #503) merges, unless a file is named on `dev`.

## 1. The goal

Jasmine asked for the Organic Social performance tabs to get the look she approved in two places (overhaul spec
`2026-11-23-organic-social-design-overhaul.md`, section 1):

- **The Claude artifact**, the Social Listening mockup published 2026-11-19 at 10:52 (overhaul spec section 2, item 1).
  On the 11-19 call she said it looks "really premium" (07:29) and asked "that we do the same for performance" (07:46).
- **The Social Listening tab on staging**, the artifact ported into the app (#468). On Slack, 2026-11-20: "when are u
  going to make the performance reports look this elevated".

The tabs in scope: Overview, Influencer, Instagram, Facebook, LinkedIn, X, TikTok and AEO Informed Social
(`ORGANIC_SOCIAL_SUBSECTIONS`, `lib/constants.ts`). The look changes; every number and every saved word stays the same.

## 2. Where round 2 stands against the goal

| Tab | What it draws | New look in | Status |
|---|---|---|---|
| Every platform tab | Data tiles | `platform-headlines@4` / `@5` (#497) | Ready for review |
| | Engagement breakdown tiles | `engagement-breakdown@2` (#497) | Ready for review |
| | Follower and engagement graphs | `follower-graph@3`, `engagement-trend@3` (#498) | Ready for review |
| | Year to date | `ytd-review@5` (#499) | Ready for review |
| | Top Content | `top-content@4` / `@5` (#500) | Ready for review |
| Overview | Tiles, engagement graph, Top Content | `platform-headlines@6` (#497), `engagement-trend@4` (#498), `top-content@5` (#500) | Ready for review |
| | KPI Check-In | `kpi-check-in@2` (#501) | Ready for review |
| Influencer | Totals and post cards | `influencer-posts@2` (#500) | Ready for review |
| AEO Informed Social | Tiles and graphs | its `design: "kit"` setting (#502) | Ready for review |
| Every tab | Insights and Recommendations boxes | `commentary@2`, `recommendations@2` (#503) | Ready for review |
| Social Listening | Everything | Built on the kit (#468) | On staging |

**Still between round 2 and the full artifact look** (each is an item in section 3):

- The graph controls (channel toggles, Annotations, Add annotation), the note and card buttons and the designation
  toggle take the kit's pill and button styles in a round 3 PR (plan decision (d)). It edits files #498 and #500 also
  change, so it's cut after they merge. The sort toolbar is already done (#500).
- Analysis inside each chart, as Social Listening has it: Phase 3 (decision 3).
- The page glow: broken app-wide, #487.
- Spacing between parts stays 32px; Social Listening uses 40px (plan, "Known differences").
- The month picker, the AEO tab's controls and table: not in the plan (decision N3).
- **Renaissance**, in its own step (plan, "Later, in the Renaissance step"). Its `ytd-review@4` needs a kit form (`@6`).
  Also `follower-graph` has only `@1` and `@2` (`parts/registry.ts:26`) and its kit form `@3` wraps `@2`, so any client
  drawing `@1` (staging's platform template row pins `@1`) has no kit form yet. Check Renaissance's pins at that step.

## 3. Every decision

**From the overhaul spec (section 8), as the plan records them:**

| # | Decision | Status | Source |
|---|---|---|---|
| 1 | Timing: go now | Settled | Overhaul spec section 8 table, row 1 |
| 2 | Chart engine: hybrid (Recharts restyled for interactive graphs, the kit's SVG for static) | Settled | Plan header |
| 3 | Analysis inside each chart (Phase 3) | **Open**: later, needs (a), (c) and Kyleah's sign-off | Plan, "Known differences" |
| 4 | The page glow | Filed as #487, not in this batch | Plan, "Known differences" |
| 5 | The gate: part versions, a setting only off the parts system | Settled | Plan header |
| 6 | The top boxes once per-chart boxes ship | **Open**: Paul recommends Insights shows past months only, Recommendations stays. For Jasmine and Kyleah | Overhaul spec section 8 |
| 7 | Carry-over of analysis to the next month | **Open**: Paul recommends it stays empty. For Jasmine and Kyleah | Overhaul spec section 8 |
| 8 | Reading per-chart boxes: one query per tab, per-tab prefix | **Open** until Phase 3 | Overhaul spec section 8 |
| (a) | Editor for the restyled boxes: keep Tiptap | Settled by Paul, built in #503 | Plan, Task 11 |
| (b) | Shared line chart: additive, default-off props | Settled, merged (#488) | Plan header |
| (c) | Per-chart box keys (`organic-social:<tab>:chart:<id>`) | **Open** until Phase 3 | Overhaul spec section 8 |
| (d) | Controls with no artifact equivalent keep their behaviour, take the kit's pills and buttons | Settled. Sort toolbar done (#500); the rest is round 3 | Plan header |
| (e) | "Preview as client" beyond Social Listening | **Open**, not in the plan | Overhaul spec section 8 |
| (f) | Restyle only the versions clients pin | Settled | Plan header |

**New since the plan:**

| # | Decision | Status | Who |
|---|---|---|---|
| N1 | **Past months: A (by client) or B (by month)** | **Settled: B** (Paul on #504, "1: B"). A missing `designFrom` is the old look (Paul's #504 review) | Paul and me. Spec: `2026-11-24-os-design-past-months.md` |
| N2 | Per-chart analysis (Phase 3) is by month: past months keep the one Insights box; Recommendations stays on new months | **Settled** (Paul on #504, "2: agree") | Paul and me |
| N3 | The month picker, the AEO tab's controls and table on the kit | **Open**, not in the plan | Me, then Paul |
| N4 | Screenshots: the plan asks for them in each PR (plan, Global Constraints); I withheld them because the test client shows a real client's data and this repo is public | **Settled** (Paul on #504, 2026-11-24): OK. Screenshots stay out of the PRs and go in the private Slack message for each round | Paul |
| N5 | Round 1 (#494) merged without a review record; round 2 has one combined record (Paul's "one combined record per round" on #490) | **Settled** (Paul on #504, 2026-11-24): no round 1 record | Paul |

## 4. How the team's saved work maps

Nothing the team saves changes in round 2: same tables, same editors, same save actions. Only how it is drawn changes.

| What the team saves | Where | Keyed by | Saved through | Past months, option A | Past months, option B | Phase 3 |
|---|---|---|---|---|---|---|
| Insights and Recommendations | `report_commentary` (`lib/db/schema.ts:351`) | client, box (`view_key`, e.g. `organic-social:instagram` and `…:recommendations`, `lib/commentary/views.ts`), the entry's month | `saveCommentary`, `approveCommentary` (`app/actions/commentary.ts:55`, `:122`) | Same text, kit box | Same text, today's box | Insights keeps past months; new months get a box per chart (decisions 3, 6, N2) |
| Notes on the follower and engagement graphs | `chart_notes` (`schema.ts:427`) | client, platform, chart, day | `saveChartNoteAction` (`app/actions/chart-notes.ts:40`) | Same notes, kit chart | Same notes, today's chart | Unchanged |
| Which annotations a client sees | `chart_annotation_hides` (`schema.ts:405`) | client, platform, chart, day | `setAnnotationHiddenAction` (`app/actions/organic-social.ts:43`) | Unchanged | Unchanged | Unchanged |
| Year to date month notes | `chart_notes`, chart `ytd-followers` or `ytd-views` (`schema.ts:431`) | client, platform, month (its 1st) | `saveChartNoteAction` | Same notes, kit cards | Same notes, today's cards | Unchanged |
| Owned or influencer per post | `post_designations` (`schema.ts:387`) | client, post | `setDesignationAction` (`app/actions/organic-social.ts:19`) | Unchanged | Unchanged | Unchanged |
| The numbers of a locked month | `dash_response_locks` (`schema.ts:479`); the older freeze table `top_content_snapshots` (`:459`) | client, exact request | Captured on lock day, served forever | Same numbers (round 2 changes no request; `lock-key-pin.test.ts`) | Same | Unchanged |
| KPI Check-In targets and results; the YTD sheet | The team's Google Sheets, named in `dash_social_config.kpiSheets` and `.ytdSheets` (`schema.ts:147`, `:156`) | client, year (and month tab) | The team edits the sheet | Same reads (#499, #501) | Same | Unchanged |
| Social Listening exports and analysis | `social_listening_uploads` (`schema.ts:633`), `social_listening_history` (`:655`); analysis in `report_commentary` under `organic-social:social-listening:<box>` (`views.ts:15-16`) | client, month, topic | `uploadSocialListeningExport` (`app/actions/social-listening.ts:55`) | Already the kit | Already the kit | It is the per-chart precedent |
| Which look a client gets | `report_section_config` pins (no schema change) | client, tab | The guarded pin script, on my go | The only write | Plus `dash_social_config.designFrom` | New per-chart keys need no migration (overhaul spec section 5) |

## 5. What Paul is asked for, in order

1. **On this PR:** N1 and N2, answered ("1: B", "2: agree"). Option B's plan is on this PR too.
2. **Review round 2**, #497 to #503, with the combined review record (its own docs PR).
3. **OK or not:** N4 (screenshots withheld) and N5 (a round 1 record). Answered on #504: N4 OK (screenshots in the private
   Slack message per round), N5 no.
4. Nothing else here needs him now. Items 6, 7 and Kyleah's sign-off for 3 go to Jasmine and Kyleah in one message, sent
   only once I approve its exact text (overhaul spec section 8).
