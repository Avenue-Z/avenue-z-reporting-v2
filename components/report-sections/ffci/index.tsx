import { CHART_COLORS } from '@/lib/constants'
import { FFCITimeline } from './timeline-chart'
import { FFCIFunnel } from './funnel'

interface FFCIProps {
  clientSlug: string
  dateRange?: string
}

// --- Types ---

interface PRHit {
  id: string
  date: string
  outlet: string
  headline: string
  url: string
  tier: 'Tier 1' | 'Tier 2' | 'Tier 3'
  domainAuthority: number
  estimatedReach: string
}

interface PRImpact {
  prId: string
  outlet: string
  headline: string
  tier: 'Tier 1' | 'Tier 2' | 'Tier 3'
  brandedSearchLift: string
  sessionLift: string
  revenueLift: string
  correlationScore: number
  attributedRevenue: string
}

interface FFCIData {
  prHits: PRHit[]
  prImpact: PRImpact[]
  funnel: { stage: string; value: number; label: string }[]
  kpis: { label: string; value: string; sublabel: string }[]
  aiAnalysis: string[]
  timelineConfig: { baseSessions: number; baseSearches: number; baseRevenue: number; spikes: { start: number; end: number; sessions: number; searches: number; revenue: number }[] }
}

// --- Per-Client Demo Data ---

