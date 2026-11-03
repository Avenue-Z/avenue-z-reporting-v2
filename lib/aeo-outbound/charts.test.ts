import { expect, test } from 'vitest'
import goldens from './__fixtures__/aivx-goldens.json'
import { embedFigure, sliceLabel, sourceDonutFigure, visibilityBarFigure, type Figure } from './charts'
import { pyRound } from './metrics'

type Case = { input: Record<string, unknown>; figure: Figure; wrapperHeight: number }
const C = goldens.cases as unknown as Record<string, Case>
const plain = (x: unknown) => JSON.parse(JSON.stringify(x))

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
for (const name of ['sources_8_types', 'sources_3_types']) {
  test(`${name}: identical to AIVx's content-source donut except the whole-number labels, their hover, the shares in the legend with ring labels from 5% and never outside, two legend columns and 24px sides`, () => {
    const eb = C[name].input.earned_breakdown as Record<string, { count: number }>
    const total = Object.values(eb).reduce((s, v) => s + v.count, 0)
    const mix = Object.entries(eb).map(([label, v]) => ({ label, weight: v.count, pct: pyRound((v.count / total) * 100, 1) }))
    const ours = plain(sourceDonutFigure(mix))
    const gold = plain(C[name].figure)
    // Deliberate differences from AIVx (2026-10-19, Ryan): whole-number labels from the stored pct, and a hover that
    // reads the label, since a usage-rate weight is not a count.
    expect(ours.data[0].textinfo).toBe('text')
    expect(ours.data[0].text).toEqual(mix.map((m) => sliceLabel((m.weight / total) * 100)))
    expect(ours.data[0].hovertemplate).toBe('<b>%{customdata}</b><br>%{text}<extra></extra>')
    expect(gold.data[0].textinfo).toBe('percent')
    // 2026-11-03: each legend entry carries its share and the hover reads the plain name; the ring labels slices from 5%
    // and never draws a label outside it (AIVx: auto, so small slices' labels went outside).
    expect(ours.data[0].labels).toEqual(gold.data[0].labels.map((l: string, i: number) => `${l} ${ours.data[0].text[i]}`))
    expect(ours.data[0].customdata).toEqual(gold.data[0].labels)
    expect(ours.data[0].texttemplate).toEqual(mix.map((m) => ((m.weight / total) * 100 >= 5 ? '%{text}' : '')))
    expect([ours.data[0].textposition, gold.data[0].textposition]).toEqual(['inside', 'auto'])
    // Round 3 (Ryan, 2026-10-21): two legend columns, appended after yanchor, and 24px sides so they fit. The grey
    // plot_bgcolor stays on the donut: only the bar chart's changed.
    expect(Object.keys(ours.layout.legend).slice(-4)).toEqual(['yanchor', 'entrywidth', 'entrywidthmode', 'maxheight'])
    expect(ours.layout.legend.entrywidth).toBe(0.5)
    expect(ours.layout.legend.entrywidthmode).toBe('fraction')
    expect(ours.layout.margin).toEqual({ l: 24, r: 24, t: 28, b: 64 })
    expect(gold.layout.margin).toEqual({ l: 90, r: 90, t: 28, b: 64 })
    expect(ours.layout.plot_bgcolor).toBe('#1a1a1a')
    // Paul, #410 review: a uirevision keeps the slices a viewer hid when the page redraws the legend (checked in Plotly 3.5.0).
    expect(ours.layout.uirevision).toBe('aeo-sources')
    expect(gold.layout.uirevision).toBeUndefined()
    for (const f of [ours, gold]) { for (const k of ['hovertemplate', 'textinfo', 'text', 'labels', 'textposition']) delete f.data[0][k]; delete f.layout.margin }
    delete ours.data[0].customdata
    delete ours.data[0].texttemplate
    delete ours.layout.uirevision
    delete ours.layout.legend.entrywidth
    delete ours.layout.legend.entrywidthmode
    delete ours.layout.legend.maxheight
    expect(ours).toEqual(gold)
  })
}
test('the embed is the AIVx wrapper, with the figure height on the outer div', () => {
  const html = embedFigure('aeo-chart-sources', sourceDonutFigure([{ label: 'A', weight: 1, pct: 100 }]))
  expect(html.startsWith('<div style="height:420px; width:100%;">')).toBe(true)
  expect(html).toContain('<div id="aeo-chart-sources" class="plotly-graph-div" style="height:100%; width:100%;"></div>')
  expect(html).toContain('Plotly.newPlot("aeo-chart-sources", ')
})
test('figure JSON cannot close the script and labels carry no tags', () => {
  const html = embedFigure('x', visibilityBarFigure([{ name: '</script><b>Evil</b> & "Co"', visibilityPct: 5 }]))
  expect(html).not.toContain('</script><b>')
  expect(html.match(/<\/script>/g)?.length).toBe(1)
  const fig = visibilityBarFigure([{ name: '<b>Bold</b>', visibilityPct: 5 }])
  expect((fig.data[0] as { y: string[] }).y).toEqual(['bBold/b'])
})

test('the own brand outside the top 10 replaces the tenth bar', () => {
  const brands = Array.from({ length: 12 }, (_, i) => ({ name: `Brand${i}`, visibilityPct: 60 - i, isOwn: i === 11 }))
  const y = (visibilityBarFigure(brands).data[0] as { y: string[] }).y
  expect(y).toHaveLength(10)
  expect(y[0]).toBe('Brand11')
  expect(y).not.toContain('Brand9')
  expect(y.at(-1)).toBe('Brand0')
})
test('an own brand already in the top 10 changes nothing', () => {
  const brands = Array.from({ length: 12 }, (_, i) => ({ name: `Brand${i}`, visibilityPct: 60 - i, isOwn: i === 3 }))
  expect(plain(visibilityBarFigure(brands))).toEqual(plain(visibilityBarFigure(brands.map(({ isOwn: _o, ...b }) => b))))
})

