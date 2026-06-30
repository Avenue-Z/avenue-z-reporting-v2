// lib/dashboard/retry-policy.test.ts
// Run: npx tsx lib/dashboard/retry-policy.test.ts
import { strict as assert } from 'node:assert'
import { planRetry, RL_BASE_DELAY_MS, RL_MAX_ATTEMPTS, RL_RESET_AFTER_MS } from './retry-policy'

const NOW = 1_000_000_000_000

// First attempt of a fresh episode (no prior attempt) → retry at base delay.
{
  const p = planRetry(0, 0, NOW)
  assert.equal(p.retry, true)
  if (p.retry) { assert.equal(p.delayMs, RL_BASE_DELAY_MS); assert.equal(p.nextAttempts, 1) }
}

// Backoff doubles with recent attempts.
{
  const p = planRetry(1, NOW, NOW)
  assert.equal(p.retry, true)
  if (p.retry) { assert.equal(p.delayMs, RL_BASE_DELAY_MS * 2); assert.equal(p.nextAttempts, 2) }
}
{
  const p = planRetry(2, NOW, NOW)
  assert.equal(p.retry, true)
  if (p.retry) { assert.equal(p.delayMs, RL_BASE_DELAY_MS * 4); assert.equal(p.nextAttempts, 3) }
}

// Budget exhausted → give up.
assert.equal(planRetry(RL_MAX_ATTEMPTS, NOW, NOW).retry, false)

// A long gap since the last attempt resets the episode, restoring the full budget.
{
  const p = planRetry(RL_MAX_ATTEMPTS, NOW - RL_RESET_AFTER_MS - 1, NOW)
  assert.equal(p.retry, true)
  if (p.retry) { assert.equal(p.delayMs, RL_BASE_DELAY_MS); assert.equal(p.nextAttempts, 1) }
}

console.log('ok')
