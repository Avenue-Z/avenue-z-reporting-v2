// lib/organic-social/social-listening/capabilities.ts
// Who may do what on the Social Listening tab (spec docs/superpowers/specs/2026-11-19-social-listening-tab-design.md,
// section 10): Commentary's rules, applied the way the chart notes apply them (lib/organic-social/chart-notes/permissions.ts).
import { canApproveCommentary, canEditCommentary } from '@/lib/commentary/permissions'
import { viewerForRole } from '../reporting-months'

/** A client role is a client whatever its email. A team role edits with an @avenuez.com email and approves only when
 *  that email is on COMMENTARY_APPROVERS (the analysis boxes are commentary, so posts and trends share its approvers).
 *  `env ?? ''`, never a bare env: canApproveCommentary's own default would read COMMENTARY_APPROVERS when passed
 *  undefined, so an explicit unset list here still means nobody approves (fail closed). `env` is only for tests. */
export function slCapabilities(
  role: unknown,
  email: string | null | undefined,
  env: string | undefined = process.env.COMMENTARY_APPROVERS,
): { canEdit: boolean; canApprove: boolean } {
  if (viewerForRole(role) !== 'team') return { canEdit: false, canApprove: false }
  return { canEdit: canEditCommentary(email), canApprove: canApproveCommentary(email, env ?? '') }
}
