// The snapshot page in the AIVx design (spec §5; v1.1 §2, §3, §9). Head and body structure follow aivx-reports@ff18697
// agent/renderer.py:2530-2556; blocks follow its builders. Every string is escaped; Peec text in figures is stripped of
// < and >. In draft every visible word carries data-slot (editable), data-mirror (a copy of a slot, edited where it first
// appears) or data-locked (a chart, or fixed by design). Preview and final carry none of that editing markup. Every mode
// carries PAGE_CSS, PAGE_JS and data-label (phones and the menu links, v1.1 §17). No mode carries a Share button (§17.11).
import { AIVX_CSS } from './aivx/css'
import { AIVX_JS } from './aivx/js'
import { AIVX_FAVICON_TAG } from './aivx/favicon'
import { embedFigure, sourceDonutFigure, visibilityBarFigure } from './charts'
import { esc } from './html'
import type { SnapshotData } from './metrics'
import { MAX_BULLETS, MIN_BULLETS, withDefaults, type Slots } from './slots'

export type RenderMode = 'draft' | 'preview' | 'final'
const UL = '<ul style="margin-top:10px;padding-left:20px;display:flex;flex-direction:column;gap:4px">' // renderer.py:2313

/** Draft only. Outlines and the Edit chip show only in edit mode (html.aeo-edit, set by the frame script). The chip is
 *  CSS ::after, so no element is added inside a slot and textContent stays exactly what Ryan typed (v1.1 §2). */
export const EDITOR_STYLE = '<style>' + [
  'html.aeo-edit [data-slot],html.aeo-edit [data-mirror-edit]{outline:1px dashed rgba(255,255,255,0.35);outline-offset:2px;cursor:text}',
  'html.aeo-edit [data-slot]:hover,html.aeo-edit [data-slot]:focus,html.aeo-edit [data-mirror-edit]:hover,html.aeo-edit [data-mirror-edit]:focus{outline:2px solid #60FFEA;position:relative}',
  'html.aeo-edit [data-slot]:hover::after,html.aeo-edit [data-slot]:focus::after,html.aeo-edit [data-mirror-edit]:hover::after,html.aeo-edit [data-mirror-edit]:focus::after{content:"Edit";position:absolute;top:-18px;right:0;padding:3px 5px;border-radius:3px;background:#60FFEA;color:#000;-webkit-text-fill-color:#000;font:700 10px/1 Avenir,sans-serif;letter-spacing:0.06em;text-transform:uppercase;pointer-events:none;z-index:5}',
  'html.aeo-edit [data-mirror-edit]:empty{display:inline-block;min-width:2em}',
  'html.aeo-edit [data-mirror]:not([data-mirror-edit]),html.aeo-edit [data-locked]{cursor:not-allowed}',
  '.aeo-flash{outline:2px solid #FFFC60!important}',
  // AIVx styles .sidebar-industry span as a block; the wrapper spans must stay inline text (v1.1 §3, round-2 MINOR 1).
  'span.aeo-w,.sidebar-industry span.aeo-w{display:inline;font:inherit;color:inherit;letter-spacing:inherit;text-transform:inherit;margin:0}',
  'th[data-slot]{user-select:text;-webkit-user-select:text}',
  '.aeo-ctl{display:none}',
  'html.aeo-edit .aeo-ctl{display:inline-block;margin:8px 0 0 6px;padding:2px 8px;border:1px solid rgba(96,255,234,0.45);border-radius:4px;background:transparent;color:#60FFEA;font:600 11px Avenir,sans-serif;cursor:pointer}',
].join('') + '</style>'

/**
 * The draft frame's script (v1.1 §2). One delegated listener per event on document, so a node cloned or re-rendered
 * after it ran keeps working. Slots become contenteditable only in edit mode, plaintext-only where supported, else true
 * with plain-text paste. In edit mode, clicks inside links and the sidebar nav never navigate; a click on a chart, a
 * fixed word or a mirror copy posts locked, except the four menu copies (data-mirror-edit, §17.16), which are editable
 * like slots and keep their section heading in sync. In Preview it posts only ready and its scroll position, at most
 * every 200 ms and scrolls to a position the parent sends, so a reload after a bullet change opens where Ryan was (v1.1 §19.7).
 */
