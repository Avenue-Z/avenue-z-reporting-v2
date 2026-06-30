'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { planRetry } from '@/lib/dashboard/retry-policy'

// Module-level so all rate-limited blocks on the page share ONE refresh cycle and
// one attempt budget. router.refresh() is a soft refresh — it does not reload the
// JS, so these survive across refreshes and let us bound + back off the retries.
let attempts = 0
let lastAttemptTs = 0
let scheduled = false

/**
 * Inline auto-retry driver for a rate-limited block. On mount it schedules a single
 * bounded router.refresh() (shared across all rate-limited blocks); when the limit
 * passes, the refreshed server render repopulates the blocks. After the attempt
 * budget is spent it stops and leaves the static "recover shortly" copy in place.
 * Renders no card of its own — it augments the existing rate-limited message.
 */
export function RateLimitedRetry() {
  const router = useRouter()
  const [willRetry, setWillRetry] = useState(true)

  useEffect(() => {
    const plan = planRetry(attempts, lastAttemptTs, Date.now())
    if (!plan.retry) {
      setWillRetry(false)
      return
    }
    if (scheduled) return // another block already owns this cycle's refresh
    scheduled = true
    const timer = setTimeout(() => {
      attempts = plan.nextAttempts
      lastAttemptTs = Date.now()
      scheduled = false
      router.refresh()
    }, plan.delayMs)
    return () => {
      clearTimeout(timer)
      scheduled = false
    }
  }, [router])

  if (!willRetry) return null
  return <span aria-live="polite"> Retrying automatically…</span>
}
