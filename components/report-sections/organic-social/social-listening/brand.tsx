// The brand topic, laid out as the approved mockup (docs/social-listening/mock.template.html, #view-brand): data tiles,
// results over time, sentiment, year to date, media types, themes, trends, top conversation themes, top influencers, most
// relevant posts, key takeaways, keyword appendix. Renders a view-model.ts SlTopicView and decides nothing itself.
import type { ReactNode } from 'react'
import { SENTIMENT_COLORS } from '@/lib/organic-social/social-listening/colors'
import type { SlBoxId } from '@/lib/organic-social/social-listening/boxes'
import type { SlTile, SlTopicView } from '@/lib/organic-social/social-listening/view-model'
import { Cloud, Donut, HBars, Key, Kpi, Legend, LineChart, MediaShare, PointLines, YtdColumns } from './artifact-charts'
import { SlCard, SlSection } from './cards'
import { PostsSection } from './posts'
import { TrendsBlock } from './trends'
import s from './sl.module.css'

export type TopicPageProps = {
  view: SlTopicView
  boxes: Partial<Record<SlBoxId, ReactNode>>
  clientSlug: string
  range: string
  caps: { canEdit: boolean; canApprove: boolean }
  /** The upload control or the live-month line, in place of a missing upload (staff only). */
  upload: ReactNode
  topicName: string
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

/** An analysis-only section: staff always (the box's "+ Add analysis"), a client only with approved text. */
export function AnalysisOnly({ title, show, box }: { title: string; show: boolean; box: ReactNode }) {
  if (!show || !box) return null
  return <SlSection title={title}><div data-export-block="">{box}</div></SlSection>
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

const MINI: ('pos' | 'neu' | 'neg')[] = ['pos', 'neu', 'neg']

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

export function BrandPage({ view, boxes, clientSlug, range, caps, upload, topicName }: TopicPageProps) {
  const r = view.ready
  const label = vsLabel(view.month)
  const posNeuPoints = r ? fromFirst(r.posNeu, r.ytd) : []
  const ytd = r ? fromFirst(r.ytd) : []
  return (
    <div className={s.view}>
      {upload}
      {r && (
        <>
          <SlSection title="Data">
            <div className={`${s.grid} ${s.g4}`}>
              {r.tiles.map((t) => {
                const v = tileValue(t)
                return <Kpi key={t.title} title={t.title} value={v.value} sub={v.sub} delta={t.change} label={label} />
              })}
            </div>
            {boxes['b-kpis']}
          </SlSection>

          <SlSection>
            <SlCard title="Results over time" meta={`${fmt(r.results)} results`} box={boxes['b-daily']}>
              <LineChart days={r.daily} color="#60FDFF" id="sl-gb" />
            </SlCard>
          </SlSection>

          <SlSection title="Sentiment">
            <div className={`${s.grid} ${s.g2}`}>
              <SlCard title="Share of sentiment" meta="All results" box={boxes['b-sent']} bodyClassName={s.donutWrap}>
                <Donut counts={r.sentiment.counts} />
                <Legend counts={r.sentiment.counts} pct={r.sentiment.pct} changes={r.sentiment.change} label={label} />
              </SlCard>
              {view.show.owned && r.owned && (
                <SlCard title="Without brand-owned channels" meta={`${fmt(r.owned.total)} results`} box={boxes['b-owned']} bodyClassName={s.donutWrap}
                  note="Drops posts from the brand's own accounts, so this is what everyone else said.">
                  <Donut counts={r.owned.counts} />
                  <Legend counts={r.owned.counts} pct={r.owned.pct} />
                </SlCard>
              )}
            </div>
            <SlCard title="Sentiment by media type" meta="Results per media type" box={boxes['b-cross']}>
              <HBars rows={r.cross} />
            </SlCard>
          </SlSection>

          <SlSection title="Year to date" line={`Earlier months as presented in each month's report; ${monthName(view.month)} from this export`}>
            <SlCard title={`Sentiment, ${ytdSpan(r.ytd, view.month)}`} meta="% of results" box={boxes['b-ytd']}>
              <YtdColumns points={ytd} aria={`Brand sentiment by month, ${ytdSpan(r.ytd, view.month)}`} />
            </SlCard>
            <div className={`${s.grid} ${s.g2}`}>
              <SlCard title="Positive + neutral combined" meta="% of results" box={boxes['b-posneu']}>
                <PointLines months={posNeuPoints.map((p) => p.month)} series={[
                  { name: 'Positive + neutral', vals: posNeuPoints.map((p) => p.value), color: SENTIMENT_COLORS.pos },
                  { name: 'Negative', vals: ytd.map((p) => p.value?.neg ?? null), color: SENTIMENT_COLORS.neg, below: true },
                ]} />
              </SlCard>
              {r.reddit && (
                <SlCard title="Reddit sentiment" meta="% of Reddit results" box={boxes['b-reddit']}>
                  <YtdColumns points={fromFirst(r.reddit)} aria="Reddit sentiment by month" />
                </SlCard>
              )}
            </div>
          </SlSection>

          <SlSection title="Media types">
            <SlCard title="Share of media types" meta={`Change vs the ${monthName(prevKey(view.month))} export`} box={boxes['b-media']}>
              <MediaShare rows={r.media} />
            </SlCard>
          </SlSection>
        </>
      )}

      <SlSection title="Themes">
        {r && (
          <SlCard title="Keyword themes" meta="Size = share of results" box={boxes['b-themes']}>
            <Cloud themes={r.themes} colorFor={(t) => t.color} />
            <Key items={[{ name: 'Mostly positive', color: SENTIMENT_COLORS.pos }, { name: 'Mostly neutral', color: SENTIMENT_COLORS.neu }, { name: 'Mostly negative', color: SENTIMENT_COLORS.neg }]} />
          </SlCard>
        )}
        {view.show.trends && (
          <SlCard title="Trends in keyword themes" meta={`vs ${monthName(prevKey(view.month))}, from Talkwalker`} box={boxes['b-trends']}>
            <TrendsBlock lists={view.trends.lists} draft={view.trends.draft} clientSlug={clientSlug} range={range} caps={caps} />
          </SlCard>
        )}
      </SlSection>

      <AnalysisOnly title="Top conversation themes" show={view.show.conv} box={boxes['b-conv']} />

      {r && r.influencers.length > 0 && (
        <SlSection title="Top influencers">
          {r.overview.length > 0 && (
            <div className={`${s.grid} ${s.g4}`}>
              {r.overview.map((o) => (
                <div key={o.label} className={s.ov} data-export-block="">
                  <p className={s.t}>{o.label}</p>
                  <p className={s.who}>{o.who}</p>
                  <p className={s.net}>{o.network}</p>
                  <p className={s.val}>{short(o.value)} {o.unit.toLowerCase()}</p>
                </div>
              ))}
            </div>
          )}
          <SlCard title={`Top ${r.influencers.length} authors`} meta="Posts, sentiment, reach and engagement" box={boxes['b-authors']}>
            <div className={s.tableScroll}>
              <table className={s.table}>
                <thead><tr>
                  <th>Author</th><th>Network</th><th className={s.r}>Posts</th><th className={s.r}>vs {monthName(prevKey(view.month)).slice(0, 3)}</th>
                  <th>Sentiment</th><th className={s.r}>Reach</th><th className={s.r}>Engagement</th>
                </tr></thead>
                <tbody>
                  {r.influencers.map((i) => {
                    const total = i.pos + i.neu + i.neg
                    return (
                      <tr key={i.authorId}>
                        <td><b>{i.name}</b></td>
                        <td>{networkLabel(i.network)}</td>
                        <td className={s.r}>{fmt(i.posts)}</td>
                        <td className={s.r}>{i.change === null ? <span className={s.flat}>new</span> : <span className={i.change > 0 ? s.up : i.change < 0 ? s.down : s.flat}>{i.change > 0 ? '+' : i.change < 0 ? '-' : ''}{Math.abs(i.change)}</span>}</td>
                        <td>
                          <span className={s.mini} role="img" aria-label={`${i.pos} positive, ${i.neu} neutral, ${i.neg} negative`}>
                            {total > 0 && MINI.map((k) => (i[k] > 0 ? <i key={k} style={{ width: `${(100 * i[k]) / total}%`, background: SENTIMENT_COLORS[k] }} /> : null))}
                          </span>
                        </td>
                        <td className={s.r}>{short(i.reach)}</td>
                        <td className={s.r}>{fmt(i.engagement)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </SlCard>
        </SlSection>
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
