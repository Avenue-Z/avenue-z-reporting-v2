/** True iff the email belongs to the @avenuez.com domain (case-insensitive). */
export function isAvenueZEmail(email: string | null | undefined): boolean {
  if (!email) return false
  return email.trim().toLowerCase().endsWith('@avenuez.com')
}

/** Parse the COMMENTARY_APPROVERS env var (comma-separated) into a normalized set. */
export function getApprovers(env: string | undefined = process.env.COMMENTARY_APPROVERS): Set<string> {
  return new Set(
    (env ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  )
}

/** Any Avenue Z staff member may write/edit commentary and view drafts. */
export function canEditCommentary(email: string | null | undefined): boolean {
  return isAvenueZEmail(email)
}

/** Only allowlisted Avenue Z staff (Maddie/Dianna) may approve or revoke. */
export function canApproveCommentary(
  email: string | null | undefined,
  env: string | undefined = process.env.COMMENTARY_APPROVERS,
): boolean {
  if (!isAvenueZEmail(email)) return false
  return getApprovers(env).has((email as string).trim().toLowerCase())
}
