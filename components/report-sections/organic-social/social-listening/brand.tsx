// The brand topic, laid out as the approved mockup (docs/social-listening/mock.template.html, #view-brand): data tiles,
// results over time, sentiment, year to date, media types, themes, trends, top conversation themes, top influencers, most
// relevant posts, key takeaways, keyword appendix. Renders a view-model.ts SlTopicView and decides nothing itself.
import type { ReactNode } from 'react'
import { SENTIMENT_COLORS, mediaColor } from '@/lib/organic-social/social-listening/colors'
import type { SlBoxId } from '@/lib/organic-social/social-listening/boxes'
import type { SlTile, SlTopicView } from '@/lib/organic-social/social-listening/view-model'
import type { YtdPoint } from '@/lib/organic-social/social-listening/compare'
import type { SlToggleChart } from '@/lib/organic-social/social-listening/params'
import { Cloud, Donut, HBars, Key, Kpi, Legend, LineChart, MediaShare, PointLines, PosNeuColumns, SentimentByMedia, YtdColumns, type ChartMark } from '../design/charts'
import { SlBoxLabel, SlCard, SlSection } from '../design/frames'
import { PostsSection } from './posts'
import { TrendsBlock } from './trends'
import { ChartToggle, type ChartView } from './chart-toggle'
import { SlNotesPanel } from './notes-panel'
import { slCardTooltip, slTileTooltip } from '@/lib/organic-social/social-listening/tooltips'
import { AuthorsSection } from './authors'
import type { SlAuthorSort } from '@/lib/organic-social/social-listening/picks'
import { buildSlChartNotes, type SlChartNotes, type SlNoteChart, type SlNoteSource } from '@/lib/organic-social/social-listening/notes'
import s from '../design/kit.module.css'
import f from '../design/frames.module.css'

export type TopicPageProps = {
  view: SlTopicView
  boxes: Partial<Record<SlBoxId, ReactNode>>
  clientSlug: string
  range: string
  caps: { canEdit: boolean; canApprove: boolean }
  /** The upload control or the live-month line, in place of a missing upload (staff only). */
  upload: ReactNode
  topicName: string
  /** The charts set to columns (slcols); every other toggle chart starts on its line (plan 2026-11-24, Unit C). */
  cols: readonly SlToggleChart[]
  /** The PDF export: a toggle chart draws only its chosen view, with no buttons, whatever the client context. */
  exporting: boolean
  /** The team's notes on the line graphs (Unit E), read once by the section; absent when there are none to show or the read
   *  failed, and the graphs then draw exactly as without notes. */
  notes?: SlNoteSource
  /** The authors table's order (slsort, Unit F); posts when absent. */
  sort?: SlAuthorSort
}

