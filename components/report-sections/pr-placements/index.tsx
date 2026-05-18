import { CHART_COLORS } from '@/lib/constants'
import { KpiCard } from '@/components/charts/kpi-card'
import { getClientBySlug } from '@/lib/clients.config'
import { calcSummary, formatSocialScore, normalizeArticle, type Placement, type RawArticle } from '@/lib/newsapi'
import { CoverageChart } from './coverage-chart'

interface PRPlacementsProps {
  clientSlug: string
  dateRange?: string
}

// --- Mock data per client ---

function getDemoData(clientSlug: string): Placement[] {
  if (clientSlug === 'kind-patches') {
    return [
      { uri: 'kp-1', title: 'The Best Vitamin Patches That Actually Work, According to Experts', url: '#', date: '2026-03-14', source: 'Well+Good', sourceDomain: 'wellandgood.com', tier: 1, importanceRank: 12, socialScore: 14200, shares: { facebook: 4800, twitter: 3200, linkedIn: 6200 }, sentiment: 0.72, dataType: 'news' },
      { uri: 'kp-2', title: 'Transdermal Patches Are the Next Big Thing in Wellness', url: '#', date: '2026-03-12', source: 'Forbes Health', sourceDomain: 'forbes.com', tier: 1, importanceRank: 5, socialScore: 28400, shares: { facebook: 9200, twitter: 8100, linkedIn: 11100 }, sentiment: 0.68, dataType: 'news' },
      { uri: 'kp-3', title: 'No Pills, No Sugar: Why Wellness Patches Are Having a Moment', url: '#', date: '2026-03-10', source: 'mindbodygreen', sourceDomain: 'mindbodygreen.com', tier: 1, importanceRank: 18, socialScore: 8900, shares: { facebook: 3400, twitter: 2100, linkedIn: 3400 }, sentiment: 0.81, dataType: 'news' },
      { uri: 'kp-4', title: 'This Patch Brand Went Viral on TikTok \u2014 Here\u2019s Why', url: '#', date: '2026-03-08', source: 'PopSugar', sourceDomain: 'popsugar.com', tier: 1, importanceRank: 22, socialScore: 19600, shares: { facebook: 7200, twitter: 6800, linkedIn: 5600 }, sentiment: 0.65, dataType: 'news' },
      { uri: 'kp-5', title: 'Kind Patches Raises $4M to Expand Transdermal Wellness Line', url: '#', date: '2026-03-06', source: 'TechCrunch', sourceDomain: 'techcrunch.com', tier: 1, importanceRank: 8, socialScore: 22100, shares: { facebook: 6400, twitter: 7800, linkedIn: 7900 }, sentiment: 0.58, dataType: 'news' },
      { uri: 'kp-6', title: 'Transdermal Nutrient Delivery: What the Science Says', url: '#', date: '2026-03-04', source: 'Healthline', sourceDomain: 'healthline.com', tier: 1, importanceRank: 10, socialScore: 12800, shares: { facebook: 4200, twitter: 3600, linkedIn: 5000 }, sentiment: 0.74, dataType: 'news' },
      { uri: 'kp-7', title: '23 Wellness Products That TikTok Made Me Buy (And Actually Love)', url: '#', date: '2026-03-02', source: 'BuzzFeed Shopping', sourceDomain: 'buzzfeed.com', tier: 1, importanceRank: 15, socialScore: 31200, shares: { facebook: 14200, twitter: 9800, linkedIn: 7200 }, sentiment: 0.52, dataType: 'news' },
      { uri: 'kp-8', title: 'How Kind Patches Built a DTC Empire on Ingredient Transparency', url: '#', date: '2026-02-28', source: 'Glossy', sourceDomain: 'glossy.co', tier: 2, importanceRank: 42, socialScore: 4200, shares: { facebook: 1600, twitter: 1200, linkedIn: 1400 }, sentiment: 0.61, dataType: 'news' },
      { uri: 'kp-9', title: 'The Clean Beauty Brand Using Patches Instead of Pills', url: '#', date: '2026-02-25', source: 'Byrdie', sourceDomain: 'byrdie.com', tier: 1, importanceRank: 24, socialScore: 9400, shares: { facebook: 3800, twitter: 2800, linkedIn: 2800 }, sentiment: 0.77, dataType: 'news' },
      { uri: 'kp-10', title: 'Kind Patches Launches New Sleep Formula After Viral TikTok', url: '#', date: '2026-02-22', source: 'Retail Dive', sourceDomain: 'retaildive.com', tier: 2, importanceRank: 38, socialScore: 3100, shares: { facebook: 900, twitter: 800, linkedIn: 1400 }, sentiment: 0.54, dataType: 'pr' },
      { uri: 'kp-11', title: 'Vitamin Patches: Gimmick or Genuine Health Innovation?', url: '#', date: '2026-02-20', source: 'Health.com', sourceDomain: 'health.com', tier: 1, importanceRank: 14, socialScore: 11200, shares: { facebook: 4100, twitter: 3200, linkedIn: 3900 }, sentiment: 0.41, dataType: 'news' },
      { uri: 'kp-12', title: 'The Wellness Brands Gen Z Actually Trusts', url: '#', date: '2026-02-17', source: 'Refinery29', sourceDomain: 'refinery29.com', tier: 1, importanceRank: 20, socialScore: 15600, shares: { facebook: 5800, twitter: 4600, linkedIn: 5200 }, sentiment: 0.69, dataType: 'news' },
    ]
  }

  // Default: Fun Spot
  return [
    { uri: 'fs-1', title: 'Fun Spot America Unveils New Thrill Ride for 2026 Season', url: '#', date: '2026-03-15', source: 'Orlando Sentinel', sourceDomain: 'orlandosentinel.com', tier: 1, importanceRank: 14, socialScore: 8400, shares: { facebook: 3200, twitter: 2100, linkedIn: 3100 }, sentiment: 0.82, dataType: 'news' },
    { uri: 'fs-2', title: 'The Best Theme Parks in Florida That Aren\u2019t Disney', url: '#', date: '2026-03-12', source: 'Travel + Leisure', sourceDomain: 'travelandleisure.com', tier: 1, importanceRank: 8, socialScore: 24600, shares: { facebook: 9400, twitter: 7200, linkedIn: 8000 }, sentiment: 0.76, dataType: 'news' },
    { uri: 'fs-3', title: 'Fun Spot Offers Free Admission for First Responders', url: '#', date: '2026-03-09', source: 'Fox 35 Orlando', sourceDomain: 'fox35orlando.com', tier: 2, importanceRank: 45, socialScore: 3200, shares: { facebook: 1800, twitter: 600, linkedIn: 800 }, sentiment: 0.91, dataType: 'news' },
    { uri: 'fs-4', title: 'Fun Spot America Parks See Record Spring Break Attendance', url: '#', date: '2026-03-06', source: 'Attractions Magazine', sourceDomain: 'attractionsmagazine.com', tier: 2, importanceRank: 52, socialScore: 2100, shares: { facebook: 900, twitter: 500, linkedIn: 700 }, sentiment: 0.64, dataType: 'news' },
    { uri: 'fs-5', title: '10 Affordable Theme Park Alternatives for Families', url: '#', date: '2026-03-03', source: 'USA Today', sourceDomain: 'usatoday.com', tier: 1, importanceRank: 3, socialScore: 31800, shares: { facebook: 12400, twitter: 9200, linkedIn: 10200 }, sentiment: 0.71, dataType: 'news' },
    { uri: 'fs-6', title: 'Central Florida Theme Parks Gear Up for Spring Tourism Boom', url: '#', date: '2026-02-28', source: 'Orlando Business Journal', sourceDomain: 'bizjournals.com/orlando', tier: 2, importanceRank: 35, socialScore: 4800, shares: { facebook: 1600, twitter: 1200, linkedIn: 2000 }, sentiment: 0.58, dataType: 'news' },
    { uri: 'fs-7', title: 'Fun Spot Named Best Family Value in Orlando by TripAdvisor', url: '#', date: '2026-02-24', source: 'TripAdvisor Blog', sourceDomain: 'tripadvisor.com', tier: 1, importanceRank: 11, socialScore: 18200, shares: { facebook: 7800, twitter: 4200, linkedIn: 6200 }, sentiment: 0.88, dataType: 'blog' },
    { uri: 'fs-8', title: 'Why Go-Kart Attractions Are Making a Major Comeback', url: '#', date: '2026-02-20', source: 'CNN Travel', sourceDomain: 'cnn.com', tier: 1, importanceRank: 4, socialScore: 27400, shares: { facebook: 10200, twitter: 8600, linkedIn: 8600 }, sentiment: 0.62, dataType: 'news' },
  ]
}

