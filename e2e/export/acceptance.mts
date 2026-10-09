// Acceptance checks for the Organic Social PDF export (spec docs/superpowers/specs/2026-10-06-organic-social-pdf-export-v2-design.md §10).
// Local only (CI has no Chromium): `npm run e2e:export`. Needs CHROME_EXECUTABLE_PATH and poppler.
// Node: verified on 26.7.0. On Node 20 (CI's) it fails before any check with "export failed at launch": tsx cannot
// resolve render-pdf.ts's dynamic import('puppeteer-core') (ERR_UNSUPPORTED_RESOLVE_REQUEST). That is the script
// runner, not Chromium or the product (Next bundles the route; Vercel runs Node 24). The cutoff between is unchecked.
//
//  A. Deterministic: a synthetic page styled by the real export theme, printed by the real renderPdf.
//     Every block keeps its start and end marker on one page; a title shares a page with its first block;
//     nothing leaves the content box; an oversized block may split; a page that never reports ready is
//     ExportNotReadyError with nothing printed.
//  B. Live (when AUTH_SECRET is set and BASE serves a build): the real route, as a Renaissance client, for the
//     Overview: a named PDF, stamped, inside the box, every post linked. Then A Place for Mom's Instagram tab (locked
//     months, YTD, annotations) as a staff editor and as a client: no editor, draft or button text, and the same print.
import { createServer } from 'node:http'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { encode } from '@auth/core/jwt'
import { ExportNotReadyError, renderPdf, CONTENT_WIDTH } from '../../lib/export/render-pdf'
import { countLinks, fontsOf, outsideBox, pagesOf, readPdf, type PdfText } from './pdf-check'

const out = mkdtempSync(join(tmpdir(), 'export-acceptance-'))
const failures: string[] = []
const check = (ok: boolean, what: string) => { console.log(`${ok ? '  ok ' : 'FAIL '} ${what}`); if (!ok) failures.push(what) }

// ---------- A. Deterministic fixture ----------
const theme = readFileSync(join(import.meta.dirname, '../../app/export/export-theme.css'), 'utf8')
const block = (id: string, height: number, title?: string) =>
  `<div data-export-block class="space-y-2" style="margin-bottom:20px">${title ? `<h2 style="font-size:14px;font-weight:800">${title}</h2>` : ''}` +
  `<p style="font-size:11px">${id}START</p><div style="height:${height}px;background:#f4f4f5;border-radius:12px"></div><p style="font-size:11px">${id}END</p></div>`
const SECTIONS = [
  { title: 'T1TITLE', heights: [180, 180, 180, 180] },
  { title: 'T2TITLE', heights: [341, 341, 341, 341, 341] },
  { title: 'T3TITLE', heights: [420, 120, 300] },
  { title: 'T4TITLE', heights: [1200] }, // taller than a page: allowed to split, the one exception
  { title: 'T5TITLE', heights: [250, 250, 250, 250, 250, 250] },
]
const blocks: { id: string; title?: string; oversized: boolean }[] = []
const body = SECTIONS.map((s, si) => s.heights.map((h, bi) => {
  const id = `B${si + 1}x${bi + 1}`
  blocks.push({ id, title: bi === 0 ? s.title : undefined, oversized: h > 700 })
  return block(id, h, bi === 0 ? s.title : undefined)
}).join('')).join('')
const page = (ready: boolean) => `<!doctype html><html><head><meta charset="utf-8"><style>${theme}</style>
<style>html,body{margin:0;background:#fff;font-family:sans-serif}</style></head>
<body><div class="export-theme" style="width:${CONTENT_WIDTH}px"><p class="no-print">NOPRINTMARKER</p>${body}</div>${ready ? '<script>window.__exportReady = true</script>' : ''}</body></html>`

