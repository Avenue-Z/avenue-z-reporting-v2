// components/report-sections/commentary/commentary-panel.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { CommentaryEditor } from './commentary-editor'
import { approveCommentary, revokeCommentary, deleteCommentaryDraft } from '@/app/actions/commentary'
import type { CommentaryEntry, CommentaryCapabilities, CommentaryPeriodHistory, CommentaryVersionTag } from '@/lib/commentary/types'
import type { CommentaryViewKey } from '@/lib/commentary/views'
import { INSIGHTS_LABELS, addText, emptyText as emptyDefault, type CommentaryLabels } from '@/lib/commentary/labels'
import { useExportMode } from '@/components/export/export-mode'
import kit from '@/components/report-sections/organic-social/design/kit.module.css'
import bx from './commentary-kit.module.css'

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

/** A panel button: the shared Button, or with the kit look the kit's small button (`plain`, `primary` for the add button,
 *  `ghost` for the quieter actions). Same text, same handler, same disabled state either way. */
function PanelButton({ look, tone = 'plain', onClick, disabled, children }: {
  look?: 'kit'; tone?: 'plain' | 'primary' | 'ghost'; onClick: () => void; disabled?: boolean; children: React.ReactNode
}) {
  if (look !== 'kit') return <Button onClick={onClick} disabled={disabled}>{children}</Button>
  const cls = tone === 'primary' ? `${kit.tbtn} ${kit.primary}` : tone === 'ghost' ? `${kit.tbtn} ${kit.ghost}` : kit.tbtn
  return <button type="button" className={cls} onClick={onClick} disabled={disabled}>{children}</button>
}

const TAG_STYLE: Record<CommentaryVersionTag, string> = {
  live: 'bg-green-500/15 text-green-400',
  superseded: 'bg-white/10 text-text-muted',
  deleted: 'bg-red-500/15 text-red-400',
  draft: 'bg-yellow-500/15 text-yellow-400',
}

