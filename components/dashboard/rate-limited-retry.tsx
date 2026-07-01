'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { retryController } from '@/lib/dashboard/retry-controller'

/**
 * Inline auto-retry driver for a rate-limited block. On mount it registers with the
 * page-wide retry controller, which runs a single self-rescheduling, backed-off
 * router.refresh() chain (4s/8s/16s/32s/64s) until the limit passes or the budget is
 * spent. Unlike the previous version this does NOT rely on the component remounting
 * to schedule each retry — the chain re-arms itself — so all retries actually fire.
 * On unmount (block recovered, or navigated away) it releases; when the last
 * rate-limited block releases, the chain stops. Renders no card of its own.
 */
export function RateLimitedRetry() {
  const router = useRouter()
  useEffect(() => retryController.acquire(() => router.refresh()), [router])
  return <span aria-live="polite"> Retrying automatically…</span>
}
