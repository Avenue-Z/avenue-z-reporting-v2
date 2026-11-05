import { ACCESS_MESSAGE, ACCESS_UNAVAILABLE, NOT_ADMIN, adminsLine, askAdmin } from './messages'

/** Shown to staff who are on no list (spec §8, v1.1 §8), or, when the settings could not be read, a try-again line
 *  instead (v1.1 §19.7, A3): the one component for both access views (Paul, #388 review). */
export function NoAccess({ admins, unavailable = false }: { admins: string[]; unavailable?: boolean }) {
  if (unavailable) {
    return (
      <div className="rounded-lg border border-white/[0.06] bg-bg-surface p-5">
        <p className="text-sm text-text-muted">{ACCESS_UNAVAILABLE}</p>
      </div>
    )
  }
  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface p-5">
      <p className="text-sm text-white">{ACCESS_MESSAGE}</p>
      <p className="mt-2 text-sm text-text-muted">{askAdmin(admins)}</p>
    </div>
  )
}

/** Shown on the Settings page to users who are not admins (v1.1 §8). */
export function NotAdmin({ admins }: { admins: string[] }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface p-5">
      <p className="text-sm text-white">{NOT_ADMIN}</p>
      <p className="mt-2 text-sm text-text-muted">{adminsLine(admins)}</p>
    </div>
  )
}
