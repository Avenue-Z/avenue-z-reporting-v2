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
import { Fallback } from '../parts/shared'
import { BrandPage } from './brand'
import { StaffNote } from './cards'
import { IndustryPage } from './industry'
import { PreviewToggle, TopicPills } from './pills'
import { UploadControl } from './upload'
import { SlAnalysis } from './analysis'
import s from './sl.module.css'

const RANGE = /^custom:(\d{4}-(?:0[1-9]|1[0-2]))-01,\d{4}-\d{2}-\d{2}$/

/**
 * `servedRange` is the locked month's range the page serves (OrganicSocialBody resolves it, as for the AEO tab). `topic`
 * is the open pill (`sl`). `exporting` is the server-side export flag: the PDF prints the client's view, whoever exports,
 * and prints brand then industry (the export calls this once per topic; an industry topic with nothing to show renders
 * nothing).
 */
export async function SocialListeningSection({ clientSlug, servedRange, role, email, topic, exporting, preview = false }: {
  clientSlug: string; servedRange: string; role: unknown; email: string | null | undefined; topic: SlTopic; exporting: boolean
  /** Staff's "Preview as client" (slview=client): the page renders exactly what the client sees. Ignored for a client role
   *  (always the client view) and in the PDF (always the client view, no toggle). */
  preview?: boolean
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
  const staffViewer = viewerForRole(role) === 'team'
  const previewing = preview && staffViewer && !exporting
  const clientView = !staffViewer || exporting || previewing
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
  const toggle = staffViewer && !exporting ? <PreviewToggle on={previewing} /> : null
  if (clientView && !pills.brand) {
    if (topic !== 'brand' && !previewing) return null
    return (
      <div className={s.root}>
        {toggle && <div className={s.topics}><span className={s.spacer} />{toggle}</div>}
        <div className={s.view}><Slot text={NOT_READY_TEXT} /></div>
      </div>
    )
  }
  const shown: SlTopic = topic === 'industry' && pills.industry ? 'industry' : 'brand'
  // In the export the industry call prints nothing when industry has nothing a client would see.
  if (exporting && topic === 'industry' && shown !== 'industry') return null

  const view = buildTopicView({ topic: shown, month, live, clientView, setting, data, approvedBoxes })
  const boxes: Partial<Record<SlBoxId, ReactNode>> = {}
  for (const id of shown === 'brand' ? SL_BRAND_BOX_IDS : SL_INDUSTRY_BOX_IDS) {
    if (clientView && !approvedBoxes.has(id)) continue
    // A preview renders each box as the client would see it: approved text only, no controls.
    boxes[id] = await monthlyCommentary({
      client, role: previewing ? 'CLIENT_VIEWER' : role, email: previewing ? null : (email ?? null), viewKey: slBoxViewKey(id), requestedRange: servedRange, labels: slBoxLabels(id), entries,
      Panel: SlAnalysis,
    })
  }

  const topicName = shown === 'brand' ? setting.brandTopic : (setting.industryTopic ?? '')
  const upload = clientView ? null
    : view.state === 'live' ? <Slot text={view.liveText!} />
    : caps.canEdit ? <UploadControl clientSlug={clientSlug} topic={shown} range={servedRange}
        label={view.state === 'missing' ? `Upload the ${shown} export for ${view.monthTitle}` : `Upload a new ${shown} export for ${view.monthTitle}`} />
    : view.state === 'missing' ? <Slot text={`No ${shown} export for ${view.monthTitle} yet.`} /> : null

  const props = { view, boxes, clientSlug, range: servedRange, caps, upload, topicName }
  const topics = setting.industryTopic ? `Talkwalker topics: ${setting.brandTopic}, and ${setting.industryTopic}` : `Talkwalker topic: ${setting.brandTopic}`
  return (
    <div className={s.root}>
      {!exporting && (
        <div className={s.topics}>
          <TopicPills topic={shown} industry={pills.industry} brandLabel={`Brand: ${setting.brandTopic}`} industryLabel={`Industry: ${setting.industryTopic ?? ''}`} />
          <span className={s.hint}>{topics}</span>
          <span className={s.spacer} />
          {toggle}
        </div>
      )}
      {exporting && <div className={s.section}><h2>{shown === 'brand' ? 'Brand' : 'Industry'}: {topicName}</h2></div>}
      {view.staffNotes.length > 0 && <div className={s.view}>{view.staffNotes.map((n) => <StaffNote key={n}>{n}</StaffNote>)}</div>}
      {shown === 'brand' ? <BrandPage {...props} /> : <IndustryPage {...props} />}
    </div>
  )
}

/** A plain line in the mockup's slot style (the not-ready text, the live month, a missing upload). */
function Slot({ text }: { text: string }) {
  return <div className={s.slot}><p>{text}</p></div>
}
