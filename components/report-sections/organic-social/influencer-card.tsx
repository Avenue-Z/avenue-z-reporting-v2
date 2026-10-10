'use client'

import { DesignationToggle } from './designation-toggle'
import { ExportMedia, Media, cardMetrics, type CardMetric } from './post-card'
import { safeHref } from './annotation-callouts'
import { useExportMode } from '@/components/export/export-mode'
import type { TopContentPost } from '@/lib/organic-social/content-types'

/** The card's rows without the ones that have nothing in them: a rate Dash did not send, and Views when the post
 *  reports none (influencer and UGC posts usually carry no reach, so a row of "—" and a 0 says nothing). Engagements
 *  always shows, even at 0. The shared PostCard keeps every row; only the Influencer tab hides them. */
export function influencerCardMetrics(post: TopContentPost, sortKey: string): CardMetric[] {
  const m = post.metrics
  return cardMetrics(post, sortKey).filter((r) =>
    r.key === 'effectiveness' ? m.effectiveness != null
      : r.key === 'engagementRate' ? m.engagementRate != null
        : r.key === 'impressions' ? m.impressions > 0
          : true)
}

/** The Influencer tab's card, laid out like a deck slide: the post on the left, its date, caption and numbers
 *  beside it. Same media, numbers and staff toggle as PostCard. */
export function InfluencerCard({ post, clientSlug, canEdit, sortKey }: {
  post: TopContentPost; clientSlug: string; canEdit: boolean; sortKey: string
}) {
  if (useExportMode()) return <ExportInfluencerCard post={post} sortKey={sortKey} />
  return (
    <div data-influencer-card className="flex w-full overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.02]">
      <div className="relative w-2/5 shrink-0">
        <Media post={post} />
        {post.mediaType === 'CAROUSEL' && (
          <span className="absolute bottom-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">◫ carousel</span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
        <div className="text-xs text-text-muted">{post.publishedAt}</div>
        <p className="line-clamp-4 text-sm text-white/90">{post.caption}</p>
        <ul className="mt-auto space-y-1.5 border-t border-white/[0.06] pt-3">
          {influencerCardMetrics(post, sortKey).map((m) => (
            <li key={m.key} className={`flex justify-between text-sm ${m.emphasised ? 'font-bold text-white' : 'text-text-muted'}`}>
              <span>{m.label}</span><span>{m.value}</span>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center justify-between gap-2">
          {post.url
            ? <a href={post.url} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-cyan hover:underline">View post</a>
            : <span />}
          {canEdit && <DesignationToggle clientSlug={clientSlug} postId={post.id} value={post.sourceType} />}
        </div>
      </div>
    </div>
  )
}

/** The card as the PDF export prints it (as PostCard's export form does): the post's print image (a video's poster
 *  frame; a player cannot print) beside its numbers, the same rows hidden, the whole card one link to the post
 *  (http(s) only), no staff toggle. */
function ExportInfluencerCard({ post, sortKey }: { post: TopContentPost; sortKey: string }) {
  const href = safeHref(post.url)
  const body = (
    <>
      <div className="relative w-2/5 shrink-0">
        <ExportMedia post={post} />
        {post.mediaType === 'CAROUSEL' && (
          <span className="absolute bottom-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">◫ carousel</span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 p-3">
        <div className="text-[11px] text-text-muted">{post.publishedAt}</div>
        <p className="line-clamp-4 text-xs text-white/90">{post.caption}</p>
        <ul className="mt-auto space-y-0.5 border-t border-white/[0.06] pt-2">
          {influencerCardMetrics(post, sortKey).map((m) => (
            <li key={m.key} className={`flex justify-between text-[11px] ${m.emphasised ? 'font-bold text-white' : 'text-text-muted'}`}>
              <span>{m.label}</span><span>{m.value}</span>
            </li>
          ))}
        </ul>
        {href && <span className="block text-[11px] text-brand-cyan underline">View post ↗</span>}
      </div>
    </>
  )
  const cls = 'flex overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.02]'
  return href
    ? <a href={href} target="_blank" rel="noopener noreferrer" data-export-link="" className={cls}>{body}</a>
    : <div className={cls}>{body}</div>
}
