// The shared Organic Social design kit's frames, first used by the Social Listening tab, in the approved mockup's markup
// (docs/social-listening/mock.template.html: .section, .sec-head, .card, .card-head, .note, .notice). A card's analysis
// box sits inside the card under its chart, as the team asked on 2026-11-19. Server-safe.
import type { ReactNode } from 'react'
import s from './kit.module.css'

export function SlSection({ title, line, children }: { title?: string; line?: string | null; children: ReactNode }) {
  return (
    <section className={s.section}>
      {title && (line ? <div className={s.secHead}><h2>{title}</h2><span>{line}</span></div> : <h2>{title}</h2>)}
      {children}
    </section>
  )
}

/** A chart card. `box` is the card's analysis box, inside the card under the chart. One block in the PDF export. */
export function SlCard({ title, meta, note, box, children, bodyClassName }: {
  title: string; meta?: string | null; note?: string | null; box?: ReactNode; children: ReactNode; bodyClassName?: string
}) {
  return (
    <div className={s.card} data-export-block="">
      <div className={s.cardHead}>
        <h3>{title}</h3>
        {meta && <span className={s.meta}>{meta}</span>}
      </div>
      <div className={bodyClassName ? `${s.cardBody} ${bodyClassName}` : s.cardBody}>{children}</div>
      {note && <p className={s.note}>{note}</p>}
      {box && <div className={s.inCard}>{box}</div>}
    </div>
  )
}

/** A staff-only line (never in the client view), in the mockup's notice style. */
export function StaffNote({ children }: { children: ReactNode }) {
  return <div className={s.notice} role="note"><b>Staff</b><span>{children}</span></div>
}
