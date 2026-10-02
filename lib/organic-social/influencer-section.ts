// dash_social_config.influencerSection (spec docs/superpowers/specs/2026-10-02-os-jasmine-call-changes-design.md
// section 4): per channel, hide top-content@3's Influencer Posts section or rename it. Read only by top-content@3, which
// Renaissance never renders. Absent: today's section. Invalid: today's section, and the part warns with the slug.
import { CHANNELS, CHANNEL_LABEL, type DashChannel } from './metrics'

export type InfluencerSetting = { hidden: true } | { label: string }
export type InfluencerSection = Partial<Record<DashChannel, InfluencerSetting>>

const MAX_LABEL = 40
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export function parseInfluencerSection(value: unknown): { kind: 'ok'; section: InfluencerSection } | { kind: 'none' } | { kind: 'invalid' } {
  if (value === undefined) return { kind: 'none' }
  if (!isObj(value)) return { kind: 'invalid' }
  const section: InfluencerSection = {}
  for (const [key, setting] of Object.entries(value)) {
    // Keys are Dash channel names. Anything else (a lowercase name, a channel we do not report) is ignored.
    if (!(CHANNELS as readonly string[]).includes(key)) continue
    if (!isObj(setting) || Object.keys(setting).length !== 1) return { kind: 'invalid' }
    if (setting.hidden === true) { section[key as DashChannel] = { hidden: true }; continue }
    if (typeof setting.label === 'string') {
      const label = setting.label.trim()
      if (label.length === 0 || label.length > MAX_LABEL) return { kind: 'invalid' }
      section[key as DashChannel] = { label }
      continue
    }
    return { kind: 'invalid' }
  }
  return { kind: 'ok', section }
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
