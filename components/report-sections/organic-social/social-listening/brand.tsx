// The brand topic, in the approved mockup's order (spec docs/superpowers/specs/2026-11-19-social-listening-tab-design.md,
// section 9): data tiles, results over time, sentiment, year to date, media types, themes, trends, top conversation
// themes, top influencers, most relevant posts, key takeaways, keyword appendix. Renders a view-model.ts SlTopicView and
// decides nothing itself. Server component.
import type { ReactNode } from 'react'
import { KpiCard } from '@/components/charts/kpi-card'
import type { SlBoxId } from '@/lib/organic-social/social-listening/boxes'
import { num, pctText, short } from '@/lib/organic-social/social-listening/format'
import { SENTIMENT_COLORS } from '@/lib/organic-social/social-listening/colors'
import type { SlTile, SlTopicView } from '@/lib/organic-social/social-listening/view-model'
import { PointsDelta, SlCard, SlSection } from './cards'
import { DailyResults, SentimentDonut, YtdPosNeu, YtdStacked } from './charts'
import { KeywordCloud } from './cloud'
import { PostsSection } from './posts'
import { MediaShare, SentimentBars, SentimentKey } from './sentiment-bars'
import { TrendsBlock } from './trends'

export type TopicPageProps = {
  view: SlTopicView
  boxes: Partial<Record<SlBoxId, ReactNode>>
  clientSlug: string
  range: string
  caps: { canEdit: boolean; canApprove: boolean }
  /** Staff controls placed where a missing upload would be (the upload control). */
  upload: ReactNode
  topicName: string
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const monthName = (key: string) => MONTH_NAMES[Number(key.slice(5, 7)) - 1]

export function tileValue(t: SlTile): { value: string; sub?: string } {
  if (t.value === null) return { value: 'n/a' }
  if (t.unit === '%') return { value: pctText(t.value) }
  if (t.title === 'Engagement' || t.title === 'Potential reach') return { value: short(t.value), sub: `${num(t.value)} exact` }
  return { value: num(t.value) }
}

export function SentimentLegend({ view }: { view: SlTopicView }) {
  const r = view.ready!
  return (
    <ul className="space-y-2 text-sm">
      {(['pos', 'neu', 'neg'] as const).map((k) => (
        <li key={k}>
          <div className="flex justify-between gap-3">
            <span className="text-white">{{ pos: 'Positive', neu: 'Neutral', neg: 'Negative' }[k]} <span className="text-xs text-text-muted">({num(r.sentiment.counts[k])})</span></span>
            <span className="tabular-nums font-semibold text-white">{pctText(r.sentiment.pct[k])}</span>
          </div>
          <PointsDelta value={r.sentiment.change[k]} label={r.changeLabel} kind={k} />
        </li>
      ))}
    </ul>
  )
}

/** The sections every topic shows after its data, staff always and a client only when there is something approved. */
export function AnalysisOnly({ title, show, box }: { title: string; show: boolean; box: ReactNode }) {
  if (!show || !box) return null
  return <SlSection title={title}><div data-export-block="">{box}</div></SlSection>
}

export function BrandPage({ view, boxes, clientSlug, range, caps, upload, topicName }: TopicPageProps) {
  const r = view.ready
  return (
    <div className="space-y-10">
      {upload}
      {r && (
        <>
          <SlSection title="Data">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {r.tiles.map((t) => {
                const v = tileValue(t)
                return (
                  <KpiCard key={t.title} title={t.title} value={v.value} subValue={v.sub} wholeDelta comparisonExpected
                    deltaLabel={r.changeLabel} {...(t.change !== undefined ? { delta: t.change } : {})} />
                )
              })}
            </div>
            {boxes['b-kpis']}
          </SlSection>

          <SlCard title="Results over time" meta={`${num(r.results)} results in ${monthName(view.month)}`} box={boxes['b-daily']}>
            <DailyResults days={r.daily} />
          </SlCard>

          <SlSection title="Sentiment">
            <div className="grid gap-4 lg:grid-cols-2">
              <SlCard title="Share of sentiment" meta="All results" box={boxes['b-sent']}>
                <div className="grid items-center gap-4 sm:grid-cols-2"><SentimentDonut counts={r.sentiment.counts} /><SentimentLegend view={view} /></div>
              </SlCard>
              {view.show.owned && r.owned && (
                <SlCard title="Without brand-owned channels" meta={`${num(r.owned.total)} results`} box={boxes['b-owned']}
                  note="Leaves out posts from the brand's own accounts, so this is what everyone else said.">
                  <div className="grid items-center gap-4 sm:grid-cols-2">
                    <SentimentDonut counts={r.owned.counts} />
                    <ul className="space-y-1 text-sm">
                      {(['pos', 'neu', 'neg'] as const).map((k) => (
                        <li key={k} className="flex justify-between gap-3"><span className="text-white">{{ pos: 'Positive', neu: 'Neutral', neg: 'Negative' }[k]} <span className="text-xs text-text-muted">({num(r.owned!.counts[k])})</span></span><span className="tabular-nums font-semibold text-white">{pctText(r.owned!.pct[k])}</span></li>
                      ))}
                    </ul>
                  </div>
                </SlCard>
              )}
            </div>
            <SlCard title="Sentiment by media type" meta="Results per media type" box={boxes['b-cross']}>
              <SentimentBars rows={r.cross} />
            </SlCard>
          </SlSection>

          <SlSection title="Year to date" line={`Earlier months as presented in each month's report; ${monthName(view.month)} from this export`}>
            <SlCard title={`Sentiment, ${ytdSpan(r.ytd, view.month)}`} meta="% of results" box={boxes['b-ytd']}>
              <YtdStacked points={fromFirst(r.ytd)} /><SentimentKey />
            </SlCard>
            <div className="grid gap-4 lg:grid-cols-2">
              <SlCard title="Positive + neutral combined" meta="% of results" box={boxes['b-posneu']}>
                <YtdPosNeu points={fromFirst(r.posNeu, r.ytd)} negative={fromFirst(r.ytd)} />
                <SentimentKey labels={['Positive + neutral', 'Negative']} />
              </SlCard>
              {r.reddit && (
                <SlCard title="Reddit sentiment" meta="% of Reddit results" box={boxes['b-reddit']}>
                  <YtdStacked points={fromFirst(r.reddit)} /><SentimentKey />
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
            <KeywordCloud themes={r.themes} kind="sentiment" />
          </SlCard>
        )}
        {view.show.trends && (
          <SlCard title="Trends in keyword themes" meta={`vs ${monthName(prevKey(view.month))}, from the Talkwalker dashboard`} box={boxes['b-trends']}>
            <TrendsBlock lists={view.trends.lists} draft={view.trends.draft} clientSlug={clientSlug} range={range} caps={caps} />
          </SlCard>
        )}
      </SlSection>

      <AnalysisOnly title="Top conversation themes" show={view.show.conv} box={boxes['b-conv']} />

      {r && r.influencers.length > 0 && (
        <SlSection title="Top influencers">
          {r.overview.length > 0 && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {r.overview.map((o) => (
                <div key={o.label} data-export-block="" className="rounded-lg border border-white/[0.06] bg-bg-surface px-4 py-3">
                  <p className="text-xs text-text-muted">{o.label}</p>
                  <p className="mt-1 truncate font-bold text-white" title={o.who}>{o.who}</p>
                  <p className="text-xs text-text-muted">{o.network}</p>
                  <p className="mt-1 text-sm font-semibold text-white">{short(o.value)} {o.unit}</p>
                </div>
              ))}
            </div>
          )}
          <SlCard title={`Top ${r.influencers.length} authors`} meta="Posts, sentiment, reach and engagement" box={boxes['b-authors']}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-text-muted">
                  <th className="py-1 font-semibold">Author</th><th className="font-semibold">Network</th><th className="text-right font-semibold">Posts</th>
                  <th className="text-right font-semibold">vs {monthName(prevKey(view.month)).slice(0, 3)}</th><th className="pl-4 font-semibold">Sentiment</th><th className="text-right font-semibold">Reach</th><th className="text-right font-semibold">Engagement</th>
                </tr></thead>
                <tbody>
                  {r.influencers.map((i) => (
                    <tr key={i.authorId} className="border-t border-white/[0.04]">
                      <td className="py-1.5 font-semibold text-white">{i.name}</td>
                      <td className="text-text-muted">{i.network}</td>
                      <td className="text-right tabular-nums text-white">{num(i.posts)}</td>
                      <td className="text-right tabular-nums">{i.change === null ? <span className="text-text-muted">new</span> : <span className="text-white">{i.change > 0 ? `+${i.change}` : i.change}</span>}</td>
                      <td className="pl-4"><AuthorSentiment pos={i.pos} neu={i.neu} neg={i.neg} /></td>
                      <td className="text-right tabular-nums text-white">{short(i.reach)}</td>
                      <td className="text-right tabular-nums text-white">{num(i.engagement)}</td>
                    </tr>
                  ))}
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

      {r && <p className="text-xs text-text-muted">Source: Talkwalker export of the topic &quot;{topicName}&quot;, {monthName(view.month)} {view.month.slice(0, 4)}.</p>}
    </div>
  )
}

/** One author's positive, neutral and negative posts as a small stacked bar (the approved mockup's authors table). */
function AuthorSentiment({ pos, neu, neg }: { pos: number; neu: number; neg: number }) {
  const total = pos + neu + neg
  return (
    <span className="flex h-2 w-24 overflow-hidden rounded-full bg-white/[0.06]" role="img" aria-label={`${pos} positive, ${neu} neutral, ${neg} negative`}>
      {total > 0 && ([['pos', pos], ['neu', neu], ['neg', neg]] as const).map(([k, v]) => (v > 0 ? <i key={k} style={{ width: `${(100 * v) / total}%`, background: SENTIMENT_COLORS[k] }} /> : null))}
    </span>
  )
}

/** A year to date series from its first month with data (the artifact's industry chart starts in May), so months
 *  before any data are not drawn as empty columns; a gap after that stays a gap. `by` decides the start for a series
 *  drawn beside another (positive + neutral beside the split). */
export function fromFirst<T extends { value: unknown }>(points: T[], by: { value: unknown }[] = points): T[] {
  const i = by.findIndex((p) => p.value !== null && p.value !== undefined)
  return i <= 0 ? points : points.slice(i)
}

/** "January to October", "May to October" when the data starts in May, or just "October" when it is the only month. */
export function ytdSpan(points: { month: string; value: unknown }[], month: string): string {
  const first = fromFirst(points)[0]?.month ?? month
  return first === month ? monthName(month) : `${monthName(first)} to ${monthName(month)}`
}

function prevKey(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}