function getClientData(clientSlug: string): FFCIData {
  if (clientSlug === 'kind-patches') {
    return {
      prHits: [
        { id: 'pr-1', date: 'Feb 5', outlet: 'Well+Good', headline: 'The Best Vitamin Patches That Actually Work, According to Experts', url: '#', tier: 'Tier 1', domainAuthority: 89, estimatedReach: '6.2M' },
        { id: 'pr-2', date: 'Feb 12', outlet: 'Forbes Health', headline: 'Transdermal Patches Are the Next Big Thing in Wellness', url: '#', tier: 'Tier 1', domainAuthority: 94, estimatedReach: '14.8M' },
        { id: 'pr-3', date: 'Feb 19', outlet: 'mindbodygreen', headline: 'No Pills, No Sugar: Why Wellness Patches Are Having a Moment', url: '#', tier: 'Tier 1', domainAuthority: 82, estimatedReach: '4.1M' },
        { id: 'pr-4', date: 'Feb 26', outlet: 'PopSugar', headline: 'This Patch Brand Went Viral on TikTok \u2014 Here\u2019s Why', url: '#', tier: 'Tier 2', domainAuthority: 78, estimatedReach: '3.4M' },
        { id: 'pr-5', date: 'Mar 4', outlet: 'Healthline', headline: 'Transdermal Nutrient Delivery: What the Science Says', url: '#', tier: 'Tier 1', domainAuthority: 91, estimatedReach: '9.7M' },
        { id: 'pr-6', date: 'Mar 8', outlet: 'BuzzFeed Shopping', headline: '23 Wellness Products That TikTok Made Me Buy (And Actually Love)', url: '#', tier: 'Tier 2', domainAuthority: 85, estimatedReach: '5.6M' },
      ],
      prImpact: [
        { prId: 'pr-2', outlet: 'Forbes Health', headline: 'Transdermal Patches Are the Next Big Thing in Wellness', tier: 'Tier 1', brandedSearchLift: '+187%', sessionLift: '+82%', revenueLift: '+$24,600', correlationScore: 0.96, attributedRevenue: '$24,600' },
        { prId: 'pr-5', outlet: 'Healthline', headline: 'Transdermal Nutrient Delivery: What the Science Says', tier: 'Tier 1', brandedSearchLift: '+124%', sessionLift: '+61%', revenueLift: '+$18,400', correlationScore: 0.93, attributedRevenue: '$18,400' },
        { prId: 'pr-1', outlet: 'Well+Good', headline: 'The Best Vitamin Patches That Actually Work, According to Experts', tier: 'Tier 1', brandedSearchLift: '+96%', sessionLift: '+48%', revenueLift: '+$12,800', correlationScore: 0.89, attributedRevenue: '$12,800' },
        { prId: 'pr-3', outlet: 'mindbodygreen', headline: 'No Pills, No Sugar: Why Wellness Patches Are Having a Moment', tier: 'Tier 1', brandedSearchLift: '+72%', sessionLift: '+34%', revenueLift: '+$9,200', correlationScore: 0.84, attributedRevenue: '$9,200' },
        { prId: 'pr-4', outlet: 'PopSugar', headline: 'This Patch Brand Went Viral on TikTok', tier: 'Tier 2', brandedSearchLift: '+58%', sessionLift: '+28%', revenueLift: '+$7,100', correlationScore: 0.79, attributedRevenue: '$7,100' },
        { prId: 'pr-6', outlet: 'BuzzFeed Shopping', headline: '23 Wellness Products That TikTok Made Me Buy', tier: 'Tier 2', brandedSearchLift: '+41%', sessionLift: '+19%', revenueLift: '+$4,800', correlationScore: 0.71, attributedRevenue: '$4,800' },
      ],
      funnel: [
        { stage: 'PR Impressions', value: 43800000, label: '43.8M' },
        { stage: 'Branded Searches', value: 28400, label: '28,400' },
        { stage: 'Website Sessions', value: 18200, label: '18,200' },
        { stage: 'Add to Cart', value: 2840, label: '2,840' },
        { stage: 'Orders', value: 1420, label: '1,420' },
        { stage: 'Revenue', value: 76900, label: '$76,900' },
      ],
      kpis: [
        { label: 'PR Placements', value: '6', sublabel: 'this period' },
        { label: 'Est. Media Reach', value: '43.8M', sublabel: 'total impressions' },
        { label: 'PR-Attributed Revenue', value: '$76,900', sublabel: 'tracked to placements' },
        { label: 'Avg Correlation Score', value: '0.85', sublabel: 'PR \u2192 traffic signal' },
      ],
      aiAnalysis: [
        'The <strong class="text-white">Forbes Health</strong> feature was the standout performer, driving a <strong class="text-white">187%</strong> spike in branded searches for "kind patches" and "vitamin patches" within 48 hours. This single placement correlated with <strong class="text-white">$24,600</strong> in tracked revenue \u2014 the highest attribution score (0.96) across all placements this period.',
        'Health-authority outlets (<strong class="text-white">Forbes Health</strong>, <strong class="text-white">Healthline</strong>, <strong class="text-white">Well+Good</strong>) consistently outperform lifestyle outlets on downstream conversions. The average Tier 1 correlation score is <strong class="text-white">0.91</strong> vs. <strong class="text-white">0.75</strong> for Tier 2. The "science-backed" angle resonates strongly with the Kind Patches buyer persona \u2014 recommend leaning into clinical evidence and expert validation in PR pitches. The <strong class="text-white">PopSugar</strong> TikTok virality piece punched above its tier, suggesting social proof content crosses over well from earned to owned channels.',
      ],
      timelineConfig: {
        baseSessions: 1200, baseSearches: 180, baseRevenue: 2100,
        spikes: [
          { start: 5, end: 9, sessions: 1400, searches: 240, revenue: 3200 },
          { start: 12, end: 17, sessions: 3200, searches: 520, revenue: 7400 },
          { start: 19, end: 23, sessions: 1600, searches: 210, revenue: 3600 },
          { start: 26, end: 28, sessions: 900, searches: 120, revenue: 1800 },
        ],
      },
    }
  }

  // Default: Fun Spot
  return {
    prHits: [
      { id: 'pr-1', date: 'Feb 3', outlet: 'Orlando Sentinel', headline: 'Fun Spot America Unveils New Thrill Ride for 2026 Season', url: '#', tier: 'Tier 1', domainAuthority: 87, estimatedReach: '2.4M' },
      { id: 'pr-2', date: 'Feb 10', outlet: 'Travel + Leisure', headline: 'The Best Theme Parks in Florida That Aren\u2019t Disney', url: '#', tier: 'Tier 1', domainAuthority: 92, estimatedReach: '8.1M' },
      { id: 'pr-3', date: 'Feb 18', outlet: 'Fox 35 Orlando', headline: 'Fun Spot Offers Free Admission for First Responders', url: '#', tier: 'Tier 2', domainAuthority: 74, estimatedReach: '1.1M' },
      { id: 'pr-4', date: 'Feb 24', outlet: 'Attractions Magazine', headline: 'Fun Spot America Parks See Record Spring Break Attendance', url: '#', tier: 'Tier 2', domainAuthority: 61, estimatedReach: '420K' },
      { id: 'pr-5', date: 'Mar 5', outlet: 'USA Today', headline: '10 Affordable Theme Park Alternatives for Families', url: '#', tier: 'Tier 1', domainAuthority: 94, estimatedReach: '12.3M' },
    ],
    prImpact: [
      { prId: 'pr-5', outlet: 'USA Today', headline: '10 Affordable Theme Park Alternatives for Families', tier: 'Tier 1', brandedSearchLift: '+142%', sessionLift: '+68%', revenueLift: '+$18,200', correlationScore: 0.94, attributedRevenue: '$18,200' },
      { prId: 'pr-2', outlet: 'Travel + Leisure', headline: 'The Best Theme Parks in Florida That Aren\u2019t Disney', tier: 'Tier 1', brandedSearchLift: '+89%', sessionLift: '+52%', revenueLift: '+$12,400', correlationScore: 0.91, attributedRevenue: '$12,400' },
      { prId: 'pr-1', outlet: 'Orlando Sentinel', headline: 'Fun Spot America Unveils New Thrill Ride for 2026 Season', tier: 'Tier 1', brandedSearchLift: '+61%', sessionLift: '+38%', revenueLift: '+$8,700', correlationScore: 0.87, attributedRevenue: '$8,700' },
      { prId: 'pr-3', outlet: 'Fox 35 Orlando', headline: 'Fun Spot Offers Free Admission for First Responders', tier: 'Tier 2', brandedSearchLift: '+34%', sessionLift: '+22%', revenueLift: '+$4,100', correlationScore: 0.78, attributedRevenue: '$4,100' },
      { prId: 'pr-4', outlet: 'Attractions Magazine', headline: 'Fun Spot America Parks See Record Spring Break Attendance', tier: 'Tier 2', brandedSearchLift: '+18%', sessionLift: '+12%', revenueLift: '+$2,100', correlationScore: 0.65, attributedRevenue: '$2,100' },
    ],
    funnel: [
      { stage: 'PR Impressions', value: 24320000, label: '24.3M' },
      { stage: 'Branded Searches', value: 12840, label: '12,840' },
      { stage: 'Website Sessions', value: 8420, label: '8,420' },
      { stage: 'Conversions', value: 634, label: '634' },
      { stage: 'Revenue', value: 45500, label: '$45,500' },
    ],
    kpis: [
      { label: 'PR Placements', value: '5', sublabel: 'this period' },
      { label: 'Est. Media Reach', value: '24.3M', sublabel: 'total impressions' },
      { label: 'PR-Attributed Revenue', value: '$45,500', sublabel: 'tracked to placements' },
      { label: 'Avg Correlation Score', value: '0.83', sublabel: 'PR \u2192 traffic signal' },
    ],
    aiAnalysis: [
      'The <strong class="text-white">USA Today</strong> and <strong class="text-white">Travel + Leisure</strong> placements drove the highest measurable impact, with a combined <strong class="text-white">$30,600</strong> in attributed revenue. Branded search volume spiked <strong class="text-white">142%</strong> within 48 hours of the USA Today feature, correlating strongly (0.94) with a sustained traffic lift over the following 5 days.',
      'Tier 1 outlets consistently outperform Tier 2 on downstream metrics \u2014 the average correlation score for Tier 1 placements is <strong class="text-white">0.91</strong> vs. <strong class="text-white">0.72</strong> for Tier 2. Recommend prioritizing national travel and lifestyle publications for maximum revenue impact. The <strong class="text-white">Fox 35 Orlando</strong> local placement punched above its weight with a 0.78 score, suggesting local broadcast still drives meaningful action for a regional attraction.',
    ],
    timelineConfig: {
      baseSessions: 1800, baseSearches: 220, baseRevenue: 3200,
      spikes: [
        { start: 3, end: 7, sessions: 1200, searches: 180, revenue: 2400 },
        { start: 10, end: 15, sessions: 2800, searches: 420, revenue: 5600 },
        { start: 18, end: 22, sessions: 800, searches: 95, revenue: 1600 },
        { start: 24, end: 27, sessions: 500, searches: 60, revenue: 900 },
      ],
    },
  }
}