// A section taller than a page (YTD Review): its title is not inside a block but is kept with the next one. The spacer
// leaves room for the title and not the card, so without keep-with-next the title ends page 1 alone (the control proves it).
const keepPage = (keep: boolean) => `<!doctype html><html><head><meta charset="utf-8"><style>${theme}</style>
<style>html,body{margin:0;background:#fff;font-family:sans-serif}</style></head>
<body><div class="export-theme" style="width:${CONTENT_WIDTH}px"><div data-export-block style="height:660px"></div>
<section><h2 ${keep ? 'data-export-keep-with-next ' : ''}style="font-size:14px;font-weight:800;margin:0 0 16px">KEEPTITLE</h2>
<div><div data-export-block><p style="font-size:11px">KEEPSTART</p><div style="height:341px;background:#f4f4f5"></div></div></div></section>
</div><script>window.__exportReady = true</script></body></html>`
// A table longer than a page (AEO's PR placements prints up to 100 rows), starting low on the first page: it may split only
// between rows, its header row repeats on each page it continues on, and its title stays with its first rows.
const tablePage = () => `<!doctype html><html><head><meta charset="utf-8"><style>${theme}</style>
<style>html,body{margin:0;background:#fff;font-family:sans-serif}</style></head>
<body><div class="export-theme" style="width:${CONTENT_WIDTH}px"><div data-export-block style="height:600px"></div>
<div><h3 data-export-keep-with-next style="font-size:14px;margin:0 0 8px">TABLETITLE</h3>
<div data-export-table><table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left;height:24px">TABLEHEAD</th></tr></thead><tbody>
${Array.from({ length: 60 }, (_, i) => `<tr data-export-row><td style="height:30px">ROW${i + 1}</td></tr>`).join('')}
</tbody></table></div></div>
</div><script>window.__exportReady = true</script></body></html>`
// The same title-then-block case inside a flex column card (AEO's SectionCard and SectionWrapper are \`flex flex-col gap-4\`).
const keepFlexPage = () => `<!doctype html><html><head><meta charset="utf-8"><style>${theme}</style>
<style>html,body{margin:0;background:#fff;font-family:sans-serif}</style></head>
<body><div class="export-theme" style="width:${CONTENT_WIDTH}px"><div data-export-block style="height:670px"></div>
<div class="flex flex-col gap-4" style="display:flex;flex-direction:column;gap:16px"><div data-export-keep-with-next><h3 style="font-size:14px;margin:0">FLEXTITLE</h3>
<p style="font-size:11px;margin:4px 0 0">FLEXDESC a description long enough to wrap onto several lines under the title, as AEO's card descriptions do. It explains what the card measures and where the data comes from, so a reader can trust the numbers below it. ${'More words to make it wrap. '.repeat(6)}</p></div>
<div data-export-block><p style="font-size:11px">FLEXSTART</p><div style="height:300px;background:#f4f4f5"></div></div></div>
</div><script>window.__exportReady = true</script></body></html>`
const html = (url = '') => url === '/keep-flex' ? keepFlexPage() : url === '/table' ? tablePage() : url.startsWith('/keep') ? keepPage(url === '/keep') : page(!url.startsWith('/never'))
const server = createServer((req, res) => { res.setHeader('content-type', 'text/html'); res.end(html(req.url)) })
await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`

console.log('A. fixture')
const fixturePdf = join(out, 'fixture.pdf')
writeFileSync(fixturePdf, await renderPdf({ url: `${origin}/ready`, cookies: [] }))
const fx = readPdf(fixturePdf)
for (const b of blocks) {
  const start = pagesOf(fx, `${b.id}START`), end = pagesOf(fx, `${b.id}END`)
  if (b.oversized) check(start.length === 1 && end.length === 1, `${b.id} (oversized) printed`)
  else check(start.length === 1 && start[0] === end[0], `${b.id} on one page (${start} / ${end})`)
  if (b.title) check(pagesOf(fx, b.title)[0] === start[0], `${b.title} on the same page as its first block`)
}
const keepOf = async (path: string) => { const f = join(out, `${path.slice(1)}.pdf`); writeFileSync(f, await renderPdf({ url: `${origin}${path}`, cookies: [] })); const d = readPdf(f); return [pagesOf(d, 'KEEPTITLE')[0], pagesOf(d, 'KEEPSTART')[0]] }
const [ctlTitle, ctlCard] = await keepOf('/keep-control')
check(ctlTitle === 1 && ctlCard === 2, `control: without keep-with-next the title ends page 1 alone (${ctlTitle} / ${ctlCard})`)
const [keepTitle, keepCard] = await keepOf('/keep')
check(keepTitle === keepCard, `a kept title moves with its first card (${keepTitle} / ${keepCard})`)
const flexFile = join(out, 'keep-flex.pdf'); writeFileSync(flexFile, await renderPdf({ url: `${origin}/keep-flex`, cookies: [] }))
const flx = readPdf(flexFile)
check(new Set([pagesOf(flx, 'FLEXTITLE')[0], pagesOf(flx, 'FLEXDESC')[0], pagesOf(flx, 'FLEXSTART')[0]]).size === 1, `a kept title block (title + description) never splits and moves with its first block (${pagesOf(flx, 'FLEXTITLE')} / ${pagesOf(flx, 'FLEXDESC')} / ${pagesOf(flx, 'FLEXSTART')})`)
const tableFile = join(out, 'table.pdf'); writeFileSync(tableFile, await renderPdf({ url: `${origin}/table`, cookies: [] }))
const tbl = readPdf(tableFile)
const rowPages = Array.from({ length: 60 }, (_, i) => pagesOf(tbl, `ROW${i + 1}`))
check(rowPages.every((p) => p.length === 1), 'every table row prints whole, on one page')
check(pagesOf(tbl, 'TABLETITLE')[0] === rowPages[0][0], `a table's title stays with its first rows (${pagesOf(tbl, 'TABLETITLE')} / ${rowPages[0]})`)
const lastPage = rowPages[59][0]
check(lastPage > rowPages[0][0] && pagesOf(tbl, 'TABLEHEAD').length === lastPage - rowPages[0][0] + 1, `the header row repeats on every page the table continues on (${pagesOf(tbl, 'TABLEHEAD')})`)
check(outsideBox(fx).length === 0, `nothing outside the content box (${outsideBox(fx).length} words)`)
check(pagesOf(fx, 'NOPRINTMARKER').length === 0, 'a no-print element stays out of the PDF (the export renders in screen media)')
check(fx.pages.every((p) => p.width === 792 && p.height === 612), 'every page is US Letter landscape')

