# AEO Outbound: chart fixes from Ryan's round 3 (design)

Status: decided 2026-10-21 (D1 to D3, §8). Code cited at dev `5fedaa52`. Every number below was measured on staging on
2026-10-21 (read only: report previews via `GET /api/aeo-outbound/reports/{id}/view?mode=preview`, and scratch figures
drawn with the page's own Plotly 3.5.0 in a browser tab; nothing saved).

## 1. What Ryan asked (round 3, verbatim)

1. "Split the Domain Types listed in the chart on the right of the Cited Sources page into 2 columns vs. one."
2. "Adjust the spacing of the bar chart in the Competitive Visibility visual so there is not a big gap between the
   chart and the overhead title. In addition, eliminate the grey gradient behind the bars."

Nothing else is in scope. The page order, titles, bullets and domain gaps are separate PRs.

## 2. How the two charts work today

Both figures are built in `lib/aeo-outbound/charts.ts` and embedded by `embedFigure` (`charts.ts:103-106`), which
writes a `Plotly.newPlot` call into the page. Plotly 3.5.0 loads from the CDN (`render.ts:330`).

**Bar chart (Competitive visibility, `#aeo-chart-visibility`):** `visibilityBarFigure` (`charts.ts:44-71`).
- Layout is `{ template: AIVX_PLOTLY_TEMPLATE, ...PLOTLY_BASE, height: max(420, n*38), xaxis, yaxis, bargap }`
  (`charts.ts:62-68`). It sets no `margin`, so Plotly's default applies: top 100, bottom 80, left and right 80, with
  the left one grown by the y-axis `automargin` for long brand names (the template sets `automargin: true`,
  `aivx/plotly-template.ts:2`).
- `PLOTLY_BASE.plot_bgcolor` is `'#1a1a1a'` (`charts.ts:14`): the flat grey plot area Ryan calls a "gradient". The
  card behind it is black (`.chart-wrap{background:#000}`, `aivx/css.ts`). Faint grid lines,
  `rgba(255,255,255,0.06)`, sit on it (`charts.ts:65`). Underneath both, the AIVx template sets
  `plot_bgcolor: '#E5ECF6'` (`aivx/plotly-template.ts:2`).
- The page centres each figure vertically in its card: `#category-data .chart-wrap>.chart-title~*,
  #competitive-visibility .chart-wrap>.chart-title~*{margin-top:auto;margin-bottom:auto}` (`render.ts:101`). The card
  stretches to the findings box beside it (`render.ts:99-100`, `align-items:stretch` at `render.ts:276`).

**Donut (Domain types, `#aeo-chart-sources`):** `sourceDonutFigure` (`charts.ts:85-100`).
- Legend: `donutLegend()` = horizontal, centred under the plot, `y: -0.06` (`charts.ts:42`). No column setting, so
  Plotly flows entries across as many columns as fit the plot area's width.
- `margin: { l: 90, r: 90, t: 28, b: 64 }` (`charts.ts:97`). The legend pushes the bottom margin down as it grows.
- On a window of 900px or less, `PAGE_JS` redraws the donut with each legend label followed by its percent
  ("Corporate 37%") and the same layout (`render.ts:153-161`; pinned by `render.frame.test.ts:247-260`).

**Labels:** the donut's labels are Peec classifications. Built-ins read Corporate, Editorial, Institutional, Other,
Reference, UGC, Competitor, You, Related; a custom classification keeps its own name (`metrics.ts:116-121`), for
example "Retailers & Marketplaces" (seen on 3 PITCH projects on 2026-10-21).

## 3. What Ryan saw (measured)

The editor shows the report in a frame 1105px wide on a 1440px window. At that width (PocketGuard draft `4e160c91`):

| | Bar chart | Donut |
|---|---|---|
| Space from chart title to figure top | 53px (centring) | 0 |
| Space from figure top to first bar | 100px (Plotly default top margin) | n/a |
| Plot area | 100 wide x 240 tall (10 bars) | 147 wide x 201 tall |
| Legend | n/a | 1 column, 8 rows |

At a full 1440px window the centring adds 0 and the legend is 3 columns (3, 3, 2); at a 1000px window the bar gap is
91 + 100 = 191px and the legend is 1 column; on a 375px phone the figure is 309px wide and the legend is 1 column of
8. Six drafts on staging were measured at 1440px (A Place for Mom and PocketGuard): all showed the same 100px top margin.

## 4. The changes

Five changes, nothing else. `PLOTLY_BASE`, the AIVx template and every file under `lib/aeo-outbound/aivx/` stay as
they are.

**C1. Bar plot area black.** In `visibilityBarFigure`'s layout, set `plot_bgcolor: '#000000'` after the
`...PLOTLY_BASE` spread. The key keeps its place in the JSON (an override of an existing key), so only its value
changes. The grid lines stay (decision D1). The donut is unchanged: a pie has no plot area.

**C2. Bar top margin.** Add `margin: { t: 8 }` as the last key of `visibilityBarFigure`'s layout. Plotly fills the other
three sides with its defaults, so left, right and bottom are as today. Measured at 1105px: the plot area grows from
240 to 332px tall, and no bar, value label or brand name rises above the figure's top edge.

**C3. Bar figure sits right under its title.** Rule `render.ts:101` keeps the vertical centring for the donut only:
`#category-data .chart-wrap>.chart-title~*{margin-top:auto;margin-bottom:auto}`. The bar figure then starts directly
under "Competitive Visibility" whatever the height of the findings box. Spare height in the card goes below the
chart. Measured at 1105px with C1 to C3 applied: 0px from title to figure, 8px from figure top to the plot.

**C4. Donut legend in two columns.** `donutLegend()` gains `entrywidth: 0.5, entrywidthmode: 'fraction'` (each entry
is half the plot area's width), and `sourceDonutFigure`'s margin becomes `{ l: 24, r: 24, t: 28, b: 64 }`. The
narrower sides are needed: with 90px sides the half-width column is narrower than "Institutional" at the editor's
width, so names overlap (measured). `Plotly.validate` accepts both keys in 3.5.0. Measured with the standard 8
labels, no slice label is clipped at any width tried (495, 327 and 275px wide figures), and a freshly drawn figure
puts no slice label on the legend. The donut grows at narrow widths (1105px frame: 147 to 277px across) and is 18px
smaller at a full 1440px window (295 to 277), since four rows of legend replace three.

**C5. Never overlap: fall back to today's legend when two columns do not fit.** Two fixed columns cannot hold every
name at every width. Measured clearance between a name and the next column (negative means overlap):

| Figure width | Built-in names | Phone form ("Institutional 37%") |
|---|---|---|
| 240 | -6 | |
| 254 | 1 | |
| 275 | 11 | |
| 300 | 24 | -3 |
| 309 | | 1 |
| 324 | | 9 |

A custom name such as "Retailers & Marketplaces" overlaps at the editor's width. So `PAGE_JS` checks the drawn legend
and falls back. Precisely (review round 1, M1 to M4):

- **State.** `cur = {d, l}` is the figure the script last asked for: `orig` on desktop, the phone figure on a phone
  (set by `apply()`, `render.ts:157-160`). `fallen` is true after a fallback, cleared by the resize retry and by
  `apply()`.
- **Check, `fits()`.** Entries are `el.querySelectorAll('.legend .traces')`; each entry's text is its `.legendtext`.
  Both are measured with `getBoundingClientRect()`. Fewer than 2 entries: fits. Column starts are the distinct `left`
  values of the entry rects. For each entry the limit is the smallest column start greater than its own `left`, else
  `el.getBoundingClientRect().right`. It overlaps when `text.right > limit - 2`.
- **Changed by the round 2 fixes and the trial** (review log F2, F5; §8), and `render.ts` PAGE_JS is the reference: the
  check at load runs only where `apply(true)` does not, a resize redraws two columns only after a fallback and otherwise
  only checks, and `document.fonts.ready` is awaited only when fonts are still loading at load.
- **When it runs.** In `init()` before the existing `matchMedia` guard (`render.ts:161`), so desktop gets checked too;
  after each `apply()` draw resolves; after the resize retry's draw resolves; once on `document.fonts.ready` when
  `document.fonts` exists (Avenir is a swapped webfont, `aivx/css.ts`). Never after the fallback draw and never after
  `restore()`.
- **Fallback.** When `fits()` is false and `fallen` is false: `draw(copy(cur.d), l)` where `l` is `copy(cur.l)` with
  `legend.entrywidth` and `legend.entrywidthmode` deleted, then `fallen = true`. At most one fallback per check, so it
  cannot loop. It goes through the existing `draw()`, so a rejected fallback falls into the existing one-shot
  `restore()`. The result is the flowing legend (today's behaviour, with C4's 24px sides). Phone labels and the
  customdata hover survive, since `cur.d` is the phone figure there.
- **Resize retry.** One `resize` listener, debounced: `clearTimeout`, then the global `setTimeout`, 150ms after the
  last event. It acts only when `el.clientWidth` differs from its value at the last check (iOS fires `resize` when its
  toolbar collapses without a width change). It then redraws `copy(cur.d), copy(cur.l)` (two columns), clears
  `fallen`, and checks after that draw resolves.
- **Environment.** Uses only `el`, `document`, the global `setTimeout` and `clearTimeout`, and
  `window.addEventListener`. The frame tests run `PAGE_JS` against a bare `EventTarget` window
  (`render.frame.test.ts:241-242`).

## 5. Who sees it

- **Drafts:** every draft on the next open (drafts render live from stored data, `view/route.ts:61`), version 1 rows
  included.
- **Approved and sent reports:** never. They serve the HTML frozen at Approve (`app/actions/aeo-outbound.ts:65`,
  `view/route.ts:52-55`, `app/snapshot/[token]/route.ts:69`).
- No stored data, slot, setting, contract or migration changes.

## 6. Tests (written first)

| Test | Proves |
|---|---|
| `charts.test.ts` bar goldens (`:10-20`) | Ours equals AIVx's bar except, now also, `plot_bgcolor` and `margin`; asserts `plot_bgcolor === '#000000'` and `margin` equals `{ t: 8 }` |
| `charts.test.ts` donut goldens (`:22-37`) | Ours equals AIVx's donut except, now also, the legend's two keys and the side margins; asserts those values |
| `charts.test.ts` donut golden (m4) | `PLOTLY_BASE` still has `plot_bgcolor: '#1a1a1a'` and the donut layout has no `plot_bgcolor` override (the change is the bar's alone) |
| `v1-compat.test.ts` `v11()` | Three new deliberate differences, each with `once()`: the bar's `plot_bgcolor` value, the bar's `margin` key, the donut's legend keys and side margins. Every other byte of the v1.0 page unchanged |
| `render.test.ts` `CHART_SPACING_RULES` (`:371-383`) | Rule 4 is the donut-only centring rule, verbatim; the spacing tests at `:454-461` still pass (no rule names a chart id, no sizing on chart-wrap) |
| `render.frame.test.ts` new (C5, `getBoundingClientRect` stubbed on `.traces` and `.legendtext`) | Overlapping boxes on desktop: one extra `react`, layout without the two legend keys, data equal to `orig`. On a phone: the fallback keeps "Reference 5%" labels and customdata. Boxes that still overlap after the fallback: exactly one extra `react`. A rejected fallback: the existing single `restore()` and nothing more. Fitting boxes, or no legend nodes: no extra call. Five resizes within 100ms: one redraw. A resize with unchanged `clientWidth`: no call. A resize after a fallback: two-column redraw, then the check. Crossing 900px (`change`): the check runs after `apply()`'s draw. Existing donut tests (`:247-315`) unchanged |

Browser check after the build (staging preview, not saved): at 1440, 1105, 1000 and 375px, bar title-to-plot gap at
most 8px plus the figure's top edge, black plot area, donut two columns with no overlap, or the flowing legend where
two do not fit.

## 7. Edge cases

| Case | Behaviour |
|---|---|
| 1 to 3 brands on the bar chart | Height stays 420 (`charts.ts:64`); plot area 332px tall; same top gap |
| Findings box much taller than the chart | Bar sits under its title; the card's spare height is below the chart (C3) |
| 1 or 2 source types | Two columns, one row; nothing to overlap |
| 15 source types, custom names | Measured: two columns would overlap at the editor width; C5 falls back to the flowing legend |
| Phone under about 390px wide | Phone labels do not fit two columns below a 324px figure; C5 falls back |
| Window resized across 900px | The existing phone switch redraws (`render.ts:161`); C5 re-checks after each redraw |
| Plotly fails to load | No chart at all, as today; C5 finds no legend and does nothing |
| A report approved before this ships | Unchanged forever (frozen HTML) |

## 8. Decisions

- **D1. Grid lines on the bar chart:** keep the faint vertical lines (proposed; Ryan named only the grey), or remove
  them (`showgrid: false`, one more key).
- **D2. Top margin 8px:** proposed. Measured clear of every label at 1105px. Any value from 0 to about 20 reads the same.
- **D3. Custom-name projects keep a flowing legend at narrow widths.** Projects whose Peec setup has long custom
  categories (seen on 2026-10-21: Protein & Performance AIVx, GLP-1 & Peptides AIVx, PE Firms (Blue Owl)) fall back
  to the flowing legend at the editor's width, so Ryan sees no change there. Proposed: accept, since overlapping text
  is worse. Alternatives, each needing its own trial: a smaller legend font, or wrapping long names (a wrap trial on
  2026-10-21 still overlapped at 15 entries and cut the legend off at 14 characters).

**I decided (2026-10-21):** D1 keep the grid lines, D2 8px, D3 accept the fallback. The round 2 findings F1 to
F8 (review log) are accepted as written and carried into the plan. The trial
(`docs/findings/2026-10-21-aeo-outbound-charts-trial.md`) confirmed C5 with them, plus one refinement: the
`document.fonts.ready` check is registered only when `document.fonts.status === 'loading'` at init.

## 8a. Minor findings carried to the plan (review round 1)

- m1: `render.test.ts:470` pins the old centring rule; it changes with C3. Update the comments at `render.ts:97-98`
  and `render.test.ts:368-370`.
- m2: the v1-compat anchor for the bar's `plot_bgcolor` must include context to be unique (the value occurs twice in
  `v1-0-final.html`).
- m3: the two legend keys are appended after `yanchor`, `entrywidth` first.
- m4: `PLOTLY_BASE` is not exported (`charts.ts:12`); test the donut's `plot_bgcolor` instead.
- m6: covered in C5 (`document.fonts.ready`).
- m7: covered in C5 (environment).
- m8: browser check adds a draft with several slices under 5% at 1105px and 375px, and a custom-name draft at 1105px.
- m9: covered in §6.

## 9. Not touched

`lib/aeo-outbound/aivx/*` (AIVx CSS, script, template, favicon, share), the separate `Avenue-Z/aivx-reports` repo, bar
colours, sort and height, donut colours, hole, slice labels and hover, the phone relabelling, the sentences, the
prompt, the editor.

## 10. Paul's review (2026-10-22)

Both found in a real browser (Plotly 3.5.0, this branch's renderer, a local static page) before the fix and checked again
after it. The same check confirmed `.legend .traces` and `.legendtext` match Plotly's legend and `entrywidth: 0.5` draws two
columns.

- **Fixed.** With an odd count the last name sits alone in its row, but `fits()` measured it against the second
  column's start, so a long last name made the whole legend fall back (seven slices, the last one long: right edge 1173
  against the second column at 1103). Each name is now limited by the next name in its own row, or by the chart's edge.
- **Fixed.** A slice the viewer hid came back when the page redrew the legend after a fallback (`hiddenlabels` went to
  null). The donut's layout now carries `uirevision: 'aeo-sources'`, which keeps it hidden through both redraws.
- **Unchanged (FYI from Paul).** A chart drawn while hidden measures 0 by 0 and stays flowing until its width changes.
