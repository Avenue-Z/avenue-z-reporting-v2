// The snapshot page in the AIVx design (spec §5). Head and body structure follow aivx-reports@ff18697
// agent/renderer.py:2530-2556; blocks follow its builders. Every string is escaped; Peec text in figures
// is stripped of < and >.
import { DECISIONS } from './config'
import { AIVX_CSS } from './aivx/css'
import { AIVX_JS } from './aivx/js'
import { AIVX_FAVICON_TAG } from './aivx/favicon'
import { AIVX_SHARE_BLOCK } from './aivx/share'
import { embedFigure, sourceDonutFigure, visibilityBarFigure } from './charts'
import { esc } from './html'
import type { SnapshotData } from './metrics'
import type { Slots } from './slots'

export type RenderMode = 'draft' | 'preview' | 'final'
const UL = '<ul style="margin-top:10px;padding-left:20px;display:flex;flex-direction:column;gap:4px">' // renderer.py:2313

const EDITOR_STYLE = '<style>[data-slot]{outline:1px dashed transparent;outline-offset:2px;cursor:text}[data-slot]:hover,[data-slot]:focus{outline-color:rgba(255,255,255,0.35)}</style>'
const EDITOR_SCRIPT = "<script>(function(){var t={},els={};function send(p){clearTimeout(t[p]);delete t[p];parent.postMessage({type:'edit',path:p,value:els[p].textContent||''},'*')}window.addEventListener('message',function(e){if(e.source===parent&&e.data&&e.data.type==='flush'){Object.keys(t).forEach(send)}});document.querySelectorAll('[data-slot]').forEach(function(el){var p=el.getAttribute('data-slot');els[p]=el;el.addEventListener('input',function(){parent.postMessage({type:'dirty',path:p},'*');clearTimeout(t[p]);t[p]=setTimeout(function(){send(p)},800)});el.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();el.blur()}});el.addEventListener('paste',function(e){e.preventDefault();var s=(e.clipboardData||window.clipboardData).getData('text/plain');document.execCommand('insertText',false,s)})})})();</script>"

