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
import {
  approvePost, approveTrends, countApprovedPosts, deleteImage, findImageOwner, findPost, forkPostDraft, insertImage, insertPost,
  insertUpload, revokePost, saveTrendsDraft, softDeletePostDraft, updatePostDraft, type PostState,
} from '@/lib/organic-social/social-listening/store'
import { checkTrendLists } from '@/lib/organic-social/social-listening/trends'
import type { SlTrend, SlTrendLists } from '@/lib/organic-social/social-listening/types'
import { checkImage, MAX_IMAGE_BYTES, MAX_IMAGES, MAX_POSTS, MAX_PRINT_BYTES, validatePostInput } from '@/lib/organic-social/social-listening/posts'
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

// ---------------------------------------------------------------------------------------------------------------
// Featured posts and screenshots (spec section 8). Any staff writer saves, deletes drafts and manages images; only
// COMMENTARY_APPROVERS approve and revoke (section 10). Every action loads the row and requires it to belong to the
// client named in the request, so an id from another client is "not found", never acted on.

type Result = { ok: true } | { ok: false; error: string }
type IdResult = { ok: true; id: string } | { ok: false; error: string }

const fail = (error: string) => ({ ok: false as const, error })
const POST_FORBIDDEN = fail('forbidden')
const NOT_FOUND = fail('not found')
// Approve, revoke, save or delete from a page opened before the post changed.
const CHANGED = fail('This post changed since you opened the page. Reload to see it.')
const SAVE_FAILED = fail('Could not save. Try again.')
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Staff = { email: string; client: NonNullable<Awaited<ReturnType<typeof getClientBySlug>>> }

/** The session may do `need`, and the client exists and has the tab on. The client is looked up by slug on the server. */
async function staffClient(clientSlug: unknown, need: 'edit' | 'approve'): Promise<Staff | { ok: false; error: string }> {
  const v = await viewer()
  if (!(need === 'edit' ? v.canEdit : v.canApprove)) return POST_FORBIDDEN
  if (typeof clientSlug !== 'string' || !clientSlug.trim()) return fail('invalid client')
  const client = await getClientBySlug(clientSlug.trim())
  if (!client) return fail('client not found')
  if (parseSocialListeningSetting(client.dashSocialConfig?.socialListening).kind !== 'ok' || !hasSocialListeningTab(client)) return fail(NOT_ON)
  return { email: v.email!, client }
}

/** The post, when `id` is a uuid naming an undeleted post of this client. */
async function ownedPost(id: unknown, clientId: string): Promise<PostState | null> {
  if (typeof id !== 'string' || !UUID.test(id)) return null
  const post = await findPost(id)
  return post && post.clientId === clientId && post.deletedAt === null ? post : null
}

/** Runs a write; a database failure becomes a plain message and one log line with the slug and the SQLSTATE only. */
async function guarded<T>(label: string, slug: string, run: () => Promise<T>): Promise<T | { ok: false; error: string }> {
  try {
    return await run()
  } catch (e) {
    console.error(`[social-listening] ${label} failed slug=${slug} code=${errorCode(e)}`)
    return SAVE_FAILED
  }
}

/** Create a post (a draft in the served finished month, from `range`) or edit one (`id`): a draft is edited in place;
 *  an approved post forks a draft that replaces it once approved, so clients keep seeing the approved one until then.
 *  Returns the id the editor should keep editing (the new draft's, for a new post or a fork). */
export async function savePostAction(input: { clientSlug: string; range?: string; id?: string | null; post: unknown }): Promise<IdResult> {
  const s = await staffClient(input?.clientSlug, 'edit')
  if (!('client' in s)) return s
  const valid = validatePostInput(input.post)
  if (!valid.ok) return fail(valid.error)
  const { client, email } = s

  if (input.id === undefined || input.id === null) {
    const when = uploadMonth(client, typeof input.range === 'string' ? input.range || undefined : undefined, requestClock())
    if (!when.ok) return fail(when.error)
    return guarded('save post', client.slug, async () => {
      const { id } = await insertPost({ ...valid.post, clientId: client.id, month: when.month, by: email })
      return { ok: true as const, id }
    })
  }

  const post = await ownedPost(input.id, client.id)
  if (!post) return NOT_FOUND
  if (post.replacedAt !== null) return CHANGED
  return guarded('save post', client.slug, async (): Promise<IdResult> => {
    if (post.status === 'draft') return (await updatePostDraft(post.id, valid.post, email)) ? { ok: true, id: post.id } : CHANGED
    const fork = await forkPostDraft(post.id, valid.post, email)
    if (fork.ok) return { ok: true, id: fork.id }
    return fork.reason === 'open-draft' ? fail('This post already has an open edit. Reload to see it.') : CHANGED
  })
}

