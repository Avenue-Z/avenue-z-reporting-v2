// The YTD Review's design kit part version (plan docs/superpowers/plans/2026-11-23-os-design-phase1.md, Task 6):
// ytd-review@5 (from @2, the team's sheet). Each graph sits in a kit card; a line (two or more months) is the shared
// LineChart, shaded and frameless; a one-month year is the kit's count columns in place of the bar chart.
//
// @2 (ytd-review-sheet.tsx) and @1 (ytd-review.tsx), which @2 falls back to when a year has no sheet, build their cards
// with plain functions, so the tree they return holds the ChartCard, LineChart and BarChart elements themselves. So @5
// awaits the real @2 section and redraws only those three in that tree (kitYtd). The client read, the sheet read, the
// Dash months, the notes, the gap lines, the logs and the fallback cards are the old code, not a copy of it. Unpublished:
// pinned per client, never promoted into the shared template or frozen into a snapshot.
import { Fragment, Suspense, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import type { PartImpl } from '@/lib/report-sections/types'
import { ChartCard } from '@/components/charts/chart-card'
import { LineChart } from '@/components/charts/line-chart'
import { BarChart } from '@/components/charts/bar-chart'
import type { OrganicSocialCtx } from '../ctx'
import { CountColumns } from '../design/charts'
import { SlCard } from '../design/frames'
import kit from '../design/kit.module.css'
import { YtdReviewSection } from './ytd-review'
import { ytdReviewV2 } from './ytd-review-sheet'

type El = ReactElement<Record<string, unknown>>
type Section = (props: never) => Promise<ReactNode>

/** One element of a returned YTD tree in kit form. Only host elements and fragments are walked into; any other
 *  component (the notes panel, a fallback card) is left exactly as it is. */
function kitYtd(node: ReactNode): ReactNode {
  if (Array.isArray(node)) return node.map(kitYtd)
  if (!isValidElement(node)) return node
  const el = node as El
  const p = el.props
  const key = el.key ?? undefined
  if (el.type === ChartCard) return <SlCard key={key} title={String(p.title)}>{kitYtd(p.children as ReactNode)}</SlCard>
  if (el.type === LineChart) return cloneElement(el, { shaded: true, frameless: true })
  if (el.type === BarChart) {
    const { data, xKey, yKeys } = p as { data: Record<string, unknown>[]; xKey: string; yKeys: { key: string; label?: string }[] }
    // The YTD bars are always one series; anything else is left as the old chart rather than guessed at.
    if (yKeys.length !== 1) return el
    const y = yKeys[0]
    return <CountColumns key={key} aria={`${y.label ?? y.key} by month`}
      points={data.map((d) => ({ label: String(d[xKey]), value: d[y.key] == null ? null : Number(d[y.key]) }))} />
  }
  if (el.type === YtdReviewSection) return <KitYtdV1Section key={key} {...(p as { ctx: OrganicSocialCtx })} />
  if (typeof el.type === 'string' || el.type === Fragment) {
    const kids = p.children as ReactNode
    if (kids === undefined) return el
    return Array.isArray(kids) ? cloneElement(el, undefined, ...kids.map(kitYtd)) : cloneElement(el, undefined, kitYtd(kids))
  }
  return el
}

/** A YTD section's answer in kit form: the block inside the kit's colours. A fallback card, the empty card or nothing
 *  passes through as it is; @2's fallback to @1 becomes @1's kit form. */
function kitYtdBlock(node: ReactNode): ReactNode {
  if (isValidElement(node) && node.type === 'section') return <div className={kit.root}>{kitYtd(node)}</div>
  return kitYtd(node)
}

/** @1's section (the no-sheet fallback) in kit form. */
async function KitYtdV1Section(props: { ctx: OrganicSocialCtx }) {
  return kitYtdBlock(await YtdReviewSection(props))
}

const kitSections = new Map<Section, Section>()
/** The kit form of a section, made once per section and kept, so a re-render never remounts the block. */
function kitSectionFor(section: Section): Section {
  let kitted = kitSections.get(section)
  if (!kitted) {
    kitted = async (props: never) => kitYtdBlock(await section(props))
    kitSections.set(section, kitted)
  }
  return kitted
}

/** @2's rendered element, `<Suspense fallback><Section ctx/></Suspense>`, with its section in kit form; the fallback and
 *  the props are kept exactly. */
function withKitSection(node: ReactNode): ReactNode {
  if (!isValidElement(node) || node.type !== Suspense) return node
  const { fallback, children } = node.props as { fallback: ReactNode; children: ReactNode }
  if (!isValidElement(children) || typeof children.type !== 'function') return node
  const Kit = kitSectionFor(children.type as Section) as unknown as (p: object) => ReactNode
  return <Suspense fallback={fallback}><Kit {...(children.props as object)} /></Suspense>
}

/** The YTD Review from the team's sheet (with @1 as its no-sheet fallback), on the design kit. */
export const ytdReviewV5: PartImpl<OrganicSocialCtx> = {
  id: ytdReviewV2.id,
  version: 5,
  published: false,
  defaultLabel: ytdReviewV2.defaultLabel,
  // @2's render takes ctx only (it reads no resolved part), so it passes straight through.
  render: (ctx, resolved) => withKitSection(ytdReviewV2.render(ctx, resolved)),
}