test('a version 1 row with the own brand ranked 12th gets it as the 10th bar, exactly 10 bars', () => {
  // The call render.ts makes for every row, version 1 included: visibilityBarFigure(data.brands).
  const v1 = { brands: Array.from({ length: 12 }, (_, i) => ({ id: `b${i}`, name: `Brand${i}`, isOwn: i === 11, visibilityPct: 60 - i, sovPct: null, position: null, rank: i + 1 })) }
  const y = (visibilityBarFigure(v1.brands).data[0] as { y: string[] }).y
  expect(y).toHaveLength(10)
  expect(y[0]).toBe('Brand11')
  expect(y.filter((n) => n === 'Brand11')).toHaveLength(1)
})

test('2026-10-19 (Ryan), amended 2026-10-20: a slice reads the whole number of its exact share, as Peec and the source-mix sentence do', () => {
  // 2026-10-20 amendment: the whole number of the exact share, as Peec shows it. An exact 24.4636 (stored 24.5) reads 24%.
  expect(sliceLabel(24.4636)).toBe('24%')
  expect(sliceLabel(18.46)).toBe('18%')
  expect(sliceLabel(18.5)).toBe('19%')
  expect(sliceLabel(37.4)).toBe('37%')
  expect(sliceLabel(99.4)).toBe('99%')
  expect(sliceLabel(0.5)).toBe('1%')
  // A stored slice always has a positive weight, so 0 reads "<1%", never "0%".
  expect(sliceLabel(0)).toBe('<1%')
  expect(sliceLabel(0.4)).toBe('<1%')
  // The sentence never prints 100 for a value under 100 (sentences.ts pctText), so the chart reads ">99%"; a stored 100.0 reads 100%, as the sentence does.
  expect(sliceLabel(99.6)).toBe('>99%')
  expect(sliceLabel(100)).toBe('100%')
})

test('2026-10-19 (Ryan): the donut labels each slice with sliceLabel, not Plotly percents', () => {
  const fig = sourceDonutFigure([{ label: 'Corporate', weight: 0.9, pct: 69.2 }, { label: 'Competitor', weight: 0.4, pct: 30.8 }])
  const t = plain(fig).data[0]
  expect([t.textinfo, t.text, t.hovertemplate]).toEqual(['text', ['69%', '31%'], '<b>%{customdata}</b><br>%{text}<extra></extra>'])
})

test('2026-11-03: no slice label is drawn outside the ring, so none can land on the legend or on another label', () => {
  // A Place for Mom's mix on 2026-11-03 (citation_count): on desktop its 3%, 1% and 1% labels sat on the legend and on each other.
  const mix = [['Institutional', 7450], ['Corporate', 5564], ['UGC', 877], ['Reference', 876], ['You', 731], ['Editorial', 486], ['Other', 155], ['Competitor', 148]]
    .map(([label, weight]) => ({ label: label as string, weight: weight as number, pct: 0 }))
  const t = plain(sourceDonutFigure(mix)).data[0]
  expect(t.textposition).toBe('inside')
  // Every slice keeps its share in the legend, so a slice too thin to label still shows it; You reads as Citation volume does.
  expect(t.labels).toEqual(['Institutional 46%', 'Corporate 34%', 'UGC 5%', 'Reference 5%', 'You 4%', 'Editorial 3%', 'Other 1%', 'Competitor 1%'])
  expect(t.labels[4]).toBe(`You ${sliceLabel((731 / 16287) * 100)}`)
  // The ring labels slices from 5% of the total, as the phone donut always has.
  expect(t.texttemplate).toEqual(['%{text}', '%{text}', '%{text}', '%{text}', '', '', '', ''])
  // The hover names the slice without the share the legend adds, then the share once.
  expect(t.customdata).toEqual(['Institutional', 'Corporate', 'UGC', 'Reference', 'You', 'Editorial', 'Other', 'Competitor'])
  expect(t.hovertemplate).toBe('<b>%{customdata}</b><br>%{text}<extra></extra>')
})

test('2026-11-03: the legend is never cut to half the chart and scrolled; the page grows the chart for it instead (render.ts)', () => {
  const legend = plain(sourceDonutFigure([{ label: 'A', weight: 1, pct: 100 }])).layout.legend
  expect(legend.maxheight).toBeGreaterThanOrEqual(10000)
})

test('2026-11-03: the ring label starts at exactly 5% of the total', () => {
  const at = (w: number) => plain(sourceDonutFigure([{ label: 'A', weight: w, pct: 0 }, { label: 'B', weight: 10000 - w, pct: 0 }])).data[0].texttemplate[0]
  expect(at(500)).toBe('%{text}')
  expect(at(499)).toBe('')
})

test('2026-10-20 amendment: the donut labels each slice from its exact share, so a stored 24.5 from an exact 24.46 reads 24%', () => {
  const t = plain(sourceDonutFigure([{ label: 'Institutional', weight: 7554, pct: 75.5 }, { label: 'Corporate', weight: 2446, pct: 24.5 }])).data[0]
  expect(t.text).toEqual(['76%', '24%'])
})
