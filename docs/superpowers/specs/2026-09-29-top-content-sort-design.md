# Top Content sorts by Views and Engagements only, on outline tabs: design

Status: draft for review (spec step 2 of the regimen). Every claim is read on `origin/dev` 8502f40 (2026-09-29).
Plan: `docs/superpowers/plans/2026-09-29-top-content-sort.md` (written first; reconciled to this spec after review,
and this spec wins where they differ).

## 1. Why
Jasmine's staging feedback table, row "ALL | ALL | ALL | Top Performing Content": "Can we only give the ability to sort
by views and engagements. Remove Engagement Rate and Effectiveness." On the call, 2026-09-29, 26:06 to 26:28, asked
whether the two should also go from the post cards: "I just want to gone from the top. You can leave it in the actual
... reporting." So: the SORT BUTTONS offer only Engagements and Views; the cards keep all four metrics. "Across the
board" (26:01 to 26:02) means every outline client (clients on locked months), never Renaissance (my standing rule).

## 2. What happens today
- The sort metrics are `SORT_METRICS`, in toolbar order: Effectiveness, Engagement Rate, Engagements, Views / Impr.
  (`lib/organic-social/sort-content.ts:8-13`). The Views button is labelled "Views / Impr." because LinkedIn and X
  report impressions as views.
- `SortableTopContent` (`components/report-sections/organic-social/sortable-top-content.tsx:73-157`) draws one toolbar
  from `SORT_METRICS` (`:125-144`) that drives every owned row and the Influencer Posts rows (`:106-119`, `:147-154`).
  It starts on Engagements, descending (`:90-91`); clicking the active button flips direction, another button switches
  to it descending (`:94-101`); a sort change remounts each row at page 1 (`:103-109`).
- Each card shows all four metrics and emphasises the active sort's (`post-card.tsx:11-19`, `:55-70`).
- Two callers:
  - The outline part, top-content@3 (`parts/top-content-outline.tsx:43-44`), registered unpublished
    (`:49-59`). Read-only on staging (2026-09-29): all five clients on locked months (A Place For Mom, Akara, Joy of
    Life, Piper, PIMCO) pin top-content 3; Renaissance has no pin. Production is unverified until launch.
  - The v2 part (`parts/top-content.tsx:66-85`, `:77-82`), which passes no sort list. The v1 part draws a different
    component with no sort toolbar (`parts/top-content.tsx:18-31`). Renaissance uses one of those two, never @3, so it
    never reaches the outline part.
- What guards what today: `sort-content.test.ts` pins sorting and `SORT_METRICS` keys (`:19-57`);
  `sortable-top-content.test.tsx` pins `ownedLimit` and clicks the Views button by name (`:32-45`);
  `parts/top-content-outline.test.tsx` mocks `SortableTopContent` and reads the props the outline part passes
  (`:6-17`, `:28-32`), and renders `TopContentV2Section` (`:20`, `:123`). The Top Content goldens do not hold the toolbar:
  `parts/__snapshots__/top-content.golden.test.tsx.snap` has no sort label, and `top-content-v2.golden.test.tsx` checks
  identity and a few texts (`:22-37`), so neither can prove the toolbar is unchanged.

## 3. The change

### 3.1 `SortableTopContent` gets an optional `sortKeys?: readonly SortKey[]`
- Absent: the toolbar is `SORT_METRICS`, all four, exactly as today.
- Present: the toolbar is `SORT_METRICS` filtered to the listed keys, always in `SORT_METRICS` order whatever order the
  caller lists (so Engagements then Views / Impr.). If that filter leaves nothing (an empty list), the toolbar is all
  four, as if absent: a toolbar is never empty.
