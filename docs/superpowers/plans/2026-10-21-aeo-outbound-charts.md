# AEO Outbound chart fixes (round 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The bar chart starts right under its title on a black plot area, and the donut legend shows two columns wherever the names fit, falling back to Plotly's flowing legend where they don't.

**Architecture:** Two figure-layout changes in `lib/aeo-outbound/charts.ts`, one CSS rule narrowed in `PAGE_CSS`, and a legend check added to the donut block of `PAGE_JS` (`lib/aeo-outbound/render.ts`). No data, slot, setting, contract or migration changes. Drafts pick it up on their next open; approved reports never change.

**Tech Stack:** TypeScript, Plotly 3.5.0 (CDN), Vitest with jsdom and fake timers.

**Spec:** `docs/superpowers/specs/2026-10-21-aeo-outbound-charts-design.md` (decisions D1 to D3 and the round 2 fixes F1 to F8 are recorded there and in `docs/superpowers/specs/2026-10-21-aeo-outbound-charts-review-log.md`; trial: `docs/findings/2026-10-21-aeo-outbound-charts-trial.md`).

## Global Constraints

- Branch `feat/aeo-outbound-charts` off `dev`; the PR targets `dev`, titled "... → dev". Nothing merges without Thomas's "merge"; Paul reviews the code.
- Never edit `lib/aeo-outbound/aivx/*` or `PLOTLY_BASE` (`charts.ts:12-17`).
- Bar layout: `plot_bgcolor: '#000000'` after the `...PLOTLY_BASE` spread; `margin: { t: 8 }` as the last key. Grid lines stay (D1).
- Donut legend: `entrywidth: 0.5, entrywidthmode: 'fraction'` appended after `yanchor`, in that order; donut margin `{ l: 24, r: 24, t: 28, b: 64 }`.
- CSS: the centring rule keeps `#category-data` only: `#category-data .chart-wrap>.chart-title~*{margin-top:auto;margin-bottom:auto}`.
- `PAGE_JS` may use only `el`, `document`, the global `setTimeout`/`clearTimeout` and `window.addEventListener` beyond what it uses today.
- Writing: no em or en dashes anywhere (code comments, commits, PR); sentence case; first person.
- Git: `git status --porcelain` before every commit; add named files only, never `git add -A`; push after every commit. Bound every long command with `perl -e 'alarm N; exec @ARGV' --`.

## Review Focus

1. **Avenir arrives after load** (it is a swapped webfont, `aivx/css.ts`): the legend must be re-checked when it lands. Pinned in Task 4 (fonts test).
2. **A donut with one source type**: one legend entry has nothing to overlap; no redraw. Pinned in Task 4.
3. **The editor frame** runs the same `PAGE_JS` in draft mode (`render.ts:164`, used in every mode): no draft-only path to break. Pinned by the existing `render.test.ts:349-357`, unchanged.
4. **Version 1 drafts** re-render with the new figures: every byte else of the v1.0 page must stay. Pinned in Tasks 1 and 3 (`v1-compat.test.ts`).
5. **Plotly.react rejects or throws** during a fallback or a phone draw: exactly one `restore()`, no check, no unhandled rejection. Pinned in Task 4.

---

### Task 1: Bar chart: black plot area and an 8px top margin (spec C1, C2)

**Files:**
- Modify: `lib/aeo-outbound/charts.ts:62-68`
- Test: `lib/aeo-outbound/charts.test.ts:10-20`, `lib/aeo-outbound/v1-compat.test.ts:34-64`

**Interfaces:**
- Consumes: nothing new.
- Produces: `visibilityBarFigure(...).layout` gains `plot_bgcolor: '#000000'` (same key position) and a last key `margin: { t: 8 }`.

- [ ] **Step 1: Write the failing tests**

In `lib/aeo-outbound/charts.test.ts`, replace the bar loop (lines 10-20) with:

