/** Re-warm cache rows older than this. */
export const SM_DIM_CACHE_TTL_MS = 24 * 60 * 60 * 1000

/** True iff a cron secret is configured and the Authorization header matches `Bearer <secret>`. */
export function isValidCronAuth(authHeader: string | null, cronSecret: string | undefined): boolean {
  if (!cronSecret) return false
  return authHeader === `Bearer ${cronSecret}`
}
