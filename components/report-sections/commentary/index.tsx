// components/report-sections/commentary/index.tsx
import { auth } from '@/auth'
import { getClientBySlug, getCommentaryForView } from '@/lib/db/queries'
import { canEditCommentary, canApproveCommentary } from '@/lib/commentary/permissions'
import { visibleEntries, pickDefaultEntry, historyEntries, toClientSafeEntry } from '@/lib/commentary/select'
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

  // #148 is a server-side gate, not a render-only one. The panel hides attribution
  // behind capabilities.canEdit, but props cross the RSC→client boundary regardless
  // of what renders — so for a non-editor the staff emails and edit/approve
  // timestamps must be stripped HERE, before they become props. Done after
  // pickDefaultEntry so selection still tie-breaks on the real updatedAt.
  const entries = capabilities.canEdit ? visible : visible.map(toClientSafeEntry)

  // THE SECURITY BOUNDARY. historyEntries returns [] for a non-approver, so superseded
  // and deleted bodies are never serialized into the browser bundle. Gating this in the
  // panel's JSX instead would still ship them — props cross the boundary regardless of
  // what renders. Do not move this check into CommentaryPanel.
  const history = historyEntries(all, capabilities)

  // A client with nothing approved sees nothing. Avenue Z staff always get the
  // panel (so they can add the first entry).
  if (!capabilities.canEdit && !initial) return null

  return (
    <CommentaryPanel
      clientSlug={clientSlug}
      viewKey={viewKey}
      entries={entries}
      initialId={initial?.id ?? null}
      capabilities={capabilities}
      history={history}
    />
  )
}
