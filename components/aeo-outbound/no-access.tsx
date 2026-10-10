import { ACCESS_MESSAGE } from './messages'

/** Shown to staff who are not on AEO_OUTBOUND_USERS (spec §8). */
export function NoAccess() {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface p-5">
      <p className="text-sm text-white">{ACCESS_MESSAGE}</p>
    </div>
  )
}
