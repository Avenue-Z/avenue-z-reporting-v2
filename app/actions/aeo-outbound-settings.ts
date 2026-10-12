'use server'
// Saves the tool's settings (spec v1.1 §8). Admins only, same host only. Every change is one statement with its log rows,
// guarded by the updated_at the page loaded, so the second of two concurrent saves is told to reload.
import { headers } from 'next/headers'
import { updateTag } from 'next/cache'
import { auth } from '@/auth'
import { isAvenueZEmail } from '@/lib/commentary/permissions'
import { outboundAccess } from '@/lib/aeo-outbound/access'
import { errorLabel } from '@/lib/aeo-outbound/log'
import { originAllowed, outboundUsers } from '@/lib/aeo-outbound/permissions'
import { SETTINGS_ERRORS, settingsChanges, validateSettingsInput, type SettingsErrors, type SettingsInput } from '@/lib/aeo-outbound/settings'
import { saveSettings } from '@/lib/aeo-outbound/settings-store'

export type SaveSettingsResult = { ok: true; updatedAt: string | null } | { ok: false; error: string; fieldErrors?: SettingsErrors }

export async function saveSettingsAction(input: SettingsInput, expectedUpdatedAt: string | null): Promise<SaveSettingsResult> {
  const session = await auth()
  const access = await outboundAccess(session?.user)
  const h = await headers()
  if (!access.ok || !access.admin || !originAllowed(h.get('origin'), h.get('host'))) return { ok: false, error: 'forbidden' }
  // A form posts an object; anything else (null, a string) is refused as invalid, not a 500.
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return { ok: false, error: 'invalid', fieldErrors: {} }
  if (access.settingsReadFailed) return { ok: false, error: SETTINGS_ERRORS.readFailed }
  if (expectedUpdatedAt !== access.settingsUpdatedAt) return { ok: false, error: SETTINGS_ERRORS.conflict }
  const checked = validateSettingsInput(input)
  if (!checked.ok) return { ok: false, error: 'invalid', fieldErrors: checked.errors }
  // v1.1 §14: AEO_OUTBOUND_USERS are always admins, so nobody is locked out. Only entries that can sign in count (accessFor requires @avenuez.com). With none, keep one settings admin.
  if ([...outboundUsers(process.env.AEO_OUTBOUND_USERS)].filter(isAvenueZEmail).length === 0 && checked.values.admins.length === 0) {
    return { ok: false, error: 'invalid', fieldErrors: { admins: SETTINGS_ERRORS.lastAdmin } }
  }
  const changes = settingsChanges(access.settingsInvalid ? null : access.settings, checked.values)
  if (!changes.length) return { ok: true, updatedAt: expectedUpdatedAt }
  const now = new Date()
  let saved: boolean
  try {
    saved = await saveSettings(checked.values, changes, access.email, now, expectedUpdatedAt)
  } catch (e) {
    console.error(`[aeo-outbound] settings save failed reason=${errorLabel(e)}`)
    return { ok: false, error: 'unavailable' }
  }
  if (!saved) return { ok: false, error: SETTINGS_ERRORS.conflict }
  updateTag('db')
  return { ok: true, updatedAt: now.toISOString() }
}