export const FRAME_SCRIPT_JS = String.raw`(function(){
var t={},edit=false;
var PLAIN=(function(){var d=document.createElement('div');try{d.contentEditable='plaintext-only'}catch(e){return false}return d.contentEditable==='plaintext-only'})();
function post(m){parent.postMessage(m,'*')}
function within(n,s){return n&&n.closest?n.closest(s):null}
function slotEl(p){var a=document.querySelectorAll('[data-slot]');for(var i=0;i<a.length;i++){if(a[i].getAttribute('data-slot')===p)return a[i]}return null}
function clean(s){return s.replace(/[\x00-\x1f\x7f]/g,' ').replace(/\s+/g,' ').trim()}
function mirror(p,v,skip){var a=document.querySelectorAll('[data-mirror]');for(var i=0;i<a.length;i++){if(a[i].getAttribute('data-mirror')===p&&a[i]!==skip&&a[i]!==document.activeElement)a[i].textContent=a[i].hasAttribute('data-upper')?v.toUpperCase():v}}
function syncMenu(p,v,skip){var a=document.querySelectorAll('[data-mirror-edit]');for(var i=0;i<a.length;i++){if(a[i].getAttribute('data-mirror')===p&&a[i]!==skip&&a[i]!==document.activeElement)a[i].textContent=a[i].hasAttribute('data-upper')?v.toUpperCase():v}}
function send(p){clearTimeout(t[p]);delete t[p];var el=slotEl(p);if(!el)return;var v=el.textContent||'';post({type:'edit',path:p,value:v});var c=clean(v);if(c)mirror(p,c)}
function flush(){Object.keys(t).forEach(send)}
function setMode(on){edit=on===true;document.documentElement.classList.toggle('aeo-edit',edit);var a=document.querySelectorAll('[data-slot],[data-mirror-edit]');for(var i=0;i<a.length;i++){if(edit)a[i].setAttribute('contenteditable',PLAIN?'plaintext-only':'true');else a[i].removeAttribute('contenteditable')}if(!edit)flush()}
window.addEventListener('message',function(e){if(e.source!==parent||!e.data||typeof e.data!=='object')return;var d=e.data;
if(d.type==='mode')setMode(d.edit);
else if(d.type==='flush')flush();
else if(d.type==='focus'&&typeof d.path==='string'){var el=slotEl(d.path);if(!el)return;if(el.scrollIntoView)el.scrollIntoView({block:'center'});if(el.focus)el.focus();el.classList.add('aeo-flash');setTimeout(function(){el.classList.remove('aeo-flash')},1200)}
else if(d.type==='scroll'&&typeof d.y==='number'&&d.y>=0&&window.scrollTo)window.scrollTo(0,d.y)});
var st=null;window.addEventListener('scroll',function(){if(st)return;st=setTimeout(function(){st=null;post({type:'scroll',y:Math.round(window.scrollY||0)})},200)},{passive:true});
document.addEventListener('input',function(e){var el=within(e.target,'[data-slot],[data-mirror-edit]');if(!el||!edit)return;var m=el.hasAttribute('data-mirror-edit');var p=el.getAttribute(m?'data-mirror':'data-slot');if(m){var v=el.textContent||'';var s=slotEl(p);if(s)s.textContent=v;mirror(p,v,el)}else syncMenu(p,el.textContent||'',el);post({type:'dirty',path:p});clearTimeout(t[p]);t[p]=setTimeout(function(){send(p)},800)});
document.addEventListener('keydown',function(e){var el=within(e.target,'[data-slot],[data-mirror-edit]');if(edit&&el&&e.key==='Enter'){e.preventDefault();if(el.blur)el.blur()}});
document.addEventListener('paste',function(e){var el=within(e.target,'[data-slot],[data-mirror-edit]');if(!el||!edit)return;e.preventDefault();var cd=e.clipboardData||window.clipboardData;var s=cd?cd.getData('text/plain'):'';if(document.execCommand)document.execCommand('insertText',false,s)});
document.addEventListener('drop',function(e){if(edit&&within(e.target,'[data-slot],[data-mirror-edit]'))e.preventDefault()});
document.addEventListener('click',function(e){if(!edit)return;var n=e.target;if(!n||!n.closest)return;
if(n.closest('a')||n.closest('.sidebar-nav'))e.preventDefault();
var c=n.closest('[data-structure]');if(c){e.preventDefault();flush();post({type:'structure',op:c.getAttribute('data-structure'),path:c.getAttribute('data-path')});return}
if(n.closest('[data-slot],[data-mirror-edit]'))return;
var m=n.closest('[data-mirror]');if(m){post({type:'locked',what:'fixed',path:m.getAttribute('data-mirror')});return}
var l=n.closest('[data-locked]');if(l)post({type:'locked',what:l.getAttribute('data-locked')})},true);
post({type:'ready'});
})();`
const FRAME_SCRIPT = `<script>${FRAME_SCRIPT_JS}</script>`

