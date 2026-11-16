import { requireStaff } from '@/lib/auth/page-access'
import { outboundAccess } from '@/lib/aeo-outbound/access'
import { errorLabel } from '@/lib/aeo-outbound/log'
import { outboundUsers } from '@/lib/aeo-outbound/permissions'
import { recentSettingsLogQuery } from '@/lib/aeo-outbound/settings-store'
import { NoAccess, NotAdmin } from '@/components/aeo-outbound/no-access'
import { SettingsForm, type SettingsLogEntry } from '@/components/aeo-outbound/settings-form'

export default async function NewBusinessSettingsPage() {
  const session = await requireStaff()
  const access = await outboundAccess(session.user)
  // Spec v1.1 §19.7 (A3): unreadable settings are a moment to retry, not a refusal.
  if (!access.ok) return <NoAccess admins={access.admins} unavailable={access.reason === 'unavailable'} />
  if (!access.admin) return <NotAdmin admins={access.admins} />
  let log: SettingsLogEntry[] = []
  try {
    log = (await recentSettingsLogQuery(20)).map((l) => ({ changedAt: l.changedAt.toISOString(), changedBy: l.changedBy, field: l.field }))
  } catch (e) {
    // The log is a detail: the form still shows and saves.
    console.error(`[aeo-outbound] settings log read failed reason=${errorLabel(e)}`)
  }
  // Every prop is plain data: check:rsc.
  return (
    <SettingsForm
      initial={access.settings} updatedAt={access.settingsUpdatedAt} readFailed={access.settingsReadFailed} invalid={access.settingsInvalid}
      envAdmins={[...outboundUsers(process.env.AEO_OUTBOUND_USERS)].sort()} log={log}
    />
  )
}