```ts
for (const name of ['visibility_bar_12', 'visibility_bar_4']) {
  test(`${name}: identical to AIVx's bar except the visibility hover, % labels, unclipped labels, black plot area and 8px top margin`, () => {
    const lb = (C[name].input.leaderboard as { brand: string; citation_count: number }[])
    const ours = plain(visibilityBarFigure(lb.map((b) => ({ name: b.brand, visibilityPct: b.citation_count }))))
    const gold = plain(C[name].figure)
    expect(ours.data[0].hovertemplate).toBe('<b>%{y}</b><br>Visibility: %{x}%<extra></extra>')
    expect(ours.data[0].text).toEqual(ours.data[0].x.map((v: number) => `${v.toFixed(1)}%`))
    expect(ours.data[0].cliponaxis).toBe(false)
    // Round 3 (Ryan, 2026-10-21): no grey behind the bars, and the bars start right under the chart title.
    expect(ours.layout.plot_bgcolor).toBe('#000000')
    expect(gold.layout.plot_bgcolor).toBe('#1a1a1a')
    expect(ours.layout.margin).toEqual({ t: 8 })
    expect(gold.layout.margin).toBeUndefined()
    const keys = Object.keys(ours.layout)
    expect(keys[keys.length - 1]).toBe('margin')
    for (const f of [ours, gold]) { delete f.data[0].hovertemplate; delete f.data[0].text; delete f.data[0].cliponaxis; delete f.layout.plot_bgcolor; delete f.layout.margin }
    expect(ours).toEqual(gold)
  })
}
```

In `lib/aeo-outbound/v1-compat.test.ts`, inside `v11`, insert before `return out` (line 63):

```ts
  // 2026-10-21 (Ryan, round 3, spec 2026-10-21-aeo-outbound-charts-design.md C1 and C2): the bar chart's plot area is
  // black and its top margin 8px. The grey value also appears in the donut's layout, so the anchor runs to the bar's height.
  out = once(
    out,
    '"plot_bgcolor":"#1a1a1a","font":{"family":"Avenir, sans-serif","color":"#FFFFFF","size":13},"hoverlabel":{"bgcolor":"#272727","bordercolor":"rgba(255,255,255,0.1)","font":{"family":"Avenir","color":"#FFFFFF","size":13}},"height":420,"xaxis"',
    '"plot_bgcolor":"#000000","font":{"family":"Avenir, sans-serif","color":"#FFFFFF","size":13},"hoverlabel":{"bgcolor":"#272727","bordercolor":"rgba(255,255,255,0.1)","font":{"family":"Avenir","color":"#FFFFFF","size":13}},"height":420,"xaxis"',
  )
  out = once(out, '"bargap":0.38}', '"bargap":0.38,"margin":{"t":8}}')
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `perl -e 'alarm 120; exec @ARGV' -- npx vitest run lib/aeo-outbound/charts.test.ts lib/aeo-outbound/v1-compat.test.ts`
Expected: FAIL. The bar tests report `plot_bgcolor` `'#1a1a1a'` where `'#000000'` is expected; the v1-compat page test fails on the bar layout bytes.

- [ ] **Step 3: Write the implementation**

In `lib/aeo-outbound/charts.ts`, the bar layout (lines 62-68) becomes:

```ts
    layout: {
      template: AIVX_PLOTLY_TEMPLATE, ...PLOTLY_BASE,
      // Round 3 (Ryan, 2026-10-21): a black plot area in place of PLOTLY_BASE's grey (this key keeps its place in the
      // JSON), and an 8px top margin in place of Plotly's default 100, so the bars start right under the chart title.
      // Left, right and bottom keep Plotly's defaults.
      plot_bgcolor: '#000000',
      height: Math.max(420, top10.length * 38),
      xaxis: { title: { text: '' }, gridcolor: 'rgba(255,255,255,0.06)', showgrid: true, zeroline: false, tickfont: { color: '#A6A6A6', size: 11 } },
      yaxis: { title: { text: '' }, showgrid: false, tickfont: { color: '#FFFFFF', size: 12, family: 'Avenir' } },
      bargap: 0.38,
      margin: { t: 8 },
    },
```

- [ ] **Step 4: Run the tests to make sure they pass**

