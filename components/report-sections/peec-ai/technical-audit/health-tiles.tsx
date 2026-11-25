// 01 · Health scores (spec §5.3): four tiles, each with its source, an ⓘ naming where the number comes from, the value
// and its delta vs the previous snapshot. Plain SVG and HTML bars, so they render on the server and print in the PDF.
import type { ReactNode } from 'react'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { PrintAsClient } from '@/components/report-sections/organic-social/parts/print-as-client'
import { deltaTone, kpiDelta, type KpiKey, type ViewMetrics } from '@/lib/technical-audit/kpis'
import type { Viewer } from '@/lib/technical-audit/view'
import { fmtDate, fmtDelta, TONE_COLOR } from './format'

const RED = '#FF4444'
const AMBER = '#FFFC60'
const GREEN = '#60FF80'
const NEUTRAL = '#60FDFF'
const TRACK = 'rgba(255,255,255,0.1)'
/** Speedometer bands for the Ahrefs Health Score (0–100). */
const GAUGE_BANDS = [{ from: 0, to: 60, color: RED }, { from: 60, to: 80, color: AMBER }, { from: 80, to: 100, color: GREEN }] as const

const TEAM_BLANK = 'Upload the GSC report to fill this tile'
const CLIENT_BLANK = 'Not available for this month'

const num = (n: number) => n.toLocaleString('en-US')

