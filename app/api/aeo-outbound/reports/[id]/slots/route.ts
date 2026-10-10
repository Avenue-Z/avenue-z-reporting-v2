import { NextResponse, type NextRequest } from 'next/server'
import { auth } from '@/auth'
import { originAllowed, outboundEmail } from '@/lib/aeo-outbound/permissions'
import { getReport, isReportId, saveSlotsQuery } from '@/lib/aeo-outbound/store'
import { applySlotPatch, needsValidationPaths } from '@/lib/aeo-outbound/slots'
import { groundingFlags } from '@/lib/aeo-outbound/grounding'
import { dataBlock } from '@/lib/aeo-outbound/prompt'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!outboundEmail(session?.user) || !originAllowed(req.headers.get('origin'), req.headers.get('host'))) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const { id } = await ctx.params
  let body: { path?: unknown; value?: unknown; revision?: unknown } | null = null
  try { body = await req.json() } catch { /* below */ }
  if (!body || typeof body.path !== 'string' || !Number.isInteger(body.revision)) return NextResponse.json({ error: 'bad-request' }, { status: 400 })
  if (!isReportId(id)) return NextResponse.json({ error: 'not-found' }, { status: 404 })
  const row = await getReport(id).catch(() => undefined)
  if (!row) return NextResponse.json({ error: 'not-found' }, { status: 404 })
  if (row.status !== 'draft' || !row.slots || !row.data) return NextResponse.json({ error: 'not-draft', revision: row.revision }, { status: 409 })
  const patched = applySlotPatch(row.slots, body.path, body.value)
  if (!patched.ok) return NextResponse.json({ error: patched.error }, { status: 400 })
  const notes = [...row.data.notes, ...groundingFlags(patched.slots, row.data, dataBlock(row.data))]
  const saved = await saveSlotsQuery(id, body.revision as number, patched.slots, notes)
  if (!saved.length) return NextResponse.json({ error: 'stale', revision: (await getReport(id))?.revision ?? null }, { status: 409 })
  return NextResponse.json({ revision: saved[0].revision, notes, needsValidation: needsValidationPaths(patched.slots) })
}