/** Approve a draft. A new post counts toward the month's 12 (approved, not replaced, not deleted, R2-10); an edit of a
 *  post that is still approved and current swaps one for one, so only then is the cap not checked. Two approvals at the
 *  very same moment can still pass 12 together; the page shows the first 12. */
export async function approvePostAction(input: { clientSlug: string; id: string }): Promise<Result> {
  const s = await staffClient(input?.clientSlug, 'approve')
  if (!('client' in s)) return s
  const { client, email } = s
  const post = await ownedPost(input.id, client.id)
  if (!post) return NOT_FOUND
  if (post.status !== 'draft' || post.replacedAt !== null) return CHANGED
  return guarded('approve post', client.slug, async (): Promise<Result> => {
    const original = post.replacesId ? await findPost(post.replacesId) : undefined
    const swaps = !!original && original.status === 'approved' && original.replacedAt === null && original.deletedAt === null
    if (!swaps && (await countApprovedPosts(client.id, post.month)) >= MAX_POSTS) {
      return fail(`A month shows at most ${MAX_POSTS} posts. Revoke one first.`)
    }
    return (await approvePost(post.id, email)) ? { ok: true } : CHANGED
  })
}

/** Return an approved, current post to draft, so clients stop seeing it. */
export async function revokePostAction(input: { clientSlug: string; id: string }): Promise<Result> {
  const s = await staffClient(input?.clientSlug, 'approve')
  if (!('client' in s)) return s
  const post = await ownedPost(input.id, s.client.id)
  if (!post) return NOT_FOUND
  return guarded('revoke post', s.client.slug, async (): Promise<Result> => ((await revokePost(post.id)) ? { ok: true } : CHANGED))
}

/** Soft delete a draft (only drafts, as Commentary). Deleting a draft edit frees its approved post for a new edit. */
export async function deletePostDraftAction(input: { clientSlug: string; id: string }): Promise<Result> {
  const s = await staffClient(input?.clientSlug, 'edit')
  if (!('client' in s)) return s
  const post = await ownedPost(input.id, s.client.id)
  if (!post) return NOT_FOUND
  if (post.status !== 'draft') return fail('Only drafts can be deleted.')
  return guarded('delete post', s.client.slug, async (): Promise<Result> => ((await softDeletePostDraft(post.id, s.email)) ? { ok: true } : CHANGED))
}

/** Add one screenshot to a draft. Form fields: `clientSlug`, `postId`, `bytes` (the screen copy) and `print` (the print
 *  copy), both JPEG made by the browser. Both are checked by size, JPEG frame header and pixel size (R2-12); the store
 *  checks the draft state and the cap of 4 inside the insert. */
export async function addPostImageAction(form: FormData): Promise<IdResult> {
  const s = await staffClient(field(form, 'clientSlug'), 'edit')
  if (!('client' in s)) return s
  const post = await ownedPost(field(form, 'postId'), s.client.id)
  if (!post) return NOT_FOUND
  if (post.status !== 'draft') return fail('Images are added to a draft. Edit the post first.')
  const bytesFile = form.get('bytes')
  const printFile = form.get('print')
  if (!(bytesFile instanceof File) || !(printFile instanceof File)) return fail('Choose an image.')
  // Refused before reading when the sizes alone are over (the body is capped at 3 MB by the framework anyway).
  if (bytesFile.size > MAX_IMAGE_BYTES) return fail('The image is over 300 KB.')
  if (printFile.size > MAX_PRINT_BYTES) return fail('The print copy is over 60 KB.')
  const bytes = new Uint8Array(await bytesFile.arrayBuffer())
  const print = new Uint8Array(await printFile.arrayBuffer())
  const checked = checkImage(bytes, print)
  if (!checked.ok) return fail(checked.error)
  return guarded('add image', s.client.slug, async (): Promise<IdResult> => {
    const added = await insertImage({ postId: post.id, bytes, printBytes: print, width: checked.width, height: checked.height, maxImages: MAX_IMAGES })
    return added ? { ok: true, id: added.id } : fail(`A post holds at most ${MAX_IMAGES} images.`)
  })
}