Run: `perl -e 'alarm 120; exec @ARGV' -- npx vitest run lib/aeo-outbound/charts.test.ts lib/aeo-outbound/v1-compat.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit and push**

```bash
git status --porcelain
git add lib/aeo-outbound/charts.ts lib/aeo-outbound/charts.test.ts lib/aeo-outbound/v1-compat.test.ts
git commit -m "Bar chart: black plot area and an 8px top margin (Ryan, round 3)"
perl -e 'alarm 30; exec @ARGV' -- git push
```

---

### Task 2: Bar chart sits right under its title (spec C3)

**Files:**
- Modify: `lib/aeo-outbound/render.ts:97-101`
- Test: `lib/aeo-outbound/render.test.ts:368-375`, `:463-472`

**Interfaces:**
- Consumes: nothing.
- Produces: `PAGE_CSS` rule 4 of the chart spacing rules is `#category-data .chart-wrap>.chart-title~*{margin-top:auto;margin-bottom:auto}`.

- [ ] **Step 1: Write the failing tests**

In `lib/aeo-outbound/render.test.ts`, replace the comment at lines 368-370 with:

```ts
/** v1.1 §17.8 and §17.10: the rules that close up the space beside the two charts and lay the findings out as rows, verbatim and in order.
 *  v1.1 18.12: rules 2 to 4 replace §17.8's display:flex on the first column, in its place, so both columns are flex
 *  columns and the chart card grows to a tall findings box. Rule 4 centres the donut below its title; since round 3
 *  (Ryan, 2026-10-21) the bar chart is left out of it, so it starts right under its title. */
```

Replace line 375 with:

```ts
  '#category-data .chart-wrap>.chart-title~*{margin-top:auto;margin-bottom:auto}',
```

Replace line 470 with:

```ts
    '#category-data .chart-wrap>.chart-title~*{margin-top:auto;margin-bottom:auto}',
```

and add as the last line of that test (after the `toEqual([...])` at line 472):

```ts
  expect(PAGE_CSS).not.toContain('#competitive-visibility .chart-wrap>.chart-title~*')
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `perl -e 'alarm 120; exec @ARGV' -- npx vitest run lib/aeo-outbound/render.test.ts`
Expected: FAIL on the rules list (it still holds the two-section rule) and on the new `not.toContain`.

- [ ] **Step 3: Write the implementation**

In `lib/aeo-outbound/render.ts`, lines 97-101 become:

```ts
  // Spec v1.1 18.12: both columns are flex columns, so the chart card grows with a tall findings box. The donut sits
  // centred below its title; the bar chart starts right under its title (round 3, Ryan, 2026-10-21). No rule here
  // sizes a figure.
  '#category-data .two-col>div,#competitive-visibility .two-col>div{display:flex;flex-direction:column}',
  '#category-data .chart-wrap,#competitive-visibility .chart-wrap{flex:1;display:flex;flex-direction:column}',
  '#category-data .chart-wrap>.chart-title~*{margin-top:auto;margin-bottom:auto}',