export function renderSnapshotHtml(data: SnapshotData, slots: Slots, mode: RenderMode, preparedOn: string): string {
  const draft = mode === 'draft'
  /** A slot's text, escaped, inside its element; editable only in draft. */
  const slot = (tag: string, path: string, value: string, cls = '', html?: string) =>
    `<${tag}${cls ? ` class="${cls}"` : ''}${draft ? ` data-slot="${path}" contenteditable="plaintext-only"` : ''}>${html ?? esc(value)}</${tag}>`
  const bullets = (key: 'competitive_bullets' | 'sources_bullets') =>
    UL + slots[key].map((b, i) => `<li><strong>${slot('span', `${key}.${i}.lead`, b.lead)}</strong> ${slot('span', `${key}.${i}.text`, b.text)}</li>`).join('') + '</ul>'

  const names = data.brands.map((b) => b.name).filter(Boolean).sort((a, b) => b.length - a.length)
  /** Bold exact roster names in the raw text (whole words only), escaping every piece. */
  const bolded = (text: string) => {
    if (!names.length) return esc(text)
    const alt = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
    const re = new RegExp(`(?<![A-Za-z0-9])(?:${alt})(?![A-Za-z0-9])`, 'g')
    let out = ''
    let last = 0
    for (const m of text.matchAll(re)) {
      out += esc(text.slice(last, m.index)) + `<strong>${esc(m[0])}</strong>`
      last = m.index! + m[0].length
    }
    return out + esc(text.slice(last))
  }

  const isLong = data.brand.length > 24 // renderer.py:1439-1458
  const kpiCards = data.kpis.map((k) => `<div class="kpi-card"><div class="kpi-label">${esc(k.label)}</div><div class="kpi-value">${esc(k.value)}</div></div>`).join('')
  const kpiStrip = data.kpis.length === 4 ? '<div class="kpi-strip">' : `<div class="kpi-strip" style="grid-template-columns:repeat(${data.kpis.length}, 1fr)">`
  const [t1, t2] = DECISIONS.sectionTitles
  const brand = esc(data.brand)

  const sidebar = `
<nav class="sidebar">
  <div class="sidebar-logo">
    <div class="aivx-brand">${DECISIONS.showAivxName ? 'AIVx' : 'Avenue Z'}</div>
    <div class="powered">Powered by Avenue Z</div>
  </div>
  <div class="sidebar-industry">
    AI Visibility Snapshot
    <span>${brand}</span>
  </div>
  <nav class="sidebar-nav">
    <a href="#headline"><span class="nav-num">01</span> Headline signal</a>
    <a href="#category-data"><span class="nav-num">02</span> ${esc(t1)}</a>
    <a href="#competitive-visibility"><span class="nav-num">03</span> ${esc(t2)}</a>
    <a href="#opportunities"><span class="nav-num">04</span> Opportunities</a>
    <a href="#methodology"><span class="nav-num">05</span> Methodology</a>
  </nav>
  <div class="sidebar-footer">${mode === 'final' ? `
    <button class="share-btn" type="button" aria-label="Copy shareable link to this report">
      <svg viewBox="0 0 24 24" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
        <polyline points="16 6 12 2 8 6"/>
        <line x1="12" y1="2" x2="12" y2="15"/>
      </svg>
      <span class="share-btn-label">Share Report</span>
    </button>` : ''}
    <a href="https://avenuez.com" target="_blank" rel="noopener">avenuez.com ↗</a>
  </div>
</nav>`

  const main = `
<header class="hero">
  <div class="hero-series">AI Visibility Snapshot</div>
  <h1 class="hero-industry"${isLong ? ' style="font-size:72px"' : ''}><span class="grad-text">${brand}</span></h1>
  <div class="hero-subtitle">Category: ${slot('span', 'category', slots.category)} &nbsp;·&nbsp; Market: ${slot('span', 'market', slots.market)} &nbsp;·&nbsp; Data window: ${esc(data.windowLabel)}</div>
  <div class="hero-meta">
  </div>
</header>
<section id="headline" class="exec-summary">
  <div class="exec-label">Headline signal</div>
  ${slot('div', 'headline', slots.headline, 'exec-headline')}
  ${slot('div', 'summary', slots.summary, 'exec-subheadline')}
</section>
<section class="section">
  ${kpiStrip}${kpiCards}</div>
  ${data.competitorsTracked > 0 ? slot('div', 'context', slots.context, 'insight-box', bolded(slots.context)) : ''}
</section>
<section id="category-data" class="section">
  <div class="section-label">02 / ${esc(t1)}</div>
  <h2 class="section-title">${esc(t1)}</h2>
  <div class="two-col" style="margin-top:16px;align-items:stretch">
    <div><div class="insight-box">${bullets('competitive_bullets')}</div></div>
    <div><div class="chart-wrap"><div class="chart-title">Domain Types</div>${embedFigure('aeo-chart-sources', sourceDonutFigure(data.sourceMix))}</div></div>
  </div>
</section>
<section id="competitive-visibility" class="section">
  <div class="section-label">03 / ${esc(t2)}</div>
  <h2 class="section-title">${esc(t2)}</h2>
  <div class="two-col" style="margin-top:16px;align-items:stretch">
    <div><div class="insight-box">${bullets('sources_bullets')}</div></div>
    <div><div class="chart-wrap"><div class="chart-title">Competitive Visibility</div>${embedFigure('aeo-chart-visibility', visibilityBarFigure(data.brands))}</div></div>
  </div>
</section>
<section class="section">
  <div class="rec-global-bottom-line">
    <div style="font-size:18px;font-weight:900;color:var(--white);margin-bottom:12px">Why it matters</div>
    ${slot('p', 'why', slots.why).replace('<p', '<p style="font-size:15px;color:rgba(255,255,255,0.75);line-height:1.75;margin:0"')}
  </div>
</section>
<section id="opportunities" class="section">
  <div class="section-label">04 / Opportunities</div>
  <h2 class="section-title">Three opportunities to explore</h2>
  <div class="leaderboard-wrap">
    <table class="leaderboard">
      <thead><tr><th>Signal</th><th>Opportunity to explore</th><th>Likely workstream</th></tr></thead>
      <tbody>${slots.opportunities.map((o, i) => `<tr>${slot('td', `opportunities.${i}.signal`, o.signal)}${slot('td', `opportunities.${i}.opportunity`, o.opportunity)}${slot('td', `opportunities.${i}.workstream`, o.workstream)}</tr>`).join('')}</tbody>
    </table>
  </div>
  <p class="chart-takeaway">These are opportunity hypotheses for discussion, not a full roadmap.</p>
</section>
<section id="methodology" class="section">
  <div class="method-note"><strong>Methodology:</strong> ${slot('span', 'methodology', slots.methodology)} <strong>Next step:</strong> ${slot('span', 'next_step', slots.next_step)}</div>
</section>
<footer class="footer">
  <div class="footer-grad-line"></div>
  <div class="footer-content">
    <div class="footer-brand">
      <div class="avz-name">Avenue Z</div>
      <p class="footer-desc">
        Avenue Z is a digital marketing and PR agency specializing in AI visibility
        and Answer Engine Optimization (AEO). We help brands earn citation authority
        with AI models through earned media, content strategy, and technical optimization.
      </p>
      <a class="footer-link" href="https://avenuez.com" target="_blank" rel="noopener">
        avenuez.com ↗
      </a>
    </div>
    <div>
      <p style="font-size:12px;color:var(--muted);font-weight:700;margin-bottom:6px">
        AI VISIBILITY SNAPSHOT
      </p>
      <p style="font-size:13px;color:rgba(255,255,255,0.5)">
        ${brand}<br>Prepared ${esc(preparedOn)}
      </p>
    </div>
  </div>
  <p class="footer-disclaimer">
    Data reflects a Peec AI visibility snapshot for the stated window and is directional.
    Avenue Z makes no representations about future AI visibility outcomes.
  </p>
</footer>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${AIVX_FAVICON_TAG}
  <title>AI Visibility Snapshot: ${brand} | Avenue Z</title>
  <script src="https://cdn.plot.ly/plotly-3.5.0.min.js" charset="utf-8" integrity="sha384-DPvk2KODrsA0CfBr4HTwAwhdDROPqqK2PvSSswJMQMpnUkwSTg4gLBxXc3wv2e5L" crossorigin="anonymous"></script>
  <meta name="description" content="AI Visibility Snapshot for ${brand}. Powered by Avenue Z AEO Intelligence.">
  <meta name="robots" content="noindex,nofollow">
  <style>${AIVX_CSS}</style>${draft ? EDITOR_STYLE : ''}
</head>
<body>
  ${sidebar}
  <div class="main">
    ${main}
  </div>
  <script>${AIVX_JS}</script>${mode === 'final' ? `\n${AIVX_SHARE_BLOCK}` : ''}${draft ? EDITOR_SCRIPT : ''}
</body>
</html>`
}
