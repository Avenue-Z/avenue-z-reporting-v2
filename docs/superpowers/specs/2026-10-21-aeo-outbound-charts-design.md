# AEO Outbound: chart fixes from Ryan's round 3 (design)

Status: draft for review, 2026-10-21. Code cited at dev `5fedaa52`. Every number below was measured on staging on
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

A custom name such as "Retailers & Marketplaces" overlaps at the editor's width. So `PAGE_JS` checks the drawn legend:
after the page loads, after each donut redraw it makes (phone or desktop), and 150ms after each window resize, it
reads each legend entry's text box. If any text ends within 2px of the next column's start, or past the figure's
right edge, it redraws the donut once with `legend.entrywidth` and `legend.entrywidthmode` removed: today's flowing
legend, which never overlaps. On the next resize it tries two columns again. Where `.legend .traces` is missing (no
Plotly, no donut) it does nothing.

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
| `charts.test.ts` new | `PLOTLY_BASE` still has `plot_bgcolor: '#1a1a1a'` and the donut layout has no `plot_bgcolor` override (the change is the bar's alone) |
| `v1-compat.test.ts` `v11()` | Three new deliberate differences, each with `once()`: the bar's `plot_bgcolor` value, the bar's `margin` key, the donut's legend keys and side margins. Every other byte of the v1.0 page unchanged |
| `render.test.ts` `CHART_SPACING_RULES` (`:371-383`) | Rule 4 is the donut-only centring rule, verbatim; the spacing tests at `:454-461` still pass (no rule names a chart id, no sizing on chart-wrap) |
| `render.frame.test.ts` new | With stubbed legend boxes that overlap: one extra `react` call whose layout has no `entrywidth` keys. Boxes that fit: no extra call. No legend nodes: no extra call. A resize after a fallback redraws with two columns first. Existing donut tests (`:247-315`) unchanged |

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

## 8. Decisions for Thomas

- **D1. Grid lines on the bar chart:** keep the faint vertical lines (proposed; Ryan named only the grey), or remove
  them (`showgrid: false`, one more key).
- **D2. Top margin 8px:** proposed. Measured clear of every label at 1105px. Any value from 0 to about 20 reads the same.

## 9. Not touched

`lib/aeo-outbound/aivx/*` (AIVx CSS, script, template, favicon, share), the separate `Avenue-Z/aivx-reports` repo, bar
colours, sort and height, donut colours, hole, slice labels and hover, the phone relabelling, the sentences, the
prompt, the editor.
