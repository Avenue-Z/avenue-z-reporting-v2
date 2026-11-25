// The industry topic, laid out as the approved mockup (docs/social-listening/mock.template.html, #view-industry): data tiles
// (results, then the three shares with their points changes), results over time, share of sentiment, sentiment year to
// date (each chart card on a row of its own since 2026-11-24), sentiment over time, sentiment by media type, keyword
// themes with the top conversation themes box, key takeaways, keyword appendix. Server component.
import { AnalysisOnly, ConversationThemes, SentimentLines, SourceLine, Toggled, fmt, fromFirst, short, vsLabel, ytdSpan, type TopicPageProps } from './brand'
import { Cloud, DailyLines, DailyStack, Donut, HBars, Key, Kpi, Legend, LineChart, YtdColumns, decoColor } from '../design/charts'
import { SlCard, SlSection } from '../design/frames'
import { SENTIMENT_COLORS } from '@/lib/organic-social/social-listening/colors'
import s from '../design/kit.module.css'
import f from '../design/frames.module.css'

export function IndustryPage({ view, boxes, upload, topicName, cols, exporting }: TopicPageProps) {
  const r = view.ready
  const label = vsLabel(view.month)
  return (
    <div className={s.view}>
      {upload}
      {r && (
        <>
          <SlSection title="Data" line={view.sampleLine}>
            <div className={`${s.grid} ${s.g4}`}>
              {r.tiles.map((t) => {
                if (t.unit !== '%') {
                  return <Kpi key={t.title} title={t.title} value={t.value === null ? 'n/a' : short(t.value)} sub={t.value === null ? undefined : `${fmt(t.value)} exact`} delta={t.change} label={label} />
                }
                return <Kpi key={t.title} title={t.title} value={t.value === null ? 'n/a' : `${t.value}%`} delta={t.points} unit="pts" label={label}
                  invert={t.title === 'Negative'} neutral={t.title === 'Neutral'} />
              })}
            </div>
            {boxes['i-kpis']}
          </SlSection>

          <SlSection>
            <SlCard title="Results over time" meta={`${fmt(r.results)} results`} box={boxes['i-daily']}>
              <LineChart days={r.daily} color="#A08BFF" id="sl-gi" />
            </SlCard>
          </SlSection>

          <SlSection title="Sentiment">
            {/* Side by side, as on the approved tab, each box under its card and the row aligned (frames.module.css .pair).
                The month-by-month card stays until Savannah confirms whether her list meant to remove it: both decks
                carry it as its own slide (plan 2026-11-24, Q3). */}
            <div className={`${s.grid} ${s.g2} ${f.pair}`}>
              <SlCard title="Share of sentiment" meta="All results" box={boxes['i-sent']} bodyClassName={s.donutWrap}>
                <Donut counts={r.sentiment.counts} />
                <Legend counts={r.sentiment.counts} pct={r.sentiment.pct} changes={r.sentiment.change} label={label} />
              </SlCard>
              <SlCard title={`Sentiment, ${ytdSpan(r.ytd, view.month)}`} meta="% of results" box={boxes['i-ytd']}>
                <Toggled id="i-ytd" cols={cols} exporting={exporting} line={<SentimentLines points={fromFirst(r.ytd)} />}
                  columns={<YtdColumns points={fromFirst(r.ytd)} aria={`Industry sentiment by month, ${ytdSpan(r.ytd, view.month)}`} />} />
              </SlCard>
            </div>
            <SlCard title="Sentiment over time" meta="Results per day" box={boxes['i-sentday']}>
              <Toggled id="i-sentday" cols={cols} exporting={exporting} line={<DailyLines rows={r.dailyBySentiment} />}
                columns={<><DailyStack rows={r.dailyBySentiment} /><Key items={[{ name: 'Positive', color: SENTIMENT_COLORS.pos }, { name: 'Neutral', color: SENTIMENT_COLORS.neu }, { name: 'Negative', color: SENTIMENT_COLORS.neg }]} /></>} />
            </SlCard>
            <SlCard title="Sentiment by media type" meta="Results per media type" box={boxes['i-cross']}>
              <HBars rows={r.cross} />
            </SlCard>
          </SlSection>

        </>
      )}

      {(r || (view.show.conv && boxes['i-conv'])) && (
        <SlSection title="Themes">
          {r && (
            <SlCard title="Keyword themes" meta="Size = share of results" box={boxes['i-themes']}
              note="Colour is decoration on the industry cloud. It does not mean sentiment.">
              <Cloud themes={r.themes} colorFor={decoColor} />
            </SlCard>
          )}
          <ConversationThemes show={view.show.conv} box={boxes['i-conv']} />
        </SlSection>
      )}
      <AnalysisOnly title="Key takeaways" show={view.show.takeaways} box={boxes['i-takeaways']} />
      <AnalysisOnly title="Keyword appendix" show={view.show.keywords} box={boxes['i-keywords']} />

      {r && <SourceLine topicName={topicName} month={view.month} />}
    </div>
  )
}