// --- Tier colors ---
const tierColor: Record<number, string> = {
  1: CHART_COLORS.positive,
  2: CHART_COLORS.primary,
  3: CHART_COLORS.neutral,
}

const tierLabel: Record<number, string> = {
  1: 'Tier 1',
  2: 'Tier 2',
  3: 'Tier 3',
}

function sentimentColor(s: number | null): string {
  if (s === null) return CHART_COLORS.neutral
  if (s > 0.1) return CHART_COLORS.positive
  if (s < -0.1) return CHART_COLORS.negative
  return CHART_COLORS.neutral
}

function sentimentLabel(s: number | null): string {
  if (s === null) return '\u2014'
  return s.toFixed(2)
}

// Build daily coverage timeline — uses placement dates to determine range
function buildTimeline(placements: Placement[]): { date: string; count: number }[] {
  if (placements.length === 0) return []

  // Find the date range from the placements themselves
  const dates = placements.map((p) => p.date).sort()
  const earliest = new Date(dates[0] + 'T00:00:00')
  const latest = new Date(dates[dates.length - 1] + 'T00:00:00')

  // Pad 3 days before and after
  const start = new Date(earliest.getTime() - 3 * 86400000)
  const end = new Date(Math.max(latest.getTime() + 3 * 86400000, Date.now()))

  const counts: Record<string, number> = {}
  for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 86400000)) {
    counts[d.toISOString().split('T')[0]] = 0
  }
  placements.forEach((p) => {
    if (counts[p.date] !== undefined) counts[p.date]++
  })
  return Object.entries(counts).map(([date, count]) => ({ date, count }))
}

