// components/report-sections/commentary/index.tsx
import { auth } from '@/auth'
import { getClientBySlug, getCommentaryForView } from '@/lib/db/queries'
import { canEditCommentary, canApproveCommentary } from '@/lib/commentary/permissions'
import { visibleEntries, pickDefaultEntry } from '@/lib/commentary/select'
import type { CommentaryViewKey } from '@/lib/commentary/views'
import { CommentaryPanel } from './commentary-panel'

export async function CommentarySection({ clientSlug, viewKey }: { clientSlug: string; viewKey: CommentaryViewKey }) {
  const [session, client] = await Promise.all([auth(), getClientBySlug(clientSlug)])
  if (!client) return null

  const email = session?.user?.email ?? null
  const capabilities = { canEdit: canEditCommentary(email), canApprove: canApproveCommentary(email) }

  const all = await getCommentaryForView(client.id, viewKey)
  const visible = visibleEntries(all, capabilities)
  const initial = pickDefaultEntry(visible)

  // A client with nothing approved sees nothing. Avenue Z staff always get the
  // panel (so they can add the first entry).
  if (!capabilities.canEdit && !initial) return null

  return (
    <CommentaryPanel
      clientSlug={clientSlug}
      viewKey={viewKey}
      entries={visible}
      initialId={initial?.id ?? null}
      capabilities={capabilities}
    />
  )
}