- The starting sort: Engagements, descending, when Engagements is on the toolbar (today's start); otherwise the first
  button on the toolbar, descending. The sort in effect is always one that has a button.
- Clicking, direction, remounting, paging, `ownedLimit`, the Influencer rows and the cards are unchanged; the one
  toolbar still drives every row, so Influencer Posts sorts only by the listed keys too.

### 3.2 The outline list
`OUTLINE_SORT_KEYS: readonly SortKey[] = ['engagements', 'impressions']`, exported from
`lib/organic-social/outline-top-content.ts` (the outline part already imports from it, `top-content-outline.tsx:7`).
The outline part passes `sortKeys={OUTLINE_SORT_KEYS}` on its `SortableTopContent` (`:43-44`). No other caller passes
`sortKeys`.

### 3.3 What does not change
- The post cards: all four metrics, the active one emphasised (Jasmine, 26:22 to 26:28).
- `SORT_METRICS` itself, sorting (`sortPosts`), paging, the default sort, the top 5 an outline client sees by default
  (still Engagements).
- Renaissance and every client not pinned to top-content@3 (the v1 and v2 parts never pass `sortKeys`).
- No request, lock key or data shape.

## 4. Failure handling
Display only; no new failure path. An empty list falls back to all four (3.1). No data, or a Dash failure, shows what it
shows today (the part's own fallback, `top-content-outline.tsx`, `safe`/`Fallback`).

## 5. Edge cases
| # | Case | Expected | Test |
|---|---|---|---|
| 1 | no `sortKeys` | four buttons, Engagements active | T1 |
| 2 | `['impressions', 'engagements']` | two buttons in toolbar order: Engagements, Views / Impr.; Engagements active | T2 |
| 3 | a list without Engagements, `['impressions']` | one button, Views active, sorted by views descending | T3 |
| 4 | `[]` | four buttons, as absent | T4 |
| 5 | Influencer Posts under a list | follows the same toolbar | T5 |
| 6 | the outline part | passes `['engagements', 'impressions']` | T6 |
| 7 | Renaissance's v2 part | passes no `sortKeys` | T7 |
| 8 | clicking Views, then Views again | views descending, then ascending (today's rule) | T2 |
| 9 | the cards under a list | all four metrics still shown | T8 |

## 6. Tests (written before the code)
In `components/report-sections/organic-social/sortable-top-content.test.tsx` (its `mk`, `group` and `view` helpers,
`:11-24`):
- T1 no `sortKeys`: buttons "Effectiveness", "Engagement Rate", "Engagements ↓", "Views / Impr.", Engagements pressed.
- T2 `sortKeys: ['impressions', 'engagements']`: exactly "Engagements ↓" and "Views / Impr."; clicking Views makes it
  pressed with "↓" and orders by impressions descending; clicking it again shows "↑".
- T3 `sortKeys: ['impressions']`: one button, "Views / Impr. ↓", pressed; posts ordered by impressions.
- T4 `sortKeys: []`: four buttons.
- T5 with a list and Influencer posts: clicking Views reorders the Influencer row too.
- T8 with a list, a card still shows "Effectiveness" and "Engagement Rate" rows.
In `components/report-sections/organic-social/parts/top-content-outline.test.tsx` (its mocked gallery and `props()`):
- T6 the outline part passes `sortKeys` equal to `['engagements', 'impressions']`.
- T7 `TopContentV2Section` passes no `sortKeys` (the prop is absent): the Renaissance-path guard the goldens cannot give.
Existing tests unchanged: `sort-content.test.ts`, `sortable-top-content.pagination.test.tsx`, the `ownedLimit` test
(`sortable-top-content.test.tsx:32-45`, which clicks "Views / Impr." by name), and every test in
`top-content-outline.test.tsx` (they read individual props, so an added prop changes none).

## 7. Other open PRs
Checked 2026-09-29 against #281 to #292: none touches `sortable-top-content.tsx`, `outline-top-content.ts`,
`parts/top-content-outline.tsx` or these tests. Paul's dormant #190 edits `sortable-top-content.tsx` and `post-card.tsx`
and already conflicts with `dev` on its own; not a dependency.

## 8. Out of scope
The cards, `SORT_METRICS`, the button labels, Renaissance, and every client not on top-content@3.
