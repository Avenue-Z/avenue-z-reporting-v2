import { getClientBySlug } from '@/lib/db/queries'
import { getChartNotes } from '@/lib/organic-social/chart-notes/select'
import { notesByDay, type DayNote } from '@/lib/organic-social/chart-notes/pick'
import { noteCapabilities } from '@/lib/organic-social/chart-notes/permissions'
import { hasReportingMonths } from '@/lib/organic-social/reporting-months'
import { dayLabel, thumbOf, topPostByDate } from '@/lib/organic-social/annotations'
import type { Annotation, AnnotationChart, NoteControls } from '@/lib/organic-social/annotations'
import type { TopContentPost } from '@/lib/organic-social/content-types'
import type { DashChannel } from '@/lib/organic-social/metrics'
import type { TrendSeries } from '@/lib/organic-social/types'

/** Every yyyy-mm-dd from `from` to `to`, inclusive, in UTC. A window is a month; the cap only
 *  stops a malformed range from running long. */
export function windowDays(from: string, to: string): string[] {
  const out: string[] = []
  for (const d = new Date(`${from}T00:00:00Z`); out.length < 400; d.setUTCDate(d.getUTCDate() + 1)) {
    const day = d.toISOString().slice(0, 10)
    if (day > to) break
    out.push(day)
  }
  return out
}

function attach(a: Annotation, dn: DayNote | undefined, dayPosts: TopContentPost[]): Annotation {
  if (!dn) return a
  // A pick counts only if it is one of this day's posts in Dash's answer; the rest are skipped.
  const picks = (dn.approved?.postIds ?? [])
    .map((id) => dayPosts.find((p) => p.id === id))
    .filter((p): p is TopContentPost => !!p)
  return { ...a, note: { text: dn.approved?.text ?? null, posts: picks, ...(dn.editor ? { editor: dn.editor } : {}) } }
}

/** Merges the team's notes into one chart's annotations, before the hides layer runs, so a hide on
 *  a day still removes its note from the client. A note on a peak day joins it; a note on any other
 *  day becomes its own item, labelled with the date alone. Editors also get the form's controls.
 *
 *  Fails closed, as hides do for clients (parts/annotation-hides.ts:29-36): if the notes cannot be
 *  read, nobody sees a note, editors get no controls, the graph renders as it did before notes, and
 *  the error is logged with the client, platform and chart. */
export async function withNotes(args: {
  clientSlug: string; channel: DashChannel; chart: AnnotationChart; role: string; email: string | null
  series: TrendSeries; from: string; to: string; today: string
  items: Annotation[]; posts: TopContentPost[] | null
}): Promise<{ items: Annotation[]; controls?: NoteControls }> {
  const caps = noteCapabilities(args.role, args.email)
  try {
    const client = await getClientBySlug(args.clientSlug)
    if (!client) throw new Error(`no client row for ${args.clientSlug}`)
    // Notes are only for clients on locked months. Renaissance is not, so its graphs never read
    // the table, whoever renders them. Not an error: nothing to log.
    if (!hasReportingMonths(client)) return { items: args.items }
    const rows = await getChartNotes(client.id, args.channel)
    const byDay = notesByDay(rows, { chart: args.chart, from: args.from, to: args.to, canEdit: caps.canEdit })
    const posts = args.posts ?? []
    const postsOn = (day: string) => posts.filter((p) => p.publishedAt === day)
    const key = args.series.channels[0]
    const values = new Map(args.series.points.map((p) => [String(p.date), Number(key ? p[key] : NaN)]))
    const top = topPostByDate(posts)

    const items = args.items.map((a) => attach(a, byDay.get(a.date), postsOn(a.date)))
    for (const [day, dn] of byDay) {
      if (items.some((a) => a.date === day)) continue
      const v = values.get(day)
      items.push(attach(
        { date: day, value: v !== undefined && Number.isFinite(v) ? v : 0, label: dayLabel(day), post: top.get(day) ?? null, noteOnly: true },
        dn,
        postsOn(day),
      ))
    }
    items.sort((x, y) => x.date.localeCompare(y.date))

    if (!caps.canEdit) return { items }
    const last = args.today < args.to ? args.today : args.to
    return {
      items,
      controls: {
        clientSlug: args.clientSlug, channel: args.channel, chart: args.chart, canApprove: caps.canApprove,
        // Phase 2b: the Add annotation panel starts from a post, so only days with at least one post.
        days: windowDays(args.from, last)
          .filter((day) => postsOn(day).length > 0)
          .map((day) => ({ day, posts: postsOn(day).map((p) => ({ id: p.id, thumb: thumbOf(p) })) })),
      },
    }
  } catch (e) {
    console.error(
      `[organic-social] chart notes unreadable for ${args.clientSlug} ${args.channel} ${args.chart}; showing none:`,
      (e as Error).message,
    )
    return { items: args.items }
  }
}