```

- [ ] **Step 4: Run the tests to make sure they pass**

Run: `perl -e 'alarm 120; exec @ARGV' -- npx vitest run lib/aeo-outbound/render.test.ts lib/aeo-outbound/v1-compat.test.ts`
Expected: PASS (v1-compat builds its expected page from `PAGE_CSS` itself, `v1-compat.test.ts:45`).

- [ ] **Step 5: Commit and push**

```bash
git status --porcelain
git add lib/aeo-outbound/render.ts lib/aeo-outbound/render.test.ts
git commit -m "Bar chart starts right under its title; the donut stays centred (Ryan, round 3)"
perl -e 'alarm 30; exec @ARGV' -- git push
```

---

### Task 3: Donut legend in two columns (spec C4)

**Files:**
- Modify: `lib/aeo-outbound/charts.ts:41-42`, `:97`
- Test: `lib/aeo-outbound/charts.test.ts:22-37`, `lib/aeo-outbound/v1-compat.test.ts` (`v11`)

**Interfaces:**
- Consumes: nothing.
- Produces: `sourceDonutFigure(...).layout.legend` ends `..., yanchor: 'top', entrywidth: 0.5, entrywidthmode: 'fraction'`; `layout.margin` is `{ l: 24, r: 24, t: 28, b: 64 }`. Task 4's fallback deletes exactly `legend.entrywidth` and `legend.entrywidthmode`.

- [ ] **Step 1: Write the failing tests**

In `lib/aeo-outbound/charts.test.ts`, replace the donut loop (lines 22-37) with:

```ts
for (const name of ['sources_8_types', 'sources_3_types']) {
  test(`${name}: identical to AIVx's content-source donut except the whole-number labels, their hover, two legend columns and 24px sides`, () => {
    const eb = C[name].input.earned_breakdown as Record<string, { count: number }>
    const total = Object.values(eb).reduce((s, v) => s + v.count, 0)
    const mix = Object.entries(eb).map(([label, v]) => ({ label, weight: v.count, pct: pyRound((v.count / total) * 100, 1) }))
    const ours = plain(sourceDonutFigure(mix))
    const gold = plain(C[name].figure)
    // Deliberate differences from AIVx (2026-10-19, Ryan): whole-number labels from the stored pct, and a hover that
    // reads the label, since a usage-rate weight is not a count.
    expect(ours.data[0].textinfo).toBe('text')
    expect(ours.data[0].text).toEqual(mix.map((m) => sliceLabel((m.weight / total) * 100)))
    expect(ours.data[0].hovertemplate).toBe('<b>%{label}</b><br>%{text}<extra></extra>')
    expect(gold.data[0].textinfo).toBe('percent')
    // Round 3 (Ryan, 2026-10-21): two legend columns, appended after yanchor, and 24px sides so they fit. The grey
    // plot_bgcolor stays on the donut: only the bar chart's changed.
    expect(Object.keys(ours.layout.legend).slice(-3)).toEqual(['yanchor', 'entrywidth', 'entrywidthmode'])
    expect(ours.layout.legend.entrywidth).toBe(0.5)
    expect(ours.layout.legend.entrywidthmode).toBe('fraction')
    expect(ours.layout.margin).toEqual({ l: 24, r: 24, t: 28, b: 64 })
    expect(gold.layout.margin).toEqual({ l: 90, r: 90, t: 28, b: 64 })
    expect(ours.layout.plot_bgcolor).toBe('#1a1a1a')
    for (const f of [ours, gold]) { delete f.data[0].hovertemplate; delete f.data[0].textinfo; delete f.data[0].text; delete f.layout.margin }
    delete ours.layout.legend.entrywidth
    delete ours.layout.legend.entrywidthmode
    expect(ours).toEqual(gold)
  })
}
```

In `lib/aeo-outbound/v1-compat.test.ts`, inside `v11`, after the two Task 1 lines and before `return out`:

```ts
  // 2026-10-21 (Ryan, round 3, spec C4): the donut's legend is two columns, with 24px sides so they fit.
  out = once(
    out,
    '"xanchor":"center","yanchor":"top"},"height":420,"margin":{"l":90,"r":90,"t":28,"b":64}',
    '"xanchor":"center","yanchor":"top","entrywidth":0.5,"entrywidthmode":"fraction"},"height":420,"margin":{"l":24,"r":24,"t":28,"b":64}',
  )
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `perl -e 'alarm 120; exec @ARGV' -- npx vitest run lib/aeo-outbound/charts.test.ts lib/aeo-outbound/v1-compat.test.ts`
Expected: FAIL. The donut tests report no `entrywidth`; v1-compat fails on the donut layout bytes.

- [ ] **Step 3: Write the implementation**

In `lib/aeo-outbound/charts.ts`, lines 41-42 become:

```ts
/** agent.py:2477-2487, plus two equal columns (round 3, Ryan, 2026-10-21): each entry is half the plot area's width.
 *  PAGE_JS falls back to Plotly's flowing legend wherever a name would run into the next column (render.ts). */
const donutLegend = () => ({ orientation: 'h', font: { family: 'Avenir', color: '#FFFFFF', size: 12 }, bgcolor: 'rgba(0,0,0,0)', borderwidth: 0, x: 0.5, y: -0.06, xanchor: 'center', yanchor: 'top', entrywidth: 0.5, entrywidthmode: 'fraction' })
```

and in `sourceDonutFigure` (line 97) the layout becomes:

```ts
    // Sides of 24px (AIVx: 90) so two legend columns fit at the editor's width (round 3, spec C4).
    layout: { template: AIVX_PLOTLY_TEMPLATE, ...PLOTLY_BASE, showlegend: true, legend: donutLegend(), height: 420, margin: { l: 24, r: 24, t: 28, b: 64 } },
```

