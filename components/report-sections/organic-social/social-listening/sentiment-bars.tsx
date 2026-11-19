// Sentiment by media type (stacked bars) and share of media types (bars with the change). Plain HTML and CSS widths, so
// they render the same on the page and in the PDF. Server-safe.
import { SENTIMENT_COLORS } from '@/lib/organic-social/social-listening/colors'
import { changeText, num, pctText } from '@/lib/organic-social/social-listening/format'
import { roundDelta } from '@/lib/delta-rounding'
import type { SlCrossRow, SlMediaRow } from '@/lib/organic-social/social-listening/view-model'

export function SentimentKey({ labels = ['Positive', 'Neutral', 'Negative'] }: { labels?: [string, string, string] | string[] }) {
  const colors = [SENTIMENT_COLORS.pos, SENTIMENT_COLORS.neu, SENTIMENT_COLORS.neg]
  return (
    <div className="mt-3 flex flex-wrap gap-4 text-xs text-text-muted">
      {labels.map((l, i) => (
        <span key={l} className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: colors[i] }} />{l}</span>
      ))}
    </div>
  )
}

export function SentimentBars({ rows }: { rows: SlCrossRow[] }) {
  return (
    <div>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.media} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-sm">
            <span className="truncate text-white" title={r.media}>{r.media}</span>
            <span className="flex h-3 overflow-hidden rounded-sm bg-white/[0.04]" role="img"
              aria-label={`${r.media}: ${num(r.pos)} positive, ${num(r.neu)} neutral, ${num(r.neg)} negative`}>
              {r.total > 0 && (['pos', 'neu', 'neg'] as const).map((k) => (
                <i key={k} style={{ width: `${(100 * r[k]) / r.total}%`, background: SENTIMENT_COLORS[k] }} />
              ))}
            </span>
            <span className="tabular-nums text-xs text-text-muted">{num(r.total)}</span>
          </li>
        ))}
      </ul>
      <SentimentKey />
    </div>
  )
}

export function MediaShare({ rows }: { rows: SlMediaRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count))
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-text-muted">
            <th className="py-1 font-semibold">Media type</th><th className="w-1/2 font-semibold"><span className="sr-only">Share</span></th>
            <th className="text-right font-semibold">%</th><th className="text-right font-semibold">Change</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.media} className="border-t border-white/[0.04]">
              <td className="py-1.5 text-white">{r.media} <span className="text-xs text-text-muted">{num(r.count)}</span></td>
              <td><span className="block h-2.5 rounded-sm" style={{ width: `${(100 * r.count) / max}%`, background: r.color }} /></td>
              <td className="text-right tabular-nums text-white">{pctText(r.pct)}</td>
              <td className="text-right tabular-nums">{r.change === null ? <span className="text-text-muted">n/a</span> : <span className="text-white">{changeText(r.change, roundDelta)}</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
