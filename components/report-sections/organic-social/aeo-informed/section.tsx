// The AEO Informed Social tab's body, under the shared Insights header the Organic Social report renders for this view (index.tsx). Spec
// docs/superpowers/specs/2026-11-12-aeo-informed-social-tab-design.md, sections 2 and 3. Server only.
//
// The flow: the client's setting (lib/organic-social/aeo-tab/setting.ts) -> the window for the served month and the chosen range (params.ts,
// aeoWindow) -> the one read (data.ts, getAeoTabData: the lock for a locked month, else the cached live read) -> the blocks below.
import { getClientBySlug } from '@/lib/db/queries'
import { requestClock } from '@/lib/organic-social/locked-range'
import { aeoSettingProblem, logMalformedAeoSetting, parseAeoInformedSetting } from '@/lib/organic-social/aeo-tab/setting'
import { aeoWindow, type AeoRange, type AeoWindow } from '@/lib/organic-social/aeo-tab/params'
import { getAeoTabData } from '@/lib/organic-social/aeo-tab/data'
import { kitActive } from '@/lib/organic-social/design-from'
import { NoData } from '../no-data'
import { Fallback } from '../parts/shared'
import { AeoRangeControl, AeoMinControl } from './controls'
import { AeoGraphs } from './graphs'
import { AeoTiles } from './tiles'
import { AeoTable } from './aeo-table'
import kit from '../design/kit.module.css'
import { GlowMark } from '../design/frames'
import {
  COMPETITOR_LINE, COMPETITOR_TABLE_TITLE, NO_DATA_FOR_WINDOW, TIMEOUT_TEXT, URL_GAPS_LINE, URL_GAPS_TITLE, notStartedText, ownTableTitle, periodLine,
} from './copy'

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

function Heading({ title, line, right }: { title: string; line?: string; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-lg font-extrabold text-white">{title}</h2>
        {line && <p className="text-xs text-text-muted">{line}</p>}
      </div>
      {right}
    </div>
  )
}

/**
 * `servedRange` is the range the page serves (a locked month's for a client on locked months); `aeo` and `aeoMin` come from the URL, already
 * parsed. A client without the setting or a Peec project renders nothing (the tab rule hides the tab, so only a hand-typed URL gets here).
 * `monthKey` is the served reporting month (null for a client without reporting months); it decides the design kit's look (option B).
 */
export async function AeoInformedSection({ clientSlug, servedRange, aeo, aeoMin, deadlineMs, monthKey }: {
  clientSlug: string; servedRange: string; aeo: AeoRange; aeoMin: number; role: string | undefined; deadlineMs: number; monthKey: string | null
}) {
  const client = await getClientBySlug(clientSlug)
  if (!client) return null
  const problem = aeoSettingProblem(client)
  if (problem) { logMalformedAeoSetting(clientSlug, problem); return null }
  const parsed = parseAeoInformedSetting(client.dashSocialConfig?.aeoInformedSocial)
  if (parsed.kind !== 'ok' || !client.peecCustomerProjectId) return null
  const setting = parsed.setting
  // The design kit (plan docs/superpowers/plans/2026-11-23-os-design-phase1.md, Task 10): only when the client's setting asks
  // for it (`design: "kit"`, setting.ts), the tiles and the graphs take the kit's look inside the kit's colours. Without it,
  // the tab is exactly as before (kit.test.tsx's snapshots, recorded before this change). Option B: and only on a served month on or
  // after the client's designFrom, the same rule as the rest of the report (design-from.ts); the body logs a malformed one.
  // Worked out here, before any early return, so every state of a kit month carries the glow's marker (the last look fixes, L1).
  const kitLook = setting.design === 'kit' && kitActive(client, monthKey)
  const glow = kitLook ? <GlowMark /> : null

  // One clock per request (requestClock): its New York date decides the lock, as for Dash; the UTC date the window and the as-of.
  const clock = requestClock()
  let w: AeoWindow
  try {
    w = aeoWindow({ servedRange, range: aeo, allTimeFrom: setting.allTimeFrom, today: addDays(clock.lastCompleteUtcDay, 1) })
  } catch (e) {
    console.error(`[aeo-informed] window failed slug=${clientSlug} range=${aeo} error=${e instanceof Error ? e.name : 'Error'}`)
    return glow ? <>{glow}<Fallback kind="error" /></> : <Fallback kind="error" />
  }

  const controls = (
    <div data-aeo-block="controls" className="flex flex-wrap items-center justify-between gap-3">
      <AeoRangeControl value={aeo} />
      {w.kind === 'ok' && <p className="text-xs text-text-muted">{periodLine(w.window, w.previousDays)}</p>}
    </div>
  )
  if (w.kind === 'not-started') return <div className="space-y-6">{glow}{controls}<NoData message={notStartedText(w.monthLabel)} /></div>
  if (w.kind === 'before-data') return <div className="space-y-6">{glow}{controls}<NoData message={NO_DATA_FOR_WINDOW} /></div>

  const data = await getAeoTabData({
    client: { id: client.id, slug: client.slug, dashSocialConfig: client.dashSocialConfig }, projectId: client.peecCustomerProjectId, setting,
    window: w.window, asOf: w.asOf, min: aeoMin, range: aeo, deadlineMs, today: clock.today,
  })
  if (data.kind === 'no-chats') return <div className="space-y-6">{glow}{controls}<NoData message={NO_DATA_FOR_WINDOW} /></div>
  if (data.kind === 'error') return <div className="space-y-6">{glow}{controls}<Fallback kind={data.reason} timeoutText={TIMEOUT_TEXT} /></div>

  // A locked and a live result render the same way, as the Dash tabs do.
  const r = data.result
  const showChange = w.previousDays !== null
  const brands = r.meta.brands
  return (
    <div className={kitLook ? `${kit.root} space-y-10` : 'space-y-8'}>
      {glow}
      {controls}
      <section data-aeo-block="graphs" data-export-block="">
        <AeoGraphs graphs={r.graphs} fourthGraph={setting.fourthGraph} {...(kitLook ? { look: 'kit' as const } : {})} />
      </section>
      <section data-aeo-block="tiles" data-export-block="">
        <AeoTiles totals={r.totals} previousDays={w.previousDays} {...(kitLook ? { kit: true } : {})} />
      </section>
      <section data-aeo-block="own" data-export-block="">
        <Heading title={ownTableTitle(r.meta.ownBrandName)} />
        <AeoTable kind="socials" rows={r.socialsOwn} brands={brands} showChange={showChange} />
      </section>
      <section data-aeo-block="competitor" data-export-block="">
        <Heading title={COMPETITOR_TABLE_TITLE} line={COMPETITOR_LINE} />
        <AeoTable kind="socials" rows={r.socialsCompetitor} brands={brands} showChange={showChange} />
      </section>
      <section data-aeo-block="gaps" data-export-block="">
        <Heading title={URL_GAPS_TITLE} line={URL_GAPS_LINE} right={<AeoMinControl value={aeoMin} />} />
        <AeoTable kind="gaps" rows={r.urlGaps} brands={brands} showChange={showChange} />
      </section>
    </div>
  )
}
