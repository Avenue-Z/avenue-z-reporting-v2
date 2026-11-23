'use client'
// Most relevant posts, as the approved mockup draws them (docs/social-listening/mock.template.html: renderGroup, postCard,
// postForm): a sideways-sliding row per group with ‹ › arrows, each card with its screenshot on top, chips, the author, the
// note and its link; the staff form beside the cards. Saves go through the post and image actions (drafts, then approval).
// The note is plain text, never markup. In the client view and the PDF there are no controls and only approved posts arrive
// here (view-model.ts); the PDF prints each post's first image at print size.
import { useRef, useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useExportMode } from '@/components/export/export-mode'
import {
  addPostImageAction, approvePostAction, deletePostDraftAction, removePostImageAction, revokePostAction, savePostAction,
} from '@/app/actions/social-listening'
import { MAX_IMAGES } from '@/lib/organic-social/social-listening/posts'
import type { SlPost, SlPostGroup, SlSentiment } from '@/lib/organic-social/social-listening/types'
import { shrinkScreenshot } from './image-shrink'
import s from '../design/kit.module.css'

// The mockup's three groups, worded without the client's name (this repo is public).
const GROUPS: { group: SlPostGroup; title: string; sub: string }[] = [
  { group: 'social', title: 'Social posts', sub: 'The most engaged posts, and a typical negative one' },
  { group: 'forum', title: 'Forum posts', sub: "Reddit can't be exported, so these are screenshots" },
  { group: 'web', title: 'Web posts', sub: 'Articles and syndicated stories that mention the brand' },
]
// The mockup's platform list; a post saved with another platform keeps it as an option.
const PLATFORMS = ['Facebook', 'Instagram', 'LinkedIn', 'X', 'Reddit', 'YouTube', 'TikTok', 'Web article', 'Other']
const SENTS: SlSentiment[] = ['Positive', 'Neutral', 'Negative']
const DEFAULT_PLATFORM: Record<SlPostGroup, string> = { social: 'Facebook', forum: 'Reddit', web: 'Web article' }
// The mockup's card width plus the gap: an arrow moves the row by one post.
const CARD_STEP = 332
const CHIP: Record<SlSentiment, string> = { Positive: s.chipPositive, Neutral: s.chipNeutral, Negative: s.chipNegative }
const imageSrc = (id: string, print: boolean) => `/api/social-listening/image/${id}${print ? '?print=1' : ''}`
const fmt = (n: number) => Math.round(n).toLocaleString('en-US')

type Caps = { canEdit: boolean; canApprove: boolean }
type Props = { posts: SlPost[]; clientSlug: string; range: string; caps: Caps }
type Editing = { group: SlPostGroup; id: string | null } | null

export function PostsSection({ posts, clientSlug, range, caps }: Props) {
  const exportMode = useExportMode()
  const staff = caps.canEdit && !exportMode
  const [editing, setEditing] = useState<Editing>(null)
  return (
    <>
      {GROUPS.map(({ group, title, sub }) => {
        const list = posts.filter((p) => p.group === group)
        if (list.length === 0 && !staff) return null
        const addingHere = editing?.group === group && editing.id === null
        const form = (p: SlPost | null) => (
          <PostForm key={p?.id ?? `new-${group}`} group={group} post={p} position={p?.position ?? list.length}
            clientSlug={clientSlug} range={range} onDone={() => setEditing(null)} />
        )
        return (
          <PostGroup key={group} title={title} sub={sub} count={list.length} print={exportMode}
            add={staff && !addingHere ? () => setEditing({ group, id: null }) : null}
            form={addingHere ? form(null) : null}
            cards={list.map((p) => (staff && editing?.id === p.id
              ? form(p)
              : <PostCard key={p.id} post={p} clientSlug={clientSlug} caps={caps} staff={staff} print={exportMode} onEdit={() => setEditing({ group, id: p.id })} />))} />
        )
      })}
    </>
  )
}

function PostGroup({ title, sub, count, print, add, form, cards }: {
  title: string; sub: string; count: number; print: boolean; add: (() => void) | null; form: ReactNode; cards: ReactNode[]
}) {
  const row = useRef<HTMLDivElement>(null)
  const slide = (dir: 1 | -1) => row.current?.scrollBy({ left: dir * CARD_STEP, behavior: 'smooth' })
  return (
    <div className={s.pgroup} data-export-block="">
      <div className={s.pgroupHead}>
        <div><h3>{title} <span>({count})</span></h3><span>{sub}</span></div>
        <span className={s.pnav}>
          {!print && count > 1 && (
            <>
              <button type="button" className={s.navbtn} onClick={() => slide(-1)} aria-label={`Previous ${title.toLowerCase()}`}>‹</button>
              <button type="button" className={s.navbtn} onClick={() => slide(1)} aria-label={`Next ${title.toLowerCase()}`}>›</button>
            </>
          )}
          {add && <button type="button" className={s.tbtn} onClick={add}>+ Add post</button>}
        </span>
      </div>
      {form}
      {cards.length > 0 && (print ? <div className={s.pprint}>{cards}</div> : <div ref={row} className={s.pgrid}>{cards}</div>)}
    </div>
  )
}