/** Removes AIVx's table sort (which strips text cells to digits) from the opportunities table, in every mode, by
 *  replacing the header with a listener-free clone. It runs after the AIVx script and before the frame script (v1.1 §9). */
export const HEADER_CLONE_JS = "(function(){var h=document.querySelector('.leaderboard thead');if(h&&h.parentNode)h.parentNode.replaceChild(h.cloneNode(true),h)})();"
const HEADER_CLONE = `<script>${HEADER_CLONE_JS}</script>`

/**
 * The share button that final pages carried before v1.1 §17.11, exactly as it was rendered (with its leading newline and
 * indent). No render emits it now. Exported so the editor's preview of a report approved before that change can remove
 * this exact string (app/api/aeo-outbound/reports/[id]/view/route.ts).
 */
export const SHARE_BUTTON = `
    <button class="share-btn" type="button" aria-label="Copy shareable link to this report">
      <svg viewBox="0 0 24 24" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
        <polyline points="16 6 12 2 8 6"/>
        <line x1="12" y1="2" x2="12" y2="15"/>
      </svg>
      <span class="share-btn-label">Share Report</span>
    </button>`

export const PAGE_CSS = [
  '.kpi-value.aeo-long{font-size:24px;line-height:1.15}',
  'html{color-scheme:dark}',
  '#category-data .two-col,#competitive-visibility .two-col{margin-bottom:0}',
  // Spec v1.1 18.12: both columns are flex columns, so the chart card grows with a tall findings box and the figure
  // below its title sits centred in it. The figures themselves are untouched.
  '#category-data .two-col>div,#competitive-visibility .two-col>div{display:flex;flex-direction:column}',
  '#category-data .chart-wrap,#competitive-visibility .chart-wrap{flex:1;display:flex;flex-direction:column}',
  '#category-data .chart-wrap>.chart-title~*,#competitive-visibility .chart-wrap>.chart-title~*{margin-top:auto;margin-bottom:auto}',
  '#category-data .insight-box,#competitive-visibility .insight-box{flex:1;margin:24px 0 0;display:flex;flex-direction:column;padding:28px 32px}',
  '#category-data .insight-box>.aeo-ctl,#competitive-visibility .insight-box>.aeo-ctl{align-self:flex-start}',
  '#category-data .insight-box ul,#competitive-visibility .insight-box ul{flex:1;justify-content:space-evenly;list-style:none}',
  '#category-data .insight-box li,#competitive-visibility .insight-box li{font-size:16px;line-height:1.6;padding:14px 0;border-bottom:1px solid rgba(255,255,255,0.08)}',
  '#category-data .insight-box li:last-child,#competitive-visibility .insight-box li:last-child{border-bottom:none}',
  '#category-data .insight-box li strong,#competitive-visibility .insight-box li strong{display:block;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:4px}',
  '#category-data .chart-wrap,#competitive-visibility .chart-wrap{margin-bottom:0}',
  '#methodology .method-note{background:none;border:none;border-radius:0;padding:0;margin-top:16px;max-width:none;font-style:normal;font-size:15px;line-height:1.75;color:rgba(255,255,255,0.75)}',
  '#methodology .method-note>div+div{margin-top:14px}',
  '#methodology .method-note strong{color:var(--white);font-weight:800;font-style:normal}',
  // Round 3 (Ryan, 2026-10-21): the pillar cards, one column on a phone; three from 901px (below).
  '.aeo-pillars{display:grid;grid-template-columns:1fr;gap:12px;margin-top:20px}',
  '.aeo-pillar{display:flex;flex-direction:column;padding:24px}',
  '.aeo-pillar-desc{font-size:14px;line-height:1.6;color:rgba(255,255,255,0.6);margin:10px 0 18px}',
  '.aeo-pillar-line{margin:auto 0 0;padding-top:16px;border-top:1px solid rgba(255,255,255,0.08);font-size:16px;line-height:1.5;font-weight:600;color:#fff}',
  '@media (max-width: 900px){',
  '.hero-industry{font-size:clamp(40px,11vw,64px)!important;line-height:1.1}',
  '.exec-summary{padding:40px 24px}',
  '.kpi-strip[data-kpis="3"]{grid-template-columns:repeat(2,1fr)!important}',
  '.leaderboard-wrap{overflow-x:visible;border:none;border-radius:0}',
  '.leaderboard thead{display:none}',
  '.leaderboard,.leaderboard tbody,.leaderboard tr,.leaderboard td{display:block;width:100%}',
  '.leaderboard tr{border:1px solid var(--border);border-radius:16px;margin-bottom:12px;padding:6px 0;background:rgba(255,255,255,0.02)}',
  '.leaderboard td{padding:8px 20px}',
  '.leaderboard td::before{content:attr(data-label);display:block;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:var(--muted);margin-bottom:4px}',
  '}',
  '@media (min-width: 901px){',
  '#opportunities .leaderboard-wrap{border:none;border-radius:0;overflow:visible;margin:24px -3px 0}',
  '#opportunities .leaderboard{table-layout:fixed;width:100%;font-size:15px;border-collapse:separate;border-spacing:3px}',
  '#opportunities .leaderboard thead tr,#opportunities .leaderboard tbody tr{border-bottom:none}',
  '#opportunities .leaderboard th{width:33.333%;background:rgba(96,255,234,0.08);color:#60FFEA;-webkit-text-fill-color:#60FFEA;box-shadow:inset 0 -2px 0 #60FFEA;font-size:14px;font-weight:800;letter-spacing:0;text-transform:none;padding:12px 16px;white-space:normal;cursor:default;vertical-align:bottom}',
  '#opportunities .leaderboard th:hover{color:#60FFEA}',
  '#opportunities .leaderboard td{padding:14px 16px;vertical-align:top;line-height:1.6;color:rgba(255,255,255,0.88);overflow-wrap:anywhere}',
  '#opportunities .leaderboard tbody tr:nth-child(odd) td{background:rgba(255,255,255,0.08)}',
  '#opportunities .leaderboard tbody tr:nth-child(even) td{background:rgba(255,255,255,0.035)}',
  '#opportunities .leaderboard tbody tr:hover{background:none}',
  '#opportunities .chart-takeaway{border-top:none;padding:16px 0 0;margin:0;color:rgba(255,255,255,0.6)}',
  '#opportunities .aeo-pillars{grid-template-columns:repeat(3,1fr);gap:16px;margin-top:24px}',
  '}',
].join('\n')

