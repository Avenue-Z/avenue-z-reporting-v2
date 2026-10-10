// Plotly figures built exactly like AIVx's builders (aivx-reports@ff18697 agent/agent.py): the brand
// visibility bars use build_leaderboard_chart's styling (:2634-2694) and the source mix uses
// build_earned_breakdown_chart (:2721-2763). Golden fixtures prove the JSON matches.
import { AIVX_PLOTLY_TEMPLATE } from './aivx/plotly-template'
import { jsonForScript, stripTags } from './html'
import { pyRound } from './metrics'

export interface Figure { data: unknown[]; layout: Record<string, unknown>; config: Record<string, unknown> }

const BRAND_COLORS = ['#6034FF', '#39A0FF', '#60FFEA', '#60FF80', '#FFFC60', '#808080'] // agent.py:32
const CITATION_BAR_COLORS = ['#6034FF', '#39A0FF', '#60FFEA', '#60FF80', '#FFFC60', '#D14BFF', '#12D9A8', '#BFFF3D', '#FF9A3D', '#FF5C9D', '#808080'] // agent.py:39-44
const PLOTLY_BASE = { // agent.py:46-55
  paper_bgcolor: '#000000',
  plot_bgcolor: '#1a1a1a',
  font: { family: 'Avenir, sans-serif', color: '#FFFFFF', size: 13 },
  hoverlabel: { bgcolor: '#272727', bordercolor: 'rgba(255,255,255,0.1)', font: { family: 'Avenir', color: '#FFFFFF', size: 13 } },
}
const CONFIG = { displayModeBar: false, responsive: true }

/** agent.py:2490-2500 */
function contrastTextColors(hex: string[]): string[] {
  return hex.map((h) => {
    const s = h.replace('#', '')
    const r = parseInt(s.slice(0, 2), 16), g = parseInt(s.slice(2, 4), 16), b = parseInt(s.slice(4, 6), 16)
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? '#000000' : '#FFFFFF'
  })
}
/** agent.py:2696-2718. Python's round() is ties-to-even, so this uses pyRound, not Math.round (golden: #74BCFF). */
function cycledDonutPalette(n: number): string[] {
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    const base = BRAND_COLORS[i % BRAND_COLORS.length]
    const cycle = Math.floor(i / BRAND_COLORS.length)
    if (cycle === 0) { out.push(base); continue }
    const f = Math.min(0.3 * cycle, 0.9)
    const ch = [1, 3, 5].map((k) => parseInt(base.slice(k, k + 2), 16))
    out.push('#' + ch.map((c) => pyRound(c + (255 - c) * f, 0).toString(16).toUpperCase().padStart(2, '0')).join(''))
  }
  return out
}
/** agent.py:2477-2487 */
const donutLegend = () => ({ orientation: 'h', font: { family: 'Avenir', color: '#FFFFFF', size: 12 }, bgcolor: 'rgba(0,0,0,0)', borderwidth: 0, x: 0.5, y: -0.06, xanchor: 'center', yanchor: 'top' })

export function visibilityBarFigure(brands: { name: string; visibilityPct: number }[]): Figure {
  const top10 = [...brands.slice(0, 20)].sort((a, b) => b.visibilityPct - a.visibilityPct).slice(0, 10)
  const rev = [...top10].reverse()
  const n = rev.length
  const x = rev.map((b) => b.visibilityPct)
  return {
    data: [{
      type: 'bar', orientation: 'h', x, y: rev.map((b) => stripTags(b.name)),
      marker: { color: rev.map((_, i) => CITATION_BAR_COLORS[Math.min(n - 1 - i, CITATION_BAR_COLORS.length - 1)]), line: { color: 'rgba(0,0,0,0)', width: 0 } },
      hovertemplate: '<b>%{y}</b><br>Visibility: %{x}%<extra></extra>',
      text: x.map((v) => `${v.toFixed(1)}%`),
      textposition: 'outside',
      cliponaxis: false, // the % labels are wider than AIVx's counts and would be clipped at the plot edge
      textfont: { color: '#A6A6A6', size: 11 },
    }],
    layout: {
      template: AIVX_PLOTLY_TEMPLATE, ...PLOTLY_BASE,
      height: Math.max(420, top10.length * 38),
      xaxis: { title: { text: '' }, gridcolor: 'rgba(255,255,255,0.06)', showgrid: true, zeroline: false, tickfont: { color: '#A6A6A6', size: 11 } },
      yaxis: { title: { text: '' }, showgrid: false, tickfont: { color: '#FFFFFF', size: 12, family: 'Avenir' } },
      bargap: 0.38,
    },
    config: CONFIG,
  }
}

export function sourceDonutFigure(mix: { label: string; weight: number }[]): Figure {
  const colors = cycledDonutPalette(mix.length)
  return {
    data: [{
      type: 'pie', labels: mix.map((m) => stripTags(m.label)), values: mix.map((m) => m.weight), hole: 0.6,
      marker: { colors, line: { color: '#000000', width: 3 } },
      textinfo: 'percent', textposition: 'auto', insidetextorientation: 'horizontal',
      insidetextfont: { family: 'Avenir', size: 14, color: contrastTextColors(colors) },
      outsidetextfont: { family: 'Avenir', size: 14, color: '#FFFFFF' },
      hovertemplate: '<b>%{label}</b><br>Citations: %{value}<extra></extra>',
    }],
    layout: { template: AIVX_PLOTLY_TEMPLATE, ...PLOTLY_BASE, showlegend: true, legend: donutLegend(), height: 420, margin: { l: 90, r: 90, t: 28, b: 64 } },
    config: CONFIG,
  }
}

/** The wrapper plotly 6.8+ emits (golden html), with the figure height on the outer div. */
export function embedFigure(id: string, fig: Figure): string {
  const h = Number(fig.layout.height ?? 420)
  return `<div style="height:${h}px; width:100%;"><div id="${id}" class="plotly-graph-div" style="height:100%; width:100%;"></div><script>window.PLOTLYENV=window.PLOTLYENV || {};if (document.getElementById("${id}")) {Plotly.newPlot("${id}", ${jsonForScript(fig.data)}, ${jsonForScript(fig.layout)}, ${jsonForScript(fig.config)})};</script></div>`
}