function PostCard({ post, clientSlug, caps, staff, print, onEdit }: {
  post: SlPost; clientSlug: string; caps: Caps; staff: boolean; print: boolean; onEdit: () => void
}) {
  const router = useRouter()
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
    <article className={s.post}>
      {images.length > 0 ? (
        <div className={s.postShots}>
          {images.map((id) => (
            <div key={id} className={s.shot}>
              {/* Lazy on the page only. The export browser's viewport is fixed (render-pdf.ts) and the PDF waits for every
                  image to finish (readiness.ts), so a lazy one below the fold would print blank or hold the export until
                  it times out (#475); the Influencer tab's PDF image is eager too (post-card.tsx ExportMedia). */}
              {/* eslint-disable-next-line @next/next/no-img-element -- served by our own route with its own access check */}
              <img src={imageSrc(id, print)} alt={`Screenshot of the ${post.platform} post by ${post.author}`} loading={print ? undefined : 'lazy'} />
              {staff && post.status === 'draft' && (
                <button type="button" className={`${s.tbtn} ${s.shotRemove}`} disabled={pending} onClick={() => run(() => removePostImageAction({ clientSlug, imageId: id }))}>Remove</button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className={s.postShotsNone}>No screenshot</div>
      )}
      <div className={s.postBody}>
        <div className={s.postMeta}>
          <span className={s.chip}>{post.platform}</span>
          <span className={`${s.chip} ${CHIP[post.sentiment]}`}>{post.sentiment}</span>
          {post.engagements !== null && <span className={s.chip}>{fmt(post.engagements)} engagements</span>}
        </div>
        <div className={s.postWho}>{post.author}</div>
        {post.note && <p className={s.postNote}>{post.note}</p>}
        {staff && (
          <p className={s.state}>{post.status === 'approved' ? 'Approved, shown to the client' : post.replacesId ? 'Draft edit of an approved post' : 'Draft, not shown to the client'}</p>
        )}
        <div className={s.postFoot}>
          {post.url && !print && <a href={post.url} target="_blank" rel="noopener noreferrer">View post ↗</a>}
          <span className={s.spacer} />
          {staff && (
            <>
              {post.status === 'draft' && caps.canApprove && (
                <button type="button" className={s.tbtn} disabled={pending} onClick={() => run(() => approvePostAction({ clientSlug, id: post.id }))}>Approve</button>
              )}
              {post.status === 'approved' && caps.canApprove && (
                <button type="button" className={`${s.tbtn} ${s.ghost}`} disabled={pending} onClick={() => run(() => revokePostAction({ clientSlug, id: post.id }))}>Revoke</button>
              )}
              <button type="button" className={s.tbtn} onClick={onEdit}>Edit</button>
              {post.status === 'draft' && (
                <button type="button" className={`${s.tbtn} ${s.ghost}`} disabled={pending}
                  onClick={() => { if (window.confirm('Remove this draft post?')) run(() => deletePostDraftAction({ clientSlug, id: post.id })) }}>Remove</button>
              )}
            </>
          )}
        </div>
        {error && <p role="alert" className={s.statusError}>{error}</p>}
      </div>
    </article>
  )
}

/** The mockup's post form: platform, sentiment, author, engagements, link, commentary and screenshots. Saving makes a
 *  draft (editing an approved post forks one), then uploads each new screenshot, shrunk in the browser, to that draft. */
function PostForm({ group, post, position, clientSlug, range, onDone }: {
  group: SlPostGroup; post: SlPost | null; position: number; clientSlug: string; range: string; onDone: () => void
}) {
  const router = useRouter()
  const files = useRef<HTMLInputElement>(null)
  const [d, setD] = useState({
    platform: post?.platform ?? DEFAULT_PLATFORM[group], sentiment: post?.sentiment ?? ('Positive' as SlSentiment),
    author: post?.author ?? '', engagements: post?.engagements === null || post?.engagements === undefined ? '' : String(post.engagements),
    url: post?.url ?? '', note: post?.note ?? '',
  })
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null)
  const [pending, start] = useTransition()
  // After a save whose screenshots did not all go up, the draft that save made (a new post's, or an approved post's
  // fork) and the files already added to it. The next save edits that draft and sends only the rest, so a retry never
  // makes a second draft, hits "already has an open edit", or adds a screenshot twice (#473). Files chosen again in the
  // picker are new File objects, so they are sent.
  const [savedId, setSavedId] = useState<string | null>(null)
  const sent = useRef(new WeakSet<File>())
  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD((x) => ({ ...x, [k]: v }))
  const id = (f: string) => `pf-${group}-${post?.id ?? 'new'}-${f}`

  function submit() {
    start(async () => {
      setStatus(null)
      const engagements = d.engagements.trim() === '' ? null : Number(d.engagements)
      const saved = await savePostAction({
        clientSlug, range, id: savedId ?? post?.id ?? null,
        post: { group, platform: d.platform, author: d.author, url: d.url, engagements, sentiment: d.sentiment, note: d.note, position },
      })
      if (!saved.ok) { setStatus({ text: saved.error, error: true }); return }
      const chosen = [...(files.current?.files ?? [])].filter((f) => !sent.current.has(f))
      const partly = (why: string) => {
        setSavedId(saved.id)
        // The server's messages end in a full stop and a thrown one may not, so it ends in exactly one.
        setStatus({ text: `Saved, but a screenshot was not added: ${why.trim().replace(/[.\s]*$/, '')}. Fix it and save again; the post is kept.`, error: true })
        router.refresh()
      }
      for (const [i, file] of chosen.entries()) {
        setStatus({ text: `Adding screenshot ${i + 1} of ${chosen.length}...`, error: false })
        try {
          const { bytes, print } = await shrinkScreenshot(file)
          const form = new FormData()
          form.set('clientSlug', clientSlug)
          form.set('postId', saved.id)
          form.set('bytes', new File([bytes], 'screen.jpg', { type: 'image/jpeg' }))
          form.set('print', new File([print], 'print.jpg', { type: 'image/jpeg' }))
          const r = await addPostImageAction(form)
          if (!r.ok) { partly(r.error); return }
          sent.current.add(file)
        } catch (err) {
          partly(err instanceof Error ? err.message : 'could not read it')
          return
        }
      }
      onDone()
      router.refresh()
    })
  }
  function clearShots() {
    if (!post) return
    start(async () => {
      for (const imageId of post.imageIds) {
        const r = await removePostImageAction({ clientSlug, imageId })
        if (!r.ok) { setStatus({ text: r.error, error: true }); break }
      }
      router.refresh()
    })
  }

  return (
    <form className={s.pform} noValidate onSubmit={(e) => { e.preventDefault(); submit() }}>
      <label htmlFor={id('platform')}>Platform
        <select id={id('platform')} value={d.platform} onChange={(e) => set('platform', e.target.value)}>
          {(PLATFORMS.includes(d.platform) ? PLATFORMS : [d.platform, ...PLATFORMS]).map((x) => <option key={x}>{x}</option>)}
        </select>
      </label>
      <label htmlFor={id('sentiment')}>Sentiment
        <select id={id('sentiment')} value={d.sentiment} onChange={(e) => set('sentiment', e.target.value as SlSentiment)}>
          {SENTS.map((x) => <option key={x}>{x}</option>)}
        </select>
      </label>
      <label htmlFor={id('who')}>Author, thread or site
        <input id={id('who')} value={d.author} placeholder="@handle, r/subreddit thread, or site name" onChange={(e) => set('author', e.target.value)} />
      </label>
      <label htmlFor={id('eng')}>Engagements
        <input id={id('eng')} type="number" min={0} value={d.engagements} placeholder="Leave blank if none" onChange={(e) => set('engagements', e.target.value)} />
      </label>
      <label className={s.wide} htmlFor={id('link')}>Link to post
        <input id={id('link')} type="url" value={d.url} placeholder="https://" onChange={(e) => set('url', e.target.value)} />
      </label>
      <label className={s.wide} htmlFor={id('note')}>Commentary
        <textarea id={id('note')} maxLength={1000} value={d.note} placeholder="What this post shows and why it matters this month" onChange={(e) => set('note', e.target.value)} />
      </label>
      <label className={s.wide} htmlFor={id('shots')}>Screenshots
        <input id={id('shots')} ref={files} type="file" accept="image/*" multiple disabled={(post?.imageIds.length ?? 0) >= MAX_IMAGES} />
      </label>
      <div className={`${s.wide} ${s.editRow}`}>
        <button type="submit" className={`${s.tbtn} ${s.primary}`} disabled={pending}>{post || savedId ? 'Save post' : 'Add post'}</button>
        <button type="button" className={s.tbtn} onClick={onDone} disabled={pending}>Cancel</button>
        {post && post.status === 'draft' && post.imageIds.length > 0 && (
          <button type="button" className={`${s.tbtn} ${s.ghost}`} onClick={clearShots} disabled={pending}>Remove screenshots</button>
        )}
        {status && <span role="status" className={status.error ? s.statusError : s.status}>{status.text}</span>}
      </div>
    </form>
  )
}
