// The Influencer tab (10/6 calls): shown for a client whose Instagram tab is shown and whose Instagram influencer
// section is not hidden (spec B2: default on, no new key). Pure. Also the split rule the tab's part uses, which
// follows the client's Instagram tab so a post is never Influencer on one tab and Organic on the other.
import { resolveSection } from '@/lib/report-sections/resolve'
import type { SectionOverride, SectionTemplate } from '@/lib/report-sections/types'
import { parseInfluencerSection } from './influencer-section'
import { CHANNEL_LABEL, resolveChannels } from './metrics'
import { authorRuleOn } from './outline-top-content'

export type InfluencerTabClient = {
  dashSocialConfig?: { channels?: string[]; influencerSection?: unknown } | null
  hiddenReports?: readonly string[] | null
}

export const INSTAGRAM_TAB_ID = 'organic-instagram'
export const INFLUENCER_TAB_ID = 'organic-influencer'

/** The tab exists for a client whose Instagram tab is shown, whose Influencer tab is not itself hidden (hidden_reports,
 *  the usual per-tab way), and whose Instagram influencer section is not hidden. Hiding the tab by either route turns
 *  the whole rule off, so the galleries show the Instagram influencer row again: the posts are never nowhere. */
export function hasInfluencerTab(client: InfluencerTabClient): boolean {
  if (!resolveChannels(client.dashSocialConfig?.channels).includes('INSTAGRAM')) return false
  const hidden = client.hiddenReports ?? []
  if (hidden.includes(INSTAGRAM_TAB_ID) || hidden.includes(INFLUENCER_TAB_ID)) return false
  const parsed = parseInfluencerSection(client.dashSocialConfig?.influencerSection)
  const setting = parsed.kind === 'ok' ? parsed.section.INSTAGRAM : undefined
  return !(setting && 'hidden' in setting)
}

export type InfluencerRules = 'outline' | 'author' | 'designations'

/** 'outline' when the platform composition pins top-content@3 (partitionByAuthor, UGC and author marks, deck-basis
 *  rate); 'author' when it pins top-content@2 and the client has a saved Instagram handle (the same split, no rate
 *  change; spec 2026-10-09 section 6); else 'designations' (partitionPosts: the stored choice, then #ad). `dsc` is the
 *  client's dash_social_config; absent means no handle. */
export function influencerRulesFor(template: SectionTemplate, override: SectionOverride | undefined, dsc?: unknown): InfluencerRules {
  const pin = resolveSection(template, override).find((p) => p.id === 'top-content')
  if (pin?.version === 3) return 'outline'
  return pin?.version === 2 && authorRuleOn(dsc) ? 'author' : 'designations'
}

/** The gallery rows without the Instagram influencer group, for a client that has the tab (the posts live there
 *  instead, spec B1: moved, not shown twice). Both galleries (top-content@2 and @3) use this, so the rule cannot drift
 *  between them. No client, or no tab: the rows unchanged. */
export function withoutTabbedInfluencer<G extends { platform: string }>(groups: G[], client: InfluencerTabClient | null | undefined): G[] {
  if (!client || !hasInfluencerTab(client)) return groups
  return groups.filter((g) => g.platform !== CHANNEL_LABEL.INSTAGRAM)
}
