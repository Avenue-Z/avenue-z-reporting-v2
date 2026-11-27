'use server'

// The Technical Audit snapshot page's staff actions: upload a Google Search Console export, publish or unpublish a
// month, hide or annotate an issue row. Every action re-checks the session and looks the client up by slug on the
// server; every snapshot is read through its client, so an id from another client is "not found". Logs name the slug,
// snapshot and slot only: never a file name, a value from the file, or a database message.
import { auth } from '@/auth'
import { revalidatePath } from 'next/cache'
import { getClientBySlug } from '@/lib/db/queries'
import { isTechAuditStaff } from '@/lib/technical-audit/staff'
import { MAX_GSC_BYTES, parseGscCwv, parseGscPageIndexing } from '@/lib/technical-audit/gsc-export'
import { completeRun, getSnapshotBundle, setOverride, setSnapshotStatus } from '@/lib/technical-audit/store'
import type { TechAuditMetricsInsert } from '@/lib/technical-audit/store'
import type { Parsed, SourceIssue, TaSource } from '@/lib/technical-audit/types'

type Result = { ok: true } | { ok: false; error: string }

const fail = (error: string): Result => ({ ok: false, error })
const FORBIDDEN = fail('forbidden')
const SAVE_FAILED = fail('Could not save. Try again.')
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NOTE_MAX = 280
const ISSUE_KEY_MAX = 300
const SLOTS = ['gsc_indexing', 'gsc_cwv_mobile', 'gsc_cwv_desktop'] as const
type Slot = (typeof SLOTS)[number]

/** The staff member's email, or null for no session or a non-staff one. */
async function staffEmail(): Promise<string | null> {
  const session = await auth()
  const email = session?.user?.email
  return isTechAuditStaff(session) && typeof email === 'string' ? email : null
}

/** A form field as a string, or null when absent or not text (a File in a text field). */
function field(form: FormData, name: string): string | null {
  const v = form.get(name)
  return typeof v === 'string' ? v : null
}

const asSlug = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
const asSnapshotId = (v: unknown) => (typeof v === 'string' && UUID.test(v) ? v : null)

function revalidateReports() {
  revalidatePath('/dashboard/[clientSlug]/reports', 'page')
  revalidatePath('/portal/[clientSlug]/reports', 'page')
}

/** What one parsed slot writes: only that slot's metrics columns, its issues, and the export date. */
function slotWrite(slot: Slot, bytes: Uint8Array): Parsed<{ metrics: Partial<TechAuditMetricsInsert>; issues: SourceIssue[]; exportDate: string | null }> {
  if (slot === 'gsc_indexing') {
    const r = parseGscPageIndexing(bytes)
    if (!r.ok) return r
    const { indexed, notIndexed, issues, exportDate } = r.value
    return { ok: true, value: { metrics: { gscIndexed: indexed, gscNotIndexed: notIndexed }, issues, exportDate } }
  }
  const device = slot === 'gsc_cwv_mobile' ? 'mobile' : 'desktop'
  const r = parseGscCwv(bytes, device)
  if (!r.ok) return r
  const { poor, ni, good, issues, exportDate } = r.value
  const metrics: Partial<TechAuditMetricsInsert> = device === 'mobile'
    ? { cwvMobilePoor: poor, cwvMobileNi: ni, cwvMobileGood: good }
    : { cwvDesktopPoor: poor, cwvDesktopNi: ni, cwvDesktopGood: good }
  return { ok: true, value: { metrics, issues, exportDate } }
}

/**
 * Upload one GSC export into one slot of one snapshot. Form fields: `clientSlug`, `snapshotId`, `slot`
 * (gsc_indexing | gsc_cwv_mobile | gsc_cwv_desktop) and `file`. Nothing is stored unless the file parses as the
 * report that slot expects.
 */
