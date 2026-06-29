'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useRouter as _useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { updateBlockText, updateLabelOverride } from '@/app/actions/dashboard'
import type { EditTarget } from '@/lib/dashboard/types'

// Safe wrapper: returns a no-op refresh when called outside the Next.js App
// Router context (e.g. in renderToString unit tests).
function useRouter() {
  try {
    return _useRouter()
  } catch (e) {
    // Bare renderToString (unit tests) has no App Router provider. In the real
    // app the provider is always present (SSR + client), so a throw here only
    // happens in tests. Re-throw on the client to surface genuine routing errors
    // rather than silently no-op'ing a refresh (which would leave stale data).
    if (typeof window !== 'undefined') throw e
    return { refresh: () => {} } as ReturnType<typeof _useRouter>
  }
}

export interface EditableTextProps {
  value: string
  slug: string
  target: EditTarget
  canEdit: boolean
  multiline?: boolean
  /** View-mode element so styling matches the site (default 'span'). */
  as?: 'h1' | 'h2' | 'h3' | 'p' | 'span' | 'div'
  className?: string
  placeholder?: string
  /** Pre-rendered view content (e.g. markdown). Edit mode always edits `value`. */
  viewNode?: ReactNode
}

export function EditableText({
  value, slug, target, canEdit, multiline = false, as = 'span', className, placeholder, viewNode,
}: EditableTextProps) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [optimistic, setOptimistic] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  // Drop the optimistic value once the server value catches up (after refresh).
  useEffect(() => { setOptimistic(null) }, [value])

  const shown = optimistic ?? value
  const Tag = as

  // Non-editor (or anyone in view mode): plain render, no interactivity.
  if (!canEdit) {
    return <Tag className={className}>{viewNode ?? (shown || placeholder)}</Tag>
  }

  async function commit() {
    setEditing(false)
    const isName = target.kind === 'blockText' && target.field === 'name'
    const next = isName ? draft.trim() : draft
    if (next === value) return
    if (isName && next === '') { setDraft(value); return }
    setOptimistic(next)
    setPending(true)
    const res = target.kind === 'blockText'
      ? await updateBlockText(slug, target.blockId, target.field, next)
      : await updateLabelOverride(slug, target, next)
    setPending(false)
    if (!res.ok) { setOptimistic(null); setDraft(value); return }
    router.refresh()
  }

  if (editing) {
    const common = {
      autoFocus: true,
      value: draft,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.target.value),
      onBlur: commit,
      className: cn('w-full rounded border border-white/20 bg-bg-surface px-1 text-inherit', className),
    }
    return multiline ? (
      <textarea
        {...common}
        rows={6}
        onKeyDown={(e) => { if (e.key === 'Escape') { setDraft(value); setEditing(false) } }}
      />
    ) : (
      <input
        {...common}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); void commit() }
          if (e.key === 'Escape') { setDraft(value); setEditing(false) }
        }}
      />
    )
  }

  return (
    <Tag
      className={cn(className, 'cursor-text rounded hover:bg-white/[0.06]', pending && 'opacity-60')}
      title="Click to edit"
      onClick={() => { setDraft(shown); setEditing(true) }}
    >
      {viewNode ?? (shown || <span className="italic text-text-muted">{placeholder ?? 'Click to edit'}</span>)}
    </Tag>
  )
}
