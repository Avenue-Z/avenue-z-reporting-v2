import type { PartImpl } from '@/lib/report-sections/types'
import type { PeecCtx } from '../ctx'
import { KPI_CATALOG, effectiveKpis, unavailableReason } from '../v2/kpi-catalog'
import { computeKpiTile, type KpiTileModel } from '../v2/kpi-values'
import { KpiTile } from '../v2/kpi-tile'
import { KpiEditor } from '../v2/kpi-editor'
import { AEO_KPI_IDS } from '@/lib/report-sections/aeo-kpis'

// Static so Tailwind sees every class; index = tile count, so fewer tiles stretch.
const LG_COLS = ['', 'lg:grid-cols-1', 'lg:grid-cols-2', 'lg:grid-cols-3', 'lg:grid-cols-4', 'lg:grid-cols-5']

function tilesFor(ctx: PeecCtx): KpiTileModel[] {
  const availability = { ga4Connected: ctx.kpi.ga4Connected, provider: ctx.provider }
  const tiles = effectiveKpis(ctx.kpi.saved, availability).map((id) => computeKpiTile(id, ctx))
  return ctx.audience === 'client' ? tiles.filter((t) => t.state === 'ok') : tiles
}

/** True when a client would see no tile, so the whole section (and its nav entry) is dropped. */
export function kpiStripHidden(ctx: PeecCtx): boolean {
  return ctx.audience === 'client' && tilesFor(ctx).length === 0
}

export const kpiCardsV2: PartImpl<PeecCtx> = {
  id: 'kpi-cards',
  version: 2,
  published: true,
  defaultLabel: 'Snapshot KPIs',
  render: (ctx) => {
    const tiles = tilesFor(ctx)
    const staff = ctx.audience === 'internal'
    const availability = { ga4Connected: ctx.kpi.ga4Connected, provider: ctx.provider }
    const options = AEO_KPI_IDS.map((id) => ({
      id,
      label: KPI_CATALOG[id].label,
      group: KPI_CATALOG[id].source === 'ga4' ? 'GA4' : ctx.provider === 'profound' ? 'Profound' : 'Peec',
      disabledReason: unavailableReason(id, availability),
    }))
    return (
      <div>
        {staff && ctx.clientSlug !== undefined && (
          <KpiEditor clientSlug={ctx.clientSlug} selected={tiles.map((t) => t.id)} options={options} />
        )}
        {tiles.length === 0 ? (
          staff && <p className="text-sm text-text-muted">No KPIs selected. Use Edit KPIs to choose up to five.</p>
        ) : (
          <div className={`grid grid-cols-1 gap-5 ${tiles.length >= 2 ? 'sm:grid-cols-2' : ''} ${LG_COLS[tiles.length]}`}>
            {tiles.map((t) => (
              <KpiTile key={t.id} tile={t} showDeltas={ctx.showDeltas} compare={ctx.compare} />
            ))}
          </div>
        )}
      </div>
    )
  },
}