async function fetchLivePlacements(clientSlug: string): Promise<Placement[] | null> {
  const apiKey = process.env.NEWSAPI_AI_KEY
  if (!apiKey) return null

  const client = getClientBySlug(clientSlug)
  if (!client?.prConfig) return null

  const { prConfig } = client
  const dataTypes = prConfig.dataTypes ?? ['news', 'pr']

  const body = {
    action: 'getArticles',
    keyword: prConfig.keywords,
    keywordOper: 'or',
    ...(prConfig.excludeKeywords?.length && { ignoreKeyword: prConfig.excludeKeywords }),
    ...(prConfig.sourceLocationUri?.length && { sourceLocationUri: prConfig.sourceLocationUri }),
    ...(prConfig.language && { lang: prConfig.language }),
    articlesPage: 1,
    articlesCount: 100,
    articlesSortBy: 'date',
    articlesSortByAsc: false,
    articleBodyLen: 0,
    dataType: dataTypes,
    forceMaxDataTimeWindow: prConfig.lookbackDays === 7 ? 7 : 31,
    resultType: 'articles',
    includeArticleTitle: true,
    includeArticleUrl: true,
    includeArticleSource: true,
    includeArticleDate: true,
    includeArticleSocialScore: true,
    includeArticleSentiment: true,
    includeSourceTitle: true,
    includeSourceImportanceRank: true,
    includeSourceAlexaGlobalRank: true,
    ignoreSourceGroupUri: 'paywall/paywalled_sources',
    apiKey,
  }

  try {
    const res = await fetch('https://eventregistry.org/api/v1/article/getArticles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      next: { revalidate: 3600 },
    })

    if (!res.ok) {
      console.error('NewsAPI returned', res.status)
      return null
    }

    const data = await res.json()
    if (data.error) {
      console.error('NewsAPI error:', data.error)
      return null
    }

    const rawArticles = data.articles?.results ?? []
    return rawArticles.map((a: RawArticle) => normalizeArticle(a, 'news'))
  } catch (err) {
    console.error('NewsAPI fetch failed:', err)
    return null
  }
}

