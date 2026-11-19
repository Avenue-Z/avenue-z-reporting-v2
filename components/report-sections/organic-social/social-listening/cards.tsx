// The Social Listening tab's frames: a section heading and a chart card with its analysis box inside it (the approved
// mockup's layout, spec docs/superpowers/specs/2026-11-19-social-listening-tab-design.md section 9). Server-safe.
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { pointsText } from '@/lib/organic-social/social-listening/format'

export function SlSection({ title, line, children }: { title: string; line?: string | null; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-lg font-extrabold text-white">{title}</h2>
        {line && <p className="text-xs text-text-muted">{line}</p>}
      </div>
      {children}
    </section>
  )
}

/** A chart card. `box` is the card's analysis box, rendered inside the card under the chart, so the text sits with the
 *  chart it describes (the team's call on 2026-11-19). One unbreakable block in the PDF export. */
export function SlCard({ title, meta, note, box, children, className }: {
  title: string; meta?: string | null; note?: string | null; box?: ReactNode; children: ReactNode; className?: string
}) {
  return (
    <div data-export-block="" className={cn('rounded-lg border border-white/[0.06] bg-bg-surface px-6 py-5', className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-bold text-white">{title}</h3>
        {meta && <span className="text-xs text-text-muted">{meta}</span>}
      </div>
      <div className="mt-3">{children}</div>
      {note && <p className="mt-3 text-xs text-text-muted">{note}</p>}
      {box && <div className="mt-4">{box}</div>}
    </div>
  )
}

/** A percentage points change ("+1.2 pts vs September 2026 report"), or "n/a" with no previous month. Up is good for
 *  positive, bad for negative, and neutral has no direction. KpiCard always appends %, so points get their own line. */
export function PointsDelta({ value, label, kind }: { value: number | null; label: string; kind: 'pos' | 'neu' | 'neg' }) {
  if (value === null) return <p className="text-xs text-text-muted">n/a {label}</p>
  const good = kind === 'neu' || value === 0 ? null : kind === 'pos' ? value > 0 : value < 0
  return (
    <p className={cn('text-xs font-semibold', good === null ? 'text-text-muted' : good ? 'text-[#60FF80]' : 'text-[#FF4444]')}>
      {pointsText(value)} <span className="font-normal text-text-muted">{label}</span>
    </p>
  )
}

/** A staff-only one-line note (never rendered in the client view). */
export function StaffNote({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-[#FFFC60]/30 bg-[#FFFC60]/[0.06] px-3 py-2 text-xs text-[#FFFC60]">{children}</p>
}
