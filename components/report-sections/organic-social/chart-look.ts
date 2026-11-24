// The design kit's look for the trend graphs' line (docs/superpowers/plans/2026-11-23-os-design-phase1.md, Task 3): a
// shaded fill and no inner frame, passed through to LineChart's own options of those names (components/charts/line-chart.tsx).
// Its own module, with no 'use client', because both sides call it: trends.tsx (a client module) and follower-graph.tsx
// (a server module), and a server module can never call a function exported from a client module (client-boundary.test.ts).

export type ChartLook = { shaded?: boolean; frameless?: boolean }

/** Only the options that are set, so a chart drawn without them is handed neither key, exactly as before. */
export const lookOf = ({ shaded, frameless }: ChartLook): ChartLook => ({ ...(shaded ? { shaded } : {}), ...(frameless ? { frameless } : {}) })