function buildTimeline(config: FFCIData['timelineConfig'], prHitDays: number[]) {
  return Array.from({ length: 30 }, (_, i) => {
    const day = i + 1
    const label = day <= 28 ? `Feb ${day}` : `Mar ${day - 28}`
    let sessions = Math.floor(config.baseSessions + Math.random() * 400 + i * 15)
    let brandedSearches = Math.floor(config.baseSearches + Math.random() * 60 + i * 3)
    const revenue = Math.floor(config.baseRevenue + Math.random() * 800 + i * 40)
    for (const spike of config.spikes) {
      if (day >= spike.start && day <= spike.end) {
        sessions += spike.sessions
        brandedSearches += spike.searches
      }
    }
    return { date: label, sessions, brandedSearches, revenue, prHit: prHitDays.includes(day) }
  })
}

const tierColor = {
  'Tier 1': CHART_COLORS.positive,
  'Tier 2': CHART_COLORS.primary,
  'Tier 3': CHART_COLORS.neutral,
}

function correlationColor(score: number) {
  if (score >= 0.85) return CHART_COLORS.positive
  if (score >= 0.7) return CHART_COLORS.email
  return CHART_COLORS.neutral
}

export async function FFCIReport({ clientSlug, dateRange }: FFCIProps) {
  const data = getClientData(clientSlug)
  const prHitDays = clientSlug === 'kind-patches' ? [5, 12, 19, 26] : [3, 10, 18, 24]
  const timelineData = buildTimeline(data.timelineConfig, prHitDays)

  return (
    <div className="mx-auto max-w-4xl space-y-10">
      {/* Hero */}
      <div className="space-y-4">
        <p className="text-sm font-bold uppercase tracking-widest text-text-muted">
          Full Funnel Conversion Intelligence
        </p>
        <h2 className="text-4xl font-extrabold leading-tight text-white">
          Connecting <span className="gradient-text-revenue">PR</span> to{' '}
          <span className="gradient-text-full">Revenue</span>
        </h2>
        <p className="text-lg leading-relaxed text-white/70">
          This report tracks the downstream impact of earned media placements on branded search,
          website traffic, and revenue. Each PR hit is scored by its correlation to measurable
          business outcomes.
        </p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {data.kpis.map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-xl border border-white/[0.06] bg-bg-surface p-5"
          >
            <p className="text-xs font-bold uppercase tracking-widest text-text-muted">
              {kpi.label}
            </p>
            <p className="mt-1 text-2xl font-extrabold text-white">{kpi.value}</p>
            <p className="mt-0.5 text-xs text-white/40">{kpi.sublabel}</p>
          </div>
        ))}
      </div>

      <div className="h-px bg-white/[0.06]" />

      {/* PR Impact Timeline */}
      <div className="space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-widest text-text-muted">
          PR Impact Timeline
        </h3>
        <p className="text-sm text-white/50">
          Daily sessions and branded searches with PR placement markers. Notice the traffic
          spikes following each media hit.
        </p>
        <FFCITimeline data={timelineData} prHits={data.prHits} />
      </div>

      <div className="h-px bg-white/[0.06]" />

      {/* Full Funnel Flow */}
      <div className="space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-widest text-text-muted">
          PR-to-Revenue Funnel
        </h3>
        <p className="text-sm text-white/50">
          How earned media impressions flow through the conversion funnel to tracked revenue.
        </p>
        <FFCIFunnel stages={data.funnel} />
      </div>

      <div className="h-px bg-white/[0.06]" />

      {/* PR Placements this period */}
      <div className="space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-widest text-text-muted">
          Media Placements
        </h3>
        <div className="space-y-3">
          {data.prHits.map((pr) => (
            <div
              key={pr.id}
              className="flex items-start gap-4 rounded-xl border border-white/[0.06] bg-bg-surface p-5"
            >
              <div className="flex-1">
                <div className="mb-1 flex items-center gap-2">
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                    style={{
                      background: `${tierColor[pr.tier]}20`,
                      color: tierColor[pr.tier],
                    }}
                  >
                    {pr.tier}
                  </span>
                  <span className="text-xs text-white/40">{pr.date}</span>
                  <span className="text-xs text-white/40">DA {pr.domainAuthority}</span>
                </div>
                <p className="text-sm font-bold text-white">{pr.headline}</p>
                <p className="mt-0.5 text-xs text-white/50">{pr.outlet} &middot; Est. reach: {pr.estimatedReach}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="h-px bg-white/[0.06]" />

      {/* Impact Ranking Table */}
      <div className="space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-widest text-text-muted">
          Placement Impact Ranking
        </h3>
        <p className="text-sm text-white/50">
          Each placement scored by the strength of correlation between publish date and
          downstream lift in branded search, sessions, and revenue.
        </p>
        <div className="overflow-hidden rounded-xl border border-white/[0.06]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] bg-bg-surface">
                <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-text-muted">
                  Placement
                </th>
                <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-text-muted">
                  Search Lift
                </th>
                <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-text-muted">
                  Session Lift
                </th>
                <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-text-muted">
                  Revenue
                </th>
                <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-text-muted">
                  Score
                </th>
              </tr>
            </thead>
            <tbody>
              {data.prImpact.map((row) => (
                <tr
                  key={row.prId}
                  className="border-b border-white/[0.04] last:border-0"
                >
                  <td className="px-5 py-3">
                    <p className="font-semibold text-white">{row.outlet}</p>
                    <p className="mt-0.5 max-w-[280px] truncate text-xs text-white/40">
                      {row.headline}
                    </p>
                  </td>
                  <td className="px-5 py-3 text-right font-semibold" style={{ color: CHART_COLORS.primary }}>
                    {row.brandedSearchLift}
                  </td>
                  <td className="px-5 py-3 text-right font-semibold" style={{ color: CHART_COLORS.ga4 }}>
                    {row.sessionLift}
                  </td>
                  <td className="px-5 py-3 text-right font-semibold" style={{ color: CHART_COLORS.positive }}>
                    {row.attributedRevenue}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <span
                      className="inline-block rounded-full px-2.5 py-0.5 text-xs font-bold"
                      style={{
                        background: `${correlationColor(row.correlationScore)}20`,
                        color: correlationColor(row.correlationScore),
                      }}
                    >
                      {row.correlationScore.toFixed(2)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="h-px bg-white/[0.06]" />

      {/* AI Insight */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-widest text-text-muted">
          AI Analysis
        </h3>
        <div className="rounded-xl border border-white/[0.06] bg-bg-surface p-6">
          {data.aiAnalysis.map((paragraph, i) => (
            <p
              key={i}
              className={`text-sm leading-relaxed text-white/70 ${i > 0 ? 'mt-3' : ''}`}
              dangerouslySetInnerHTML={{ __html: paragraph }}
            />
          ))}
        </div>
      </div>

      {/* Data freshness */}
      <p className="text-xs text-text-muted">
        Demo data — connect Google Search Console and PR tracking to see real attribution
      </p>
    </div>
  )
}
