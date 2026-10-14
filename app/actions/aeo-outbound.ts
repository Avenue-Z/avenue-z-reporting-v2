'use server'

import { headers } from 'next/headers'
import { refresh } from 'next/cache'
import { auth } from '@/auth'
import { DECISIONS } from '@/lib/aeo-outbound/config'
import { errorLabel } from '@/lib/aeo-outbound/log'
import { preparedDay } from '@/lib/aeo-outbound/metrics'
import { originAllowed } from '@/lib/aeo-outbound/permissions'
import { outboundAccess } from '@/lib/aeo-outbound/access'
import { cleanRecipient } from '@/lib/aeo-outbound/recipient'
import { renderSnapshotHtml } from '@/lib/aeo-outbound/render'
import { needsValidationPaths, withDefaults } from '@/lib/aeo-outbound/slots'
import { SHARE_TOKEN_UNIQUE, approveQuery, copyAsDraft, discardQuery, getReport, isConstraintViolation, isReportId, revokeQuery } from '@/lib/aeo-outbound/store'
import { newShareToken } from '@/lib/aeo-outbound/token'

type Fail = { ok: false; error: string }
const FORBIDDEN: Fail = { ok: false, error: 'forbidden' }
const NOT_FOUND: Fail = { ok: false, error: 'not found' }
const STALE: Fail = { ok: false, error: 'stale' }
/** A database failure. The editor and hub show it as "Lost connection. Try again." */
const UNAVAILABLE: Fail = { ok: false, error: 'unavailable' }

/** The caller's email when they are allowlisted staff on a same-host request; otherwise the refusal. A foreign Origin is
 *  forbidden first; settings that could not be read are unavailable, a retry, never forbidden (spec v1.1 §19.7, A3). */
async function caller(): Promise<string | Fail> {
  const h = await headers()
  if (!originAllowed(h.get('origin'), h.get('host'))) return FORBIDDEN
  const session = await auth()
  const access = await outboundAccess(session?.user)
  if (!access.ok) return access.reason === 'unavailable' ? UNAVAILABLE : FORBIDDEN
  return access.email
}

/**
 * Runs an action's database work. A throw is logged as one line naming the action, the id and the error's code (never
 * its message: a Drizzle message carries the SQL params, so the email, the share token, the recipient and the HTML)
 * and answers unavailable.
 */
async function guarded<T>(action: 'approve' | 'revoke' | 'discard' | 'copy', id: string, work: () => Promise<T | Fail>): Promise<T | Fail> {
  try {
    return await work()
  } catch (e) {
    console.error(`[aeo-outbound] ${action} failed id=${id} reason=${errorLabel(e)}`)
    return UNAVAILABLE
  }
}

export async function approveSnapshotAction(id: string, revision: number, recipient: string): Promise<{ ok: true; token: string } | Fail> {
  const email = await caller()
  if (typeof email !== 'string') return email
  if (!isReportId(id) || !Number.isInteger(revision)) return NOT_FOUND
  return guarded('approve', id, async () => {
    const row = await getReport(id)
    if (!row) return NOT_FOUND
    // The row exists but changed under the editor: approved, failed, or edited since it was shown.
    if (row.status !== 'draft' || row.revision !== revision) return STALE
    if (!row.data || !row.slots || row.unreadable) return NOT_FOUND
    const who = cleanRecipient(recipient)
    if (!who.ok) return { ok: false, error: who.error } as Fail
    const slots = withDefaults(row.slots, row.data)
    if (DECISIONS.needsValidationBlocksApprove && needsValidationPaths(slots).length) return { ok: false, error: 'Fill in every "Needs validation" first.' } as Fail
    const now = new Date()
    // Spec v1.1 §19.8: the Prepared date never falls before the data window's last day.
    const html = renderSnapshotHtml(row.data, slots, 'final', preparedDay(now, row.data.window.end))
    const write = (token: string) => approveQuery(id, revision, { html, token, recipient: who.value, by: email, now })
    let done
    try {
      done = await write(newShareToken())
    } catch (e) {
      // A 144-bit token colliding is vanishingly rare; one retry with a new token, any other failure propagates.
      if (!isConstraintViolation(e, SHARE_TOKEN_UNIQUE)) throw e
      done = await write(newShareToken())
    }
    if (!done.length || !done[0].shareToken) return STALE
    refresh()
    return { ok: true as const, token: done[0].shareToken }
  })
}

export async function revokeSnapshotAction(id: string): Promise<{ ok: true } | Fail> {
  const email = await caller()
  if (typeof email !== 'string') return email
  if (!isReportId(id)) return NOT_FOUND
  return guarded('revoke', id, async () => {
    const done = await revokeQuery(id, email, new Date())
    if (!done.length) return NOT_FOUND
    refresh()
    return { ok: true as const }
  })
}

export async function discardSnapshotAction(id: string): Promise<{ ok: true } | Fail> {
  const email = await caller()
  if (typeof email !== 'string') return email
  if (!isReportId(id)) return NOT_FOUND
  return guarded('discard', id, async () => {
    const done = await discardQuery(id, email, new Date())
    if (!done.length) return NOT_FOUND
    refresh()
    return { ok: true as const }
  })
}

export async function copySnapshotAsDraftAction(id: string): Promise<{ ok: true; id: string } | Fail> {
  const email = await caller()
  if (typeof email !== 'string') return email
  if (!isReportId(id)) return NOT_FOUND
  return guarded('copy', id, async () => {
    const newId = await copyAsDraft(id, email, new Date())
    if (!newId) return NOT_FOUND
    refresh()
    return { ok: true as const, id: newId }
  })
}
