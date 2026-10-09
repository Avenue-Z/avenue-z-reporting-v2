import { canApproveCommentary, canEditCommentary } from '@/lib/commentary/permissions'
import { viewerForRole } from '../reporting-months'

/** Commentary's rules, applied the way monthly Commentary applies them
 *  (components/report-sections/commentary/monthly.tsx:19-22): a client role is a client whatever
 *  its email; a team role writes with an @avenuez.com email and approves only when that email is
 *  on the notes' OWN allowlist, CHART_NOTES_APPROVERS. Not COMMENTARY_APPROVERS: the organic
 *  social approvers differ from Commentary's (decided 2026-09-24), and neither list grants the
 *  other's approvals. Unset means nobody approves: fail closed. `env` is only for tests. */
export function noteCapabilities(
  role: unknown,
  email: string | null | undefined,
  env: string | undefined = process.env.CHART_NOTES_APPROVERS,
): { canEdit: boolean; canApprove: boolean } {
  if (viewerForRole(role) !== 'team') return { canEdit: false, canApprove: false }
  // env ?? '' and never a bare env: canApproveCommentary's own default argument falls back to
  // COMMENTARY_APPROVERS when it is passed undefined (lib/commentary/permissions.ts:25), which
  // would hand Commentary's approvers the notes whenever the notes' var is unset. Proven by
  // running it, 2026-09-24: the test "notes read their own list" fails on a bare env.
  return { canEdit: canEditCommentary(email), canApprove: canApproveCommentary(email, env ?? '') }
}
