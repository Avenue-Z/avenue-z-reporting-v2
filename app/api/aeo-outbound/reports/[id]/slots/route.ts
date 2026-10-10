import { NextResponse, type NextRequest } from 'next/server'
import { auth } from '@/auth'
import { originAllowed, outboundEmail } from '@/lib/aeo-outbound/permissions'
import { getReport, isReportId, saveSlotsQuery } from '@/lib/aeo-outbound/store'
import { applySlotPatch, needsValidationPaths } from '@/lib/aeo-outbound/slots'
import { groundingFlags } from '@/lib/aeo-outbound/grounding'
import { errorLabel } from '@/lib/aeo-outbound/log'
import { dataBlock } from '@/lib/aeo-outbound/prompt'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const unavailable = () => NextResponse.json({ error: 'unavailable' }, { status: 503 })
const refused = (id: string, reason: string) => console.warn(`[aeo-outbound] slots refused id=${id} reason=${reason}`)

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!outboundEmail(session?.user) || !originAllowed(req.headers.get('origin'), req.headers.get('host'))) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const { id } = await ctx.params
  let body: { path?: unknown; value?: unknown; revision?: unknown } | null = null
  try { body = await req.json() } catch { /* below */ }
  if (!body || typeof body.path !== 'string' || !Number.isInteger(body.revision)) return NextResponse.json({ error: 'bad-request' }, { status: 400 })
  if (!isReportId(id)) return NextResponse.json({ error: 'not-found' }, { status: 404 })
  let row: Awaited<ReturnType<typeof getReport>>
  try { row = await getReport(id) } catch (e) {
    console.error(`[aeo-outbound] slots read failed id=${id} reason=${errorLabel(e)}`)
    return unavailable()
  }
  if (!row) return NextResponse.json({ error: 'not-found' }, { status: 404 })
  if (row.status !== 'draft' || !row.slots || !row.data) {
    refused(id, 'not-draft')
    return NextResponse.json({ error: 'not-draft', revision: row.revision }, { status: 409 })
  }
  const patched = applySlotPatch(row.slots, body.path, body.value)
  if (!patched.ok) return NextResponse.json({ error: patched.error }, { status: 400 })
  const notes = [...row.data.notes, ...groundingFlags(patched.slots, row.data, dataBlock(row.data))]
  let saved: { revision: number }[]
  try { saved = await saveSlotsQuery(id, body.revision as number, patched.slots, notes) } catch (e) {
    console.error(`[aeo-outbound] slots save failed id=${id} reason=${errorLabel(e)}`)
    return unavailable()
  }
  if (!saved.length) {
    refused(id, 'stale')
    let current: number | null
    try { current = (await getReport(id))?.revision ?? null } catch (e) {
      console.error(`[aeo-outbound] slots read failed id=${id} reason=${errorLabel(e)}`)
      return unavailable()
    }
    return NextResponse.json({ error: 'stale', revision: current }, { status: 409 })
  }
  return NextResponse.json({ revision: saved[0].revision, notes, needsValidation: needsValidationPaths(patched.slots) })
}
