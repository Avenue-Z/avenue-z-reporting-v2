'use server'

// The Social Listening tab's server actions (spec docs/superpowers/specs/2026-11-19-social-listening-tab-design.md,
// sections 5, 6, 10 and 11). Every action re-checks the session, the client and the setting; the client is never taken
// from the form alone. Logs name the slug, topic, month, rule ids and sizes only: never a file name, a value from the
// file, or a database message (a failed check constraint's message holds the whole row).
import { createHash } from 'node:crypto'
import { auth } from '@/auth'
import { getClientBySlug } from '@/lib/db/queries'
import { slCapabilities } from '@/lib/organic-social/social-listening/capabilities'
import { parseTalkwalkerExport } from '@/lib/organic-social/social-listening/export-parse'
import { hasSocialListeningTab, parseSocialListeningSetting } from '@/lib/organic-social/social-listening/setting'
import { insertUpload } from '@/lib/organic-social/social-listening/store'
import { uploadMonth } from '@/lib/organic-social/social-listening/upload-month'
import { requestClock } from '@/lib/organic-social/locked-range'
import type { SlTopic } from '@/lib/organic-social/social-listening/types'

type UploadResult = { ok: true; month: string; beforeOpen: boolean } | { ok: false; errors: string[] }

const refuse = (error: string): UploadResult => ({ ok: false, errors: [error] })
const FORBIDDEN = refuse('forbidden')
const NOT_ON = 'Social listening is not on for this client.'

/** The role AND the email, as the chart notes check them (app/actions/chart-notes.ts). Not exported: a 'use server'
 *  module may only export async actions. */
async function viewer() {
  const session = await auth()
  const email = session?.user?.email ?? null
  return { email, ...slCapabilities(session?.user?.role, email) }
}

/** A form field as a string, or null when it is absent or not text (a File in a text field). */
function field(form: FormData, name: string): string | null {
  const v = form.get(name)
  return typeof v === 'string' ? v : null
}

/** The database's own error code (a Postgres SQLSTATE), never its message. */
function errorCode(e: unknown): string {
  const code = typeof e === 'object' && e !== null ? (e as { code?: unknown }).code : undefined
  return typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code) ? code : 'none'
}

/**
 * Upload one Talkwalker export for one topic. Form fields: `clientSlug`, `topic` (brand or industry), `range` (the page's
 * range, which decides the month; any `month` field is ignored) and `file`. Every rule must pass or nothing is stored
 * (section 6). Uploads are append-only: a re-upload adds a row and the newest is shown (section 11).
 */
export async function uploadSocialListeningExport(form: FormData): Promise<UploadResult> {
  const v = await viewer()
  if (!v.canEdit) return FORBIDDEN

  const clientSlug = field(form, 'clientSlug')?.trim() ?? ''
  if (!clientSlug) return refuse('invalid client')
  const topicField = field(form, 'topic')
  if (topicField !== 'brand' && topicField !== 'industry') return refuse('invalid topic')
  const topic: SlTopic = topicField
  const range = field(form, 'range') || undefined
  const file = form.get('file')
  if (!(file instanceof File) || file.size === 0) return refuse('Choose the Talkwalker .xls export to upload.')

  const client = await getClientBySlug(clientSlug)
  if (!client) return refuse('client not found')
  const parsed = parseSocialListeningSetting(client.dashSocialConfig?.socialListening)
  if (parsed.kind !== 'ok' || !hasSocialListeningTab(client)) return refuse(NOT_ON)
  const topicName = topic === 'brand' ? parsed.setting.brandTopic : parsed.setting.industryTopic
  if (topicName === null) return refuse('This client has no industry topic.')

  const when = uploadMonth(client, range, requestClock())
  if (!when.ok) return refuse(when.error)

  // The framework caps the body at 3 MB (next.config.ts); the parser refuses anything over 2 MB under V1.
  const bytes = new Uint8Array(await file.arrayBuffer())
  const where = `slug=${client.slug} topic=${topic} month=${when.month}`
  let result: ReturnType<typeof parseTalkwalkerExport>
  try {
    result = parseTalkwalkerExport(bytes, { topic, topicName, month: when.month })
  } catch {
    // The parser refuses what it can name (V1 to V9); a workbook that still breaks it is not an export it knows. The
    // error itself is not logged: it can quote the file.
    console.error(`[social-listening] upload parse failed ${where} bytes=${bytes.length}`)
    return refuse("This isn't the original Talkwalker .xls export. Upload the file as downloaded.")
  }
  if (!result.ok) {
    const rules = [...new Set(result.failed.map((f) => f.rule))].join(',')
    console.warn(`[social-listening] upload refused ${where} rules=${rules} bytes=${bytes.length}`)
    return { ok: false, errors: result.failed.map((f) => f.message) }
  }

  try {
    // insertUpload calls updateTag('db'), so the page shows the new upload on its next render.
    await insertUpload({
      clientId: client.id, month: when.month, topic, data: result.data, raw: bytes,
      sha256: createHash('sha256').update(bytes).digest('hex'), byteSize: bytes.length,
      beforeOpen: when.beforeOpen, by: v.email!,
    })
  } catch (e) {
    console.error(`[social-listening] upload failed to store ${where} code=${errorCode(e)}`)
    return refuse('Could not save the upload. Try again.')
  }
  console.info(`[social-listening] upload stored ${where} bytes=${bytes.length} beforeOpen=${when.beforeOpen}`)
  return { ok: true, month: when.month, beforeOpen: when.beforeOpen }
}