export async function PRPlacementsReport({ clientSlug, dateRange }: PRPlacementsProps) {
  // Try live API first, fall back to demo data
  const hasKey = !!process.env.NEWSAPI_AI_KEY
  console.log('[PR Placements] API key present:', hasKey, '| Client:', clientSlug)
  const livePlacements = hasKey ? await fetchLivePlacements(clientSlug) : null
  const hasLiveData = livePlacements !== null && livePlacements.length > 0
  console.log('[PR Placements] Live results:', livePlacements ? `${livePlacements.length} articles` : 'null', hasLiveData ? '(using live)' : '(using fallback)')
  const placements = hasLiveData ? livePlacements : getDemoData(clientSlug)
  const isLive = hasLiveData
  const summary = calcSummary(placements)
  const timelineData = buildTimeline(placements)

  // Sentiment distribution buckets
  const sentimentBuckets = [
    { label: 'Very Negative', min: -1, max: -0.5, count: 0, color: '#991b1b' },
    { label: 'Negative', min: -0.5, max: -0.1, count: 0, color: CHART_COLORS.negative },
    { label: 'Neutral', min: -0.1, max: 0.1, count: 0, color: CHART_COLORS.neutral },
    { label: 'Positive', min: 0.1, max: 0.5, count: 0, color: CHART_COLORS.email },
    { label: 'Very Positive', min: 0.5, max: 1.0, count: 0, color: CHART_COLORS.positive },
  ]
  let nullSentimentCount = 0
  placements.forEach((p) => {
    if (p.sentiment === null) {
      nullSentimentCount++
      return
    }
    for (const bucket of sentimentBuckets) {
      if (p.sentiment >= bucket.min && p.sentiment < bucket.max) {
        bucket.count++
        return
      }
    }
    if (p.sentiment >= 0.5) sentimentBuckets[4].count++
  })
  const maxBucketCount = Math.max(...sentimentBuckets.map((b) => b.count), 1)

  return (
    <div className="space-y-8">
      {/* Section heading */}
      <div>
        <p className="text-sm font-bold uppercase tracking-widest text-text-muted">
          Earned Media Coverage
        </p>
        <h2 className="text-3xl font-extrabold uppercase text-white">
          PR{' '}
          <span className="gradient-text-reputation">Placements</span>
        </h2>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-5 lg:grid-cols-5">
        <KpiCard title="Total Hits" value={String(summary.totalHits)} />
        <KpiCard title="Tier 1 Placements" value={String(summary.tier1Count)} delta={summary.totalHits > 0 ? Math.round((summary.tier1Count / summary.totalHits) * 100) : 0} suffix="% of total" />
        <KpiCard title="Est. Social Reach" value={formatSocialScore(summary.totalSocialScore)} />
        <KpiCard title="Avg Sentiment" value={summary.avgSentiment !== null ? summary.avgSentiment.toFixed(2) : '\u2014'} />
        <KpiCard title="Avg Source Rank" value={summary.avgImportanceRank !== null ? `p${Math.round(summary.avgImportanceRank)}` : '\u2014'} />
      </div>

      {/* Coverage Timeline */}
      <div>
        <h3 className="mb-4 text-lg font-bold text-white">
          Coverage Over Time
        </h3>
        <CoverageChart data={timelineData} />
      </div>

      {/* Tier Breakdown + Sentiment side by side */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Tier Breakdown */}
        <div>
          <h3 className="mb-4 text-lg font-bold text-white">
            Tier Breakdown
          </h3>
          <div className="rounded-lg border border-white/[0.08] bg-bg-surface px-6 py-5 space-y-4">
            {[1, 2, 3].map((tier) => {
              const count = tier === 1 ? summary.tier1Count : tier === 2 ? summary.tier2Count : summary.tier3Count
              const pct = summary.totalHits > 0 ? Math.round((count / summary.totalHits) * 100) : 0
              return (
                <div key={tier} className="space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="font-extrabold uppercase tracking-widest text-xs" style={{ color: tierColor[tier] }}>
                      {tierLabel[tier]}
                    </span>
                    <span className="text-sm text-white/60">
                      {count} ({pct}%)
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-white/[0.06]">
                    <div
                      className="h-2 rounded-full"
                      style={{
                        width: `${pct}%`,
                        background: tierColor[tier],
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Sentiment Distribution */}
        <div>
          <h3 className="mb-4 text-lg font-bold text-white">
            Sentiment Distribution
          </h3>
          <div className="rounded-lg border border-white/[0.08] bg-bg-surface px-6 py-5 space-y-4">
            {sentimentBuckets.map((bucket) => (
              <div key={bucket.label} className="space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-white/70">{bucket.label}</span>
                  <span className="text-white/60">{bucket.count}</span>
                </div>
                <div className="h-2 rounded-full bg-white/[0.06]">
                  <div
                    className="h-2 rounded-full"
                    style={{
                      width: `${(bucket.count / maxBucketCount) * 100}%`,
                      background: bucket.color,
                    }}
                  />
                </div>
              </div>
            ))}
            {nullSentimentCount > 0 && (
              <p className="text-xs text-text-muted">
                Sentiment unavailable for {nullSentimentCount} article{nullSentimentCount > 1 ? 's' : ''}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Placements Table */}
      <div>
        <h3 className="mb-4 text-lg font-bold text-white">
          All Placements
        </h3>
        <div className="overflow-hidden rounded-lg border border-white/[0.08]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] bg-bg-surface">
                <th className="px-5 py-3 text-left text-xs font-extrabold uppercase tracking-widest text-text-muted">
                  Date
                </th>
                <th className="px-5 py-3 text-left text-xs font-extrabold uppercase tracking-widest text-text-muted">
                  Headline
                </th>
                <th className="px-5 py-3 text-left text-xs font-extrabold uppercase tracking-widest text-text-muted">
                  Outlet
                </th>
                <th className="px-5 py-3 text-center text-xs font-extrabold uppercase tracking-widest text-text-muted">
                  Tier
                </th>
                <th className="px-5 py-3 text-right text-xs font-extrabold uppercase tracking-widest text-text-muted">
                  Rank
                </th>
                <th className="px-5 py-3 text-right text-xs font-extrabold uppercase tracking-widest text-text-muted">
                  Social
                </th>
                <th className="px-5 py-3 text-right text-xs font-extrabold uppercase tracking-widest text-text-muted">
                  Sentiment
                </th>
              </tr>
            </thead>
            <tbody>
              {placements.map((p) => (
                <tr
                  key={p.uri}
                  className="border-b border-white/[0.04] last:border-0"
                >
                  <td className="whitespace-nowrap px-5 py-3 text-white/60">
                    {new Date(p.date + 'T00:00:00').toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </td>
                  <td className="max-w-[300px] truncate px-5 py-3">
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-white hover:underline"
                    >
                      {p.title}
                    </a>
                  </td>
                  <td className="px-5 py-3">
                    <p className="text-white/70">{p.source}</p>
                    <p className="text-xs text-white/30">{p.sourceDomain}</p>
                  </td>
                  <td className="px-5 py-3 text-center">
                    <span
                      className="inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase"
                      style={{
                        background: `${tierColor[p.tier]}20`,
                        color: tierColor[p.tier],
                      }}
                    >
                      Tier {p.tier}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right text-white/60">p{p.importanceRank}</td>
                  <td className="px-5 py-3 text-right text-white/60">
                    {formatSocialScore(p.socialScore)}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <span style={{ color: sentimentColor(p.sentiment) }}>
                      {sentimentLabel(p.sentiment)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Data freshness */}
      <p className="text-xs text-text-muted">
        {isLive
          ? `Live data from NewsAPI.ai \u2022 ${placements.length} articles found`
          : 'Demo data \u2014 connect NewsAPI.ai to see real media coverage'}
      </p>
    </div>
  )
}
