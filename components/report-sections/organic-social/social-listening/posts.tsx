'use client'
// Most relevant posts: a sideways-scrolling row per group (the mockup's .pgrid), screenshots from the image route, and the
// staff editor. The note is plain text, never markup. In the client view and the PDF there are no controls and only
// approved posts arrive here (view-model.ts); the PDF prints each post's first image at print size.
import { useRef, useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useExportMode } from '@/components/export/export-mode'
import {
  addPostImageAction, approvePostAction, deletePostDraftAction, removePostImageAction, revokePostAction, savePostAction,
} from '@/app/actions/social-listening'
import { SENTIMENT_COLORS } from '@/lib/organic-social/social-listening/colors'
import { num } from '@/lib/organic-social/social-listening/format'
import { MAX_IMAGES } from '@/lib/organic-social/social-listening/posts'
import type { SlPost, SlPostGroup, SlSentiment } from '@/lib/organic-social/social-listening/types'
import { shrinkScreenshot } from './image-shrink'

// The approved mockup's three groups, worded without the client's name (this repo is public).
const GROUPS: { group: SlPostGroup; title: string; sub: string }[] = [
  { group: 'social', title: 'Social posts', sub: 'The most engaged posts, and a typical negative one' },
  { group: 'forum', title: 'Forum posts', sub: "Reddit can't be exported, so these are screenshots" },
  { group: 'web', title: 'Web posts', sub: 'Articles and syndicated stories that mention the brand' },
]
// The mockup's platform list; a post saved with another platform keeps it as an option.
const PLATFORMS = ['Facebook', 'Instagram', 'LinkedIn', 'X', 'Reddit', 'YouTube', 'TikTok', 'Web article', 'Other']
const DEFAULT_PLATFORM: Record<SlPostGroup, string> = { social: 'Facebook', forum: 'Reddit', web: 'Web article' }
// One card's width plus the gap, so an arrow moves the row by one post.
const CARD_STEP = 300
const TONE: Record<SlSentiment, string> = { Positive: SENTIMENT_COLORS.pos, Neutral: SENTIMENT_COLORS.neu, Negative: SENTIMENT_COLORS.neg }
const imageSrc = (id: string, print: boolean) => `/api/social-listening/image/${id}${print ? '?print=1' : ''}`

type Caps = { canEdit: boolean; canApprove: boolean }
type Props = { posts: SlPost[]; clientSlug: string; range: string; caps: Caps }

export function PostsSection({ posts, clientSlug, range, caps }: Props) {
  const exportMode = useExportMode()
  const staff = caps.canEdit && !exportMode
  const [adding, setAdding] = useState<SlPostGroup | null>(null)
  return (
    <div className="space-y-5">
      {GROUPS.map(({ group, title, sub }) => {
        const list = posts.filter((p) => p.group === group)
        if (list.length === 0 && !staff) return null
        return (
          <PostGroup key={group} title={title} sub={sub} count={list.length} print={exportMode}
            add={staff && adding !== group ? () => setAdding(group) : null}
            editor={staff && adding === group
              ? <PostEditor clientSlug={clientSlug} range={range} initial={{ group, position: list.length }} onDone={() => setAdding(null)} />
              : null}
            cards={list.map((p) => <PostCard key={p.id} post={p} clientSlug={clientSlug} range={range} caps={caps} staff={staff} print={exportMode} />)} />
        )
      })}
    </div>
  )
}

/** A group of posts: its title with the count, a line on what it holds, and a row that slides sideways with the ‹ › arrows
 *  (the approved mockup's .pgroup-head and .pnav). */
function PostGroup({ title, sub, count, print, add, editor, cards }: {
  title: string; sub: string; count: number; print: boolean; add: (() => void) | null; editor: ReactNode; cards: ReactNode[]
}) {
  const row = useRef<HTMLUListElement>(null)
  const slide = (dir: 1 | -1) => row.current?.scrollBy({ left: dir * CARD_STEP, behavior: 'smooth' })
  const arrows = !print && cards.length > 1
  return (
    <div data-export-block="">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-extrabold text-white">{title} <span className="text-xs font-normal text-text-muted">({count})</span></h3>
          <p className="text-xs text-text-muted">{sub}</p>
        </div>
        <span className="inline-flex items-center gap-1.5">
          {arrows && (
            <>
              <button type="button" onClick={() => slide(-1)} aria-label={`Previous ${title.toLowerCase()}`}
                className="h-[30px] w-[30px] rounded-full border border-white/[0.16] bg-bg-surface text-base leading-none text-white hover:border-[#60FDFF] hover:text-[#60FDFF]">‹</button>
              <button type="button" onClick={() => slide(1)} aria-label={`Next ${title.toLowerCase()}`}
                className="h-[30px] w-[30px] rounded-full border border-white/[0.16] bg-bg-surface text-base leading-none text-white hover:border-[#60FDFF] hover:text-[#60FDFF]">›</button>
            </>
          )}
          {add && <button type="button" onClick={add} className="rounded-md bg-white/[0.12] px-3 py-1 text-xs font-semibold text-white">+ Add post</button>}
        </span>
      </div>
      {editor}
      {cards.length > 0 && (print
        ? <ul className="grid grid-cols-2 gap-3">{cards}</ul>
        : <ul ref={row} className="flex snap-x gap-3 overflow-x-auto pb-2">{cards}</ul>)}
    </div>
  )
}

