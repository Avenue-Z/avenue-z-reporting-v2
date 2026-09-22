'use client'

import { useState } from 'react'
import type { ChartAnnotation } from '@/lib/organic-social/annotations'
import type { Creative } from '@/lib/organic-social/content-types'

const TILE = 'h-16 w-16 shrink-0 rounded-md'

/** Only http(s) links are rendered. The URL comes from Dash, so a javascript: URL must never
 *  become an href. */
const safeHref = (url: string | null) => (url && /^https?:\/\//i.test(url) ? url : null)

/** Same fallback as the Top Content card (post-card.tsx, Media): a missing or purged image
 *  shows the placeholder, never a broken image. onError catches a load that fails after
 *  hydration; the ref catches one that failed before React attached the handler. A video
 *  with no poster keeps a muted video tile, as the card keeps a live video. */
function Picture({ creative, alt }: { creative: Creative | null; alt: string }) {
  const [broken, setBroken] = useState(false)
  if (broken || !creative) {
    return (
      <div className={`${TILE} flex items-center justify-center bg-white/[0.04] p-1 text-center text-[9px] leading-tight text-text-muted`}>
        creative no longer available
      </div>
    )
  }
  if (creative.kind === 'video' && !creative.poster) {
    return (
      <video className={`${TILE} object-cover`} src={creative.src} muted playsInline preload="metadata"
        aria-label={alt} onError={() => setBroken(true)} />
    )
  }
  const src = creative.kind === 'image' ? creative.thumb : creative.poster!
  return (
    <img
      src={src}
      alt={alt}
      className={`${TILE} object-cover`}
      ref={(el) => { if (el && el.complete && el.naturalWidth === 0) setBroken(true) }}
      onError={() => setBroken(true)}
    />
  )
}

/** The annotation's own label describes the picture: no caption crosses the server to client
 *  boundary (only the day, the value and the thumbnail do). */
function Thumb({ annotation }: { annotation: ChartAnnotation }) {
  const thumb = annotation.thumb
  if (!thumb) return null
  const picture = <Picture creative={thumb.creative} alt={annotation.label} />
  const href = safeHref(thumb.url)
  return href ? <a href={href} target="_blank" rel="noopener noreferrer">{picture}</a> : picture
}

/** The days that spiked, in date order, directly above the chart they explain. Not pinned
 *  to pixel positions over the line, which would break as the chart resizes on a phone. */
export function AnnotationCallouts({ items }: { items: ChartAnnotation[] }) {
  if (items.length === 0) return null
  return (
    <ul aria-label="Annotations" className="flex flex-wrap gap-3">
      {items.map((a) => (
        <li key={a.date} className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] p-2">
          <Thumb annotation={a} />
          <span className="text-xs font-bold text-white">{a.label}</span>
        </li>
      ))}
    </ul>
  )
}
