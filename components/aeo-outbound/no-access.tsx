import { ACCESS_MESSAGE, NOT_ADMIN, adminsLine, askAdmin } from './messages'

/** Shown to staff who are on no list (spec §8, v1.1 §8). */
export function NoAccess({ admins }: { admins: string[] }) {
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
