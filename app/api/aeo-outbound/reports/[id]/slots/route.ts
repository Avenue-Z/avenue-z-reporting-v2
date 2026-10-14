import { NextResponse, type NextRequest } from 'next/server'
import { auth } from '@/auth'
import { outboundAccess } from '@/lib/aeo-outbound/access'
import { checkContract, SAVE_SEQ, SAVE_WRITER, SLOTS_BODY } from '@/lib/aeo-outbound/contracts'
import { originAllowed } from '@/lib/aeo-outbound/permissions'
import { getReport, isReportId, saveSlotsQuery, type SaveBy } from '@/lib/aeo-outbound/store'
import { applySlotPatch, applyStructure, isStructuralPath, needsValidationPaths, withDefaults } from '@/lib/aeo-outbound/slots'
import { groundingFlags } from '@/lib/aeo-outbound/grounding'
import { errorLabel } from '@/lib/aeo-outbound/log'
import type { StoredNote } from '@/lib/aeo-outbound/notes'
import { dataBlock } from '@/lib/aeo-outbound/prompt'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const unavailable = () => NextResponse.json({ error: 'unavailable' }, { status: 503 })
const refused = (id: string, reason: string) => console.warn(`[aeo-outbound] slots refused id=${id} reason=${reason}`)
// Spec v1.1 18.4 step 5: the route's first getReport plus at most two re-reads after a conditional update misses.
const MAX_READS = 3

type Row = Awaited<ReturnType<typeof getReport>>
// A miss on the read keeps today's single safe log line and 503; the error's label only, never the body.
async function read(id: string): Promise<{ ok: true; row: Row } | { ok: false }> {
  try { return { ok: true, row: await getReport(id) } } catch (e) {
    console.error(`[aeo-outbound] slots read failed id=${id} reason=${errorLabel(e)}`)
    return { ok: false }
  }
}

// writer and seq together, or neither, as SAVE_WRITER and SAVE_SEQ allow (spec v1.1 18.4). undefined is a bad body.
function saveBy(b: { writer?: unknown; seq?: unknown }): SaveBy | null | undefined {
  if (b.writer === undefined && b.seq === undefined) return null
  if (!SAVE_WRITER.safeParse(b.writer).success || !SAVE_SEQ.safeParse(b.seq).success) return undefined
  // Postgres returns a uuid in lowercase, and zod's uuid accepts either case, so compare and store the lowercase form.
  return { writer: (b.writer as string).toLowerCase(), seq: b.seq as number }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!(await outboundAccess(session?.user)).ok || !originAllowed(req.headers.get('origin'), req.headers.get('host'))) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const { id } = await ctx.params
  let body: unknown = null
  try { body = await req.json() } catch { /* below */ }
  // v1.1 §10: the body is a contract; a violation keeps the v1.0 400 body.
  if (!checkContract('request.slots', SLOTS_BODY, body).ok) return NextResponse.json({ error: 'bad-request' }, { status: 400 })
  // A structural guard as well as the contract, so a bad body is a 400, never a TypeError.
  const b = body as { path?: unknown; value?: unknown; revision?: unknown; writer?: unknown; seq?: unknown } | null
  if (!b || typeof b !== 'object' || typeof b.path !== 'string' || !Number.isInteger(b.revision)) return NextResponse.json({ error: 'bad-request' }, { status: 400 })
  const by = saveBy(b)
  if (by === undefined) return NextResponse.json({ error: 'bad-request' }, { status: 400 })
  const { path, value, revision } = b as { path: string; value: unknown; revision: number }
  if (!isReportId(id)) return NextResponse.json({ error: 'not-found' }, { status: 404 })
  const first = await read(id)
  if (!first.ok) return unavailable()
  if (!first.row) return NextResponse.json({ error: 'not-found' }, { status: 404 })
  let row: Row = first.row
  const structural = isStructuralPath(path)
  // Spec v1.1 18.4, steps 1 to 5. Every write is a compare-and-set on revision, so it lands only on the row it read.
  for (let reads = 1; ; reads++) {
    // A row gone on a re-read (discarded meanwhile) answers as today: 409 stale with no revision.
    if (!row) {
      refused(id, 'stale')
      return NextResponse.json({ error: 'stale', revision: null }, { status: 409 })
    }
    // Step 1: not a readable draft.
    if (row.status !== 'draft' || !row.slots || !row.data || row.unreadable) {
      refused(id, row.unreadable ? 'unreadable' : 'not-draft')
      return NextResponse.json({ error: 'not-draft', revision: row.revision }, { status: 409 })
    }
    // Missing keys read the row's own data and the v1.0 words, never live settings (v1.1 §3).
    const current = withDefaults(row.slots, row.data)
    // Step 2, before the patch: a landed bullet add or remove must not be applied a second time.
    const ours = by !== null && row.lastWriter === by.writer
    if (ours && row.lastSeq === by.seq) {
      const notes = row.notes ?? [...row.data.notes, ...groundingFlags(current, row.data, dataBlock(row.data))]
      return NextResponse.json({ revision: row.revision, notes, needsValidation: needsValidationPaths(current), ...(structural ? { slots: current } : {}) })
    }
    if (ours && row.lastSeq !== null && row.lastSeq > by.seq) {
      // A later item of ours already landed: this attempt was aborted and nobody reads its answer.
      refused(id, 'stale')
      return NextResponse.json({ error: 'stale', revision: row.revision }, { status: 409 })
    }
    // Step 3: apply the patch to the row as read.
    const patched = structural ? applyStructure(current, path, value) : applySlotPatch(current, path, value)
    if (!patched.ok) return NextResponse.json({ error: patched.error }, { status: 400 })
    // Step 4: the request's revision when it is the row's; else the row's only when an earlier item of ours is the last write.
    const from = revision === row.revision ? revision : ours ? row.revision : null
    if (from === null) {
      refused(id, 'stale')
      return NextResponse.json({ error: 'stale', revision: row.revision }, { status: 409 })
    }
    // The notes column: the row's data notes, then this save's grounding flags (v1.1 §4). Old rows' strings stay strings.
    const notes: StoredNote[] = [...row.data.notes, ...groundingFlags(patched.slots, row.data, dataBlock(row.data))]
    // Step 5: the conditional update.
    let saved: { revision: number }[]
    try { saved = await saveSlotsQuery(id, from, patched.slots, notes, path === 'brand' ? patched.slots.brand : undefined, by) } catch (e) {
      console.error(`[aeo-outbound] slots save failed id=${id} reason=${errorLabel(e)}`)
      return unavailable()
    }
    if (saved.length) return NextResponse.json({ revision: saved[0].revision, notes, needsValidation: needsValidationPaths(patched.slots), ...(structural ? { slots: patched.slots } : {}) })
    if (reads >= MAX_READS) {
      console.warn(`[aeo-outbound] slots save missed id=${id} reason=contended reads=${reads}`)
      return unavailable()
    }
    const next = await read(id)
    if (!next.ok) return unavailable()
    row = next.row
  }
}
