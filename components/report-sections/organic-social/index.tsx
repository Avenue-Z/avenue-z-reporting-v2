import { Suspense } from 'react'
import { auth } from '@/auth'
import { getClientBySlug, getSectionTemplate } from '@/lib/db/queries'
import { resolveSection } from '@/lib/report-sections/resolve'
import { lookup } from '@/lib/report-sections/registry'
import { SharedPartsHeader } from '@/components/report-sections/shared/shared-parts-header'
import { orgSocialChannelViewKey, type CommentaryViewKey } from '@/lib/commentary/views'
import type { DashChannel } from '@/lib/organic-social/metrics'
import type { OrganicView } from '@/lib/constants'
import type { SectionOverride } from '@/lib/report-sections/types'
import { ORGANIC_SOCIAL_PARTS } from './parts/registry'
import { wrapsAsBlock } from './parts/export-layout'
import { CODE_TEMPLATES } from './template'
import { buildOrganicSocialCtx, type OrganicSocialCtx } from './ctx'
import { OverviewSkeleton } from './skeletons'
import { lockedRangeFor, logHiddenMonthAttempt, logMalformedConfig, requestClock } from '@/lib/organic-social/locked-range'
import { noMonthsText, viewerForRole } from '@/lib/organic-social/reporting-months'
import { drawnVersion } from '@/lib/organic-social/kit-wraps'
import { kitActive, logMalformedDesignFrom, parseDesignFrom } from '@/lib/organic-social/design-from'
import { NoMonths } from './no-months'
import { AeoInformedSection } from './aeo-informed/section'
import type { AeoRange } from '@/lib/organic-social/aeo-tab/params'
import { SocialListeningSection } from './social-listening/section'
import type { SlTopic } from '@/lib/organic-social/social-listening/types'
import type { SlToggleChart } from '@/lib/organic-social/social-listening/params'
import type { SlAuthorSort } from '@/lib/organic-social/social-listening/picks'
import kitStyles from './design/kit.module.css'

/** The AEO Informed Social tab's own settings, read from the URL by the route (parseAeoRange, parseAeoMin) and its time limit (page 120 s,
 *  export 30 s). Handed to the body on that tab only, so every other tab's body and parts get exactly what they got before. */
export type AeoViewSettings = { range: AeoRange; min: number; deadlineMs: number }
const AEO_DEFAULTS: AeoViewSettings = { range: 'month', min: 2, deadlineMs: 120_000 }

export function OrganicSocialReport({
  clientSlug, dateRange = 'last_30_days', compareRange = null, channel = null, view = null, aeo, aeoMin, aeoDeadlineMs, sl, exporting, slPreview, slCols, slSort,
}: {
  clientSlug: string
  dateRange?: string
  compareRange?: string | null
  channel?: DashChannel | null
  /** 'influencer' on the Influencer tab, 'aeo-informed' on the AEO Informed Social tab (channel stays null on both); null for Overview
   *  and the platform tabs. */
  view?: OrganicView
  /** The AEO Informed Social tab only: its range (aeo=), min competitors (aeomin=) and time limit. Ignored on every other tab. */
  aeo?: AeoRange
  aeoMin?: number
  aeoDeadlineMs?: number
  /** The Social Listening tab only: the open pill (sl=) and whether this render is the PDF export, which prints the client's view,
   *  brand then industry (spec 2026-11-19 sections 4 and 9). Ignored on every other tab. */
  sl?: SlTopic
  exporting?: boolean
  /** The Social Listening tab only: staff's "Preview as client" (slview=client). */
  slPreview?: boolean
  /** The Social Listening tab only: the charts set to columns (slcols, plan 2026-11-24 Unit C), on screen and in the PDF. */
  slCols?: readonly SlToggleChart[]
  /** The Social Listening tab only: the authors table's order (slsort, Unit F), on screen and in the PDF. Posts when absent. */
  slSort?: SlAuthorSort
}) {
  const ctx = buildOrganicSocialCtx({ clientSlug, dateRange, compareRange, channel, view })
  // The Social Listening tab has an analysis box under every card and no Insights or Recommendations of its own, so neither
  // shared header box is rendered and the 'organic-social' commentary is never read on it (R2-7).
  if (view === 'social-listening') {
    return (
      <div className="space-y-8">
        <Suspense fallback={<OverviewSkeleton />}>
          <OrganicSocialBody ctx={ctx} sl={{ topic: sl ?? 'brand', exporting: exporting ?? false, ...(slPreview ? { preview: true } : {}), ...(slCols?.length ? { cols: slCols } : {}), ...(slSort && slSort !== 'posts' ? { sort: slSort } : {}) }} />
        </Suspense>
      </div>
    )
  }
  const aeoSettings: AeoViewSettings | undefined = view === 'aeo-informed'
    ? { range: aeo ?? AEO_DEFAULTS.range, min: aeoMin ?? AEO_DEFAULTS.min, deadlineMs: aeoDeadlineMs ?? AEO_DEFAULTS.deadlineMs }
    : undefined
  // Both boxes (Insights on top, Recommendations at the bottom) are per platform subpage: each channel
  // carries its own content key, while opt-in stays gated on the base 'organic-social' config (configKey)
  // so a per-channel key never needs its own opt-in entry. Overview (channel === null) keeps the bare
  // 'organic-social' key; the Influencer tab has its own. The bottom box derives its own key from this one
  // (recommendationsViewKeyFor).
  const commentaryViewKey: CommentaryViewKey = view === 'influencer' ? 'organic-social:influencer'
    : view === 'aeo-informed' ? 'organic-social:aeo-informed'
    : channel ? orgSocialChannelViewKey(channel) : 'organic-social'
  // The outer component is SYNCHRONOUS so the section's own skeletons paint on first render.
  // Both async dependencies — the viewer-role read (`await auth()`) and the template/config lookup
  // (`getSectionTemplate` is a new critical-path dependency the data sections don't otherwise need)
  // — live inside OrganicSocialBody, behind a Suspense whose fallback IS the section skeletons, so
  // first paint no longer waits on either (PR #168 review R1 #6). `getClientBySlug` is React.cache-deduped.
  return (
    <div className="space-y-8">
      <SharedPartsHeader viewKey={commentaryViewKey} configKey="organic-social" clientSlug={clientSlug} requestedRange={dateRange} />
      <Suspense fallback={<OverviewSkeleton />}>
        <OrganicSocialBody ctx={ctx} {...(aeoSettings ? { aeo: aeoSettings } : {})} />
      </Suspense>
      {/* Recommendations: the same opt-in, rendered after every part (10/6 calls: "put them at the bottom"). */}
      <SharedPartsHeader placement="bottom" viewKey={commentaryViewKey} configKey="organic-social" clientSlug={clientSlug} requestedRange={dateRange} />
    </div>
  )
}

