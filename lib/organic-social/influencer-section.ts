// dash_social_config.influencerSection (PR #306): per channel, hide the Influencer Posts section or rename it. Read by
// top-content@3 (the section on a platform tab), by the Influencer tab rule for every client, top-content@2 clients included
// (hasInfluencerTab: a hidden Instagram setting means no tab), by the tab's part (the Instagram label names its
// heading), and the parsed value reaches the portal browser through toPortalSidebarClient. Absent: today's section.
// Invalid: today's section, and the part warns with the slug.
import { CHANNELS, CHANNEL_LABEL, type DashChannel } from './metrics'

export type InfluencerSetting = { hidden: true } | { label: string }
export type InfluencerSection = Partial<Record<DashChannel, InfluencerSetting>>

const MAX_LABEL = 40
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const hasOwn = (o: Record<string, unknown>, k: string) => Object.prototype.hasOwnProperty.call(o, k)

export function parseInfluencerSection(value: unknown): { kind: 'ok'; section: InfluencerSection } | { kind: 'none' } | { kind: 'invalid' } {
  if (value === undefined) return { kind: 'none' }
  if (!isObj(value)) return { kind: 'invalid' }
  const section: InfluencerSection = {}
  for (const [key, setting] of Object.entries(value)) {
    // Keys are Dash channel names. Anything else (a lowercase name, a channel we do not report) is ignored.
    if (!(CHANNELS as readonly string[]).includes(key)) continue
    if (!isObj(setting) || Object.keys(setting).length !== 1) return { kind: 'invalid' }
    // Own keys only: the one key counted above must be the one read here, never an inherited property.
    if (hasOwn(setting, 'hidden') && setting.hidden === true) { section[key as DashChannel] = { hidden: true }; continue }
    if (hasOwn(setting, 'label') && typeof setting.label === 'string') {
      const label = setting.label.trim()
      if (label.length === 0 || label.length > MAX_LABEL) return { kind: 'invalid' }
      section[key as DashChannel] = { label }
      continue
    }
    return { kind: 'invalid' }
  }
  return { kind: 'ok', section }
}

/** The keys the parser skips, for a warning: a key whose upper-case form is a channel (a miscased
 *  channel, the slip this exists to catch) is named; any other key is only counted, since hand-typed jsonb could hold
 *  anything. Anything that is not an object reports nothing (the parser already calls it invalid or absent). */
export function ignoredInfluencerKeys(value: unknown): { miscased: string[]; other: number } {
  const out = { miscased: [] as string[], other: 0 }
  if (!isObj(value)) return out
  for (const key of Object.keys(value)) {
    if ((CHANNELS as readonly string[]).includes(key)) continue
    if ((CHANNELS as readonly string[]).includes(key.toUpperCase())) out.miscased.push(key)
    else out.other++
  }
  return out
}

/** The platforms whose influencer row is not rendered, as the gallery labels them (PlatformGroup.platform). */
export function hiddenInfluencerPlatforms(section: InfluencerSection): Set<string> {
  return new Set((Object.keys(section) as DashChannel[]).filter((c) => section[c] && 'hidden' in section[c]!).map((c) => CHANNEL_LABEL[c]))
}

/** The heading for the tab on screen, or undefined for today's. The heading is one per section, so only a platform tab
 *  whose channel has a label gets it; Overview (channel null) always keeps the default. */
export function influencerLabel(section: InfluencerSection, channel: DashChannel | null): string | undefined {
  const s = channel ? section[channel] : undefined
  return s && 'label' in s ? s.label : undefined
}
