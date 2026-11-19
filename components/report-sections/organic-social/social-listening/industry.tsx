// The industry topic, in the approved mockup's order (spec section 9): data tiles (results, then the three shares with
// their points changes), results over time, share of sentiment, sentiment year to date, sentiment over time, sentiment by
// media type, keyword themes, top conversation themes, key takeaways, keyword appendix. Server component.
import { KpiCard } from '@/components/charts/kpi-card'
import { num, pctText, short } from '@/lib/organic-social/social-listening/format'
import { AnalysisOnly, SentimentLegend, fromFirst, tileValue, ytdSpan, type TopicPageProps } from './brand'
import { PointsDelta, SlCard, SlSection } from './cards'
import { DailyResults, DailySentiment, SentimentDonut, YtdStacked } from './charts'
import { KeywordCloud } from './cloud'
import { SentimentBars, SentimentKey } from './sentiment-bars'

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const monthName = (key: string) => MONTH_NAMES[Number(key.slice(5, 7)) - 1]

export function IndustryPage({ view, boxes, upload, topicName }: TopicPageProps) {
  const r = view.ready
  return (
    <div className="space-y-10">
      {upload}
      {r && (
        <>
          <SlSection title="Data" line={view.sampleLine}>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {r.tiles.map((t) => {
                if (t.unit !== '%') {
                  // As the artifact: the short number, with the exact one under it.
                  const v = t.value === null ? tileValue(t) : { value: short(t.value), sub: `${num(t.value)} exact` }
                  return <KpiCard key={t.title} title={t.title} value={v.value} subValue={v.sub} wholeDelta comparisonExpected deltaLabel={r.changeLabel} {...(t.change !== undefined ? { delta: t.change } : {})} />
                }
                const kind = t.title === 'Positive' ? 'pos' : t.title === 'Neutral' ? 'neu' : 'neg'
                return (
                  <div key={t.title} data-export-block="" className="rounded-lg border border-white/[0.06] bg-bg-surface p-5">
                    <p className="text-sm text-text-muted">{t.title}</p>
                    <p className="mt-1 text-2xl font-bold text-white">{t.value === null ? 'n/a' : pctText(t.value)}</p>
                    <PointsDelta value={t.points ?? null} label={r.changeLabel} kind={kind} />
                  </div>
                )
              })}
            </div>
            {boxes['i-kpis']}
          </SlSection>

          <SlCard title="Results over time" meta={`${num(r.results)} results in ${monthName(view.month)}`} box={boxes['i-daily']}>
            <DailyResults days={r.daily} />
          </SlCard>

          <SlSection title="Sentiment">
            <div className="grid gap-4 lg:grid-cols-2">
              <SlCard title="Share of sentiment" meta="All results" box={boxes['i-sent']}>
                <div className="grid items-center gap-4 sm:grid-cols-2"><SentimentDonut counts={r.sentiment.counts} /><SentimentLegend view={view} /></div>
              </SlCard>
              <SlCard title={`Sentiment, ${ytdSpan(r.ytd, view.month)}`} meta="% of results" box={boxes['i-ytd']}>
                <YtdStacked points={fromFirst(r.ytd)} /><SentimentKey />
              </SlCard>
            </div>
            <SlCard title="Sentiment over time" meta="Results per day" box={boxes['i-sentday']}>
              <DailySentiment days={r.dailyBySentiment} /><SentimentKey />
            </SlCard>
            <SlCard title="Sentiment by media type" meta="Results per media type" box={boxes['i-cross']}>
              <SentimentBars rows={r.cross} />
            </SlCard>
          </SlSection>

          <SlSection title="Themes">
            <SlCard title="Keyword themes" meta="Size = share of results" box={boxes['i-themes']}>
              <KeywordCloud themes={r.themes} kind="decoration" />
            </SlCard>
          </SlSection>
        </>
      )}

      <AnalysisOnly title="Top conversation themes" show={view.show.conv} box={boxes['i-conv']} />
      <AnalysisOnly title="Key takeaways" show={view.show.takeaways} box={boxes['i-takeaways']} />
      <AnalysisOnly title="Keyword appendix" show={view.show.keywords} box={boxes['i-keywords']} />

      {r && <p className="text-xs text-text-muted">Source: Talkwalker export of the topic &quot;{topicName}&quot;, {monthName(view.month)} {view.month.slice(0, 4)}.</p>}
    </div>
  )
}
