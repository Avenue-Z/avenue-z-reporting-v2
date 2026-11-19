// The Social Listening tab's body (spec docs/superpowers/specs/2026-11-19-social-listening-tab-design.md, sections 5 and 9).
// Server only. The flow: the client and its setting -> the served month -> one read of the stored months (getSlMonth) and
// one read of every analysis box (getCommentaryForViewPrefix) -> view-model.ts decides what shows -> brand.tsx or
// industry.tsx render it. `clientView` (a client role, or any export) drives every client rule (R2-1): a staff member's
// PDF can never put a draft, a staff note or an empty staff-only card in front of a client.
import type { ReactNode } from 'react'
import { getClientBySlug, getCommentaryForViewPrefix } from '@/lib/db/queries'
import { clientMonthEntry } from '@/lib/commentary/month'
import type { CommentaryEntry } from '@/lib/commentary/types'
import { lockedRangeFor, requestClock } from '@/lib/organic-social/locked-range'
import { monthOf, viewerForRole } from '@/lib/organic-social/reporting-months'
import { SL_BRAND_BOX_IDS, SL_INDUSTRY_BOX_IDS, SL_VIEW_PREFIX, slBoxLabels, slBoxViewKey, type SlBoxId } from '@/lib/organic-social/social-listening/boxes'
import { slCapabilities } from '@/lib/organic-social/social-listening/capabilities'
import { logMalformedSocialListeningSetting, parseSocialListeningSetting, socialListeningSettingProblem, hasSocialListeningTab } from '@/lib/organic-social/social-listening/setting'
import { getSlMonth } from '@/lib/organic-social/social-listening/store'
import type { SlMonthData, SlTopic } from '@/lib/organic-social/social-listening/types'
import { buildTopicView, NOT_READY_TEXT, servedMonths, topicPills } from '@/lib/organic-social/social-listening/view-model'
import { monthlyCommentary } from '@/components/report-sections/commentary/monthly'
import { NoData } from '../no-data'
import { Fallback } from '../parts/shared'
import { BrandPage } from './brand'
import { StaffNote } from './cards'
import { IndustryPage } from './industry'
import { TopicPills } from './pills'
import { UploadControl } from './upload'

const RANGE = /^custom:(\d{4}-(?:0[1-9]|1[0-2]))-01,\d{4}-\d{2}-\d{2}$/

/**
 * `servedRange` is the locked month's range the page serves (OrganicSocialBody resolves it, as for the AEO tab). `topic`
 * is the open pill (`sl`). `exporting` is the server-side export flag: the PDF prints the client's view, whoever exports,
 * and prints brand then industry (the export calls this once per topic; an industry topic with nothing to show renders
 * nothing).
 */
export async function SocialListeningSection({ clientSlug, servedRange, role, email, topic, exporting }: {
  clientSlug: string; servedRange: string; role: unknown; email: string | null | undefined; topic: SlTopic; exporting: boolean
}) {
  const client = await getClientBySlug(clientSlug)
  if (!client || !hasSocialListeningTab(client)) {
    if (client) {
      const problem = socialListeningSettingProblem(client)
      if (problem) logMalformedSocialListeningSetting(clientSlug, problem)
    }
    return null
  }
  const parsed = parseSocialListeningSetting(client.dashSocialConfig?.socialListening)
  if (parsed.kind !== 'ok') return null
  const setting = parsed.setting

  const m = RANGE.exec(servedRange)
  if (!m) {
    console.error(`[social-listening] served range is not a whole month slug=${clientSlug}`)
    return <Fallback kind="error" />
  }
  const month = m[1]
  const clock = requestClock()
  const clientView = viewerForRole(role) === 'client' || exporting
  const caps = clientView ? { canEdit: false, canApprove: false } : slCapabilities(role, email)
  const live = lockedRangeFor(client, role, servedRange, clock)?.month?.live ?? monthOf(clock.today) === month

  let data: SlMonthData
  let entries: CommentaryEntry[]
  try {
    [data, entries] = await Promise.all([getSlMonth(client.id, servedMonths(month)), getCommentaryForViewPrefix(client.id, SL_VIEW_PREFIX)])
  } catch (e) {
    const code = typeof e === 'object' && e !== null && typeof (e as { code?: unknown }).code === 'string' ? (e as { code: string }).code : 'none'
    console.error(`[social-listening] read failed slug=${clientSlug} month=${month} code=${code}`)
    return <Fallback kind="error" />
  }

  // A box has client text when a client would open on an approved entry for this month (the same rule the commentary
  // panel prints in the PDF).
  const clientMonths = lockedRangeFor(client, 'CLIENT_VIEWER', servedRange, clock)?.months ?? []
  const approvedBoxes = new Set<SlBoxId>(
    [...SL_BRAND_BOX_IDS, ...SL_INDUSTRY_BOX_IDS].filter((id) => clientMonthEntry(entries.filter((e) => e.viewKey === slBoxViewKey(id)), month, clientMonths) !== null),
  )

  const pills = topicPills({ month, data, setting, clientView })
  if (clientView && !pills.brand) return topic === 'brand' ? <NoData message={NOT_READY_TEXT} /> : null
  const shown: SlTopic = topic === 'industry' && pills.industry ? 'industry' : 'brand'
  // In the export the industry call prints nothing when industry has nothing a client would see.
  if (exporting && topic === 'industry' && shown !== 'industry') return null

  const view = buildTopicView({ topic: shown, month, live, clientView, setting, data, approvedBoxes })
  const boxes: Partial<Record<SlBoxId, ReactNode>> = {}
  for (const id of shown === 'brand' ? SL_BRAND_BOX_IDS : SL_INDUSTRY_BOX_IDS) {
    if (clientView && !approvedBoxes.has(id)) continue
    boxes[id] = await monthlyCommentary({
      client, role, email: email ?? null, viewKey: slBoxViewKey(id), requestedRange: servedRange, labels: slBoxLabels(id), entries,
    })
  }

  const topicName = shown === 'brand' ? setting.brandTopic : (setting.industryTopic ?? '')
  const upload = clientView ? null
    : view.state === 'live' ? <NoData message={view.liveText!} />
    : caps.canEdit ? <UploadControl clientSlug={clientSlug} topic={shown} range={servedRange}
        label={view.state === 'missing' ? `Upload the ${shown} export for ${view.monthTitle}` : `Upload a new ${shown} export for ${view.monthTitle}`} />
    : view.state === 'missing' ? <NoData message={`No ${shown} export for ${view.monthTitle} yet.`} /> : null

  const props = { view, boxes, clientSlug, range: servedRange, caps, upload, topicName }
  return (
    <div className="space-y-6">
      {!exporting && (
        <TopicPills topic={shown} industry={pills.industry} brandLabel={`Brand: ${setting.brandTopic}`} industryLabel={`Industry: ${setting.industryTopic ?? ''}`} />
      )}
      {exporting && <h2 className="text-xl font-extrabold text-white">{shown === 'brand' ? 'Brand' : 'Industry'}: {topicName}</h2>}
      {view.staffNotes.map((n) => <StaffNote key={n}>{n}</StaffNote>)}
      {shown === 'brand' ? <BrandPage {...props} /> : <IndustryPage {...props} />}
    </div>
  )
}
