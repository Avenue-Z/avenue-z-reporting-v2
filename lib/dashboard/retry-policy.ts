/**
 * Auto-retry policy for rate-limited (and timed-out) dashboard blocks.
 *
 * A block that renders the 'rate-limited' state is server-rendered once and will
 * not recover on its own — the user has to refresh. RateLimitedRetry drives a
 * bounded sequence of router.refresh() calls so the block repopulates once the
 * limit passes. This module holds the pure decision so it can be unit-tested
 * without React/timers.
 */
export const RL_MAX_ATTEMPTS = 3
export const RL_BASE_DELAY_MS = 4000 // first wait; doubles each attempt (4s, 8s, 16s)
export const RL_RESET_AFTER_MS = 120_000 // a gap this long means a new rate-limit episode

export type RetryPlan =
  | { retry: false }
  | { retry: true; delayMs: number; nextAttempts: number }

/**
 * Decide whether and when to auto-retry, given how many attempts have already
 * fired in this episode and when the last one was. If the last attempt was longer
 * ago than the reset window, the episode is considered fresh (attempts reset to 0),
 * so a block that recovered and is rate-limited again later gets a full new budget.
 */
export function planRetry(attempts: number, lastAttemptTs: number, now: number): RetryPlan {
  const episodeAttempts = now - lastAttemptTs > RL_RESET_AFTER_MS ? 0 : attempts
  if (episodeAttempts >= RL_MAX_ATTEMPTS) return { retry: false }
  return { retry: true, delayMs: RL_BASE_DELAY_MS * 2 ** episodeAttempts, nextAttempts: episodeAttempts + 1 }
}