/** One graph's notes, keyed by what the graph draws. Nothing to show without a source. */
export function notesFor(source: SlNoteSource | undefined, chart: SlNoteChart, keys: readonly string[]): SlChartNotes {
  return source ? buildSlChartNotes(source.rows, { chart, keys, caps: source.caps, clientSlug: source.clientSlug, today: source.today }) : { marks: [], panel: [] }
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const monthName = (key: string) => MONTH_NAMES[Number(key.slice(5, 7)) - 1]
export const fmt = (n: number) => Math.round(n).toLocaleString('en-US')
export const short = (v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : fmt(v))
export function prevKey(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}
/** "vs Sep report", as the mockup labels every change. */
export const vsLabel = (month: string) => `vs ${monthName(prevKey(month)).slice(0, 3)} report`

/** A tile's value as the mockup prints it: counts in full, engagement and reach short with the exact number under. */
export function tileValue(t: SlTile): { value: string; sub?: string } {
  if (t.value === null) return { value: 'n/a' }
  if (t.unit === '%') return { value: `${t.value}%` }
  if (t.title === 'Engagement' || t.title === 'Potential reach') return { value: short(t.value), sub: `${fmt(t.value)} exact` }
  return { value: fmt(t.value) }
}

/** A year to date series from its first month with data, so months before any data are not drawn as empty columns; a
 *  gap after that stays a gap. `by` decides the start for a series drawn beside another. */
export function fromFirst<T extends { value: unknown }>(points: T[], by: { value: unknown }[] = points): T[] {
  const i = by.findIndex((p) => p.value !== null && p.value !== undefined)
  return i <= 0 ? points : points.slice(i)
}

/** "January to October", "May to October" when the data starts in May, or just "October" when it is the only month. */
export function ytdSpan(points: { month: string; value: unknown }[], month: string): string {
  const first = fromFirst(points)[0]?.month ?? month
  return first === month ? monthName(month) : `${monthName(first)} to ${monthName(month)}`
}

/** A toggle chart's first view: columns when the URL set it to columns (slcols), else the line. */
export const viewOf = (cols: readonly SlToggleChart[], id: SlToggleChart): ChartView => (cols.includes(id) ? 'columns' : 'line')

/** A chart with the Line / Columns toggle. On screen, the client toggle; in the PDF, only the chosen view, drawn on the
 *  server, so the export never depends on the client knowing it is an export. */
export function Toggled({ id, cols, exporting, line, columns }: {
  id: SlToggleChart; cols: readonly SlToggleChart[]; exporting: boolean; line: ReactNode; columns: ReactNode
}) {
  const initial = viewOf(cols, id)
  if (exporting) return <>{initial === 'columns' ? columns : line}</>
  return <ChartToggle id={id} initial={initial} line={line} columns={columns} />
}

/** A year to date sentiment split as three lines, positive, neutral and negative by month, as both decks draw it (plan
 *  2026-11-24, F8): the line view of YtdColumns' points. A month with no data breaks the line, as on the columns. */
export function SentimentLines({ points, marks }: { points: YtdPoint[]; marks?: readonly ChartMark[] }) {
  return (
    <PointLines marks={marks} months={points.map((p) => p.month)} series={[
      { name: 'Positive', vals: points.map((p) => p.value?.pos ?? null), color: SENTIMENT_COLORS.pos },
      { name: 'Neutral', vals: points.map((p) => p.value?.neu ?? null), color: SENTIMENT_COLORS.neu },
      { name: 'Negative', vals: points.map((p) => p.value?.neg ?? null), color: SENTIMENT_COLORS.neg, below: true },
    ]} />
  )
}

/** An analysis-only section: staff always (the box's "+ Add analysis"), a client only with approved text. */
export function AnalysisOnly({ title, show, box }: { title: string; show: boolean; box: ReactNode }) {
  if (!show || !box) return null
  return <SlSection title={title}><div data-export-block="">{box}</div></SlSection>
}

/** The top conversation themes box, inside the Themes section under a small label (2026-11-24: it is part of themes, not
 *  a section of its own). Same rule as AnalysisOnly: staff always, a client only with approved text. */
export function ConversationThemes({ show, box }: { show: boolean; box: ReactNode }) {
  if (!show || !box) return null
  return <div className={f.item} data-export-block=""><SlBoxLabel>Top conversation themes</SlBoxLabel>{box}</div>
}

const lastDay = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate()

export function SourceLine({ topicName, month }: { topicName: string; month: string }) {
  return (
    <p className={s.source}>
      Source: Talkwalker export of the topic &quot;{topicName}&quot;, {monthName(month)} 1 to {lastDay(month)}, {month.slice(0, 4)} (Eastern).
      Changes compare with the {monthName(prevKey(month))} report as presented to the client.
    </p>
  )
}

// Talkwalker's source types as the mockup names them ("SOCIALMEDIA_INSTAGRAM" is Instagram).
const NETWORKS: Record<string, string> = {
  INSTAGRAM: 'Instagram', FACEBOOK: 'Facebook', LINKEDIN: 'LinkedIn', YOUTUBE: 'YouTube', TWITTER: 'X', X: 'X',
  TIKTOK: 'TikTok', REDDIT: 'Reddit', THREADS: 'Threads', PINTEREST: 'Pinterest', FORUMS: 'Forums', FORUM: 'Forums',
  BLOGS: 'Blogs', BLOG: 'Blogs', NEWS: 'News', ONLINENEWS: 'Online news',
}
/** A source type for people: a known network by name, anything else in plain words. */
export function networkLabel(raw: string): string {
  const key = raw.trim().toUpperCase().replace(/^SOCIALMEDIA_/, '')
  if (NETWORKS[key.replace(/[_\s]/g, '')]) return NETWORKS[key.replace(/[_\s]/g, '')]
  const words = key.toLowerCase().split(/[_\s]+/).filter(Boolean).join(' ')
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : raw
}

export function BrandPage({ view, boxes, clientSlug, range, caps, upload, topicName, cols, exporting, notes, sort }: TopicPageProps) {
  const r = view.ready
  const label = vsLabel(view.month)
  const posNeuPoints = r ? fromFirst(r.posNeu, r.ytd) : []
  const ytd = r ? fromFirst(r.ytd) : []
  const reddit = r?.reddit ? fromFirst(r.reddit) : []
  const n = {
    daily: notesFor(notes, 'sl-b-daily', r ? r.daily.map((d) => d.day) : []),
    ytd: notesFor(notes, 'sl-b-ytd', ytd.map((p) => p.month)),
    posneu: notesFor(notes, 'sl-b-posneu', posNeuPoints.map((p) => p.month)),
    reddit: notesFor(notes, 'sl-b-reddit', reddit.map((p) => p.month)),
  }
  return (
    <div className={s.view}>
      {upload}
      {r && (
        <>
          <SlSection title="Data">
            <div className={`${s.grid} ${s.g4}`}>
              {r.tiles.map((t) => {
                const v = tileValue(t)
                return <Kpi key={t.title} title={t.title} value={v.value} sub={v.sub} delta={t.change} label={label} tooltip={slTileTooltip('brand', t.id)} />
              })}
            </div>
            {boxes['b-kpis']}
          </SlSection>

          <SlSection>
            <SlCard title="Results over time" meta={`${fmt(r.results)} results`} box={boxes['b-daily']} tooltip={slCardTooltip('b-daily')}>
              <LineChart days={r.daily} color="#60FDFF" id="sl-gb" marks={n.daily.marks} />
              <SlNotesPanel notes={n.daily} title="Results over time" />
            </SlCard>
          </SlSection>

          <SlSection title="Sentiment">
            {/* The two donuts stay side by side, as on the approved tab; each box sits under its card, and the pair row lines
                the cards up to one height and the boxes up to one line (frames.module.css .pair). */}
            <div className={`${s.grid} ${s.g2} ${f.pair}`}>
              <SlCard title="Share of sentiment" meta="All results" box={boxes['b-sent']} tooltip={slCardTooltip('b-sent')} bodyClassName={s.donutWrap}>
                <Donut counts={r.sentiment.counts} />
                <Legend counts={r.sentiment.counts} pct={r.sentiment.pct} changes={r.sentiment.change} label={label} />
              </SlCard>
              {view.show.owned && r.owned && (
                <SlCard title="Without brand-owned channels" meta={`${fmt(r.owned.total)} results`} box={boxes['b-owned']} tooltip={slCardTooltip('b-owned')} bodyClassName={s.donutWrap}
                  note="Excludes results from the brand's owned channels">
                  <Donut counts={r.owned.counts} />
                  <Legend counts={r.owned.counts} pct={r.owned.pct} />
                </SlCard>
              )}
            </div>
            <SlCard title="Sentiment by media type" meta="Results per media type" box={boxes['b-cross']} tooltip={slCardTooltip('b-cross')}>
              <HBars rows={r.cross} />
            </SlCard>
          </SlSection>

          <SlSection title="Year to date" line={`Earlier months as presented in each month's report; ${monthName(view.month)} from this export`}>
            <SlCard title={`Sentiment, ${ytdSpan(r.ytd, view.month)}`} meta="% of results" box={boxes['b-ytd']} tooltip={slCardTooltip('b-ytd')}>
              <Toggled id="b-ytd" cols={cols} exporting={exporting} line={<SentimentLines points={ytd} marks={n.ytd.marks} />}
                columns={<YtdColumns points={ytd} aria={`Brand sentiment by month, ${ytdSpan(r.ytd, view.month)}`} marks={n.ytd.marks} />} />
              <SlNotesPanel notes={n.ytd} title="Sentiment, year to date" />
            </SlCard>
            <SlCard title="Positive + neutral combined" meta="% of results" box={boxes['b-posneu']} tooltip={slCardTooltip('b-posneu')}>
              <Toggled id="b-posneu" cols={cols} exporting={exporting}
                line={<PointLines months={posNeuPoints.map((p) => p.month)} series={[
                  { name: 'Positive + neutral', vals: posNeuPoints.map((p) => p.value), color: SENTIMENT_COLORS.pos },
                  { name: 'Negative', vals: ytd.map((p) => p.value?.neg ?? null), color: SENTIMENT_COLORS.neg, below: true },
                ]} marks={n.posneu.marks} />}
                columns={<PosNeuColumns months={posNeuPoints.map((p) => p.month)} posNeu={posNeuPoints.map((p) => p.value)}
                  neg={ytd.map((p) => p.value?.neg ?? null)} marks={n.posneu.marks} />} />
              <SlNotesPanel notes={n.posneu} title="Positive + neutral combined" />
            </SlCard>
            {r.reddit && (
              <SlCard title="Reddit sentiment" meta="% of Reddit results" box={boxes['b-reddit']} tooltip={slCardTooltip('b-reddit')}>
                <Toggled id="b-reddit" cols={cols} exporting={exporting} line={<SentimentLines points={reddit} marks={n.reddit.marks} />}
                  columns={<YtdColumns points={reddit} aria="Reddit sentiment by month" marks={n.reddit.marks} />} />
                <SlNotesPanel notes={n.reddit} title="Reddit sentiment" />
              </SlCard>
            )}
          </SlSection>

          <SlSection title="Media types">
            {/* The change compares with last month as the client saw it: the delivered report's counts, else its export (D4). */}
            <SlCard title="Share of media types" meta={`Change vs the ${monthName(prevKey(view.month))} ${r.mediaVs === 'export' ? 'export' : 'report'}`} box={boxes['b-media']} tooltip={slCardTooltip('b-media')}>
              <MediaShare rows={r.media} />
            </SlCard>
            <SlCard title="Share of media types by sentiment" meta="Where each sentiment came from" box={boxes['b-mediasent']} tooltip={slCardTooltip('b-mediasent')}>
              <SentimentByMedia rows={r.cross} colorFor={mediaColor} />
            </SlCard>
          </SlSection>
        </>
      )}

      <SlSection title="Themes">
        {r && (
          <SlCard title="Keyword themes" meta="Size = share of results" box={boxes['b-themes']} tooltip={slCardTooltip('b-themes')}>
            <Cloud themes={r.themes} colorFor={(t) => t.color} />
            <Key items={[{ name: 'Mostly positive', color: SENTIMENT_COLORS.pos }, { name: 'Mostly neutral', color: SENTIMENT_COLORS.neu }, { name: 'Mostly negative', color: SENTIMENT_COLORS.neg }]} />
          </SlCard>
        )}
        {view.show.trends && (
          <SlCard title="Trends in keyword themes" meta={`vs ${monthName(prevKey(view.month))}, from Talkwalker`} box={boxes['b-trends']} tooltip={slCardTooltip('b-trends')}>
            <TrendsBlock lists={view.trends.lists} draft={view.trends.draft} clientSlug={clientSlug} range={range} caps={caps} />
          </SlCard>
        )}
        <ConversationThemes show={view.show.conv} box={boxes['b-conv']} />
      </SlSection>

      {r && (
        <AuthorsSection r={r} prevShort={monthName(prevKey(view.month)).slice(0, 3)} networkLabel={networkLabel} caps={caps}
          clientSlug={clientSlug} range={range} sort={sort ?? 'posts'} exporting={exporting} box={boxes['b-authors']} />
      )}

      {view.show.posts && (
        <SlSection title="Most relevant posts" line={caps.canEdit ? 'Picked by the analyst. Approved posts are shown to the client, at most 12 a month.' : null}>
          <PostsSection posts={view.posts} clientSlug={clientSlug} range={range} caps={caps} />
          {boxes['b-posts']}
        </SlSection>
      )}

      <AnalysisOnly title="Key takeaways" show={view.show.takeaways} box={boxes['b-takeaways']} />
      <AnalysisOnly title="Keyword appendix" show={view.show.keywords} box={boxes['b-keywords']} />

      {r && <SourceLine topicName={topicName} month={view.month} />}
    </div>
  )
}
