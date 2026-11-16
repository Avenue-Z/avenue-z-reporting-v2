// lib/organic-social/aeo-tab/setting.ts
// The AEO Informed Social tab's per-client setting and the rule that offers the tab (spec
// docs/superpowers/specs/2026-11-12-aeo-informed-social-tab-design.md, section 1). Pure: lib/constants.ts imports it, and so do the
// sidebars in the browser, so it must not reach the adapter, the database or anything server-only.
import { FOURTH_GRAPHS, type FourthGraph } from '../aeo-informed/fourth-graph'

export const AEO_TAB_ID = 'organic-aeo-informed'

/** dash_social_config.aeoInformedSocial, parsed, with the defaults filled. */
export type AeoInformedSetting = {
  /** The first day of the client's Peec data: All time starts here. */
  allTimeFrom: string
  /** The Peec source tag that selects the client's social sources (the tag the team applies in Peec; spec 2026-11-13). It must exist
   *  exactly once in the client's Peec project. Default "Organic Social". */
  selector: string
  /** The fourth graph. Default instagram. */
  fourthGraph: FourthGraph
}

export type AeoSettingParse = { kind: 'off' } | { kind: 'ok'; setting: AeoInformedSetting } | { kind: 'malformed'; reason: string }

const KEYS = new Set(['enabled', 'allTimeFrom', 'selector', 'fourthGraph'])
const isDay = (v: unknown): v is string => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const t = new Date(`${v}T00:00:00Z`)
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === v
}

/**
 * `{ enabled: true, allTimeFrom: "YYYY-MM-DD", selector?: string, fourthGraph?: "instagram" | "tiktok" }`. Absent, or `enabled` anything but
 * exactly true, is off: today's behaviour. Anything else wrong, including an unknown key (a typo would otherwise fall back to a default
 * silently), is malformed. A reason names the key, never the value.
 */
export function parseAeoInformedSetting(raw: unknown): AeoSettingParse {
  if (raw === undefined || raw === null) return { kind: 'off' }
  if (typeof raw !== 'object' || Array.isArray(raw)) return { kind: 'malformed', reason: 'aeoInformedSocial is not an object' }
  const o = raw as Record<string, unknown>
  if (o.enabled !== true) return { kind: 'off' }
  const unknown = Object.keys(o).filter((k) => !KEYS.has(k))
  if (unknown.length) return { kind: 'malformed', reason: `unknown key ${unknown.sort().join(', ')} (allowed: ${[...KEYS].join(', ')})` }
  if (!isDay(o.allTimeFrom)) return { kind: 'malformed', reason: 'allTimeFrom is not a real YYYY-MM-DD date' }
  if (o.selector !== undefined && (typeof o.selector !== 'string' || o.selector.trim() === '')) return { kind: 'malformed', reason: 'selector is not a non-empty string' }
  if (o.fourthGraph !== undefined && !FOURTH_GRAPHS.includes(o.fourthGraph as FourthGraph)) return { kind: 'malformed', reason: `fourthGraph must be ${FOURTH_GRAPHS.join(' or ')}` }
  return {
    kind: 'ok',
    setting: { allTimeFrom: o.allTimeFrom, selector: (o.selector as string | undefined) ?? 'Organic Social', fourthGraph: (o.fourthGraph as FourthGraph | undefined) ?? 'instagram' },
  }
}

/** What the tab rule reads. A full client row fits, and so does a trimmed record that carries only the server-computed boolean. */
export type AeoTabClient = {
  aeoInformedTab?: boolean
  dashSocialConfig?: { aeoInformedSocial?: unknown } | null
  peecCustomerProjectId?: string | null
  hiddenReports?: readonly string[] | null
}

/**
 * Whether the client gets the tab. Hidden in hidden_reports: never. A trimmed record (the portal sidebar's) carries `aeoInformedTab`, computed
 * on the server, so the Peec project id never reaches a client's browser. A full row: a valid setting and a non-empty Peec project. Pure, no
 * logging: the server logs a malformed setting where it builds the trimmed record and where the section renders.
 */
export function hasAeoInformedTab(client: AeoTabClient): boolean {
  if (client.hiddenReports?.includes(AEO_TAB_ID)) return false
  if (typeof client.aeoInformedTab === 'boolean') return client.aeoInformedTab
  return parseAeoInformedSetting(client.dashSocialConfig?.aeoInformedSocial).kind === 'ok'
    && typeof client.peecCustomerProjectId === 'string' && client.peecCustomerProjectId.trim() !== ''
}

/** Why a client's setting gives no tab, or null when it is off or usable: a malformed setting, or a valid one with no Peec project. */
export function aeoSettingProblem(client: AeoTabClient): string | null {
  const parsed = parseAeoInformedSetting(client.dashSocialConfig?.aeoInformedSocial)
  if (parsed.kind === 'malformed') return parsed.reason
  if (parsed.kind === 'ok' && !(typeof client.peecCustomerProjectId === 'string' && client.peecCustomerProjectId.trim() !== '')) {
    return 'the setting is on but the client has no peec_customer_project_id'
  }
  return null
}

export function logMalformedAeoSetting(slug: string, reason: string): void {
  console.warn(`[aeo-informed] the aeoInformedSocial setting is not usable, so the tab is off slug=${slug}: ${reason}`)
}