const started = Date.now()
const err = await renderPdf({ url: `${origin}/never`, cookies: [], readyTimeoutMs: 4000 }).catch((e) => e)
check(err instanceof ExportNotReadyError, `a page never ready is ExportNotReadyError, no PDF (${Date.now() - started}ms)`)
server.close()

// ---------- B. Live route ----------
const base = process.env.BASE ?? 'http://localhost:3457'
if (!process.env.AUTH_SECRET) {
  console.log('B. live: skipped (AUTH_SECRET not set)')
} else {
  console.log(`B. live (${base})`)
  // A token minted for this local server only (never a deployed one): a client of the export's client, or a staff editor.
  const exportAs = async (who: { role: string; email: string; clientSlug: string | null }, body: Record<string, unknown>, name: string) => {
    const now = Math.floor(Date.now() / 1000)
    const cookie = await encode({ secret: process.env.AUTH_SECRET!, salt: 'authjs.session-token', maxAge: 600,
      token: { sub: who.email, email: who.email, name: 'acceptance', role: who.role, clientSlug: who.clientSlug, service: true, iat: now, exp: now + 600, jti: crypto.randomUUID() } })
    const t = Date.now()
    const res = await fetch(`${base}/api/export/pdf`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: `authjs.session-token=${cookie}` },
      body: JSON.stringify({ compareRange: null, tz: 'America/New_York', ...body }) })
    check(res.status === 200, `${name}: route answers 200 (${res.status}, ${Date.now() - t}ms)`)
    if (!res.ok) return null
    const bytes = Buffer.from(await res.arrayBuffer())
    const file = join(out, `${name}.pdf`)
    writeFileSync(file, bytes)
    const pdf = readPdf(file)
    check(outsideBox(pdf).length === 0, `${name}: nothing outside the content box (${outsideBox(pdf).length} words)`)
    check(pdf.pages.every((p) => p.width === 792 && p.height === 612), `${name}: ${pdf.pages.length} pages, all Letter landscape`)
    // Printed at full width, not shrunk to fit: anything laid out past the 979 px content width (a w-max hover tooltip, PR 4
    // final review) makes Chromium scale every page down, which outsideBox can't see. The header stamp is right-aligned to
    // the content box's right edge (763.2 pt), so it ends there unless the page was shrunk (an 11% shrink put it at ~680).
    const stamp = pdf.words.find((w) => w.page === 1 && w.text === 'Exported')
    const stampEnd = stamp ? Math.max(...pdf.words.filter((w) => w.page === 1 && Math.abs(w.yMin - stamp.yMin) < 2).map((w) => w.xMax)) : 0
    check(stampEnd > 757, `${name}: printed at full width, not shrunk to fit (stamp ends at ${stampEnd.toFixed(1)} pt)`)
    // Vercel caps a function's response body at 4.5 MB; full-size WebP post images once made this export 31 MB.
    check(bytes.length < 4_500_000, `${name}: under Vercel's 4.5 MB response limit (${(bytes.length / 1e6).toFixed(2)} MB)`)
    // Every glyph comes from a web font the page loads, never from a system font: the server's Chromium has almost none
    // (only Open Sans), so a character borrowed from a Mac font here prints as an empty box there (↑ ↓ ↗, emoji).
    const system = fontsOf(file).filter((f) => !/^(NunitoSans|NotoSansMath|NotoColorEmoji|NotoSansMono)/.test(f))
    check(system.length === 0, `${name}: every glyph from the page's web fonts, none from a system font (${system.join(', ') || 'none'})`)
    console.log(`  ${name} PDF: ${file}`)
    return { res, bytes, pdf }
  }

  const ren = await exportAs({ role: 'CLIENT_VIEWER', email: 'acceptance@localhost', clientSlug: 'renaissance' },
    { clientSlug: 'renaissance', section: 'organic-social', subsection: null, dateRange: 'last_30_days' }, 'renaissance-client')
  if (ren) {
    check(/filename\*=UTF-8''Renaissance%20%E2%80%93%20Organic%20Social%20%E2%80%93%20\d{4}-\d{2}-\d{2}\.pdf/.test(ren.res.headers.get('content-disposition') ?? ''), 'named Renaissance – Organic Social – <date>.pdf')
    check(pagesOf(ren.pdf, 'Exported')[0] === 1 && pagesOf(ren.pdf, 'Reporting').length > 0, 'stamped with export time and reporting period on page 1')
    const viewPost = ren.pdf.words.filter((w, i) => w.text === 'View' && ren.pdf.words[i + 1]?.text === 'post').length
    check(viewPost > 0 && countLinks(ren.bytes) >= viewPost, `every post is a link (${countLinks(ren.bytes)} links, ${viewPost} posts)`)
  }

  // A page loaded before sections were added posts no section; it must still export Organic Social.
  const skew = await exportAs({ role: 'CLIENT_VIEWER', email: 'acceptance@localhost', clientSlug: 'renaissance' },
    { clientSlug: 'renaissance', subsection: null, dateRange: 'last_30_days' }, 'renaissance-no-section')
  check(!!skew, 'a body with no section still exports Organic Social')

  // A locked-months client's platform tab, exported by a staff editor and by a client (Thomas, #332 round 2, item 5): the
  // staff export prints exactly the client's, with no editor, draft or button text. A month both can see, so both serve it.
  const APFM = { clientSlug: 'a-place-for-mom', section: 'organic-social', subsection: process.env.APFM_TAB ?? 'organic-instagram', dateRange: process.env.APFM_MONTH ?? 'custom:2026-08-01,2026-08-31' }
  const staff = await exportAs({ role: 'INTERNAL_ADMIN', email: 'acceptance@avenuez.com', clientSlug: null }, APFM, 'apfm-staff')
  const client = await exportAs({ role: 'CLIENT_VIEWER', email: 'acceptance@localhost', clientSlug: APFM.clientSlug }, APFM, 'apfm-client')
  // Every glyph in the same order, and every page starting at the same place. The stamp's minute can differ between the
  // runs, so it is dropped. Spaces are too: sub-pixel glyph placement (0.07 pt seen) splits letter-spaced titles into
  // words differently ("GROW T H" / "GROW TH") with the same glyphs in the same place.
  const body = (pdf: PdfText) => pdf.words.map((w) => w.text).join('').replace(/^.*?Exported.*?(AM|PM)[A-Z]{2,4}/, '')
    + pdf.pages.map((_, i) => pdf.words.find((w) => w.page === i + 1)?.yMin.toFixed(0)).join()
  for (const [name, r] of [['apfm-staff', staff], ['apfm-client', client]] as const) {
    if (!r) continue
    const staffOnly = (r.pdf.words.map((w) => w.text).join(' ').match(/\b(Draft|Approve|Revoke|Add annotation|Add commentary|Edit|Hidden)\b/g) ?? [])
    check(staffOnly.length === 0, `${name}: no editor, draft or button text (${[...new Set(staffOnly)].join(', ') || 'none'})`)
    const text = r.pdf.words.map((w) => w.text).join(' ')
    check(text.includes('Follower Growth, Year to Date'), `${name}: YTD Review printed`) // its title's tracking splits "YTD"
    // An annotation's label starts with its day; the day printed again before it read "8/25 · 8/25 | …".
    check(!/(\d{1,2}\/\d{1,2}) · \1\b/.test(text), `${name}: each annotation's day prints once`)
  }
  if (staff && client) check(body(staff.pdf) === body(client.pdf), 'apfm: the staff export prints exactly what the client export does')

  // AEO (PDF export PR 2): every tab of a client with all four (Peec and Profound) and Renaissance's two, each as a staff
  // editor and as a client. No table or chart controls print, the two exports print the same, and each tab's time to
  // ready is logged by exportAs (spec 2026-10-08 §11: a tab over 30 s is a finding).
  const AEO_RUNS: [string, (string | null)[]][] = process.env.AEO_CLIENT
    ? [[process.env.AEO_CLIENT, [null, 'pr-influence', 'content-impact', 'technical-audit']]]
    : [['avenue-z', [null, 'pr-influence', 'content-impact', 'technical-audit']], ['renaissance', [null, 'pr-influence']]]
  for (const [aeoClient, tabs] of AEO_RUNS) {
    for (const tab of tabs) {
      const aeoBody = { clientSlug: aeoClient, section: 'peec-ai', subsection: tab, dateRange: 'last_30_days' }
      const name = `aeo-${aeoClient}-${tab ?? 'overview'}`
      const s = await exportAs({ role: 'INTERNAL_ADMIN', email: 'acceptance@avenuez.com', clientSlug: null }, aeoBody, `${name}-staff`)
      const c = await exportAs({ role: 'CLIENT_VIEWER', email: 'acceptance@localhost', clientSlug: aeoClient }, aeoBody, `${name}-client`)
      for (const [who, r] of [['staff', s], ['client', c]] as const) {
        if (!r) continue
        const text = r.pdf.words.map((w) => w.text).join(' ')
        const controls = text.match(/See all \d+ rows|Show less|Clear all filters|Sort by|Daily Weekly Monthly Quarterly/g) ?? []
        check(controls.length === 0, `${name}-${who}: no table or chart controls (${[...new Set(controls)].join(', ') || 'none'})`)
      }
      if (s && c) check(body(s.pdf) === body(c.pdf), `${name}: the staff export prints exactly what the client export does`)
    }
  }

  // Paid Media (PDF export PR 3): every tab of a client running Paid Search, Meta and LinkedIn, each as a staff editor and
  // as a client. No toggle, sort or expand control prints; the two exports print the same; exportAs logs each time to ready.
  const PM_RUNS: [string, (string | null)[]][] = [[process.env.PM_CLIENT ?? 'renaissance', [null, 'paid-search', 'meta', 'linkedin']]]
  for (const [pmClient, tabs] of PM_RUNS) {
    for (const tab of tabs) {
      const pmBody = { clientSlug: pmClient, section: 'paid-media', subsection: tab, dateRange: 'last_30_days' }
      const name = `pm-${pmClient}-${tab ?? 'overview'}`
      const s = await exportAs({ role: 'INTERNAL_ADMIN', email: 'acceptance@avenuez.com', clientSlug: null }, pmBody, `${name}-staff`)
      const c = await exportAs({ role: 'CLIENT_VIEWER', email: 'acceptance@localhost', clientSlug: pmClient }, pmBody, `${name}-client`)
      for (const [who, r] of [['staff', s], ['client', c]] as const) {
        if (!r) continue
        const text = r.pdf.words.map((w) => w.text).join(' ')
        const controls = text.match(/Spend Clicks Paid Search|Cost Clicks Impressions Leads|Show all|Filter ≥10 clicks|[▸▾]/g) ?? []
        check(controls.length === 0, `${name}-${who}: no toggle, sort or expand controls (${[...new Set(controls)].join(', ') || 'none'})`)
      }
      if (s && c) check(body(s.pdf) === body(c.pdf), `${name}: the staff export prints exactly what the client export does`)
    }
  }

  // Executive Overview (PDF export PR 4): exported as a staff editor and as a client, posting a stale custom range the page
  // ignores (spec 2026-10-09 §9.1). No toggle, tab, sort or hover-only text prints; no reporting period is stamped; the two
  // exports print the same; exportAs logs the time to ready.
  {
    const eoClient = process.env.EO_CLIENT ?? 'renaissance'
    const eoBody = { clientSlug: eoClient, section: 'executive-overview', subsection: null, dateRange: 'custom:2026-08-01,2026-08-31' }
    const s = await exportAs({ role: 'INTERNAL_ADMIN', email: 'acceptance@avenuez.com', clientSlug: null }, eoBody, `eo-${eoClient}-staff`)
    const c = await exportAs({ role: 'CLIENT_VIEWER', email: 'acceptance@localhost', clientSlug: eoClient }, eoBody, `eo-${eoClient}-client`)
    for (const [who, r] of [['staff', s], ['client', c]] as const) {
      if (!r) continue
      const text = r.pdf.words.map((w) => w.text).join(' ')
      // The sort headers print uppercase (CSS), so a leaked arrow reads "↓ SESSIONS": that part ignores case. The rest keeps
      // it: "Prior period" is the hover layer, while every KPI delta legitimately reads "vs prior period".
      const controls = [...(text.match(/By Conversion|7d avg|Prior period|rolling average/g) ?? []), ...(text.match(/[↓↑] (Sessions|CVR)/gi) ?? [])]
      check(controls.length === 0, `eo-${eoClient}-${who}: no toggle, tab, sort or hover-only text (${[...new Set(controls)].join(', ') || 'none'})`)
      check(!text.includes('Reporting period'), `eo-${eoClient}-${who}: no reporting period stamped`)
      // Exact case: the Web Analytics label prints uppercase; the Journey's "sessions in the last 30 days" must not satisfy it.
      check(text.includes('LAST 30 DAYS'), `eo-${eoClient}-${who}: each section keeps its own window label`)
    }
    if (s && c) check(body(s.pdf) === body(c.pdf), `eo-${eoClient}: the staff export prints exactly what the client export does`)
  }
}

console.log(`\nfixture PDF: ${fixturePdf}`)
if (failures.length) { console.error(`\n${failures.length} check(s) failed`); process.exit(1) }
console.log('\nall export acceptance checks passed')