export function CommentaryPanel({
  clientSlug,
  viewKey,
  entries,
  initialId,
  clientEntryId,
  capabilities,
  history,
  defaultPeriod,
  emptyText,
  entryNotes,
  labels = INSIGHTS_LABELS,
  look,
  periodLabel,
}: {
  clientSlug: string
  viewKey: CommentaryViewKey
  entries: CommentaryEntry[]
  initialId: string | null
  /** The entry a client opens on (worked out server-side); the PDF export prints it, whoever exports. */
  clientEntryId: string | null
  capabilities: CommentaryCapabilities
  history: CommentaryPeriodHistory[]
  defaultPeriod?: { start: string; end: string }
  emptyText?: string
  entryNotes?: Record<string, string>
  /** The box's words (title, button, empty line). Absent: Insights, the box formerly titled Commentary. */
  labels?: CommentaryLabels
  /** The design kit's look (commentary@2 and recommendations@2, Organic Social only; CommentarySection decides): the kit's
   *  frame, label, buttons, badges and body style. Every behaviour is the same. Absent: exactly as before. */
  look?: 'kit'
  /** A snapshot-bound box (Technical Audit): names the one snapshot the box is for, e.g. 'Snapshot: Nov 1, 2026'. The
   *  editor hides its date inputs and saves `defaultPeriod`; the entry shows this in place of the period range. */
  periodLabel?: string
}) {
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  // The user's explicit dropdown pick, or null to follow the RSC's default (newest).
  // Clearing it on save auto-lands selection on the freshly-created/newest entry —
  // no state-sync effect needed.
  const [userSelectedId, setUserSelectedId] = useState<string | null>(null)
  const [editing, setEditing] = useState<null | 'new' | string>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const selectedId = userSelectedId ?? initialId
  const selected = entries.find((e) => e.id === selectedId) ?? null
  const exportMode = useExportMode()

  if (exportMode) return <ExportCommentary entry={entries.find((e) => e.id === clientEntryId) ?? null} title={labels.title} periodLabel={periodLabel} {...(look ? { look } : {})} />
  const K = look === 'kit'

  function refresh() {
    setEditing(null)
    // The action's updateTag already sends the re-rendered page back with its response, so this refresh
    // renders it a second time. Kept on purpose for now; it goes when every save path drops it together.
    router.refresh()
  }
  function doApprove(id: string) { startTransition(async () => { await approveCommentary(clientSlug, id); refresh() }) }
  function doRevoke(id: string) { startTransition(async () => { await revokeCommentary(clientSlug, id); refresh() }) }
  function doDelete(id: string) {
    if (!window.confirm('Delete this draft? It stays recoverable in the approver history log.')) return
    // Unlike approve/revoke, the selected row itself vanishes here — clear the manual
    // selection (same as handleSaved) so it falls back to the RSC's recomputed default
    // instead of stranding the panel on a now-nonexistent id.
    startTransition(async () => { await deleteCommentaryDraft(clientSlug, id); setUserSelectedId(null); refresh() })
  }

  // After a save (Add or a fork-on-edit), clear the manual selection so the panel
  // follows the RSC's recomputed newest entry — surfacing a freshly created draft.
  function handleSaved() {
    setUserSelectedId(null)
    setEditing(null)
    router.refresh()
  }

  // The kit's empty box (Organic Social design round 3, Task 8): with nothing written and no history to open, only the
  // artifact's dashed add button, the one Social Listening's empty box draws. It does what Add does: the full panel with
  // the editor opens. A client never gets here (the server returns nothing for a client with nothing approved).
  if (K && capabilities.canEdit && editing === null && entries.length === 0 && !(capabilities.canApprove && history.length > 0)) {
    return (
      <div className={`mb-8 ${kit.root} ${kit.tight}`}>
        <button type="button" className={`${kit.tbtn} ${kit.addAnalysis}`} onClick={() => setEditing('new')}>+ {addText(labels)}</button>
      </div>
    )
  }

  return (
    <section className={K ? `${kit.root} ${kit.tight} ${bx.box} mb-8` : 'mb-8 rounded-lg border border-white/[0.08] bg-bg-surface'}>
      <div className="flex items-center justify-between p-4">
        <button type="button" onClick={() => setCollapsed((c) => !c)}
          className={K ? `flex items-center gap-2 ${kit.lbl}${capabilities.canEdit ? '' : ` ${bx.lblClient}`}` : 'flex items-center gap-2 text-sm font-extrabold text-white'}>
          <span>{collapsed ? '▸' : '▾'}</span> {labels.title}
        </button>
        {capabilities.canEdit && editing === null && (
          <PanelButton look={look} tone="primary" onClick={() => setEditing('new')}>{addText(labels)}</PanelButton>
        )}
      </div>

      {!collapsed && (
        <div className="space-y-4 px-4 pb-4">
          {editing === 'new' && (
            <CommentaryEditor key="new" clientSlug={clientSlug} viewKey={viewKey} onDone={handleSaved} defaultPeriod={defaultPeriod} outline={labels.outline} periodLabel={periodLabel} />
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

          {editing !== 'new' && !selected && <p className="text-sm text-text-muted">{emptyText ?? emptyDefault(labels)}</p>}

          {editing !== 'new' && selected && editing !== selected.id && (
            <article className="space-y-3">
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span className="text-text-muted">{periodLabel ?? `Reporting period: ${fmt(selected.periodStart)} – ${fmt(selected.periodEnd)}`}</span>
                {entryNotes?.[selected.id] && (
                  <span className={K ? kit.edited : 'rounded bg-white/10 px-2 py-0.5 font-semibold text-text-muted'}>{entryNotes[selected.id]}</span>
                )}
                {capabilities.canEdit && (
                  <span className={K ? (selected.status === 'approved' ? kit.approved : kit.whoTag) : `rounded px-2 py-0.5 font-semibold ${selected.status === 'approved' ? 'bg-green-500/15 text-green-400' : 'bg-yellow-500/15 text-yellow-400'}`}>
                    {selected.status === 'approved' ? 'Approved' : 'Draft'}
                  </span>
                )}
              </div>
              <div
                className={K ? kit.commBody : 'text-sm text-white [&_a]:underline [&_a]:text-blue-400 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_h3]:text-base [&_h3]:font-bold [&_p]:my-1'}
                dangerouslySetInnerHTML={{ __html: selected.bodyHtml }}
              />
              {capabilities.canEdit && (
                <p className="text-xs text-text-muted">
                  Last updated by {selected.updatedBy} on {fmtDateTime(selected.updatedAt)}
                  {selected.status === 'approved' && selected.approvedBy && (
                    <> · Approved by {selected.approvedBy}{selected.approvedAt ? ` on ${fmtDateTime(selected.approvedAt)}` : ''}</>
                  )}
                </p>
              )}
              {capabilities.canEdit && (
                <div className="flex flex-wrap items-center gap-2">
                  <PanelButton look={look} onClick={() => setEditing(selected.id)}>Edit</PanelButton>
                  {capabilities.canApprove && selected.status === 'draft' && (
                    <PanelButton look={look} onClick={() => doApprove(selected.id)} disabled={isPending}>Approve</PanelButton>
                  )}
                  {capabilities.canApprove && selected.status === 'approved' && (
                    <PanelButton look={look} tone="ghost" onClick={() => doRevoke(selected.id)} disabled={isPending}>Revoke</PanelButton>
                  )}
                  {selected.status === 'draft' && (
                    <PanelButton look={look} tone="ghost" onClick={() => doDelete(selected.id)} disabled={isPending}>Delete draft</PanelButton>
                  )}
                </div>
              )}
            </article>
          )}

          {editing !== 'new' && selected && editing === selected.id && (
            <CommentaryEditor key={selected.id} clientSlug={clientSlug} viewKey={viewKey} entry={selected} onDone={handleSaved} outline={labels.outline} defaultPeriod={defaultPeriod} periodLabel={periodLabel} />
          )}

          {capabilities.canApprove && history.length > 0 && (
            <div className="border-t border-white/[0.08] pt-3">
              <button
                type="button"
                onClick={() => setHistoryOpen((h) => !h)}
                className="flex items-center gap-2 text-xs font-semibold text-text-muted"
              >
                <span>{historyOpen ? '▾' : '▸'}</span>
                History ({history.reduce((n, g) => n + g.versions.length, 0)} versions)
              </button>

              {historyOpen && (
                <div className="mt-3 space-y-4">
                  {history.map((group) => (
                    <div key={`${group.periodStart}|${group.periodEnd}`} className="space-y-2">
                      <p className="text-xs font-semibold text-white">
                        {fmt(group.periodStart)} – {fmt(group.periodEnd)}
                      </p>
                      {group.versions.map(({ entry, tag }) => (
                        <div key={entry.id} className="rounded border border-white/[0.08] p-2">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className={`rounded px-2 py-0.5 font-semibold ${TAG_STYLE[tag]}`}>{tag}</span>
                            <span className="text-text-muted">
                              {entry.deletedAt
                                ? `deleted by ${entry.deletedBy} on ${fmtDateTime(entry.deletedAt)}`
                                : entry.approvedAt && entry.approvedBy
                                  ? `approved by ${entry.approvedBy} on ${fmtDateTime(entry.approvedAt)}`
                                  : `updated by ${entry.updatedBy} on ${fmtDateTime(entry.updatedAt)}`}
                            </span>
                          </div>
                          <div
                            className="mt-1 text-xs text-text-muted [&_p]:my-1"
                            dangerouslySetInnerHTML={{ __html: entry.bodyHtml }}
                          />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

/** Commentary as the PDF export prints it: what the client sees, whoever exports. The client's entry is worked out
 *  server-side with the client's own rules (index.tsx; monthly.tsx for a locked month, where a whole-month entry wins),
 *  not from `initialId`, which for staff is the newest entry including drafts. None, nothing. No controls; one block. */
function ExportCommentary({ entry: shown, title, look, periodLabel }: { entry: CommentaryEntry | null; title: string; look?: 'kit'; periodLabel?: string }) {
  if (!shown) return null
  const K = look === 'kit'
  return (
    <section data-export-block="" className={K ? `${kit.root} ${kit.tight} ${bx.box} mb-8 space-y-3 p-4` : 'mb-8 space-y-3 rounded-lg border border-white/[0.08] bg-bg-surface p-4'}>
      <h2 className={K ? `${kit.lbl} ${bx.lblClient}` : 'text-sm font-extrabold text-white'}>{title}</h2>
      <p className="text-xs text-text-muted">{periodLabel ?? `Reporting period: ${fmt(shown.periodStart)} – ${fmt(shown.periodEnd)}`}</p>
      <div
        className={K ? kit.commBody : 'text-sm text-white [&_a]:underline [&_a]:text-blue-400 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_h3]:text-base [&_h3]:font-bold [&_p]:my-1'}
        dangerouslySetInnerHTML={{ __html: shown.bodyHtml }}
      />
    </section>
  )
}