/** Every mode: the menu scrolls inside the report instead of loading the editor's address in the frame (v1.1 §17.1), and
 *  the phone donut shows each slice's own label (§17.2; since 2026-10-19 the figure's text, charts.ts sliceLabel, so
 *  phone, desktop and the source-mix sentence round a slice the same way), and the menu marks 05 at the bottom of the
 *  page, where AIVx's scroll-spy never reaches the short last section (§17.12). Registered before the frame script's
 *  listener, so it runs first. */
export const PAGE_JS = String.raw`(function(){
var nav=document.querySelectorAll('.sidebar-nav a[href^="#"]');
function setActive(h){for(var i=0;i<nav.length;i++){if(nav[i].getAttribute('href')===h)nav[i].classList.add('active');else nav[i].classList.remove('active')}}
function atBottom(){var d=document.documentElement;return window.innerHeight+window.scrollY>=d.scrollHeight-2}
function bottomRule(){if(nav.length&&atBottom())setActive(nav[nav.length-1].getAttribute('href'))}
window.addEventListener('scroll',bottomRule,{passive:true});
document.addEventListener('click',function(e){
var n=e.target;if(!n||!n.closest)return;
var a=n.closest('a[href^="#"]');
if(a){if(document.querySelector('[data-slot][contenteditable]'))return;var id=a.getAttribute('href').slice(1);var t=id&&document.getElementById(id);if(t){e.preventDefault();if(a.closest('.sidebar-nav'))setActive(a.getAttribute('href'));if(t.scrollIntoView)t.scrollIntoView({behavior:'smooth',block:'start'})}return}
},true);
var el=document.getElementById('aeo-chart-sources'),orig=null,restored=false;
function copy(x){return JSON.parse(JSON.stringify(x))}
function restore(){if(restored||!orig)return;restored=true;try{var p=window.Plotly.react(el,copy(orig.d),copy(orig.l));if(p&&p.catch)p.catch(function(){})}catch(err){}}
function draw(d,l){try{var p=window.Plotly.react(el,d,l);if(p&&p.catch)p.catch(restore)}catch(err){restore()}}
function apply(phone){if(!el||!window.Plotly||!orig)return;restored=false;if(!phone){draw(copy(orig.d),copy(orig.l));return}
var d=copy(orig.d),l=copy(orig.l),t=d[0];if(!t)return;var v=t.values||[],tx=t.text,total=0;if(!Array.isArray(tx)||tx.length!==v.length)return;for(var i=0;i<v.length;i++)total+=v[i];if(!total)return;var lab=t.labels||[];
t.customdata=lab.slice();t.texttemplate=v.map(function(x){return x/total>=0.05?'%{text}':''});t.labels=lab.map(function(x,i){return x+' '+tx[i]});
if(t.hovertemplate)t.hovertemplate=String(t.hovertemplate).replace('%{label}','%{customdata}');draw(d,l)}
function init(){if(!el||!window.Plotly||!el.data)return;orig={d:copy(el.data),l:copy(el.layout)};if(!window.matchMedia)return;var mq=window.matchMedia('(max-width: 900px)');if(mq.matches)apply(true);var on=function(ev){apply(ev.matches)};if(mq.addEventListener)mq.addEventListener('change',on);else if(mq.addListener)mq.addListener(on)}
if(document.readyState==='complete'){init();bottomRule()}else{window.addEventListener('load',init);window.addEventListener('load',bottomRule)}
})();`
const PAGE_SCRIPT = `<script>${PAGE_JS}</script>`

