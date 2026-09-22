'use server'

import { revalidateTag } from 'next/cache'
import { auth } from '@/auth'
import { getClientBySlug } from '@/lib/db/queries'
import { canSetDesignation } from '@/lib/organic-social/designations/permissions'
import { authorizeDesignation, setDesignation } from '@/lib/organic-social/designations/mutations'
import type { SourceType } from '@/lib/organic-social/types'
import { canHideAnnotation } from '@/lib/organic-social/annotation-hides/permissions'
import { authorizeAnnotationHide, setAnnotationHidden } from '@/lib/organic-social/annotation-hides/mutations'
import type { DashChannel } from '@/lib/organic-social/metrics'
import type { AnnotationChart } from '@/lib/organic-social/annotations'

type Result = { ok: true } | { ok: false; error: string }

/** Set (or overwrite) a post's Organic/Influencer designation. Internal staff only —
 *  the toggle is invisible to CLIENT_* (B8) AND this action re-checks the role, because
 *  a hidden control is not an authorization boundary. */
export async function setDesignationAction(input: {
  clientSlug: string; postId: number; designation: SourceType
}): Promise<Result> {
  const session = await auth()
  const role = session?.user?.role
  const email = session?.user?.email
  if (!role || !canSetDesignation(role)) return { ok: false, error: 'forbidden' }

  const valid = authorizeDesignation({ postId: input.postId, designation: input.designation })
  if (!valid.ok) return { ok: false, error: valid.error! }

  const client = await getClientBySlug(input.clientSlug)
  if (!client) return { ok: false, error: 'client not found' }

  await setDesignation({
    clientId: client.id, postId: input.postId, designation: input.designation, setBy: email ?? 'unknown',
  })
  revalidateTag('db', 'max')
  return { ok: true }
}

/** Hide or unhide one annotation on a v2 graph from the client. Internal staff only: the
 *  control is invisible to CLIENT_* AND this action re-checks the role, because a hidden
 *  control is not an authorization boundary. */
export async function setAnnotationHiddenAction(input: {
  clientSlug: string; channel: string; chart: string; day: string; hidden: boolean
}): Promise<Result> {
  const session = await auth()
  const role = session?.user?.role
  const email = session?.user?.email
  if (!role || !canHideAnnotation(role)) return { ok: false, error: 'forbidden' }

  const valid = authorizeAnnotationHide(input)
  if (!valid.ok) return { ok: false, error: valid.error! }

  const client = await getClientBySlug(input.clientSlug)
  if (!client) return { ok: false, error: 'client not found' }

  await setAnnotationHidden({
    clientId: client.id, channel: input.channel as DashChannel, chart: input.chart as AnnotationChart,
    day: input.day, hidden: input.hidden, setBy: email ?? 'unknown',
  })
  revalidateTag('db', 'max')
  return { ok: true }
}