- [ ] **Step 4: Run the tests to make sure they pass**

Run: `perl -e 'alarm 120; exec @ARGV' -- npx vitest run lib/aeo-outbound/charts.test.ts lib/aeo-outbound/v1-compat.test.ts lib/aeo-outbound/render.frame.test.ts`
Expected: PASS (the frame tests compare the phone layout with `fig.layout`, which now carries the new keys on both sides).

- [ ] **Step 5: Commit and push**

```bash
git status --porcelain
git add lib/aeo-outbound/charts.ts lib/aeo-outbound/charts.test.ts lib/aeo-outbound/v1-compat.test.ts
git commit -m "Donut legend in two columns, with 24px sides so they fit (Ryan, round 3)"
perl -e 'alarm 30; exec @ARGV' -- git push
```

---

### Task 4: The legend falls back where two columns do not fit (spec C5, F1 to F7)

**Files:**
- Modify: `lib/aeo-outbound/render.ts:137-161` (the `PAGE_JS` comment and its donut block)
- Test: `lib/aeo-outbound/render.frame.test.ts:228-245` (`bootDonut`) and new tests after `:315`

**Interfaces:**
- Consumes: Task 3's legend keys `entrywidth` and `entrywidthmode`.
- Produces: no exports change. `PAGE_JS` keeps its name and its place in every mode.

- [ ] **Step 1: Write the failing tests**

In `lib/aeo-outbound/render.frame.test.ts`, give `bootDonut` a `before` hook. Its signature (line 230) becomes:

```ts
function bootDonut(over: { matches?: boolean; react?: () => unknown; noPlotly?: boolean; noEl?: boolean; mix?: typeof MIX; text?: unknown; before?: (el: HTMLElement) => void } = {}) {
```

and after line 240 (the `'text' in over` line) add:

```ts
  if (!over.noEl) over.before?.(el)
```

