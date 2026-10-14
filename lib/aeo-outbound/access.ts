// The one access check for every page, route and action of the tool (spec v1.1 §8). It reads the settings row once per
// request and hands the settings back, so callers pass them down instead of reading again.
import { isStaff } from '@/lib/auth/route-access'
import { errorLabel } from './log'
import { accessFor, outboundUsers } from './permissions'
import { readSettingsRow } from './settings-store'
import { resolveSettings, SETTINGS_DEFAULTS, type OutboundSettings } from './settings'

export type OutboundAccess =
  | { ok: true; email: string; admin: boolean; admins: string[]; settings: OutboundSettings; settingsUpdatedAt: string | null; settingsInvalid: boolean; settingsReadFailed: boolean }
  | { ok: false; admins: string[]; unavailable?: true }

export async function outboundAccess(
  user: { role?: string | null; email?: string | null } | null | undefined,
  env: string | undefined = process.env.AEO_OUTBOUND_USERS,
  read: () => Promise<unknown> = readSettingsRow,
): Promise<OutboundAccess> {
  // A non-staff caller never reaches the database.
  if (!user || !isStaff({ role: user.role ?? null })) return { ok: false, admins: [] }
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
  // so it says unavailable and the editor's routes answer 503, which the save queue retries.
  if (!who) return readFailed ? { ok: false, admins, unavailable: true } : { ok: false, admins }
  return { ok: true, email: who.email, admin: who.admin, admins, settings, settingsUpdatedAt: updatedAt, settingsInvalid: invalid, settingsReadFailed: readFailed }
}
