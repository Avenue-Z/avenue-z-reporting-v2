# Trial: two-column donut legend with a no-overlap fallback (2026-10-21)

**Question.** Does spec C5 (`docs/superpowers/specs/2026-10-21-aeo-outbound-charts-design.md`), with the round 2
fixes F1 to F7 (review log), keep two columns where they fit and fall back without overlap or loops?

**How.** Throwaway script (session scratchpad, not in the repo) injected into a staging draft preview in a browser tab,
PocketGuard `4e160c91`, read only, nothing saved. It rebuilt the donut fresh with C4's layout (`entrywidth: 0.5`,
`entrywidthmode: 'fraction'`, side margins 24) and ran the C5 logic: `cur`, `fallen`, `fits()`, `draw(d,l,after)`
with one `then(after, restore)` chain, the debounced resize retry, and the init check only where `apply(true)` is not
called. Resize events were dispatched by hand: the browser's viewport emulation fires none.

**Results** (the log is the sequence of draws and checks):

| Case | Figure width | Result | Log |
|---|---|---|---|
| 1440px window, standard 8 names | 495 | 2 columns, 4 rows | fits |
| 1105px (editor), standard | 327 | 2 columns, 4 rows | fits |
| 1105px, 15 entries with long custom names | 327 | flowing legend, no overlap | fallback, draw:flow |
| Same, widened to 1440px | 495 | 2 columns tried, still too long, flowing | resize, draw:2col, fallback, draw:flow |
| Standard, narrowed to 920px | 242 | flowing, 1 column | resize, fallback, draw:flow |
| Then widened back to 1440px | 495 | 2 columns again | resize, draw:2col, fits |
| Five resize events, unchanged width | | no draw | (nothing) |
| 375px phone | 309 | flowing, phone labels ("Corporate 37%") and customdata hover kept | draw:2col, fallback, draw:flow |
| Widened to a 414px phone | 348 | 2 columns, phone labels kept | resize, draw:2col, fits |

No loop in any case: at most one fallback per check.

**Settled.**
- C5 works as specified with F1 to F7.
- Refinement: check on `document.fonts.ready` only when `document.fonts.status === 'loading'` at init. Otherwise
  its callback can run between `apply(true)`'s `react` call and the end of that draw, and measure a half-drawn legend.
- Wrap trial (D3, round 2 F8): wrapping long names with `<br>` at the space nearest the middle, 15 entries, side
  margins 24: names longer than 18 characters wrapped still overlapped at 327px and 275px figure widths. Wrapping at
  14 characters pushed the legend's last row 12px below the 420px figure. So D3 keeps the fallback, not wrapping.
