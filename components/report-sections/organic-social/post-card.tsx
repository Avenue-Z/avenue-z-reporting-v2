'use client'

import { useState } from 'react'
import { num } from '@/lib/supermetrics/format'
import { pctCompact } from '@/lib/organic-social/format'
import { DesignationToggle } from './designation-toggle'
import { safeHref } from './annotation-callouts'
import { useExportMode } from '@/components/export/export-mode'
import type { TopContentPost } from '@/lib/organic-social/content-types'

interface CardMetric { key: string; label: string; value: string; emphasised?: boolean }

function cardMetrics(post: TopContentPost, sortKey: string): CardMetric[] {
  const m = post.metrics
  return [
    // effectiveness + engagementRate are both fractions (×100 for %).
    { key: 'effectiveness', label: 'Effectiveness', value: m.effectiveness != null ? pctCompact(m.effectiveness * 100) : '—' },
    { key: 'engagementRate', label: 'Engagement Rate', value: m.engagementRate != null ? pctCompact(m.engagementRate * 100) : '—' },
    { key: 'engagements', label: 'Engagements', value: num(m.engagements) },
    { key: 'impressions', label: 'Views / Impr.', value: num(m.impressions) },
  ].map((x) => ({ ...x, emphasised: x.key === sortKey }))
}

/** Creative area with an onError placeholder — a purged/deleted asset shows a placeholder,
 *  the card is never hidden (snapshot §5). No video autoplay (play only on press). */
function Media({ post }: { post: TopContentPost }) {
  const [broken, setBroken] = useState(false)
  const c = post.creative
  if (broken || !c) {
    return (
      <div className="flex aspect-square items-center justify-center bg-white/[0.04] text-center text-[11px] text-text-muted">
        creative no longer available
      </div>
    )
  }
  if (c.kind === 'video') {
    return (
      <video className="aspect-square w-full object-cover" controls preload="metadata" poster={c.poster ?? undefined} onError={() => setBroken(true)}>
        <source src={c.src} type="video/mp4" onError={() => setBroken(true)} />
      </video>
    )
  }
  return (
    <img
      className="aspect-square w-full object-cover"
      src={c.thumb}
      alt={post.caption.slice(0, 80)}
      // onError catches failures AFTER hydration; the ref catches an <img> that already errored
      // BEFORE React hydrated (SSR sends the tag, the browser can fail the load before the
      // handler attaches — a complete image with zero natural width is a failed load).
      ref={(el) => { if (el && el.complete && el.naturalWidth === 0) setBroken(true) }}
      onError={() => setBroken(true)}
    />
  )
}

/** The creative as the PDF export prints it: a video's poster frame (a player cannot print), else a
 *  placeholder; an image as it is. */
function ExportMedia({ post }: { post: TopContentPost }) {
  const [broken, setBroken] = useState(false)
  const c = post.creative
  const src = c?.kind === 'video' ? c.poster : c?.thumb
  if (broken || !src) {
    return (
      <div className="flex aspect-[4/3] items-center justify-center bg-white/[0.04] text-center text-[11px] text-text-muted">
        {c?.kind === 'video' ? 'video' : 'creative no longer available'}
      </div>
    )
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="aspect-[4/3] w-full object-cover" src={src} alt={post.caption.slice(0, 80)} onError={() => setBroken(true)} />
}

/** A card as the PDF export prints it: the whole card is one link to the post (http(s) only), "View post"
 *  reads as a link on paper, the card fills its grid cell, and staff controls are gone. */
function ExportPostCard({ post, sortKey }: { post: TopContentPost; sortKey: string }) {
  const href = safeHref(post.url)
  const body = (
    <>
      <div className="relative">
        <ExportMedia post={post} />
        {post.mediaType === 'CAROUSEL' && (
          <span className="absolute bottom-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">◫ carousel</span>
        )}
      </div>
      <div className="space-y-2 p-3">
        <div className="text-[11px] text-text-muted">{post.publishedAt}</div>
        <p className="line-clamp-3 text-xs text-white/90">{post.caption}</p>
        <ul className="space-y-0.5">
          {cardMetrics(post, sortKey).map((m) => (
            <li key={m.key} className={`flex justify-between text-[11px] ${m.emphasised ? 'font-bold text-white' : 'text-text-muted'}`}>
              <span>{m.label}</span><span>{m.value}</span>
            </li>
          ))}
        </ul>
        {href && <span className="block text-[11px] text-brand-cyan underline">View post ↗</span>}
      </div>
    </>
  )
  const cls = 'block overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.02]'
  return href
    ? <a href={href} target="_blank" rel="noopener noreferrer" data-export-link="" className={cls}>{body}</a>
    : <div className={cls}>{body}</div>
}

export function PostCard({ post, clientSlug, canEdit, sortKey = 'engagements' }: {
  post: TopContentPost; clientSlug: string; canEdit: boolean; sortKey?: string
}) {
  if (useExportMode()) return <ExportPostCard post={post} sortKey={sortKey} />
  return (
    <div className="w-56 shrink-0 overflow-hidden rounded-xl print:w-[calc(25%-9px)] border border-white/[0.08] bg-white/[0.02]">
      <div className="relative">
        <Media post={post} />
        {post.mediaType === 'CAROUSEL' && (
          <span className="absolute bottom-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">◫ carousel</span>
        )}
      </div>
      <div className="space-y-2 p-3">
        <div className="text-[11px] text-text-muted">{post.publishedAt}</div>
        <p className="line-clamp-3 text-xs text-white/90">{post.caption}</p>
        <ul className="space-y-0.5">
          {cardMetrics(post, sortKey).map((m) => (
            <li key={m.key} className={`flex justify-between text-[11px] ${m.emphasised ? 'font-bold text-white' : 'text-text-muted'}`}>
              <span>{m.label}</span><span>{m.value}</span>
            </li>
          ))}
        </ul>
        {post.url && (
          <a href={post.url} target="_blank" rel="noopener noreferrer" className="block text-[11px] text-brand-cyan hover:underline">
            View post
          </a>
        )}
        {canEdit && <DesignationToggle clientSlug={clientSlug} postId={post.id} value={post.sourceType} />}
      </div>
    </div>
  )
}
