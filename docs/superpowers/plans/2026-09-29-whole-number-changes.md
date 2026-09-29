# Outline tiles: whole-number percent changes (plan, not built)

From Jasmine's staging review, round 1: "Can all percent changes be rounded up?" Applies to the outline clients'
tiles only. Renaissance and every other section keep one decimal.

## Today (origin/dev d4f4a42)
- Every change arrow is drawn by the shared `KpiCard`: `Math.abs(delta).toFixed(1)` (`components/charts/kpi-card.tsx:71`).
  The arrow and its colour use the unrounded sign (`:66-70`).
- Outline tiles pass `delta` at `outline-tiles.tsx:26`. `OutlineTiles` is used by the Data block (`outline-tiles.tsx:43`)
  and the engagement breakdown (`parts/engagement-breakdown.tsx:14`).
- `KpiCard` is shared app-wide, including Renaissance's tiles, so it must not change by default.

## Change
- An optional `KpiCard` prop for whole-number changes, default one decimal. Only `OutlineTiles` sets it.
- Round the size first, then apply the sign. The rounded value drives the arrow, the colour and the text, so a small
  rise never shows a green up arrow next to "0%".
- Pending her answer: nearest whole number or always up (a 6.3% change shows 6% or 7%).
- Settled 2026-09-29: rate values are not changed. Her ask names percent changes, and her guide already states the
  rate rule (whole numbers at 1% or more, one decimal below, `lib/organic-social/format.ts:13`).
- Scope checked: in Organic Social the change arrows come only from `KpiCard` via `OutlineTiles`. The other one-decimal
  change displays (`capsule-column-chart.tsx:140`, `metric-delta.tsx:26`, `trend-area-chart.tsx:77`) are not used by
  any Organic Social section.
- Applies to every client pinned to the outline tiles (platform-headlines 2 or 3): the three outline clients today,
  Piper and PIMCO once they are switched on. A tab without outline rows (X) draws the v1 tiles, which keep one
  decimal; if Piper keeps its X tab, that tab would differ.
- Fix the `pctCompact` doc: it says 3.5% shows as "3%", but `Math.round(3.5)` is 4 (`format.ts:3`).

## Tests first
- Edges: +0.3, +0.5, -0.3, -6.3, 0, and a missing prior (the greyed placeholder is unchanged).
- A zero after rounding shows no arrow and the muted colour.
- `KpiCard` without the prop renders exactly as today.
- v1 platform headlines (Renaissance's path) unchanged.

## Independence
- Touches only `components/charts/kpi-card.tsx`, `outline-tiles.tsx` and the `format.ts` doc comment. No other open PR
  touches these files.
- Renaissance fingerprint before and after.
