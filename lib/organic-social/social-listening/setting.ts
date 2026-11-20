// lib/organic-social/social-listening/setting.ts
// The Social Listening tab's per-client setting and the rule that offers the tab (spec
// docs/superpowers/specs/2026-11-19-social-listening-tab-design.md, section 4). Pure, like aeo-tab/setting.ts: lib/constants.ts imports it,
// and so do the sidebars in the browser, so it must not reach the database or anything server-only.
import { hasReportingMonths } from '../reporting-months'

export const SOCIAL_LISTENING_TAB_ID = 'organic-social-listening'

/** dash_social_config.socialListening, parsed, with the defaults filled. */
export type SocialListeningSetting = {
  /** The Talkwalker topic name of the brand export, without surrounding spaces. */
  brandTopic: string
  /** The Talkwalker topic name of the industry export, or null: no Industry pill and no industry sections. */
  industryTopic: string | null
  /** The percent Talkwalker samples the industry topic at (1 to 100), shown as "<n>% sample"; null for no label. */
  industrySample: number | null
}

export type SocialListeningSettingParse = { kind: 'off' } | { kind: 'ok'; setting: SocialListeningSetting } | { kind: 'malformed'; reason: string }

// paidSheet is reserved for Phase 2 (paid sentiment, spec section 12) and stays unknown until that build adds it.
const KEYS = new Set(['enabled', 'brandTopic', 'industryTopic', 'industrySample'])
const topic = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

/**
 * `{ enabled: true, brandTopic: string, industryTopic?: string, industrySample?: 1..100 }`. Absent, or `enabled` anything but exactly true,
 * is off: today's behaviour. Anything else wrong is malformed: an unknown key (a typo would otherwise drop a field silently), a topic that
 * is not a non-empty string, the two topics the same, or an industrySample that is not an integer 1 to 100 or comes without an industry
 * topic. A reason names the key, never the value.
 */
export function parseSocialListeningSetting(raw: unknown): SocialListeningSettingParse {
  if (raw === undefined || raw === null) return { kind: 'off' }
  if (typeof raw !== 'object' || Array.isArray(raw)) return { kind: 'malformed', reason: 'socialListening is not an object' }
  const o = raw as Record<string, unknown>
  if (o.enabled !== true) return { kind: 'off' }
  const unknown = Object.keys(o).filter((k) => !KEYS.has(k))
  if (unknown.length) return { kind: 'malformed', reason: `unknown key ${unknown.sort().join(', ')} (allowed: ${[...KEYS].join(', ')})` }
  const brandTopic = topic(o.brandTopic)
  if (brandTopic === null) return { kind: 'malformed', reason: 'brandTopic is not a non-empty string' }
  const hasIndustry = 'industryTopic' in o
  const industryTopic = hasIndustry ? topic(o.industryTopic) : null
  if (hasIndustry && industryTopic === null) return { kind: 'malformed', reason: 'industryTopic is not a non-empty string' }
  if (industryTopic !== null && industryTopic === brandTopic) return { kind: 'malformed', reason: 'industryTopic is the same as brandTopic' }
  let industrySample: number | null = null
  if ('industrySample' in o) {
    const n = o.industrySample
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > 100) return { kind: 'malformed', reason: 'industrySample must be an integer from 1 to 100' }
    if (industryTopic === null) return { kind: 'malformed', reason: 'industrySample is set without industryTopic' }
    industrySample = n
  }
  return { kind: 'ok', setting: { brandTopic, industryTopic, industrySample } }
}

/** What the tab rule reads. A full client row fits, and so does a trimmed record that carries only the server-computed boolean. */
export type SocialListeningTabClient = {
  socialListeningTab?: boolean
  dashSocialConfig?: { socialListening?: unknown; reportingMonths?: unknown } | null
  hiddenReports?: readonly string[] | null
}

/**
 * Whether the client gets the tab. Hidden in hidden_reports: never. A trimmed record (the portal sidebar's) carries `socialListeningTab`,
 * computed on the server, and that boolean decides, so the setting never reaches a client's browser. A full row: a valid setting and the
 * client on reporting months. Pure, no logging: the server logs a malformed setting where it builds the trimmed record and where the
 * section renders.
 */
export function hasSocialListeningTab(client: SocialListeningTabClient): boolean {
  if (client.hiddenReports?.includes(SOCIAL_LISTENING_TAB_ID)) return false
  if (typeof client.socialListeningTab === 'boolean') return client.socialListeningTab
  return parseSocialListeningSetting(client.dashSocialConfig?.socialListening).kind === 'ok' && hasReportingMonths(client)
}

/** Why a client's setting gives no tab, or null when it is off or usable: a malformed setting, or a valid one on a client without
 *  reporting months. */
export function socialListeningSettingProblem(client: SocialListeningTabClient): string | null {
  const parsed = parseSocialListeningSetting(client.dashSocialConfig?.socialListening)
  if (parsed.kind === 'malformed') return parsed.reason
  if (parsed.kind === 'ok' && !hasReportingMonths(client)) return 'the setting is on but the client has no dash_social_config.reportingMonths'
  return null
}

export function logMalformedSocialListeningSetting(slug: string, reason: string): void {
  console.warn(`[social-listening] the socialListening setting is not usable, so the tab is off slug=${slug}: ${reason}`)
}
