'use client'

import { useState, useTransition } from 'react'
import { setDesignationAction } from '@/app/actions/organic-social'
import type { SourceType } from '@/lib/organic-social/types'

/** Internal-staff-only control. Rendered only when `canEdit` is true (the parent gates
 *  on canSetDesignation server-side); the server action re-checks regardless. Optimistic:
 *  flips immediately, reverts on failure. Freshness after success comes from the action's
 *  revalidateTag('db'), which re-partitions the post into the other section. */
export function DesignationToggle({
  clientSlug, postId, value,
}: { clientSlug: string; postId: number; value: SourceType }) {
  const [current, setCurrent] = useState<SourceType>(value)
  const [pending, startTransition] = useTransition()

  function toggle() {
    const next: SourceType = current === 'organic' ? 'influencer' : 'organic'
    setCurrent(next) // optimistic
    startTransition(async () => {
      const res = await setDesignationAction({ clientSlug, postId, designation: next })
      if (!res.ok) setCurrent(current) // revert on failure
    })
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      className="whitespace-nowrap rounded-full border border-white/[0.12] px-2 py-0.5 text-[11px] font-bold text-text-muted hover:text-white disabled:opacity-50"
    >
      {current === 'organic' ? 'Organic' : 'Influencer'} · change
    </button>
  )
}
