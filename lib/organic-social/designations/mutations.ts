import { db } from '@/lib/db/client'
import { postDesignations } from '@/lib/db/schema'
import type { SourceType } from '../types'

const VALID = new Set<SourceType>(['organic', 'influencer'])

/** Pure validation for the server-action payload. Kept out of the action file so it
 *  is unit-testable (a 'use server' module may only export async actions). */
export function authorizeDesignation(input: { postId: number; designation: string }): { ok: boolean; error?: string } {
  if (!Number.isInteger(input.postId) || input.postId <= 0) return { ok: false, error: 'invalid postId' }
  if (!VALID.has(input.designation as SourceType)) return { ok: false, error: 'invalid designation' }
  return { ok: true }
}

/** Upsert the per-post designation. A stored row always wins over the suggestion, so
 *  this overwrites on conflict (client_id, post_id) — including writing back 'organic'
 *  to un-mark an #ad-suggested post. */
export async function setDesignation(args: {
  clientId: string; postId: number; designation: SourceType; setBy: string
}): Promise<void> {
  await db
    .insert(postDesignations)
    .values({ clientId: args.clientId, postId: args.postId, designation: args.designation, setBy: args.setBy })
    .onConflictDoUpdate({
      target: [postDesignations.clientId, postDesignations.postId],
      set: { designation: args.designation, setBy: args.setBy, setAt: new Date() },
    })
}
