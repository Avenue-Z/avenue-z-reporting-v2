import { getClientBySlug } from '@/lib/db/queries'
import { getAnnotationHides } from '@/lib/organic-social/annotation-hides/select'
import { applyHides } from '@/lib/organic-social/annotation-hides/apply'
import { canHideAnnotation } from '@/lib/organic-social/annotation-hides/permissions'
import type { Annotation, AnnotationChart, AnnotationControls } from '@/lib/organic-social/annotations'
import type { DashChannel } from '@/lib/organic-social/metrics'

/** Applies the team's hides to one chart's annotations. Clients get hidden annotations
 *  removed here, on the server; staff get them marked, plus the controls to change them.
 *  If the hides cannot be read (a transient error, or an environment without the
 *  migration), clients get none, so one the team hid is never shown by accident, and staff
 *  get all of them without controls. Logged either way. Skips the read when there is
 *  nothing to hide. */
export async function withHides(args: {
  clientSlug: string; channel: DashChannel; chart: AnnotationChart; role: string; items: Annotation[]
}): Promise<{ items: Annotation[]; controls?: AnnotationControls }> {
  if (args.items.length === 0) return { items: [] }
  const staff = canHideAnnotation(args.role)
  try {
    const client = await getClientBySlug(args.clientSlug)
    // No client row means the hides cannot be read at all: fail closed, exactly as the catch below,
    // so an annotation the team hid is never shown to a client by accident.
    if (!client) throw new Error(`no client row for ${args.clientSlug}`)
    const hidden = await getAnnotationHides(client.id, args.channel)
    return {
      items: applyHides(args.items, hidden, args.chart, staff ? 'staff' : 'client'),
      controls: staff ? { clientSlug: args.clientSlug, channel: args.channel, chart: args.chart } : undefined,
    }
  } catch (e) {
    console.error(
      `[organic-social] annotation hides unreadable for ${args.clientSlug} ${args.channel} ${args.chart}; ` +
        `${staff ? 'showing staff every annotation without controls' : 'showing the client none'}:`,
      (e as Error).message,
    )
    return { items: staff ? args.items : [] }
  }
}
