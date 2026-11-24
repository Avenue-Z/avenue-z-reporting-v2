// The shared Organic Social design kit's frames, first used by the Social Listening tab, in the approved mockup's markup
// (docs/social-listening/mock.template.html: .section, .sec-head, .card, .card-head, .note, .notice). A card's analysis
// box sits under the card, outside it, so cards line up evenly, as the team asked on 2026-11-24 (it sat inside the card
// from 2026-11-19). Server-safe.
import type { ReactNode } from 'react'
import s from './kit.module.css'
import f from './frames.module.css'

export function SlSection({ title, line, children }: { title?: string; line?: string | null; children: ReactNode }) {
  return (
    <section className={s.section}>
      {title && (line ? <div className={s.secHead}><h2>{title}</h2><span>{line}</span></div> : <h2>{title}</h2>)}
      {children}
    </section>
  )
}

/** A chart card: title, chart and note line only. `box` is its analysis box, drawn under the card and outside it; the
 *  card and its box are one block in the PDF export, so the box never leaves its chart's page. With no box the markup
 *  is the card alone, as it always was (the kit YTD block passes none). */
export function SlCard({ title, meta, note, box, children, bodyClassName }: {
  title: string; meta?: string | null; note?: string | null; box?: ReactNode; children: ReactNode; bodyClassName?: string
}) {
  const parts = (
    <>
      <div className={s.cardHead}>
        <h3>{title}</h3>
        {meta && <span className={s.meta}>{meta}</span>}
      </div>
      <div className={bodyClassName ? `${s.cardBody} ${bodyClassName}` : s.cardBody}>{children}</div>
      {note && <p className={s.note}>{note}</p>}
    </>
  )
  if (!box) return <div className={s.card} data-export-block="">{parts}</div>
  return (
    <div className={f.item} data-export-block="">
      <div className={s.card}>{parts}</div>
      {box}
    </div>
  )
}

/** A small label over an analysis box that has no chart of its own inside a section (the top conversation themes box in
 *  Themes). Not a heading, so it never reads as a card title. */
export function SlBoxLabel({ children }: { children: ReactNode }) {
  return <p className={f.label}>{children}</p>
}

/** A staff-only line (never in the client view), in the mockup's notice style. */
export function StaffNote({ children }: { children: ReactNode }) {
  return <div className={s.notice} role="note"><b>Staff</b><span>{children}</span></div>
}
