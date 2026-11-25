// The Top influencers section (plan docs/superpowers/plans/2026-11-24-social-listening-feedback.md, Unit F; spec F11): the
// overview cards and the authors table, as the view model decided them. A client sees only the authors and cards the team
// left shown for the month; staff see every one, with Show / Hide. The sort is for every viewer; the PDF prints the order
// on screen without the buttons. Reach and engagement per mention are on every deck's table (Q4). Server component.
import type { ReactNode } from 'react'
import { SENTIMENT_COLORS } from '@/lib/organic-social/social-listening/colors'
import type { SlAuthorSort } from '@/lib/organic-social/social-listening/picks'
import type { SlReadyView } from '@/lib/organic-social/social-listening/view-model'
import { SlCard, SlSection } from '../design/frames'
import { AuthorSortControl, PickToggle } from './authors-controls'
import { slCardTooltip } from '@/lib/organic-social/social-listening/tooltips'
import s from '../design/kit.module.css'
import f from '../design/frames.module.css'

const MINI: ('pos' | 'neu' | 'neg')[] = ['pos', 'neu', 'neg']
const fmt = (n: number) => Math.round(n).toLocaleString('en-US')
const short = (v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : fmt(v))
/** Engagement per mention is small (a few per post), so it keeps one decimal. */
const oneDecimal = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 1 })

export function AuthorsSection({ r, prevShort, networkLabel, caps, clientSlug, range, sort, exporting, box }: {
  r: SlReadyView
  /** "Sep": the change column's heading. */
  prevShort: string
  networkLabel: (raw: string) => string
  caps: { canEdit: boolean }
  clientSlug: string
  range: string
  sort: SlAuthorSort
  exporting: boolean
  box: ReactNode
}) {
  if (r.influencers.length === 0) return null
  const editing = caps.canEdit && !exporting
  const shown = r.influencers.filter((i) => i.shown).length
  return (
    <SlSection title="Top influencers">
      {r.overview.length > 0 && (
        <div className={`${s.grid} ${s.g4}`}>
          {r.overview.map((o) => (
            <div key={o.label} className={`${s.ov}${o.shown ? '' : ` ${f.dim}`}`} data-export-block="">
              <p className={s.t}>{o.label}</p>
              <p className={s.who}>{o.who}</p>
              <p className={s.net}>{o.network}</p>
              <p className={s.val}>{short(o.value)} {o.unit.toLowerCase()}</p>
              {editing && (
                <p className={f.pickRow}>
                  {!o.shown && <span className={f.hiddenTag}>Hidden from the client</span>}
                  <PickToggle clientSlug={clientSlug} range={range} kind="card" itemKey={o.label} shown={o.shown} name={o.label} />
                </p>
              )}
            </div>
          ))}
        </div>
      )}
      <SlCard title={`Top ${shown} author${shown === 1 ? '' : 's'}`}
        meta={editing ? `${shown} of ${r.influencers.length} shown to the client` : 'Posts, sentiment, reach and engagement'} box={box} tooltip={slCardTooltip('b-authors')}>
        {!exporting && <AuthorSortControl sort={sort} />}
        <div className={s.tableScroll}>
          <table className={s.table}>
            <thead><tr>
              <th>Author</th><th>Network</th><th className={s.r}>Posts</th><th className={s.r}>vs {prevShort}</th>
              <th>Sentiment</th><th className={s.r}>Reach</th><th className={s.r}>Reach per mention</th>
              <th className={s.r}>Engagement</th><th className={s.r}>Engagement per mention</th>
              {editing && <th>Client</th>}
            </tr></thead>
            <tbody>
              {r.influencers.map((i) => {
                const total = i.pos + i.neu + i.neg
                return (
                  <tr key={i.authorId} className={i.shown ? undefined : f.dim}>
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
                    <td className={s.r}>{i.reachPer === null ? 'n/a' : short(i.reachPer)}</td>
                    <td className={s.r}>{fmt(i.engagement)}</td>
                    <td className={s.r}>{i.engagementPer === null ? 'n/a' : oneDecimal(i.engagementPer)}</td>
                    {editing && (
                      <td><PickToggle clientSlug={clientSlug} range={range} kind="author" itemKey={i.authorId} shown={i.shown} name={i.name} /></td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </SlCard>
    </SlSection>
  )
}