// ── Half-circle geometry (viewBox 0 0 120 70, centre 60,62, radius 48): value 0 is the left end, 100 the right. ──
const CX = 60
const CY = 62
const R = 48
function point(v: number, r = R): [number, number] {
  const a = Math.PI * (1 - Math.max(0, Math.min(100, v)) / 100)
  return [CX + r * Math.cos(a), CY - r * Math.sin(a)]
}
function arc(from: number, to: number): string {
  const [x1, y1] = point(from)
  const [x2, y2] = point(to)
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${R} ${R} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`
}

function Tile({ title, source, info, children }: { title: string; source: string; info: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-white/[0.06] bg-bg-surface p-6" data-export-block="">
      <div>
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-white">{title}</h3>
          <InfoTooltip text={info} />
        </div>
        <p className="mt-0.5 text-xs text-text-muted">{source}</p>
      </div>
      {children}
    </div>
  )
}

function Delta({ kpi, cur, prev, unit, previousDate }: {
  kpi: KpiKey; cur: number | null; prev: number | null; unit: 'pts' | 'count' | 'pct'; previousDate: string | null
}) {
  if (!previousDate) return null
  const d = kpiDelta(cur, prev)
  const tone = deltaTone(kpi, d)
  return (
    <p className="text-xs text-text-muted">
      <span className="font-bold" style={{ color: tone ? TONE_COLOR[tone] : undefined }}>{fmtDelta(unit, d)}</span>
      {' '}vs {fmtDate(previousDate)}
    </p>
  )
}

function NoData() {
  return <p className="text-sm text-text-muted">No data for this snapshot</p>
}

/** A GSC slot with no upload: the team is told to upload it, a client (and the PDF) that it isn't available. */
function Blank({ viewer }: { viewer: Viewer }) {
  const client = <p className="text-sm text-text-muted">{CLIENT_BLANK}</p>
  if (viewer === 'client') return client
  return <PrintAsClient live={<p className="text-sm text-text-muted">{TEAM_BLANK}</p>} client={client} />
}

function Bar({ value, max, color, faint = false, label }: { value: number; max: number; color: string; faint?: boolean; label: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0
  return (
    <div className="flex items-center gap-2" aria-label={label}>
      <div className="h-2 flex-1 rounded-full" style={{ background: TRACK }}>
        <div className="h-2 rounded-full" style={{ width: `${pct}%`, background: color, opacity: faint ? 0.35 : 1 }} />
      </div>
      <span className={`w-12 text-right text-xs tabular-nums ${faint ? 'text-text-muted' : 'font-bold text-white'}`}>{num(value)}</span>
    </div>
  )
}

function HealthScore({ m, prev, previousDate }: { m: ViewMetrics | null; prev: ViewMetrics | null; previousDate: string | null }) {
  const v = m?.ahrefsHealthScore ?? null
  return (
    <Tile title="Site health score" source="Ahrefs Site Audit"
      info="Ahrefs → Site Audit → Overview → Health Score: the share of crawled internal URLs with no errors, 0 to 100.">
      {v === null ? <NoData /> : (
        <div className="flex flex-col items-center gap-1">
          <svg viewBox="0 0 120 70" className="w-full max-w-60" role="img" aria-label={`Health score ${v} of 100`}>
            {GAUGE_BANDS.map((b) => <path key={b.from} d={arc(b.from, b.to)} fill="none" stroke={b.color} strokeOpacity={0.35} strokeWidth={10} />)}
            <line x1={CX} y1={CY} x2={point(v, R - 6)[0]} y2={point(v, R - 6)[1]} stroke="#FFFFFF" strokeWidth={2.5} strokeLinecap="round" />
            <circle cx={CX} cy={CY} r={3.5} fill="#FFFFFF" />
          </svg>
          <p className="text-3xl font-extrabold text-white">{v}</p>
          <Delta kpi="health" cur={v} prev={prev?.ahrefsHealthScore ?? null} unit="pts" previousDate={previousDate} />
        </div>
      )}
    </Tile>
  )
}

function CrawlIssues({ m, prev, previousDate }: { m: ViewMetrics | null; prev: ViewMetrics | null; previousDate: string | null }) {
  const rows = [
    { label: 'Issues', color: RED, cur: m?.sfIssueTypesIssue ?? null, prev: prev?.sfIssueTypesIssue ?? null, urls: m?.sfUrlsIssue ?? null },
    { label: 'Warnings', color: AMBER, cur: m?.sfIssueTypesWarning ?? null, prev: prev?.sfIssueTypesWarning ?? null, urls: m?.sfUrlsWarning ?? null },
    { label: 'Opportunities', color: NEUTRAL, cur: m?.sfIssueTypesOpportunity ?? null, prev: prev?.sfIssueTypesOpportunity ?? null, urls: m?.sfUrlsOpportunity ?? null },
  ]
  const empty = rows.every((r) => r.cur === null)
  const max = Math.max(1, ...rows.flatMap((r) => [r.cur ?? 0, r.prev ?? 0]))
  return (
    <Tile title="Crawl issues by type" source="Screaming Frog Issues Overview"
      info="Screaming Frog → Reports → Issues Overview. Bars count issue types, not URLs; the lighter bar is the previous snapshot.">
      {empty ? <NoData /> : (
        <>
          <div className="flex flex-col gap-3">
            {rows.map((r) => (
              <div key={r.label} className="flex flex-col gap-1">
                <p className="text-xs font-bold text-white">{r.label}</p>
                <Bar value={r.cur ?? 0} max={max} color={r.color} label={`${r.label}: ${r.cur ?? 0} issue types`} />
                {r.prev !== null && previousDate && (
                  <Bar value={r.prev} max={max} color={r.color} faint label={`${r.label} on ${fmtDate(previousDate)}: ${r.prev} issue types`} />
                )}
              </div>
            ))}
          </div>
          <p className="text-xs text-text-muted">
            URLs affected: {rows.map((r) => `${r.label} ${r.urls === null ? '—' : num(r.urls)}`).join(' · ')}
          </p>
          <Delta kpi="sf_issue_types" cur={rows[0].cur} prev={rows[0].prev} unit="count" previousDate={previousDate} />
        </>
      )}
    </Tile>
  )
}

const indexedPct = (m: ViewMetrics | null): number | null => {
  if (!m || m.gscIndexed === null || m.gscNotIndexed === null) return null
  const known = m.gscIndexed + m.gscNotIndexed
  return known === 0 ? null : (m.gscIndexed / known) * 100
}

function Indexing({ m, prev, previousDate, viewer }: { m: ViewMetrics | null; prev: ViewMetrics | null; previousDate: string | null; viewer: Viewer }) {
  const pct = indexedPct(m)
  return (
    <Tile title="Indexing coverage" source="GSC Page indexing upload"
      info="Search Console → Indexing → Pages → All known pages. Indexed pages as a share of all known URLs.">
      {pct === null || !m ? <Blank viewer={viewer} /> : (
        <div className="flex flex-col items-center gap-1">
          <svg viewBox="0 0 120 70" className="w-full max-w-60" role="img" aria-label={`${pct.toFixed(1)}% of known URLs indexed`}>
            <path d={arc(0, 100)} fill="none" stroke={TRACK} strokeWidth={10} />
            {pct > 0 && <path d={arc(0, pct)} fill="none" stroke={NEUTRAL} strokeWidth={10} />}
          </svg>
          <p className="text-3xl font-extrabold text-white">{pct.toFixed(1)}%</p>
          <p className="text-xs text-text-muted">indexed of known URLs</p>
          <p className="text-xs text-text-muted">
            Indexed <span className="font-bold text-white">{num(m.gscIndexed ?? 0)}</span>
            {' · '}Not indexed <span className="font-bold text-white">{num(m.gscNotIndexed ?? 0)}</span>
          </p>
          <Delta kpi="indexed" cur={pct} prev={indexedPct(prev)} unit="pct" previousDate={previousDate} />
        </div>
      )}
    </Tile>
  )
}

type Cwv = { poor: number | null; ni: number | null; good: number | null }
const cwvOf = (m: ViewMetrics | null, device: 'mobile' | 'desktop'): Cwv => device === 'mobile'
  ? { poor: m?.cwvMobilePoor ?? null, ni: m?.cwvMobileNi ?? null, good: m?.cwvMobileGood ?? null }
  : { poor: m?.cwvDesktopPoor ?? null, ni: m?.cwvDesktopNi ?? null, good: m?.cwvDesktopGood ?? null }

function CwvDevice({ name, cur, prev, previousDate, viewer }: { name: string; cur: Cwv; prev: Cwv; previousDate: string | null; viewer: Viewer }) {
  const blank = cur.poor === null || cur.ni === null || cur.good === null
  const max = Math.max(1, cur.poor ?? 0, cur.ni ?? 0, cur.good ?? 0)
  return (
    <div role="group" aria-label={name} className="flex min-w-0 flex-col gap-2">
      <p className="text-xs font-bold uppercase tracking-wider text-text-muted">{name}</p>
      {blank ? <Blank viewer={viewer} /> : (
        <>
          {([['Poor', cur.poor, RED], ['Needs improvement', cur.ni, AMBER], ['Good', cur.good, GREEN]] as const).map(([label, v, color]) => (
            <div key={label} className="flex flex-col gap-1">
              <p className="text-xs text-white">{label}</p>
              <Bar value={v ?? 0} max={max} color={color} label={`${name} ${label}: ${v ?? 0} URLs`} />
            </div>
          ))}
          {/* Poor URLs: lower is better on either device. */}
          <Delta kpi="cwv_poor_mobile" cur={cur.poor} prev={prev.poor} unit="count" previousDate={previousDate} />
        </>
      )}
    </div>
  )
}

function CoreWebVitals({ m, prev, previousDate, viewer }: { m: ViewMetrics | null; prev: ViewMetrics | null; previousDate: string | null; viewer: Viewer }) {
  return (
    <Tile title="Core Web Vitals" source="GSC Core Web Vitals uploads"
      info="Search Console → Experience → Core Web Vitals → Mobile and Desktop reports. URL counts by status: Poor, Needs improvement, Good.">
      {/* Side by side, mobile first, rather than a toggle, so both print in the PDF. */}
      <div className="grid grid-cols-2 gap-6">
        <CwvDevice name="Mobile" cur={cwvOf(m, 'mobile')} prev={cwvOf(prev, 'mobile')} previousDate={previousDate} viewer={viewer} />
        <CwvDevice name="Desktop" cur={cwvOf(m, 'desktop')} prev={cwvOf(prev, 'desktop')} previousDate={previousDate} viewer={viewer} />
      </div>
    </Tile>
  )
}

export function HealthTiles({ metrics, prevMetrics, previousDate, viewer }: {
  metrics: ViewMetrics | null
  prevMetrics: ViewMetrics | null
  previousDate: string | null
  viewer: Viewer
}) {
  const p = { m: metrics, prev: prevMetrics, previousDate }
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <HealthScore {...p} />
      <CrawlIssues {...p} />
      <Indexing {...p} viewer={viewer} />
      <CoreWebVitals {...p} viewer={viewer} />
    </div>
  )
}
