// components/report-sections/commentary/commentary-panel.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { CommentaryEditor } from './commentary-editor'
import { approveCommentary, revokeCommentary } from '@/app/actions/commentary'
import type { CommentaryEntry, CommentaryCapabilities } from '@/lib/commentary/types'
import type { CommentaryViewKey } from '@/lib/commentary/views'

function fmt(d: string): string {
  // 'YYYY-MM-DD' → 'Mon D, YYYY' without timezone drift.
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtDateTime(iso: string): string {
  // ISO timestamp → 'Mon D, YYYY, h:mm AM/PM' (local time).
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

export function CommentaryPanel({
  clientSlug,
  viewKey,
  entries,
  initialId,
  capabilities,
}: {
  clientSlug: string
  viewKey: CommentaryViewKey
  entries: CommentaryEntry[]
  initialId: string | null
  capabilities: CommentaryCapabilities
}) {
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  // The user's explicit dropdown pick, or null to follow the RSC's default (newest).
  // Clearing it on save auto-lands selection on the freshly-created/newest entry —
  // no state-sync effect needed.
  const [userSelectedId, setUserSelectedId] = useState<string | null>(null)
  const [editing, setEditing] = useState<null | 'new' | string>(null)
  const [isPending, startTransition] = useTransition()

  const selectedId = userSelectedId ?? initialId
  const selected = entries.find((e) => e.id === selectedId) ?? null

  function refresh() {
    setEditing(null)
    router.refresh() // re-runs the RSC; revalidateTag already busted the cache
  }
  function doApprove(id: string) { startTransition(async () => { await approveCommentary(clientSlug, id); refresh() }) }
  function doRevoke(id: string) { startTransition(async () => { await revokeCommentary(clientSlug, id); refresh() }) }

  // After a save (Add or a fork-on-edit), clear the manual selection so the panel
  // follows the RSC's recomputed newest entry — surfacing a freshly created draft.
  function handleSaved() {
    setUserSelectedId(null)
    setEditing(null)
    router.refresh()
  }

  return (
    <section className="mb-8 rounded-lg border border-white/[0.08] bg-bg-surface">
      <div className="flex items-center justify-between p-4">
        <button type="button" onClick={() => setCollapsed((c) => !c)} className="flex items-center gap-2 text-sm font-extrabold text-white">
          <span>{collapsed ? '▸' : '▾'}</span> Commentary
        </button>
        {capabilities.canEdit && editing === null && (
          <Button onClick={() => setEditing('new')}>Add commentary</Button>
        )}
      </div>

      {!collapsed && (
        <div className="space-y-4 px-4 pb-4">
          {editing === 'new' && (
            <CommentaryEditor key="new" clientSlug={clientSlug} viewKey={viewKey} onDone={handleSaved} />
          )}

          {editing !== 'new' && entries.length > 1 && (
            <select
              value={selectedId ?? ''}
              onChange={(e) => setUserSelectedId(e.target.value)}
              className="rounded border border-white/[0.08] bg-bg-base px-2 py-1 text-sm text-white"
            >
              {entries.map((e) => (
                <option key={e.id} value={e.id}>
                  {fmt(e.periodStart)} – {fmt(e.periodEnd)}{e.status === 'draft' ? ' (draft)' : ''}{e.id === initialId ? ' · latest' : ''}
                </option>
              ))}
            </select>
          )}

          {editing !== 'new' && !selected && <p className="text-sm text-text-muted">No commentary yet.</p>}

          {editing !== 'new' && selected && editing !== selected.id && (
            <article className="space-y-3">
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span className="text-text-muted">Reporting period: {fmt(selected.periodStart)} – {fmt(selected.periodEnd)}</span>
                <span className={`rounded px-2 py-0.5 font-semibold ${selected.status === 'approved' ? 'bg-green-500/15 text-green-400' : 'bg-yellow-500/15 text-yellow-400'}`}>
                  {selected.status === 'approved' ? 'Approved' : 'Draft'}
                </span>
              </div>
              <div
                className="text-sm text-white [&_a]:underline [&_a]:text-blue-400 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_h3]:text-base [&_h3]:font-bold [&_p]:my-1"
                dangerouslySetInnerHTML={{ __html: selected.bodyHtml }}
              />
              <p className="text-xs text-text-muted">
                Last updated by {selected.updatedBy} on {fmtDateTime(selected.updatedAt)}
                {selected.status === 'approved' && selected.approvedBy && (
                  <> · Approved by {selected.approvedBy}{selected.approvedAt ? ` on ${fmtDateTime(selected.approvedAt)}` : ''}</>
                )}
              </p>
              {capabilities.canEdit && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button onClick={() => setEditing(selected.id)}>Edit</Button>
                  {capabilities.canApprove && selected.status === 'draft' && (
                    <Button onClick={() => doApprove(selected.id)} disabled={isPending}>Approve</Button>
                  )}
                  {capabilities.canApprove && selected.status === 'approved' && (
                    <Button onClick={() => doRevoke(selected.id)} disabled={isPending}>Revoke</Button>
                  )}
                </div>
              )}
            </article>
          )}

          {editing !== 'new' && selected && editing === selected.id && (
            <CommentaryEditor key={selected.id} clientSlug={clientSlug} viewKey={viewKey} entry={selected} onDone={handleSaved} />
          )}
        </div>
      )}
    </section>
  )
}