/** Resolves the viewer role, the composition (DB template + per-client override), and renders the
 *  parts. Async and isolated behind the Suspense above so its awaits don't gate first paint. */
export async function OrganicSocialBody({ ctx, aeo, sl }: { ctx: OrganicSocialCtx; aeo?: AeoViewSettings; sl?: { topic: SlTopic; exporting: boolean; preview?: boolean; cols?: readonly SlToggleChart[]; sort?: SlAuthorSort } }) {
  // Viewer role drives the internal-only designation toggle (top-content@2). Read defensively: a
  // failed session lookup must not blank the section, so keep ctx's safe client-role default.
  // The email feeds only the written notes on the v2 graphs. Read in the same guarded call, so a
  // failed session read still means client rules and no email.
  let role: string | undefined
  let email: string | undefined
  try {
    const user = (await auth())?.user
    role = user?.role
    email = user?.email ?? undefined
  } catch { role = undefined; email = undefined }
  const rctx: OrganicSocialCtx = { ...ctx, ...(role ? { role } : {}), ...(email ? { email } : {}) }
  // The AEO Informed Social tab (spec 2026-11-12 section 1): its own section, no template parts. It is served the same month as every
  // other tab: the same three locked-months calls as the parts path below, written out here so that path, Renaissance's, is not touched.
  if (rctx.view === 'aeo-informed') {
    const settings = aeo ?? AEO_DEFAULTS
    let aeoClient: unknown
    let aeoReadFailed = false
    try { aeoClient = await getClientBySlug(rctx.clientSlug) } catch { aeoReadFailed = true }
    const aeoLocked = aeoReadFailed ? null : lockedRangeFor(aeoClient, role, rctx.dateRange, requestClock())
    if (aeoLocked?.reason === 'malformed-config') logMalformedConfig(rctx.clientSlug, aeoLocked.malformedKey)
    const aeoDesignFrom = aeoReadFailed ? null : parseDesignFrom(aeoClient)
    if (aeoDesignFrom?.kind === 'malformed') logMalformedDesignFrom(rctx.clientSlug, aeoDesignFrom.value)
    if (aeoLocked && !aeoLocked.month) return <NoMonths text={noMonthsText(aeoLocked, viewerForRole(role))} />
    if (aeoLocked?.month && aeoLocked.outcome === 'replaced' && aeoLocked.hiddenMonthAttempt) {
      logHiddenMonthAttempt(rctx.clientSlug, rctx.dateRange, aeoLocked.month.dateRange)
    }
    return (
      <AeoInformedSection clientSlug={rctx.clientSlug} servedRange={aeoLocked?.month?.dateRange ?? rctx.dateRange}
        aeo={settings.range} aeoMin={settings.min} role={role} deadlineMs={settings.deadlineMs} monthKey={aeoLocked?.month?.key ?? null} />
    )
  }
  // The Social Listening tab (spec 2026-11-19 section 4): its own section, no template parts, served the same month as every other tab
  // by the same three locked-months calls, as the AEO tab above. The PDF prints the client's view, brand then industry (R2-5).
  if (rctx.view === 'social-listening') {
    let slClient: unknown
    let slReadFailed = false
    try { slClient = await getClientBySlug(rctx.clientSlug) } catch { slReadFailed = true }
    const slLocked = slReadFailed ? null : lockedRangeFor(slClient, role, rctx.dateRange, requestClock())
    if (slLocked?.reason === 'malformed-config') logMalformedConfig(rctx.clientSlug, slLocked.malformedKey)
    if (slLocked && !slLocked.month) return <NoMonths text={noMonthsText(slLocked, viewerForRole(role))} />
    if (slLocked?.month && slLocked.outcome === 'replaced' && slLocked.hiddenMonthAttempt) {
      logHiddenMonthAttempt(rctx.clientSlug, rctx.dateRange, slLocked.month.dateRange)
    }
    const servedRange = slLocked?.month?.dateRange ?? rctx.dateRange
    const exporting = sl?.exporting ?? false
    const section = (topic: SlTopic) => (
      <SocialListeningSection clientSlug={rctx.clientSlug} servedRange={servedRange} role={role} email={email} topic={topic} exporting={exporting}
        {...(sl?.preview && !exporting ? { preview: true } : {})} {...(sl?.cols ? { cols: sl.cols } : {})} {...(sl?.sort ? { sort: sl.sort } : {})} />
    )
    return exporting ? <div className="space-y-12">{section('brand')}{section('industry')}</div> : section(sl?.topic ?? 'brand')
  }
  const key = rctx.view === 'influencer' ? 'organic-social:influencer' : rctx.channel ? 'organic-social:platform' : 'organic-social'
  // Resolve the composition defensively. A DB hiccup here must NOT blank the whole section: on
  // failure, fall back to the in-code template with no per-client override so each part still
  // renders behind its own Suspense/safe() boundary (per-section isolation).
  let template = CODE_TEMPLATES[key]
  let override: SectionOverride | undefined
  try {
    // Two independent reads — run them together, not serialized.
    const [dbTemplate, config] = await Promise.all([
      getSectionTemplate(key),
      getClientBySlug(rctx.clientSlug),
    ])
    template = dbTemplate ?? CODE_TEMPLATES[key]
    override = config?.reportSectionConfig?.[key]
  } catch (e) {
    // Degrade, don't blank: keep the code-template fallback + no override so each part still
    // renders. Log it — otherwise a prod DB failure silently drops every render to the code
    // template and quietly stops applying per-client overrides with no signal at all.
    console.error(`[organic-social] template/config lookup failed for '${key}'; using code template`, e)
  }
  // Locked months (spec 4.6). The lock reads its config on its own, so a template-lookup failure
  // cannot disable it. getClientBySlug is request-deduplicated and every route awaited it first, so
  // this adds no query. If it still fails, today's path runs: every Dash getter needs the same
  // lookup, so no data can load.
  let lockClient: unknown
  let lockReadFailed = false
  try { lockClient = await getClientBySlug(rctx.clientSlug) } catch { lockReadFailed = true }
  const locked = lockReadFailed ? null : lockedRangeFor(lockClient, role, rctx.dateRange, requestClock())
  if (locked?.reason === 'malformed-config') logMalformedConfig(rctx.clientSlug, locked.malformedKey)
  // Option B (spec 2026-11-24-os-design-past-months section 3): a bad designFrom is logged once per render, before the
  // no-months return so a client with no months still logs it. It then draws the old look, like an absent one.
  const designFrom = lockReadFailed ? null : parseDesignFrom(lockClient)
  if (designFrom?.kind === 'malformed') logMalformedDesignFrom(rctx.clientSlug, designFrom.value)
  if (locked && !locked.month) return <NoMonths text={noMonthsText(locked, viewerForRole(role))} />
  // The kit only on a served month on or after designFrom; before it, each kit part draws the version it wraps, which is
  // exactly what the client drew before its pin. A failed client read means no kit.
  const kit = !lockReadFailed && kitActive(lockClient, locked?.month?.key ?? null)
  if (locked?.month && locked.outcome === 'replaced' && locked.hiddenMonthAttempt) {
    logHiddenMonthAttempt(rctx.clientSlug, rctx.dateRange, locked.month.dateRange)
  }
  const pctx: OrganicSocialCtx = locked?.month
    ? { ...rctx, dateRange: locked.month.dateRange, compareRange: locked.month.compareRange }
    : rctx
  const resolved = resolveSection(template, override).map((r) => ({ ...r, version: drawnVersion(r.id, r.version, kit) }))
  const parts = resolved.map((r) => {
    const impl = lookup(ORGANIC_SOCIAL_PARTS, r.id, r.version)
    const node = impl?.render(pctx, r) ?? null
    // A part with no export form of its own is one unbreakable block in the PDF export (parts/export-layout.ts);
    // the attribute only matters under the export page's theme, and a part that lays out its own blocks is untouched.
    return node == null ? null : <div key={`${r.id}@${r.version}`} {...(wrapsAsBlock(r.id, r.version) ? { 'data-export-block': '' } : {})}>{node}</div>
  })
  // The last look fixes, L2 (spec 2026-11-26): a kit month stacks its parts with the artifact's 40px gap (kit .parts); an
  // old-look month keeps the bare fragment, byte for byte (index.test.tsx's old-look pin).
  return kit ? <div className={kitStyles.parts}>{parts}</div> : <>{parts}</>
}
