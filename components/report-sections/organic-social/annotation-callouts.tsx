'use client'

import { useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { setAnnotationHiddenAction } from '@/app/actions/organic-social'
import type { AnnotationControls, ChartAnnotation, ChartThumb, NoteControls } from '@/lib/organic-social/annotations'
import type { Creative } from '@/lib/organic-social/content-types'
import { NoteActions } from './note-actions'

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
function Thumb({ thumb, alt }: { thumb: ChartThumb; alt: string }) {
  const picture = <Picture creative={thumb.creative} alt={alt} />
  const href = safeHref(thumb.url)
  return href ? <a href={href} target="_blank" rel="noopener noreferrer">{picture}</a> : picture
}

/** One annotation. With controls (staff only; the parent gets them from the server and the
 *  action re-checks the role) it carries a hide or unhide button. Optimistic: it fades or
 *  un-fades at once and goes back if the action refuses or fails. Freshness after success
 *  comes from the action's revalidateTag('db'). */
function AnnotationItem({ annotation, controls, onToggle, noteControls, onEdit, as, floating }: {
  annotation: ChartAnnotation
  controls?: AnnotationControls
  /** Set by the chart, which holds which days are hidden so the dot goes with the row. */
  onToggle?: (day: string, hidden: boolean) => void
  noteControls?: NoteControls
  onEdit?: (day: string, initial?: { text: string; postIds: number[] }) => void
  as?: 'li' | 'div'
  floating?: boolean
}) {
  const hidden = !!annotation.hidden
  const [pending, startTransition] = useTransition()

  function toggle() {
    if (!controls || !onToggle) return
    const next = !hidden
    onToggle(annotation.date, next) // optimistic, in the chart above
    startTransition(async () => {
      let ok = false
      try {
        ok = (await setAnnotationHiddenAction({ ...controls, day: annotation.date, hidden: next })).ok
      } catch {
        ok = false
      }
      if (!ok) onToggle(annotation.date, !next) // put it back
    })
  }

  // A day shown only for its note, with no approved note yet, has nothing for a client: like a
  // hidden card it is faded for the team and must not reach a PDF exported from the team's view.
  const draftOnly = !!annotation.noteOnly && !annotation.note
  const thumbs = annotation.thumbs ?? (annotation.thumb ? [annotation.thumb] : [])
  const draft = annotation.noteEditor?.draft
  const Tag = as ?? 'li'

  // Export PDF is window.print() of the page in front of you, so anything staff-only has to
  // carry `no-print` or it lands in a PDF exported from a client's view: a hidden card is shown
  // to staff only so they can unhide it, and the toggle is a control rather than content.
  return (
    <Tag className={cn(
      'flex flex-wrap items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] p-2',
      // Over the graph (#272727), the card takes the darker brand surface and a clearer border, so it
      // stands apart as a card rather than blending into the chart (seen live, 2026-09-24).
      floating && 'border-white/[0.14] bg-bg-subtle shadow-lg shadow-black/40',
      hidden && 'opacity-40 no-print',
      !hidden && draftOnly && 'opacity-40 no-print',
    )}>
      {thumbs.map((t, i) => <Thumb key={i} thumb={t} alt={annotation.label} />)}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-xs font-bold text-white">{annotation.label}</span>
        {annotation.note && <span className={cn('text-xs text-white', floating && 'line-clamp-2')}>{annotation.note}</span>}
        {draft && <span className={cn('no-print text-[11px] text-text-muted', floating && 'line-clamp-1')}>Draft: {draft.text}</span>}
        {hidden && <span className="text-[11px] text-text-muted">Hidden from client</span>}
      </span>
      {/* The team's buttons get a row of their own under the picture and the text: beside them the
          text column (flex-1, a zero starting width) shrank to a few pixels, and a fixed-height card
          clipped its buttons (measured in Chromium, Task 10). A client has no buttons, no row. */}
      {(controls || (noteControls && onEdit)) && (
        <span className="no-print flex basis-full flex-wrap items-center gap-2">
          {controls && (
            <button
              type="button"
              onClick={toggle}
              disabled={pending}
              aria-label={hidden ? 'Unhide' : 'Hide from client'}
              className="no-print whitespace-nowrap rounded-full border border-white/[0.12] px-2 py-0.5 text-[11px] font-bold text-text-muted hover:text-white disabled:opacity-50"
            >
              {hidden ? 'Unhide' : floating ? 'Hide' : 'Hide from client'}
            </button>
          )}
          {noteControls && onEdit && <NoteActions annotation={annotation} controls={noteControls} compact={floating} onEdit={onEdit} />}
        </span>
      )}
    </Tag>
  )
}

/** The row of callouts above the chart. Since Phase 2b it holds only a callout whose day has no point
 *  on the series (it has no dot to open a card from); every other callout is a card that opens from
 *  its dot (CalloutCard, trends.tsx). */
export function AnnotationCallouts({ items, controls, noteControls, onToggle, onEdit }: {
  items: ChartAnnotation[]
  controls?: AnnotationControls
  noteControls?: NoteControls
  onToggle?: (day: string, hidden: boolean) => void
  onEdit?: (day: string, initial?: { text: string; postIds: number[] }) => void
}) {
  if (items.length === 0) return null
  // Hiding every card is not enough: the list is a non-last child of the chart's section, so
  // Tailwind still gives it a margin and the printed page keeps a gap where the row was. A
  // draft-only day prints nothing either.
  const nothingPrintable = items.every((a) => a.hidden || (a.noteOnly && !a.note))
  return (
    <ul aria-label="Annotations" className={cn('flex flex-wrap gap-3', nothingPrintable && 'no-print')}>
      {items.map((a) => (
        <AnnotationItem key={a.date} annotation={a} controls={controls} noteControls={noteControls} onToggle={onToggle} onEdit={onEdit} />
      ))}
    </ul>
  )
}

/** One callout as the card that opens from its dot (Phase 2b: hover, focus or tap; the chart places
 *  it, one at a time). The same card as the row, so hiding, notes and print rules are identical; the
 *  note is cut at two lines and the draft at one (the hover box and the form show them whole). */
export function CalloutCard(props: {
  annotation: ChartAnnotation
  controls?: AnnotationControls
  noteControls?: NoteControls
  onToggle?: (day: string, hidden: boolean) => void
  onEdit?: (day: string, initial?: { text: string; postIds: number[] }) => void
}) {
  return <AnnotationItem {...props} as="div" floating />
}
