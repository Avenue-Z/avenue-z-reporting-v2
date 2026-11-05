# AEO Outbound: charts drawn while the report is hidden

**Date:** 2026-10-22. **Branch:** `fix/aeo-outbound-chart-drawn-hidden` off `dev` at `d4a78532`.
**Replaces** the open S1 in `2026-10-22-aeo-outbound-round3-scorecard-fixes-design.md` (editor bar labels cut).

## Root cause (measured, not inferred)

Measured in real headless Chrome (`puppeteer-core` from the repo, the editor's exact sandbox, PocketGuard Oct 19,
frame 1105 x 817 as the editor's at a 1440 window):

| Frame at load | Bar chart drawn / box | Furthest-left label | Page width |
|---|---|---|---|
| Sized from the start | 335 / 335 | 22px inside | 1105 |
| Width 0, then sized | 335 / 335 (Plotly's own resize corrects it) | 34px inside | 1105 |
| Hidden (`display:none`), then shown | 700 / 700 | 29px cut off | 1288 (scrolls sideways) |

A chart drawn while the report has no layout gets Plotly's default 700px width. Nothing corrects it: no window resize
arrives when a hidden frame is shown, and the 700px chart widens its own grid column (`1fr` keeps a min-content floor),
so its box also reads 700 and Plotly's resize would keep 700 anyway. The two earlier attempts missed this: one watched
for a container width change (there is none once the chart props it open), one waited for fonts.

**Who sees it.** The editor never hides its frame (`components/aeo-outbound/editor.tsx:557`), and in a normally
rendering browser the chart fits whenever the frame is not hidden. The cut labels were seen by our automated checks,
which ran in a browser pane that was itself hidden (a background page). So Ryan likely never sees it; but any report
drawn while hidden (a background tab, a hidden pane, an embed) does, and our QA cannot trust what it sees until it's fixed.

## The change

1. **CSS:** the two chart columns get `min-width:0` (`render.ts`, the `.two-col>div` rule), so a mis-drawn chart can
   never widen its column or the page.
2. **Page script:** each `.plotly-graph-div` is watched with `ResizeObserver`; when its box is laid out (width above 0)
   and differs from the width Plotly drew it at by more than 1px, one window `resize` is sent (100ms debounce). Plotly's
   own responsive handler and the donut legend check (`resized()`) already answer that event. A chart that fits sends
   nothing, so there is no loop. Without `ResizeObserver` nothing runs.

**Not changed:** the figures, the sentences, the editor, the frame script, stored rows. Every page (draft, preview,
final, shared link) gets it, since all render from `render.ts`.

## Proof

- Unit tests (`render.frame.test.ts`): a chart that fits sends nothing, a hidden one (box 0) sends nothing, a chart
  drawn at 700 or 214 in a 335 box sends one resize after 100ms, and no `ResizeObserver` is a no-op. `render.test.ts`
  pins the new rule; two pinned rule lists updated on purpose.
- Headless Chrome on the changed code: all three frame cases read 335 / 335, labels 22px inside, page 1105. The page
  opened directly at 1440, 1280 and 390 wide is identical before and after (one resize event each, from the viewport).
