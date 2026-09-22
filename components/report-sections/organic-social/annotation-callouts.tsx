'use client'

import { useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { setAnnotationHiddenAction } from '@/app/actions/organic-social'
import type { AnnotationControls, ChartAnnotation } from '@/lib/organic-social/annotations'
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

/** One annotation. With controls (staff only; the parent gets them from the server and the
 *  action re-checks the role) it carries a hide or unhide button. Optimistic: it fades or
 *  un-fades at once and goes back if the action refuses or fails. Freshness after success
 *  comes from the action's revalidateTag('db'). */
function AnnotationItem({ annotation, controls }: { annotation: ChartAnnotation; controls?: AnnotationControls }) {
  const [hidden, setHidden] = useState(!!annotation.hidden)
  const [pending, startTransition] = useTransition()

  function toggle() {
    if (!controls) return
    const next = !hidden
    setHidden(next) // optimistic
    startTransition(async () => {
      let ok = false
      try {
        ok = (await setAnnotationHiddenAction({ ...controls, day: annotation.date, hidden: next })).ok
      } catch {
        ok = false
      }
      if (!ok) setHidden(!next) // put it back
    })
  }

  return (
    <li className={cn('flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] p-2', hidden && 'opacity-40')}>
      <Thumb annotation={annotation} />
      <span className="text-xs font-bold text-white">{annotation.label}</span>
      {hidden && <span className="text-[11px] text-text-muted">Hidden from client</span>}
      {controls && (
        <button
          type="button"
          onClick={toggle}
          disabled={pending}
          className="whitespace-nowrap rounded-full border border-white/[0.12] px-2 py-0.5 text-[11px] font-bold text-text-muted hover:text-white disabled:opacity-50"
        >
          {hidden ? 'Unhide' : 'Hide from client'}
        </button>
      )}
    </li>
  )
}

/** The days that spiked, in date order, directly above the chart they explain. Not pinned
 *  to pixel positions over the line, which would break as the chart resizes on a phone. */
export function AnnotationCallouts({ items, controls }: { items: ChartAnnotation[]; controls?: AnnotationControls }) {
  if (items.length === 0) return null
  return (
    <ul aria-label="Annotations" className="flex flex-wrap gap-3">
      {items.map((a) => <AnnotationItem key={a.date} annotation={a} controls={controls} />)}
    </ul>
  )
}