/** Remove one screenshot from a draft of this client. An approved post's images are never removed in place. */
export async function removePostImageAction(input: { clientSlug: string; imageId: string }): Promise<Result> {
  const s = await staffClient(input?.clientSlug, 'edit')
  if (!('client' in s)) return s
  if (typeof input.imageId !== 'string' || !UUID.test(input.imageId)) return NOT_FOUND
  const owner = await findImageOwner(input.imageId)
  if (!owner || owner.clientId !== s.client.id) return NOT_FOUND
  return guarded('remove image', s.client.slug, async (): Promise<Result> =>
    ((await deleteImage(input.imageId)) ? { ok: true } : fail('Images are removed from a draft. Edit the post first.')))
}

// ---------------------------------------------------------------------------------------------------------------
// Theme trends (spec sections 7 and 8): typed by staff per served finished month, approved by COMMENTARY_APPROVERS.
// Clients see only the approved lists; saving after approval keeps them until the next approval (R2-11).

const rangeOf = (range: unknown) => (typeof range === 'string' && range ? range : undefined)

/** Save the three lists (one theme per line, an optional trailing change) as the month's draft. */
export async function saveTrendsAction(input: { clientSlug: string; range?: string; emerging: string; decreasing: string; newThemes: string }): Promise<Result> {
  const s = await staffClient(input?.clientSlug, 'edit')
  if (!('client' in s)) return s
  const checked = checkTrendLists(input)
  if (!checked.ok) return fail(checked.error)
  const when = uploadMonth(s.client, rangeOf(input.range), requestClock())
  if (!when.ok) return fail(when.error)
  return guarded('save trends', s.client.slug, async (): Promise<Result> => {
    await saveTrendsDraft({ clientId: s.client.id, month: when.month, lists: checked.lists, by: s.email })
    return { ok: true }
  })
}

const isTrend = (t: unknown): t is SlTrend =>
  typeof t === 'object' && t !== null && typeof (t as SlTrend).theme === 'string'
  && ((t as SlTrend).change === null || typeof (t as SlTrend).change === 'string')
const isLists = (v: unknown): v is SlTrendLists =>
  typeof v === 'object' && v !== null
  && (['emerging', 'decreasing', 'newThemes'] as const).every((k) => Array.isArray((v as Record<string, unknown>)[k]) && ((v as Record<string, unknown[]>)[k]).every(isTrend))

/** Approve the month's draft, only while it still equals `seen`, the lists the approver was shown (checked in the
 *  same statement as the approval). */
export async function approveTrendsAction(input: { clientSlug: string; range?: string; seen: SlTrendLists }): Promise<Result> {
  const s = await staffClient(input?.clientSlug, 'approve')
  if (!('client' in s)) return s
  if (!isLists(input.seen)) return fail('invalid trends')
  // Exactly the stored shape, so the database's equality check compares like with like.
  const only = (list: SlTrend[]) => list.map((t) => ({ theme: t.theme, change: t.change }))
  const seen: SlTrendLists = { emerging: only(input.seen.emerging), decreasing: only(input.seen.decreasing), newThemes: only(input.seen.newThemes) }
  const when = uploadMonth(s.client, rangeOf(input.range), requestClock())
  if (!when.ok) return fail(when.error)
  return guarded('approve trends', s.client.slug, async (): Promise<Result> =>
    ((await approveTrends({ clientId: s.client.id, month: when.month, by: s.email, seen }))
      ? { ok: true }
      : fail('The trends changed since you opened the page, or are already approved. Reload to see them.')))
}
