import { DataTable } from '@/components/charts/data-table'
import { num } from '@/lib/supermetrics/format'
import { NoData } from './no-data'
import type { OwnedRetrieval } from '@/lib/organic-social/ai-retrievals'

const columns = [
  { key: 'title', label: 'Content' },
  { key: 'retrievals', label: 'Retrievals', align: 'right' as const, sortable: true, sortKey: 'retrievalsRaw', sortType: 'number' as const },
  { key: 'engines', label: 'AI Engines' },
]

function EngineChips({ engines }: { engines: string[] }) {
  if (engines.length === 0) return <span className="text-text-muted">—</span>
  return (
    <div className="flex flex-wrap gap-1">
      {engines.map((e) => (
        <span key={e} className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold text-white/80">
          {e}
        </span>
      ))}
    </div>
  )
}

function toRows(items: OwnedRetrieval[]) {
  return items.map((item) => ({
    title: (
      <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-brand-cyan hover:underline">
        {item.title ?? item.url}
      </a>
    ),
    retrievals: num(item.retrievals),
    retrievalsRaw: item.retrievals,
    engines: <EngineChips engines={item.engines} />,
  }))
}

/** Surface B: ranked table of the client's OWN LinkedIn content that AI engines have retrieved,
 *  most-retrieved first. Mirrors top-content.tsx's DataTable-based ranked view (title link,
 *  formatted counts, sortable). */
export function TopAiRetrievedList({ items }: { items: OwnedRetrieval[] }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-extrabold uppercase tracking-widest text-text-muted">Top AI-Retrieved Content</h2>
      {items.length === 0 ? (
        <NoData message="No AI-retrieved owned content in this period yet." />
      ) : (
        <DataTable columns={columns} rows={toRows(items)} defaultSort={{ key: 'retrievals', dir: 'desc' }} />
      )}
    </section>
  )
}
