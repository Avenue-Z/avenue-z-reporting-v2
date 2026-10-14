// The one access check for every page, route and action of the tool (spec v1.1 §8). It reads the settings row once per
// request and hands the settings back, so callers pass them down instead of reading again.
import { isStaff } from '@/lib/auth/route-access'
import { errorLabel } from './log'
import { accessFor, outboundUsers } from './permissions'
import { readSettingsRow } from './settings-store'
import { resolveSettings, SETTINGS_DEFAULTS, type OutboundSettings } from './settings'

/** Why access was refused: `unavailable` when the settings could not be read, so the refusal may be wrong and the
 *  caller says try again (spec v1.1 §19.7, A3); `forbidden` otherwise. Every refusal carries one (Paul, #388 review). */
export type AccessRefusal = 'forbidden' | 'unavailable'

export type OutboundAccess =
  | { ok: true; email: string; admin: boolean; admins: string[]; settings: OutboundSettings; settingsUpdatedAt: string | null; settingsInvalid: boolean; settingsReadFailed: boolean }
  | { ok: false; admins: string[]; reason: AccessRefusal }

/** The HTTP status of a refusal for every route: 503 (a retry) when access could not be checked, else 403. */
export const refusalStatus = (reason: AccessRefusal): 403 | 503 => (reason === 'unavailable' ? 503 : 403)

export async function outboundAccess(
  user: { role?: string | null; email?: string | null } | null | undefined,
  env: string | undefined = process.env.AEO_OUTBOUND_USERS,
  read: () => Promise<unknown> = readSettingsRow,
): Promise<OutboundAccess> {
  // A non-staff caller never reaches the database.
  if (!user || !isStaff({ role: user.role ?? null })) return { ok: false, admins: [], reason: 'forbidden' }
  const envUsers = outboundUsers(env)
  let settings: OutboundSettings = SETTINGS_DEFAULTS
  let updatedAt: string | null = null
  let invalid = false
  let readFailed = false
  try {
    const r = resolveSettings(await read())
    settings = r.settings
    updatedAt = r.updatedAt
    invalid = r.invalid
  } catch (e) {
    // The settings can't be read: access falls back to the env list only and every other value to config.ts.
    readFailed = true
    console.error(`[aeo-outbound] settings read failed reason=${errorLabel(e)}`)
  }
  const lists = readFailed ? { users: [] as string[], admins: [] as string[] } : settings
  const admins = [...new Set([...envUsers, ...lists.admins])].sort()
  const who = accessFor(user, envUsers, lists)
  // Spec v1.1 §19.7 (A3): with the settings unreadable, a refusal may be wrong (a Settings user is not on the env list),
  // so it says unavailable and every route answers 503 (refusalStatus), which the save queue retries.
  if (!who) return { ok: false, admins, reason: readFailed ? 'unavailable' : 'forbidden' }
  return { ok: true, email: who.email, admin: who.admin, admins, settings, settingsUpdatedAt: updatedAt, settingsInvalid: invalid, settingsReadFailed: readFailed }
}
