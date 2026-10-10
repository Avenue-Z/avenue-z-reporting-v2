'use server'

import { headers } from 'next/headers'
import { updateTag } from 'next/cache'
import { auth } from '@/auth'
import { DECISIONS } from '@/lib/aeo-outbound/config'
import { fmtEasternDay } from '@/lib/aeo-outbound/metrics'
import { originAllowed, outboundEmail } from '@/lib/aeo-outbound/permissions'
import { cleanRecipient } from '@/lib/aeo-outbound/recipient'
import { renderSnapshotHtml } from '@/lib/aeo-outbound/render'
import { needsValidationPaths } from '@/lib/aeo-outbound/slots'
import { SHARE_TOKEN_UNIQUE, approveQuery, copyAsDraft, discardQuery, getReport, isConstraintViolation, isReportId, revokeQuery } from '@/lib/aeo-outbound/store'
import { newShareToken } from '@/lib/aeo-outbound/token'

type Fail = { ok: false; error: string }
const FORBIDDEN: Fail = { ok: false, error: 'forbidden' }
const NOT_FOUND: Fail = { ok: false, error: 'not found' }

/** The caller's email when they are allowlisted staff on a same-host request; otherwise null. */
async function caller(): Promise<string | null> {
  const session = await auth()
  const email = outboundEmail(session?.user)
  if (!email) return null
  const h = await headers()
  return originAllowed(h.get('origin'), h.get('host')) ? email : null
}

export async function approveSnapshotAction(id: string, revision: number, recipient: string): Promise<{ ok: true; token: string } | Fail> {
  const email = await caller()
  if (!email) return FORBIDDEN
  if (!isReportId(id) || !Number.isInteger(revision)) return NOT_FOUND
  const row = await getReport(id)
  if (!row || row.status !== 'draft' || !row.data || !row.slots) return NOT_FOUND
  const who = cleanRecipient(recipient)
  if (!who.ok) return { ok: false, error: who.error }
  if (DECISIONS.needsValidationBlocksApprove && needsValidationPaths(row.slots).length) return { ok: false, error: 'Fill in every "Needs validation" first.' }
  const now = new Date()
  const html = renderSnapshotHtml(row.data, row.slots, 'final', fmtEasternDay(now))
  const write = (token: string) => approveQuery(id, revision, { html, token, recipient: who.value, by: email, now })
  let done
  try {
    done = await write(newShareToken())
  } catch (e) {
    // A 144-bit token colliding is vanishingly rare; one retry with a new token, any other failure propagates.
    if (!isConstraintViolation(e, SHARE_TOKEN_UNIQUE)) throw e
    done = await write(newShareToken())
  }
  if (!done.length || !done[0].shareToken) return { ok: false, error: 'stale' }
  updateTag('db')
  return { ok: true, token: done[0].shareToken }
}

export async function revokeSnapshotAction(id: string): Promise<{ ok: true } | Fail> {
  const email = await caller()
  if (!email) return FORBIDDEN
  if (!isReportId(id)) return NOT_FOUND
  const done = await revokeQuery(id, email, new Date())
  if (!done.length) return NOT_FOUND
  updateTag('db')
  return { ok: true }
}

export async function discardSnapshotAction(id: string): Promise<{ ok: true } | Fail> {
  const email = await caller()
  if (!email) return FORBIDDEN
  if (!isReportId(id)) return NOT_FOUND
  const done = await discardQuery(id, email, new Date())
  if (!done.length) return NOT_FOUND
  updateTag('db')
  return { ok: true }
}

export async function copySnapshotAsDraftAction(id: string): Promise<{ ok: true; id: string } | Fail> {
  const email = await caller()
  if (!email) return FORBIDDEN
  if (!isReportId(id)) return NOT_FOUND
  const newId = await copyAsDraft(id, email, new Date())
  if (!newId) return NOT_FOUND
  updateTag('db')
  return { ok: true, id: newId }
}
