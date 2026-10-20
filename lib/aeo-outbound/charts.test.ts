import { expect, test } from 'vitest'
import goldens from './__fixtures__/aivx-goldens.json'
import { embedFigure, sliceLabel, sourceDonutFigure, visibilityBarFigure, type Figure } from './charts'
import { pyRound } from './metrics'

type Case = { input: Record<string, unknown>; figure: Figure; wrapperHeight: number }
const C = goldens.cases as unknown as Record<string, Case>
const plain = (x: unknown) => JSON.parse(JSON.stringify(x))

for (const name of ['visibility_bar_12', 'visibility_bar_4']) {
  test(`${name}: identical to AIVx's bar except the visibility hover, % labels and unclipped labels`, () => {
    const lb = (C[name].input.leaderboard as { brand: string; citation_count: number }[])
    const ours = plain(visibilityBarFigure(lb.map((b) => ({ name: b.brand, visibilityPct: b.citation_count }))))
    const gold = plain(C[name].figure)
    expect(ours.data[0].hovertemplate).toBe('<b>%{y}</b><br>Visibility: %{x}%<extra></extra>')
    expect(ours.data[0].text).toEqual(ours.data[0].x.map((v: number) => `${v.toFixed(1)}%`))
    expect(ours.data[0].cliponaxis).toBe(false)
    for (const f of [ours, gold]) { delete f.data[0].hovertemplate; delete f.data[0].text; delete f.data[0].cliponaxis }
    expect(ours).toEqual(gold)
  })
}
for (const name of ['sources_8_types', 'sources_3_types']) {
  test(`${name}: identical to AIVx's content-source donut except the whole-number labels and their hover`, () => {
    const eb = C[name].input.earned_breakdown as Record<string, { count: number }>
    const total = Object.values(eb).reduce((s, v) => s + v.count, 0)
    const mix = Object.entries(eb).map(([label, v]) => ({ label, weight: v.count, pct: pyRound((v.count / total) * 100, 1) }))
    const ours = plain(sourceDonutFigure(mix))
    const gold = plain(C[name].figure)
    // Deliberate differences from AIVx (2026-10-19, Ryan): whole-number labels from the stored pct, and a hover that
    // reads the label, since a usage-rate weight is not a count.
    expect(ours.data[0].textinfo).toBe('text')
    expect(ours.data[0].text).toEqual(mix.map((m) => sliceLabel(m.pct)))
    expect(ours.data[0].hovertemplate).toBe('<b>%{label}</b><br>%{text}<extra></extra>')
    expect(gold.data[0].textinfo).toBe('percent')
    for (const f of [ours, gold]) { delete f.data[0].hovertemplate; delete f.data[0].textinfo; delete f.data[0].text }
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

test('2026-10-19 (Ryan): a slice reads the whole number of its stored pct, rounded as the source-mix sentence rounds it', () => {
  // 1846 of 10000 is an exact 18.46, stored as 18.5: the sentence prints 19%, so the chart does too.
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
  expect([t.textinfo, t.text, t.hovertemplate]).toEqual(['text', ['69%', '31%'], '<b>%{label}</b><br>%{text}<extra></extra>'])
})
