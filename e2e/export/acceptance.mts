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
import { countLinks, outsideBox, pagesOf, readPdf, type PdfText } from './pdf-check'

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
const html = (url = '') => url.startsWith('/keep') ? keepPage(url === '/keep') : page(!url.startsWith('/never'))
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
    // Vercel caps a function's response body at 4.5 MB; full-size WebP post images once made this export 31 MB.
    check(bytes.length < 4_500_000, `${name}: under Vercel's 4.5 MB response limit (${(bytes.length / 1e6).toFixed(2)} MB)`)
    console.log(`  ${name} PDF: ${file}`)
    return { res, bytes, pdf }
  }

  const ren = await exportAs({ role: 'CLIENT_VIEWER', email: 'acceptance@localhost', clientSlug: 'renaissance' },
    { clientSlug: 'renaissance', subsection: null, dateRange: 'last_30_days' }, 'renaissance-client')
  if (ren) {
    check(/filename\*=UTF-8''Renaissance%20%E2%80%93%20Organic%20Social%20%E2%80%93%20\d{4}-\d{2}-\d{2}\.pdf/.test(ren.res.headers.get('content-disposition') ?? ''), 'named Renaissance – Organic Social – <date>.pdf')
    check(pagesOf(ren.pdf, 'Exported')[0] === 1 && pagesOf(ren.pdf, 'Reporting').length > 0, 'stamped with export time and reporting period on page 1')
    const viewPost = ren.pdf.words.filter((w, i) => w.text === 'View' && ren.pdf.words[i + 1]?.text === 'post').length
    check(viewPost > 0 && countLinks(ren.bytes) >= viewPost, `every post is a link (${countLinks(ren.bytes)} links, ${viewPost} posts)`)
  }

  // A locked-months client's platform tab, exported by a staff editor and by a client (Thomas, #332 round 2, item 5): the
  // staff export prints exactly the client's, with no editor, draft or button text. A month both can see, so both serve it.
  const APFM = { clientSlug: 'a-place-for-mom', subsection: process.env.APFM_TAB ?? 'organic-instagram', dateRange: process.env.APFM_MONTH ?? 'custom:2026-08-01,2026-08-31' }
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
}

console.log(`\nfixture PDF: ${fixturePdf}`)
if (failures.length) { console.error(`\n${failures.length} check(s) failed`); process.exit(1) }
console.log('\nall export acceptance checks passed')
