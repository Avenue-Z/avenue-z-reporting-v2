import { ga4Totals, ga4Query } from '@/lib/ga4/client'
import { getHubSpotSummary } from '@/lib/hubspot/client'
import { KpiCard } from '@/components/charts/kpi-card'
import { AreaChart } from '@/components/charts/area-chart'
import { CHART_COLORS } from '@/lib/constants'

interface ExecSummaryProps {
  clientSlug: string
  dateRange?: string
}

// Fallback demo data shown when env vars are not yet configured
const DEMO_KPIS = [
  { title: 'Sessions',      value: '89,234',  delta: 15.4 },
  { title: 'Users',         value: '62,108',  delta: 11.2 },
  { title: 'New Users',     value: '34,872',  delta: 9.8  },
  { title: 'Conversions',   value: '1,847',   delta: 22.6 },
  { title: 'Contacts',      value: '1,284',   delta: 14.8 },
  { title: 'Deals Created', value: '64',      delta: 12.5 },
  { title: 'Deals Won',     value: '28',      delta: 16.7 },
  { title: 'Revenue',       value: '184,200', delta: 24.3, prefix: '$' },
]

const DEMO_TREND = Array.from({ length: 30 }, (_, i) => ({
  date: `Day ${i + 1}`,
  sessions: Math.floor(2000 + Math.random() * 1500 + i * 30),
  conversions: Math.floor(40 + Math.random() * 30 + i * 2),
}))

export async function ExecSummary({ clientSlug, dateRange }: ExecSummaryProps) {
  // Fetch GA4 and HubSpot data concurrently; gracefully fall back to demo if not configured
  let kpis = DEMO_KPIS
  let trend = DEMO_TREND
  let isDemo = true

  try {
    const [ga4TotalsRow, ga4TrendRows, hubspotData] = await Promise.all([
      ga4Totals(clientSlug, ['sessions', 'totalUsers', 'newUsers', 'conversions'], dateRange ?? 'last_30_days'),
      ga4Query({
        clientSlug,
        metrics: ['sessions', 'conversions'],
        dimensions: ['date'],
        dateRange: dateRange ?? 'last_30_days',
      }),
      getHubSpotSummary(clientSlug).catch(() => null),
    ])

    const fmt = (n: number | null | undefined) =>
      n != null ? Math.round(n).toLocaleString() : '—'

    kpis = [
      { title: 'Sessions',    value: fmt(ga4TotalsRow.sessions as number),    delta: 0 },
      { title: 'Users',       value: fmt(ga4TotalsRow.totalUsers as number),  delta: 0 },
      { title: 'New Users',   value: fmt(ga4TotalsRow.newUsers as number),    delta: 0 },
      { title: 'Conversions', value: fmt(ga4TotalsRow.conversions as number), delta: 0 },
      {
        title: 'Contacts',
        value: hubspotData ? fmt(hubspotData.totalContacts) : '—',
        delta: 0,
      },
      {
        title: 'Deals',
        value: hubspotData ? fmt(hubspotData.totalDeals) : '—',
        delta: 0,
      },
    ]

    trend = ga4TrendRows.rows
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .map((row) => ({
        date: String(row.date ?? ''),
        sessions: Number(row.sessions ?? 0),
        conversions: Number(row.conversions ?? 0),
      }))

    isDemo = false
  } catch {
    // env vars not set yet — show demo data
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-bold uppercase tracking-widest text-text-muted">
          Performance Overview
        </p>
        <h2 className="text-3xl font-extrabold uppercase text-white">
          Executive{' '}
          <span className="gradient-text-full">Summary</span>
        </h2>
      </div>

      <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <KpiCard
            key={kpi.title}
            title={kpi.title}
            value={kpi.value}
            delta={kpi.delta}
            prefix={'prefix' in kpi ? kpi.prefix : undefined}
          />
        ))}
      </div>

      <div>
        <h3 className="mb-4 text-lg font-bold text-white">
          Sessions &amp; Conversions Trend
        </h3>
        <AreaChart
          data={trend}
          xKey="date"
          yKeys={[
            { key: 'sessions',    color: CHART_COLORS.ga4,      label: 'Sessions'    },
            { key: 'conversions', color: CHART_COLORS.positive, label: 'Conversions' },
          ]}
          height={320}
        />
      </div>

      {isDemo && (
        <p className="text-xs text-text-muted">
          Demo data — add{' '}
          <code className="text-white">GA4_PROPERTY_ID_*</code> and{' '}
          <code className="text-white">GOOGLE_SERVICE_ACCOUNT_KEY</code> env vars
          to see real metrics.
        </p>
      )}
    </div>
  )
}