export async function uploadGscExport(form: FormData): Promise<Result> {
  const email = await staffEmail()
  if (!email) return FORBIDDEN

  const slug = asSlug(field(form, 'clientSlug'))
  const snapshotId = asSnapshotId(field(form, 'snapshotId'))
  const slotField = field(form, 'slot')
  const slot = SLOTS.find((s) => s === slotField)
  const file = form.get('file')
  if (!slug) return fail('invalid client')
  if (!snapshotId) return fail('invalid snapshot')
  if (!slot) return fail('invalid slot')
  if (!(file instanceof File) || file.size === 0) return fail('Choose the Search Console .xlsx export to upload.')
  if (file.size > MAX_GSC_BYTES) return fail('The file is larger than 2 MB.')

  const client = await getClientBySlug(slug)
  if (!client) return fail('client not found')
  const bundle = await getSnapshotBundle(client.id, snapshotId)
  if (!bundle) return fail('snapshot not found')
  const where = `[tech-audit] ${client.slug} ${bundle.snapshot.snapshotDate}`

  const bytes = new Uint8Array(await file.arrayBuffer())
  if (bytes.byteLength > MAX_GSC_BYTES) return fail('The file is larger than 2 MB.')
  let parsed: ReturnType<typeof slotWrite>
  try {
    parsed = slotWrite(slot, bytes)
  } catch {
    // The parser can quote the file in its error: not logged.
    console.error(`${where} ${slot} parse threw`)
    return fail("This isn't a Search Console export the page can read.")
  }
  if (!parsed.ok) {
    console.warn(`${where} ${slot} refused`)
    return fail(parsed.reason)
  }

  const { metrics, issues, exportDate } = parsed.value
  try {
    // No requireDraft: a staff re-upload to a published month goes live immediately.
    await completeRun(client.id, snapshotId, slot satisfies TaSource, bytes, {
      metrics, issues, snapshot: { gscExportDate: exportDate ?? new Date().toISOString().slice(0, 10) },
    }, { uploadedBy: email })
  } catch {
    console.error(`${where} ${slot} store failed`)
    return fail('Could not save the upload. Try again.')
  }
  revalidateReports()
  console.info(`${where} ${slot} stored`)
  return { ok: true }
}

async function setStatus(
  input: { clientSlug: string; snapshotId: string },
  status: 'draft' | 'published',
): Promise<Result> {
  const email = await staffEmail()
  if (!email) return FORBIDDEN
  if (typeof input !== 'object' || input === null) return fail('invalid request')
  const slug = asSlug(input.clientSlug)
  const snapshotId = asSnapshotId(input.snapshotId)
  if (!slug) return fail('invalid client')
  if (!snapshotId) return fail('invalid snapshot')
  const client = await getClientBySlug(slug)
  if (!client) return fail('client not found')
  try {
    await setSnapshotStatus(client.id, snapshotId, status, email)
  } catch (e) {
    if (e instanceof Error && e.message === 'Snapshot not found') return fail('snapshot not found')
    console.error(`[tech-audit] ${client.slug} ${snapshotId} ${status} failed`)
    return SAVE_FAILED
  }
  revalidateReports()
  console.info(`[tech-audit] ${client.slug} ${snapshotId} ${status}`)
  return { ok: true }
}

export async function publishSnapshot(input: { clientSlug: string; snapshotId: string }): Promise<Result> {
  return setStatus(input, 'published')
}

export async function unpublishSnapshot(input: { clientSlug: string; snapshotId: string }): Promise<Result> {
  return setStatus(input, 'draft')
}

/** Hide or annotate one issue row for a brand. `note`: trimmed, at most 280 characters, empty clears it; omit a field
 *  to leave it as it is. */
export async function setIssueOverride(
  input: { clientSlug: string; issueKey: string; hidden?: boolean; note?: string | null },
): Promise<Result> {
  const email = await staffEmail()
  if (!email) return FORBIDDEN
  if (typeof input !== 'object' || input === null) return fail('invalid request')
  const slug = asSlug(input.clientSlug)
  if (!slug) return fail('invalid client')
  const { issueKey, hidden, note } = input
  if (typeof issueKey !== 'string' || !issueKey || issueKey.length > ISSUE_KEY_MAX) return fail('invalid issue')
  if (hidden !== undefined && typeof hidden !== 'boolean') return fail('invalid hidden value')
  if (note != null && typeof note !== 'string') return fail('invalid note')

  const patch: { hidden?: boolean; note?: string | null } = {}
  if (hidden !== undefined) patch.hidden = hidden
  if (note !== undefined) {
    const trimmed = note === null ? '' : note.trim()
    if (trimmed.length > NOTE_MAX) return fail(`The note is longer than ${NOTE_MAX} characters.`)
    patch.note = trimmed === '' ? null : trimmed
  }
  if (Object.keys(patch).length === 0) return fail('nothing to change')

  const client = await getClientBySlug(slug)
  if (!client) return fail('client not found')
  try {
    await setOverride(client.id, issueKey, patch, email)
  } catch {
    console.error(`[tech-audit] ${client.slug} override failed`)
    return SAVE_FAILED
  }
  revalidateReports()
  return { ok: true }
}
