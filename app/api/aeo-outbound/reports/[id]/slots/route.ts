import { NextResponse, type NextRequest } from 'next/server'
import { auth } from '@/auth'
import { outboundAccess } from '@/lib/aeo-outbound/access'
import { checkContract, SLOTS_BODY } from '@/lib/aeo-outbound/contracts'
import { originAllowed } from '@/lib/aeo-outbound/permissions'
import { getReport, isReportId, saveSlotsQuery } from '@/lib/aeo-outbound/store'
import { applySlotPatch, applyStructure, isStructuralPath, needsValidationPaths, withDefaults } from '@/lib/aeo-outbound/slots'
import { groundingFlags } from '@/lib/aeo-outbound/grounding'
import { errorLabel } from '@/lib/aeo-outbound/log'
import type { StoredNote } from '@/lib/aeo-outbound/notes'
import { dataBlock } from '@/lib/aeo-outbound/prompt'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const unavailable = () => NextResponse.json({ error: 'unavailable' }, { status: 503 })
const refused = (id: string, reason: string) => console.warn(`[aeo-outbound] slots refused id=${id} reason=${reason}`)

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!(await outboundAccess(session?.user)).ok || !originAllowed(req.headers.get('origin'), req.headers.get('host'))) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const { id } = await ctx.params
  let body: unknown = null
  try { body = await req.json() } catch { /* below */ }
  // v1.1 §10: the body is a contract; a violation keeps the v1.0 400 body.
  if (!checkContract('request.slots', SLOTS_BODY, body).ok) return NextResponse.json({ error: 'bad-request' }, { status: 400 })
  // The structural guard runs even when CONTRACT_DISABLED turns the contract off, so a bad body is a 400, never a TypeError.
  const b = body as { path?: unknown; value?: unknown; revision?: unknown } | null
  if (!b || typeof b !== 'object' || typeof b.path !== 'string' || !Number.isInteger(b.revision)) return NextResponse.json({ error: 'bad-request' }, { status: 400 })
  const { path, value, revision } = b as { path: string; value: unknown; revision: number }
  if (!isReportId(id)) return NextResponse.json({ error: 'not-found' }, { status: 404 })
  let row: Awaited<ReturnType<typeof getReport>>
  try { row = await getReport(id) } catch (e) {
    console.error(`[aeo-outbound] slots read failed id=${id} reason=${errorLabel(e)}`)
    return unavailable()
  }
  if (!row) return NextResponse.json({ error: 'not-found' }, { status: 404 })
  if (row.status !== 'draft' || !row.slots || !row.data || row.unreadable) {
    refused(id, row.unreadable ? 'unreadable' : 'not-draft')
    return NextResponse.json({ error: 'not-draft', revision: row.revision }, { status: 409 })
  }
  // Missing keys read the row's own data and the v1.0 words, never live settings (v1.1 §3).
  const current = withDefaults(row.slots, row.data)
  const structural = isStructuralPath(path)
  const patched = structural ? applyStructure(current, path, value) : applySlotPatch(current, path, value)
  if (!patched.ok) return NextResponse.json({ error: patched.error }, { status: 400 })
  // The notes column: the row's data notes, then this save's grounding flags (v1.1 §4). Old rows' strings stay strings.
  const notes: StoredNote[] = [...row.data.notes, ...groundingFlags(patched.slots, row.data, dataBlock(row.data))]
  let saved: { revision: number }[]
  try { saved = await saveSlotsQuery(id, revision, patched.slots, notes, path === 'brand' ? patched.slots.brand : undefined) } catch (e) {
    console.error(`[aeo-outbound] slots save failed id=${id} reason=${errorLabel(e)}`)
    return unavailable()
  }
  if (!saved.length) {
    refused(id, 'stale')
    let latest: number | null
    try { latest = (await getReport(id))?.revision ?? null } catch (e) {
      console.error(`[aeo-outbound] slots read failed id=${id} reason=${errorLabel(e)}`)
      return unavailable()
    }
    return NextResponse.json({ error: 'stale', revision: latest }, { status: 409 })
  }
  return NextResponse.json({ revision: saved[0].revision, notes, needsValidation: needsValidationPaths(patched.slots), ...(structural ? { slots: patched.slots } : {}) })
}