/** The phone Share block that final pages carried (immediately before the footer) before v1.1 §17.11. No render emits it
 *  now. Exported so the editor's preview of a report approved before that change can remove this exact string. */
export const SHARE_MOBILE = '<div class="aeo-share-mobile"><button class="aeo-share-mobile-btn" type="button" aria-label="Copy shareable link to this report">Share Report</button></div>'

/** The "Powered by Avenue Z" line shows only when the top-left name does not already contain "avenue z", trimmed, any case (spec v1.1 §17.5). */
export const showsPowered = (wordmark: string): boolean => !wordmark.trim().toLowerCase().includes('avenue z')

export function renderSnapshotHtml(data: SnapshotData, stored: Slots, mode: RenderMode, preparedOn: string): string {
  const draft = mode === 'draft'
  const s = withDefaults(stored, data)
  const p = s.page
  /** An attribute only in draft. */
  const attr = (name: string, value: string) => (draft ? ` ${name}="${esc(value)}"` : '')
  const fixedMark = attr('data-locked', 'fixed')
  /** One editable element: in draft the element itself carries data-slot. */
  const slot = (tag: string, path: string, value: string, cls = '', attrs = '', html?: string) =>
    `<${tag}${cls ? ` class="${cls}"` : ''}${attrs}${attr('data-slot', path)}>${html ?? esc(value)}</${tag}>`
  /** The same, with the content on its own line, as v1.0 laid out the footer text blocks. */
  const block = (tag: string, path: string, value: string, cls: string, attrs: string, indent: string) =>
    `<${tag}${cls ? ` class="${cls}"` : ''}${attrs}${attr('data-slot', path)}>\n${indent}  ${esc(value)}\n${indent}</${tag}>`
  /** Text that shares its element with other text: wrapped in draft only. */
  const wrap = (path: string, value: string) => (draft ? `<span class="aeo-w" data-slot="${esc(path)}">${esc(value)}</span>` : esc(value))
  /** A copy of a slot edited elsewhere: plain text with data-mirror in draft. The menu copies are also editable (data-mirror-edit, v1.1 §17.16). */
  const mirror = (path: string, value: string, upper = false, editable = false) => (draft ? `<span class="aeo-w" data-mirror="${esc(path)}"${upper ? ' data-upper' : ''}${editable ? ' data-mirror-edit' : ''}>${esc(value)}</span>` : esc(value))
  /** Fixed by design (v1.1 §3): numbering and the Prepared date. */
  const fixed = (text: string) => (draft ? `<span class="aeo-w" data-locked="fixed">${esc(text)}</span>` : esc(text))
  const bullets = (key: 'competitive_bullets' | 'sources_bullets') => {
    const list = s[key]
    const items = list.map((b, i) => `<li><strong>${slot('span', `${key}.${i}.lead`, b.lead)}</strong> ${slot('span', `${key}.${i}.text`, b.text)}${draft && list.length > MIN_BULLETS ? `<button type="button" class="aeo-ctl" data-structure="remove" data-path="${key}.${i}">Remove</button>` : ''}</li>`).join('')
    return UL + items + '</ul>' + (draft && list.length < MAX_BULLETS ? `<button type="button" class="aeo-ctl" data-structure="add" data-path="${key}">Add bullet</button>` : '')
  }

  // The brand slot is used everywhere the brand shows (v1.1 §3). Peec's own name is replaced only when Ryan changed it,
  // so a row he has not renamed renders exactly as before.
  const renamed = s.brand !== data.brand ? s.brand : null
  const shownBrands = renamed ? data.brands.map((b) => (b.isOwn ? { ...b, name: renamed } : b)) : data.brands
  const names = shownBrands.map((b) => b.name).filter(Boolean).sort((a, b) => b.length - a.length)
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

  /** The column word a stacked phone card shows above each cell (v1.1 §17.2). */
  const label = (word: string) => ` data-label="${esc(word)}"`
  const isLong = s.brand.length > 24 // renderer.py:1439-1458, read from the slot (v1.1 §3)
  const kpiCards = s.kpis.map((k, i) => `<div class="kpi-card">${slot('div', `kpis.${i}.label`, k.label, 'kpi-label')}${slot('div', `kpis.${i}.value`, k.value, k.value.trim().length > 7 ? 'kpi-value aeo-long' : 'kpi-value')}</div>`).join('')
  const kpiStrip = s.kpis.length === 4 ? '<div class="kpi-strip">' : `<div class="kpi-strip"${s.kpis.length === 3 ? ' data-kpis="3"' : ''} style="grid-template-columns:repeat(${s.kpis.length}, 1fr)">`
  const t1 = p.section_1_title
  const t2 = p.section_2_title
  const brand = esc(s.brand)
  const chartMark = attr('data-locked', 'chart')
  // Round 3 (Ryan, 2026-10-21): the Opportunities page can be turned off per report. Off, its menu item and section are
  // not written and Methodology moves up to 04; on, the section is written as before (the table, or the pillar cards on
  // a pillar row).
  const oppsShown = s.opportunities_page !== 'hidden'
  const methodNum = oppsShown ? '05' : '04'
  const oppsNav = oppsShown ? `\n    <a href="#opportunities"><span class="nav-num"${fixedMark}>04</span> ${mirror('page.opps_label', p.opps_label, false, true)}</a>` : ''
  // Round 3 (Ryan, 2026-10-21): a pillar row shows three cards (name, description, data line) in place of the table and
  // its footnote; a table row is byte-identical to before.
  const oppsBody = s.opportunities_layout === 'pillars'
    ? `<div class="aeo-pillars">${s.opportunities.map((o, i) => `<div class="cluster-card aeo-pillar">${slot('div', `opportunities.${i}.workstream`, o.workstream, 'cluster-name')}${slot('p', `opportunities.${i}.opportunity`, o.opportunity, 'aeo-pillar-desc')}${slot('p', `opportunities.${i}.signal`, o.signal, 'aeo-pillar-line')}</div>`).join('')}</div>`
    : `<div class="leaderboard-wrap">
    <table class="leaderboard">
      <thead><tr>${slot('th', 'page.opps_col_1', p.opps_col_1)}${slot('th', 'page.opps_col_2', p.opps_col_2)}${slot('th', 'page.opps_col_3', p.opps_col_3)}</tr></thead>
      <tbody>${s.opportunities.map((o, i) => `<tr>${slot('td', `opportunities.${i}.signal`, o.signal, '', label(p.opps_col_1))}${slot('td', `opportunities.${i}.opportunity`, o.opportunity, '', label(p.opps_col_2))}${slot('td', `opportunities.${i}.workstream`, o.workstream, '', label(p.opps_col_3))}</tr>`).join('')}</tbody>
    </table>
  </div>
  ${slot('p', 'page.opps_takeaway', p.opps_takeaway, 'chart-takeaway')}`
  // Shown: the section with the table or the pillar cards. Hidden: nothing, whatever the layout.
  const oppsSection = oppsShown ? `
<section id="opportunities" class="section">
  <div class="section-label">${fixed('04 / ')}${wrap('page.opps_label', p.opps_label)}</div>
  ${slot('h2', 'page.opps_title', p.opps_title, 'section-title')}
  ${oppsBody}
</section>` : ''

  const sidebar = `
<nav class="sidebar">
  <div class="sidebar-logo">
    ${slot('div', 'page.sidebar_wordmark', p.sidebar_wordmark, 'aivx-brand')}${showsPowered(p.sidebar_wordmark) ? `\n    ${slot('div', 'page.sidebar_powered', p.sidebar_powered, 'powered')}` : ''}
  </div>
  <div class="sidebar-industry">
    ${mirror('page.series', p.series)}
    <span${attr('data-mirror', 'brand')}>${brand}</span>
  </div>
  <nav class="sidebar-nav">
    <a href="#headline"><span class="nav-num"${fixedMark}>01</span> ${mirror('page.headline_label', p.headline_label, false, true)}</a>
    <a href="#category-data"><span class="nav-num"${fixedMark}>02</span> ${mirror('page.section_1_title', t1, false, true)}</a>
    <a href="#competitive-visibility"><span class="nav-num"${fixedMark}>03</span> ${mirror('page.section_2_title', t2, false, true)}</a>${oppsNav}
    <a href="#methodology"><span class="nav-num"${fixedMark}>${methodNum}</span> ${wrap('page.method_nav', p.method_nav)}</a>
  </nav>
  <div class="sidebar-footer">
    ${slot('a', 'page.sidebar_link', p.sidebar_link, '', ' href="https://avenuez.com" target="_blank" rel="noopener"')}
  </div>
</nav>`

  const main = `
<header class="hero">
  ${slot('div', 'page.series', p.series, 'hero-series')}
  <h1 class="hero-industry"${isLong ? ' style="font-size:72px"' : ''}>${slot('span', 'brand', s.brand, 'grad-text')}</h1>
  <div class="hero-subtitle">${wrap('page.category_label', p.category_label)} ${slot('span', 'category', s.category)} &nbsp;·&nbsp; ${wrap('page.market_label', p.market_label)} ${slot('span', 'market', s.market)} &nbsp;·&nbsp; ${wrap('page.window_prefix', p.window_prefix)} ${wrap('window_label', s.window_label)}</div>
  <div class="hero-meta">
  </div>
</header>
<section id="headline" class="exec-summary">
  ${slot('div', 'page.headline_label', p.headline_label, 'exec-label')}
  ${slot('div', 'headline', s.headline, 'exec-headline')}
  ${slot('div', 'summary', s.summary, 'exec-subheadline')}
</section>
<section class="section">
  ${kpiStrip}${kpiCards}</div>
  ${data.competitorsTracked > 0 ? slot('div', 'context', s.context, 'insight-box', '', bolded(s.context)) : ''}
</section>
<section id="category-data" class="section">
  <div class="section-label">${fixed('02 / ')}${mirror('page.section_1_title', t1)}</div>
  ${slot('h2', 'page.section_1_title', t1, 'section-title')}
  <div class="two-col" style="margin-top:16px;align-items:stretch">
    <div><div class="insight-box">${bullets('competitive_bullets')}</div></div>
    <div><div class="chart-wrap">${slot('div', 'page.chart_1_title', p.chart_1_title, 'chart-title')}${embedFigure('aeo-chart-sources', sourceDonutFigure(data.sourceMix), chartMark)}</div></div>
  </div>
</section>
<section id="competitive-visibility" class="section">
  <div class="section-label">${fixed('03 / ')}${mirror('page.section_2_title', t2)}</div>
  ${slot('h2', 'page.section_2_title', t2, 'section-title')}
  <div class="two-col" style="margin-top:16px;align-items:stretch">
    <div><div class="insight-box">${bullets('sources_bullets')}</div></div>
    <div><div class="chart-wrap">${slot('div', 'page.chart_2_title', p.chart_2_title, 'chart-title')}${embedFigure('aeo-chart-visibility', visibilityBarFigure(shownBrands), chartMark)}</div></div>
  </div>
</section>
<section class="section">
  <div class="rec-global-bottom-line">
    ${slot('div', 'page.why_title', p.why_title, '', ' style="font-size:18px;font-weight:900;color:var(--white);margin-bottom:12px"')}
    ${slot('p', 'why', s.why, '', ' style="font-size:15px;color:rgba(255,255,255,0.75);line-height:1.75;margin:0"')}
  </div>
</section>${oppsSection}
<section id="methodology" class="section">
  <div class="section-label">${fixed(`${methodNum} / `)}${mirror('page.method_nav', p.method_nav)}</div>
  ${slot('h2', 'page.method_title', p.method_title, 'section-title')}
  <div class="method-note"><div>${slot('strong', 'page.method_label', p.method_label)} ${slot('span', 'methodology', s.methodology)}</div><div>${slot('strong', 'page.next_label', p.next_label)} ${slot('span', 'next_step', s.next_step)}</div></div>
</section>
<footer class="footer">
  <div class="footer-grad-line"></div>
  <div class="footer-content">
    <div class="footer-brand">
      ${slot('div', 'page.footer_name', p.footer_name, 'avz-name')}
      ${block('p', 'page.footer_desc', p.footer_desc, 'footer-desc', '', '      ')}
      ${block('a', 'page.footer_link', p.footer_link, 'footer-link', ' href="https://avenuez.com" target="_blank" rel="noopener"', '      ')}
    </div>
    <div>
      <p style="font-size:12px;color:var(--muted);font-weight:700;margin-bottom:6px">
        ${mirror('page.series', p.series.toUpperCase(), true)}
      </p>
      <p style="font-size:13px;color:rgba(255,255,255,0.5)">
        ${mirror('brand', s.brand)}<br>${wrap('page.prepared_label', p.prepared_label)} ${fixed(preparedOn)}
      </p>
    </div>
  </div>
  ${block('p', 'page.footer_disclaimer', p.footer_disclaimer, 'footer-disclaimer', '', '  ')}
</footer>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${AIVX_FAVICON_TAG}
  <title>${esc(p.series)}: ${brand} | Avenue Z</title>
  <script src="https://cdn.plot.ly/plotly-3.5.0.min.js" charset="utf-8" integrity="sha384-DPvk2KODrsA0CfBr4HTwAwhdDROPqqK2PvSSswJMQMpnUkwSTg4gLBxXc3wv2e5L" crossorigin="anonymous"></script>
  <meta name="description" content="${esc(p.series)} for ${brand}. Powered by Avenue Z AEO Intelligence.">
  <meta name="robots" content="noindex,nofollow">
  <style>${AIVX_CSS}</style><style>${PAGE_CSS}</style>${draft ? EDITOR_STYLE : ''}
</head>
<body>
  ${sidebar}
  <div class="main">
    ${main}
  </div>
  <script>${AIVX_JS}</script>${HEADER_CLONE}${PAGE_SCRIPT}${draft ? FRAME_SCRIPT : ''}
</body>
</html>`
}
