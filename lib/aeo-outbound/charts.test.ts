import { expect, test } from 'vitest'
import goldens from './__fixtures__/aivx-goldens.json'
import { embedFigure, sourceDonutFigure, visibilityBarFigure, type Figure } from './charts'

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
  test(`${name}: identical to AIVx's content-source donut`, () => {
    const eb = C[name].input.earned_breakdown as Record<string, { count: number }>
    const ours = sourceDonutFigure(Object.entries(eb).map(([label, v]) => ({ label, weight: v.count })))
    expect(plain(ours)).toEqual(plain(C[name].figure))
  })
}
test('the embed is the AIVx wrapper, with the figure height on the outer div', () => {
  const html = embedFigure('aeo-chart-sources', sourceDonutFigure([{ label: 'A', weight: 1 }]))
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
