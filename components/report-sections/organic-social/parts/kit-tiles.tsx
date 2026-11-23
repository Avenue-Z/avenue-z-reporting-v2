// The Organic Social tiles drawn with the design kit (plan docs/superpowers/plans/2026-11-23-os-design-phase1.md, Tasks 2
// and 5). Each component is the twin of today's, with the same markup around it, KpiTile in place of KpiCard
// (design/charts.tsx; it reads exactly as KpiCard, kpi-tile.test.tsx), and the kit's colours on its outer element.
// `asKit` is how the kit part versions reuse today's sections whole: each section is awaited as it is and only the drawing
// element it returns is swapped, so the requests, the logs, the sheet read and the fallback cards are today's code, not a
// copy of it. Server-safe.
import { isValidElement, type ComponentProps, type ReactNode } from 'react'
import { num } from '@/lib/organic-social/base'
import { pctCompact } from '@/lib/organic-social/format'
import { expectsComparison } from '@/lib/organic-social/metrics'
import { metricDefinition, sharedTileDefinition } from '@/lib/organic-social/metric-definitions'
import type { PlatformHeadline } from '@/lib/organic-social/types'
import type { OutlineHeadline, OutlineKpi } from '@/lib/organic-social/outline-headlines'
import { KpiTile } from '../design/charts'
import kit from '../design/kit.module.css'
import { NoData } from '../no-data'
import { PlatformHeadlines, gridColsBase, gridColsMd } from '../platform-headlines'
import { OutlineHeadlines, OutlineTiles } from '../outline-tiles'
import s from './kit-tiles.module.css'

/** A blank value that keeps the tile's height, as outline-tiles.tsx's BLANK. */
const BLANK = '\u00A0'

/** platform-headlines.tsx `PlatformSection`, with the kit's tiles. */
function KitPlatformSection({ h, wholeDelta }: { h: PlatformHeadline; wholeDelta?: boolean }) {
  const n = h.kpis.length
  return (
    // One platform's label and tiles never split across pages in the PDF export, as before.
    <section data-export-block="" className="space-y-3">
      <h3 className={s.label}>{h.label}</h3>
      {h.noData ? (
        <NoData />
      ) : (
        <div className={`grid ${gridColsBase(n)} gap-3 ${gridColsMd(n)}`}>
          {h.kpis.map((k) => (
            <KpiTile
              key={k.key}
              title={k.label}
              tooltip={sharedTileDefinition(h.channel, k.key)}
              value={k.format === 'percent' ? pctCompact(k.value) : num(k.value)}
              delta={k.delta}
              comparisonExpected={expectsComparison(k.key)}
              subValue={k.footnote}
              wholeDelta={wholeDelta}
            />
          ))}
        </div>
      )}
    </section>
  )
}

/** platform-headlines.tsx `PlatformHeadlines`, with the kit's tiles. */
export function KitPlatformHeadlines({ headlines, wholeDelta }: ComponentProps<typeof PlatformHeadlines>) {
  return (
    <div className={`${kit.root} space-y-6`}>
      {headlines.map((h) => (
        <KitPlatformSection key={h.channel} h={h} wholeDelta={wholeDelta} />
      ))}
    </div>
  )
}

/** outline-tiles.tsx `OutlineTiles`, with the kit's tiles: a flagged row is a blank tile with its flag and no change. */
export function KitOutlineTiles({ kpis, channel }: { kpis: OutlineKpi[]; channel: string }) {
  const n = kpis.length
  return (
    <div className={`${kit.root} grid ${gridColsBase(n)} gap-3 ${gridColsMd(n)}`}>
      {kpis.map((k) => k.value === null ? (
        <KpiTile key={k.key} title={k.label} value={BLANK} subValue={k.unavailable} tooltip={metricDefinition(channel, k.key)} />
      ) : (
        <KpiTile
          key={k.key}
          title={k.label}
          tooltip={metricDefinition(channel, k.key)}
          value={k.format === 'percent' ? pctCompact(k.value) : num(k.value)}
          delta={k.delta}
          wholeDelta
          comparisonExpected={expectsComparison(k.key)}
          subValue={k.footnote}
        />
      ))}
    </div>
  )
}

/** outline-tiles.tsx `OutlineHeadlines` (the outline's Data block), with the kit's tiles. */
export function KitOutlineHeadlines({ headline }: { headline: OutlineHeadline }) {
  return (
    <div className={`${kit.root} space-y-6`}>
      <section data-export-block="" className="space-y-3">
        <h3 className={s.label}>Data</h3>
        {headline.noData ? <NoData /> : <KitOutlineTiles kpis={headline.kpis} channel={headline.channel} />}
      </section>
    </div>
  )
}

/** Swaps the drawing element a tiles section returned for its kit twin, and passes everything else through untouched:
 *  a fallback card, the no-data card, or nothing. Matched by component, so a section that one day returned something
 *  else would show it as it is, and the kit part tests (which look for the kit's classes) would fail. */
export function asKit(node: ReactNode): ReactNode {
  if (!isValidElement(node)) return node
  if (node.type === PlatformHeadlines) return <KitPlatformHeadlines {...(node.props as ComponentProps<typeof PlatformHeadlines>)} />
  if (node.type === OutlineHeadlines) return <KitOutlineHeadlines {...(node.props as ComponentProps<typeof OutlineHeadlines>)} />
  if (node.type === OutlineTiles) return <KitOutlineTiles {...(node.props as ComponentProps<typeof OutlineTiles>)} />
  return node
}