function PostCard({ post, clientSlug, range, caps, staff, print }: { post: SlPost; clientSlug: string; range: string; caps: Caps; staff: boolean; print: boolean }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const images = print ? post.imageIds.slice(0, 1) : post.imageIds
  const run = (f: () => Promise<{ ok: boolean; error?: string }>) => start(async () => {
    setError(null)
    const r = await f()
    if (!r.ok) setError(r.error ?? 'Something went wrong.')
    else router.refresh()
  })
  return (
    <li className="w-72 shrink-0 snap-start rounded-lg border border-white/[0.06] bg-bg-base p-4">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-semibold text-white">{post.platform}</span>
        <span className="rounded-full border px-2 py-0.5" style={{ color: TONE[post.sentiment], borderColor: `${TONE[post.sentiment]}55` }}>{post.sentiment}</span>
      </div>
      <p className="mt-1 truncate text-xs text-text-muted" title={post.author}>{post.author}{post.engagements !== null ? ` · ${num(post.engagements)} engagements` : ''}</p>
      {images.length > 0 && (
        <div className="mt-3 space-y-2">
          {images.map((id) => (
            <div key={id} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- served by our own route with its own access check */}
              <img src={imageSrc(id, print)} alt={`Screenshot of the ${post.platform} post`} className="w-full rounded-md" loading="lazy" />
              {staff && post.status === 'draft' && (
                <button type="button" disabled={pending} onClick={() => run(() => removePostImageAction({ clientSlug, imageId: id }))}
                  className="absolute right-1 top-1 rounded bg-black/70 px-2 py-0.5 text-[11px] text-white">Remove</button>
              )}
            </div>
          ))}
        </div>
      )}
      {post.note && <p className="mt-3 whitespace-pre-line text-sm text-white">{post.note}</p>}
      {post.url && !print && (
        <a href={post.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs font-semibold text-[#60FDFF]">View post ↗</a>
      )}
      {staff && (
        <div className="mt-3 space-y-2 border-t border-white/[0.06] pt-3">
          <p className="text-[11px] text-text-muted">
            {post.status === 'approved' ? 'Approved, shown to the client' : post.replacesId ? 'Draft edit of an approved post' : 'Draft, not shown to the client'}
          </p>
          {editing ? (
            <PostEditor clientSlug={clientSlug} range={range} id={post.id} initial={post} onDone={() => setEditing(false)} />
          ) : (
            <div className="flex flex-wrap gap-2 text-xs">
              <button type="button" onClick={() => setEditing(true)} className="rounded-md bg-white/[0.12] px-2.5 py-1 font-semibold text-white">Edit</button>
              {post.status === 'draft' && caps.canApprove && (
                <button type="button" disabled={pending} onClick={() => run(() => approvePostAction({ clientSlug, id: post.id }))} className="rounded-md bg-[#60FF80]/20 px-2.5 py-1 font-semibold text-[#60FF80]">Approve</button>
              )}
              {post.status === 'approved' && caps.canApprove && (
                <button type="button" disabled={pending} onClick={() => run(() => revokePostAction({ clientSlug, id: post.id }))} className="rounded-md bg-white/[0.08] px-2.5 py-1 font-semibold text-white">Revoke</button>
              )}
              {post.status === 'draft' && (
                <button type="button" disabled={pending} onClick={() => { if (window.confirm('Delete this draft post?')) run(() => deletePostDraftAction({ clientSlug, id: post.id })) }}
                  className="rounded-md bg-white/[0.08] px-2.5 py-1 font-semibold text-[#FF4444]">Delete draft</button>
              )}
              {post.status === 'draft' && post.imageIds.length < MAX_IMAGES && <AddImage clientSlug={clientSlug} postId={post.id} />}
            </div>
          )}
          {error && <p role="alert" className="text-xs text-[#FF4444]">{error}</p>}
        </div>
      )}
    </li>
  )
}

function AddImage({ clientSlug, postId }: { clientSlug: string; postId: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  return (
    <label className="cursor-pointer rounded-md bg-white/[0.08] px-2.5 py-1 font-semibold text-white">
      {pending ? 'Adding...' : 'Add screenshot'}
      <input type="file" accept="image/*" className="sr-only" disabled={pending} onChange={(e) => {
        const file = e.target.files?.[0]
        e.target.value = ''
        if (!file) return
        start(async () => {
          setError(null)
          try {
            const { bytes, print } = await shrinkScreenshot(file)
            const form = new FormData()
            form.set('clientSlug', clientSlug)
            form.set('postId', postId)
            form.set('bytes', new File([bytes], 'screen.jpg', { type: 'image/jpeg' }))
            form.set('print', new File([print], 'print.jpg', { type: 'image/jpeg' }))
            const r = await addPostImageAction(form)
            if (!r.ok) setError(r.error)
            else router.refresh()
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not read the image.')
          }
        })
      }} />
      {error && <span role="alert" className="ml-2 font-normal text-[#FF4444]">{error}</span>}
    </label>
  )
}

type Draft = { group: SlPostGroup; platform: string; author: string; url: string; engagements: string; sentiment: SlSentiment; note: string; position: number }

function PostEditor({ clientSlug, range, id, initial, onDone }: {
  clientSlug: string; range: string; id?: string; initial: Partial<SlPost> & { group: SlPostGroup; position: number }; onDone: () => void
}) {
  const router = useRouter()
  const [d, setD] = useState<Draft>({
    group: initial.group, platform: initial.platform ?? DEFAULT_PLATFORM[initial.group], author: initial.author ?? '', url: initial.url ?? '',
    engagements: initial.engagements === null || initial.engagements === undefined ? '' : String(initial.engagements),
    sentiment: initial.sentiment ?? 'Neutral', note: initial.note ?? '', position: initial.position,
  })
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }))
  const field = 'w-full rounded-md border border-white/10 bg-bg-surface px-2 py-1 text-sm text-white'
  function save() {
    const engagements = d.engagements.trim() === '' ? null : Number(d.engagements)
    start(async () => {
      setError(null)
      const r = await savePostAction({ clientSlug, range, id: id ?? null, post: { ...d, engagements } })
      if (!r.ok) { setError(r.error); return }
      onDone()
      router.refresh()
    })
  }
  return (
    <div className="mb-3 space-y-2 rounded-md border border-white/10 p-3 text-xs text-text-muted">
      <div className="grid grid-cols-2 gap-2">
        <label>Platform<select className={field} value={d.platform} onChange={(e) => set('platform', e.target.value)}>
          {(PLATFORMS.includes(d.platform) ? PLATFORMS : [d.platform, ...PLATFORMS]).map((x) => <option key={x}>{x}</option>)}
        </select></label>
        <label>Author, thread or site<input className={field} value={d.author} placeholder="@handle, r/subreddit thread, or site name" onChange={(e) => set('author', e.target.value)} /></label>
        <label>Group<select className={field} value={d.group} onChange={(e) => set('group', e.target.value as SlPostGroup)}>
          {GROUPS.map((g) => <option key={g.group} value={g.group}>{g.title}</option>)}
        </select></label>
        <label>Sentiment<select className={field} value={d.sentiment} onChange={(e) => set('sentiment', e.target.value as SlSentiment)}>
          {(['Positive', 'Neutral', 'Negative'] as const).map((s) => <option key={s}>{s}</option>)}
        </select></label>
        <label>Engagements<input className={field} inputMode="numeric" value={d.engagements} onChange={(e) => set('engagements', e.target.value)} /></label>
        <label>Order<input className={field} type="number" min={0} max={99} value={d.position} onChange={(e) => set('position', Number(e.target.value))} /></label>
      </div>
      <label className="block">Link to post<input className={field} value={d.url} placeholder="https://" onChange={(e) => set('url', e.target.value)} /></label>
      <label className="block">Commentary<textarea className={field} rows={4} maxLength={1000} value={d.note} placeholder="What this post shows and why it matters this month" onChange={(e) => set('note', e.target.value)} /></label>
      <div className="flex gap-2">
        <button type="button" disabled={pending} onClick={save} className="rounded-md bg-white/[0.16] px-3 py-1 font-semibold text-white">{pending ? 'Saving...' : 'Save draft'}</button>
        <button type="button" disabled={pending} onClick={onDone} className="rounded-md px-3 py-1 font-semibold text-text-muted">Cancel</button>
      </div>
      {error && <p role="alert" className="text-[#FF4444]">{error}</p>}
    </div>
  )
}