Then add after the last donut test (after line 315's test closes):

```ts
// The legend check (spec 2026-10-21 C5): Plotly's legend nodes are stand-ins whose boxes the test sets.
type Box = [left: number, textRight: number]
const rect = (left: number, right: number) => ({ left, right, top: 0, bottom: 10, width: right - left, height: 10, x: left, y: 0, toJSON: () => ({}) }) as DOMRect
function setLegend(el: HTMLElement, boxes: Box[], right = 300, width = 300) {
  el.querySelector('.legend')?.remove()
  const d = el.ownerDocument
  const lg = d.createElement('div'); lg.className = 'legend'
  for (const [left, textRight] of boxes) {
    const tr = d.createElement('div'); tr.className = 'traces'; tr.getBoundingClientRect = () => rect(left, left + 20)
    const tx = d.createElement('div'); tx.className = 'legendtext'; tx.getBoundingClientRect = () => rect(left + 20, textRight)
    tr.appendChild(tx); lg.appendChild(tr)
  }
  el.appendChild(lg)
  el.getBoundingClientRect = () => rect(0, right)
  Object.defineProperty(el, 'clientWidth', { configurable: true, value: width })
}
const FITS: Box[] = [[0, 100], [150, 250], [0, 90], [150, 240]]
const OVERLAPS: Box[] = [[0, 160], [150, 250]]
type Call = [unknown, Record<string, unknown>[], { legend?: { entrywidth?: number; entrywidthmode?: string } }]
const callsOf = (react: { mock: { calls: unknown[] } }) => react.mock.calls as Call[]
const flowing = (layout: Record<string, unknown>) => { const l = JSON.parse(JSON.stringify(layout)); delete l.legend.entrywidth; delete l.legend.entrywidthmode; return l }
const flush = () => vi.advanceTimersByTimeAsync(0)

test('legend on a desktop width: names that fit draw nothing; names that overlap redraw once, flowing, with the same data', async () => {
  const fits = bootDonut({ matches: false, before: (el) => setLegend(el, FITS) })
  await flush()
  expect(fits.react).not.toHaveBeenCalled()
  const over = bootDonut({ matches: false, before: (el) => setLegend(el, OVERLAPS) })
  await flush()
  expect(over.react).toHaveBeenCalledTimes(1)
  const [target, data, layout] = callsOf(over.react)[0]
  expect(target).toBe(doc.getElementById('aeo-chart-sources'))
  expect(data).toEqual(JSON.parse(JSON.stringify(over.fig.data)))
  expect(layout).toEqual(flowing(over.fig.layout))
  await vi.advanceTimersByTimeAsync(1000)
  expect(over.react).toHaveBeenCalledTimes(1)
})

test('legend: one source type has nothing to overlap, so nothing is redrawn', async () => {
  const one = bootDonut({ matches: false, mix: [{ label: 'Corporate', weight: 1, pct: 100 }], before: (el) => setLegend(el, [[0, 400]]) })
  await flush()
  expect(one.react).not.toHaveBeenCalled()
})

test('legend on a phone: the check runs after the phone draw, and the fallback keeps the phone labels and hover, once', async () => {
  const { react, fig } = bootDonut({ before: (el) => setLegend(el, OVERLAPS) })
  await flush()
  expect(react).toHaveBeenCalledTimes(2)
  expect(callsOf(react)[0][2].legend?.entrywidth).toBe(0.5)
  const [, data, layout] = callsOf(react)[1]
  expect(data[0].labels).toEqual(['Reference 5%', 'Corporate 60%', 'You 35%'])
  expect(data[0].customdata).toEqual(['Reference', 'Corporate', 'You'])
  expect(layout).toEqual(flowing(fig.layout))
  await vi.advanceTimersByTimeAsync(1000)
  expect(react).toHaveBeenCalledTimes(2)
})

test('legend: a rejected fallback restores the originals once; a rejected phone draw restores once and never checks', async () => {
  const desk = bootDonut({ matches: false, react: () => Promise.reject(new Error('x')), before: (el) => setLegend(el, OVERLAPS) })
  await flush()
  expect(desk.react).toHaveBeenCalledTimes(2)
  expect(callsOf(desk.react)[1][1]).toEqual(JSON.parse(JSON.stringify(desk.fig.data)))
  expect(callsOf(desk.react)[1][2]).toEqual(JSON.parse(JSON.stringify(desk.fig.layout)))
  const phone = bootDonut({ react: () => Promise.reject(new Error('x')), before: (el) => setLegend(el, OVERLAPS) })
  await flush()
  expect(phone.react).toHaveBeenCalledTimes(2)
  expect(callsOf(phone.react)[1][1]).toEqual(JSON.parse(JSON.stringify(phone.fig.data)))
})

test('legend: resizes retry two columns once, 150ms after the last, and only when the width changed', async () => {
  let el!: HTMLElement
  const { react } = bootDonut({ matches: false, before: (e) => { el = e; setLegend(e, OVERLAPS, 300, 300) } })
  await flush()
  expect(react).toHaveBeenCalledTimes(1)
  win.dispatchEvent(new Event('resize'))
  await vi.advanceTimersByTimeAsync(200)
  expect(react).toHaveBeenCalledTimes(1)
  setLegend(el, FITS, 400, 400)
  for (let i = 0; i < 5; i++) { win.dispatchEvent(new Event('resize')); await vi.advanceTimersByTimeAsync(20) }
  expect(react).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(150)
  expect(react).toHaveBeenCalledTimes(2)
  expect(callsOf(react)[1][2].legend?.entrywidth).toBe(0.5)
  await flush()
  expect(react).toHaveBeenCalledTimes(2)
})

test('legend: a resize that makes two columns overlap falls back once', async () => {
  let el!: HTMLElement
  const { react, fig } = bootDonut({ matches: false, before: (e) => { el = e; setLegend(e, FITS, 400, 400) } })
  await flush()
  expect(react).not.toHaveBeenCalled()
  setLegend(el, OVERLAPS, 300, 300)
  win.dispatchEvent(new Event('resize'))
  await vi.advanceTimersByTimeAsync(150)
  expect(react).toHaveBeenCalledTimes(1)
  expect(callsOf(react)[0][2]).toEqual(flowing(fig.layout))
})

test('legend: crossing to a phone width checks after the phone draw', async () => {
  let el!: HTMLElement
  const { react, change } = bootDonut({ matches: false, before: (e) => { el = e; setLegend(e, FITS) } })
  await flush()
  expect(react).not.toHaveBeenCalled()
  setLegend(el, OVERLAPS)
  change(true)
  await flush()
  expect(react).toHaveBeenCalledTimes(2)
  expect(callsOf(react)[1][1][0].labels).toEqual(['Reference 5%', 'Corporate 60%', 'You 35%'])
  expect(callsOf(react)[1][2].legend?.entrywidth).toBeUndefined()
})

test('legend: a font still loading re-checks when it arrives; a loaded font adds no check', async () => {
  let el!: HTMLElement
  let arrive!: () => void
  const loading = bootDonut({ matches: false, before: (e) => {
    el = e; setLegend(e, FITS)
    Object.defineProperty(e.ownerDocument, 'fonts', { configurable: true, value: { status: 'loading', ready: new Promise<void>((r) => { arrive = r }) } })
  } })
  await flush()
  expect(loading.react).not.toHaveBeenCalled()
  setLegend(el, OVERLAPS)
  arrive()
  await flush()
  expect(loading.react).toHaveBeenCalledTimes(1)
  const loaded = bootDonut({ matches: false, before: (e) => {
    el = e; setLegend(e, FITS)
    Object.defineProperty(e.ownerDocument, 'fonts', { configurable: true, value: { status: 'loaded', ready: Promise.resolve() } })
  } })
  setLegend(el, OVERLAPS)
  await flush()
  expect(loaded.react).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `perl -e 'alarm 120; exec @ARGV' -- npx vitest run lib/aeo-outbound/render.frame.test.ts`
Expected: FAIL. The overlap tests see no fallback call (today's `PAGE_JS` never checks the legend). The existing donut tests still pass.

- [ ] **Step 3: Write the implementation**

In `lib/aeo-outbound/render.ts`, the `PAGE_JS` comment (lines 137-141) becomes:

```ts
/** Every mode: the menu scrolls inside the report instead of loading the editor's address in the frame (v1.1 §17.1), and
 *  the phone donut shows each slice's own label (§17.2; since 2026-10-19 the figure's text, charts.ts sliceLabel, so
 *  phone, desktop and the source-mix sentence round a slice the same way), and the menu marks 05 at the bottom of the
 *  page, where AIVx's scroll-spy never reaches the short last section (§17.12). The donut's two legend columns fall back
 *  to Plotly's flowing legend wherever a name would run into the next column, checked after each draw, when a loading
 *  font arrives and 150ms after the last resize (round 3, spec 2026-10-21 C5). Registered before the frame script's
 *  listener, so it runs first. */
```

and lines 153-161 (from `var el=document.getElementById('aeo-chart-sources')` through the end of `function init(){...}`) become:

```js
var el=document.getElementById('aeo-chart-sources'),orig=null,cur=null,restored=false,fallen=false,w=-1,tmr=null;
function copy(x){return JSON.parse(JSON.stringify(x))}
function restore(){if(restored||!orig)return;restored=true;try{var p=window.Plotly.react(el,copy(orig.d),copy(orig.l));if(p&&p.catch)p.catch(function(){})}catch(err){}}
function draw(d,l,after){try{var p=window.Plotly.react(el,d,l);if(p&&p.then)p.then(after,restore);else if(after)after()}catch(err){restore()}}
function fits(){var it=el.querySelectorAll('.legend .traces');if(it.length<2)return true;var e=[],s=[];for(var i=0;i<it.length;i++){var x=Math.round(it[i].getBoundingClientRect().left),t=it[i].querySelector('.legendtext')||it[i];e.push([x,t.getBoundingClientRect().right]);if(s.indexOf(x)<0)s.push(x)}s.sort(function(a,b){return a-b});var edge=el.getBoundingClientRect().right;for(var j=0;j<e.length;j++){var lim=edge;for(var k=0;k<s.length;k++)if(s[k]>e[j][0]){lim=s[k];break}if(e[j][1]>lim-2)return false}return true}
function check(){try{w=el.clientWidth;if(fallen||!cur||!cur.l.legend||!cur.l.legend.entrywidth||fits())return;fallen=true;var l=copy(cur.l);delete l.legend.entrywidth;delete l.legend.entrywidthmode;draw(copy(cur.d),l)}catch(err){}}
function apply(phone){if(!el||!window.Plotly||!orig)return;restored=false;if(!phone){cur=orig;fallen=false;draw(copy(orig.d),copy(orig.l),check);return}
var d=copy(orig.d),l=copy(orig.l),t=d[0];if(!t)return;var v=t.values||[],tx=t.text,total=0;if(!Array.isArray(tx)||tx.length!==v.length)return;for(var i=0;i<v.length;i++)total+=v[i];if(!total)return;var lab=t.labels||[];
t.customdata=lab.slice();t.texttemplate=v.map(function(x){return x/total>=0.05?'%{text}':''});t.labels=lab.map(function(x,i){return x+' '+tx[i]});
if(t.hovertemplate)t.hovertemplate=String(t.hovertemplate).replace('%{label}','%{customdata}');cur={d:copy(d),l:copy(l)};fallen=false;draw(d,l,check)}
function resized(){clearTimeout(tmr);tmr=setTimeout(function(){try{if(el.clientWidth===w)return;if(!fallen){check();return}restored=false;fallen=false;draw(copy(cur.d),copy(cur.l),check)}catch(err){}},150)}
function init(){if(!el||!window.Plotly||!el.data)return;orig={d:copy(el.data),l:copy(el.layout)};cur=orig;w=el.clientWidth;window.addEventListener('resize',resized);var f=document.fonts;if(f&&f.status==='loading'&&f.ready&&f.ready.then)f.ready.then(check);if(!window.matchMedia){check();return}var mq=window.matchMedia('(max-width: 900px)');if(mq.matches)apply(true);else check();var on=function(ev){apply(ev.matches)};if(mq.addEventListener)mq.addEventListener('change',on);else if(mq.addListener)mq.addListener(on)}
```

Line 162 (`if(document.readyState==='complete'){init();bottomRule()}else{...}`) is unchanged.

- [ ] **Step 4: Run the tests to make sure they pass**

Run: `perl -e 'alarm 120; exec @ARGV' -- npx vitest run lib/aeo-outbound/render.frame.test.ts lib/aeo-outbound/render.test.ts lib/aeo-outbound/v1-compat.test.ts`
Expected: PASS, the existing donut tests (`:247-315`) included, with no unhandled rejection reported.

- [ ] **Step 5: Commit and push**

```bash
git status --porcelain
git add lib/aeo-outbound/render.ts lib/aeo-outbound/render.frame.test.ts
git commit -m "Donut legend falls back to Plotly's flowing legend where two columns would overlap (spec C5)"
perl -e 'alarm 30; exec @ARGV' -- git push
```

---

### Task 5: Full checks, browser check, PR

**Files:** none changed unless a check fails.

- [ ] **Step 1: The CI commands, locally** (`make check`, `Makefile:17-21`, minus the build, which CI runs)

```bash
perl -e 'alarm 300; exec @ARGV' -- npm run typecheck
perl -e 'alarm 590; exec @ARGV' -- npm test
perl -e 'alarm 300; exec @ARGV' -- npm run check:rsc
perl -e 'alarm 120; exec @ARGV' -- npx eslint lib/aeo-outbound/charts.ts lib/aeo-outbound/render.ts lib/aeo-outbound/charts.test.ts lib/aeo-outbound/render.test.ts lib/aeo-outbound/render.frame.test.ts lib/aeo-outbound/v1-compat.test.ts
```

Expected: each passes. Keep the raw final lines for the PR.

- [ ] **Step 2: Open the draft PR against `dev`**, titled "AEO Outbound: chart fixes from Ryan's round 3 → dev". The body says what changed and why, lists the deliberate differences from AIVx's charts (black bar plot area, 8px top margin, two legend columns, 24px donut sides), notes that approved reports never change, links the spec, review log and trial, and pastes the Step 1 output.

- [ ] **Step 3: Browser check** on the PR's Vercel preview if it opens the tool, otherwise on staging after promotion (say which). Read only, nothing saved. At 1440, 1105, 1000 and 375px wide: the bar plot starts at most 8px below the figure top, directly under the title; its plot area is black; the donut legend is two columns with no overlap, or flowing where two do not fit. Also a draft with several slices under 5% at 1105px and 375px, and a custom-name draft at 1105px if one exists (spec §8a, m8). Screenshot the bar and donut at 1105px for the PR.
