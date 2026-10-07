// The Influencer tab (10/6 calls): shown for a client whose Instagram tab is shown and whose Instagram influencer
// section is not hidden (spec B2: default on, no new key). Pure. Also the split rule the tab's part uses, which
// follows the client's Instagram tab so a post is never Influencer on one tab and Organic on the other.
import { resolveSection } from '@/lib/report-sections/resolve'
import type { SectionOverride, SectionTemplate } from '@/lib/report-sections/types'
import { parseInfluencerSection } from './influencer-section'
import { resolveChannels } from './metrics'

export type InfluencerTabClient = {
  dashSocialConfig?: { channels?: string[]; influencerSection?: unknown } | null
  hiddenReports?: readonly string[] | null
}

export const INSTAGRAM_TAB_ID = 'organic-instagram'

export function hasInfluencerTab(client: InfluencerTabClient): boolean {
  if (!resolveChannels(client.dashSocialConfig?.channels).includes('INSTAGRAM')) return false
  if ((client.hiddenReports ?? []).includes(INSTAGRAM_TAB_ID)) return false
  const parsed = parseInfluencerSection(client.dashSocialConfig?.influencerSection)
  const setting = parsed.kind === 'ok' ? parsed.section.INSTAGRAM : undefined
  return !(setting && 'hidden' in setting)
}

export type InfluencerRules = 'outline' | 'designations'

/** 'outline' when the platform composition pins top-content@3 (partitionByAuthor, UGC and author marks), else
 *  'designations' (partitionPosts: the stored choice, then #ad), which is what top-content@2 does. */
export function influencerRulesFor(template: SectionTemplate, override: SectionOverride | undefined): InfluencerRules {
  const pin = resolveSection(template, override).find((p) => p.id === 'top-content')
  return pin?.version === 3 ? 'outline' : 'designations'
}
