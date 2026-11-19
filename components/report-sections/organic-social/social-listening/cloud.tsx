// The keyword theme cloud: each theme sized by its share of results. On brand the colour is the theme's sentiment
// (colors.ts brandThemeColor); on industry it is decoration (the export's own palette). Server-safe.
import { SENTIMENT_COLORS } from '@/lib/organic-social/social-listening/colors'

const MIN_PX = 12
const MAX_PX = 34

export function KeywordCloud({ themes, kind }: { themes: { theme: string; share: number; color: string }[]; kind: 'sentiment' | 'decoration' }) {
  if (themes.length === 0) return <p className="text-sm text-text-muted">No themes in this export.</p>
  const shares = themes.map((t) => t.share)
  const lo = Math.min(...shares)
  const hi = Math.max(...shares)
  const size = (s: number) => (hi === lo ? (MIN_PX + MAX_PX) / 2 : MIN_PX + ((s - lo) / (hi - lo)) * (MAX_PX - MIN_PX))
  return (
    <div>
      <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2" aria-label="Keyword themes">
        {themes.map((t) => (
          <li key={t.theme} className="font-bold leading-tight" style={{ color: t.color, fontSize: `${Math.round(size(t.share))}px` }}
            title={`${t.theme}: ${(t.share * 100).toFixed(1)}% of results`}>
            {t.theme}
          </li>
        ))}
      </ul>
      {kind === 'sentiment' ? (
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-text-muted">
          {([['pos', 'Mostly positive'], ['neu', 'Mostly neutral'], ['neg', 'Mostly negative']] as const).map(([k, l]) => (
            <span key={k} className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: SENTIMENT_COLORS[k] }} />{l}</span>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-xs text-text-muted">Colour is decoration on the industry cloud. It does not mean sentiment.</p>
      )}
    </div>
  )
}
