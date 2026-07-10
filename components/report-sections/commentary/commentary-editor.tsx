'use client'

import { useState, useTransition } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import { Button } from '@/components/ui/button'
import { saveCommentary } from '@/app/actions/commentary'
import type { CommentaryEntry } from '@/lib/commentary/types'
import type { CommentaryViewKey } from '@/lib/commentary/views'

const CONTENT_CLASS =
  'min-h-[8rem] p-3 text-sm text-white focus:outline-none [&_a]:underline [&_a]:text-blue-400 ' +
  '[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_h3]:text-base [&_h3]:font-bold [&_p]:my-1'

// Suggested commentary structure (PRD "Commentary Guidance"). Pre-filled as an
// editable scaffold when adding a NEW entry; authors replace each line. Editing
// an existing entry shows its own content instead.
const SUGGESTED_TEMPLATE =
  '<ul>' +
  '<li>Headline with business framing</li>' +
  '<li>Prior-period change</li>' +
  '<li>Why it changed</li>' +
  '<li>Operational caveats</li>' +
  '<li>Bigger-picture trend context</li>' +
  '<li>Cross-channel notes</li>' +
  '<li>Risks or watchouts, if relevant</li>' +
  '<li>Next steps</li>' +
  '</ul>'

function ToolbarButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`rounded px-2 py-1 text-xs font-semibold ${active ? 'bg-white/15 text-white' : 'text-text-muted hover:bg-white/5'}`}
    >
      {label}
    </button>
  )
}

export function CommentaryEditor({
  clientSlug,
  viewKey,
  entry,
  onDone,
}: {
  clientSlug: string
  viewKey: CommentaryViewKey
  entry?: CommentaryEntry
  onDone: () => void
}) {
  const [periodStart, setPeriodStart] = useState(entry?.periodStart ?? '')
  const [periodEnd, setPeriodEnd] = useState(entry?.periodEnd ?? '')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const editor = useEditor({
    extensions: [
      // Tiptap v3 StarterKit bundles Link; disable it here so the separately
      // configured Link extension below is the only 'link' (avoids a duplicate-
      // extension collision). The `link: false` key is ignored on versions where
      // StarterKit does not include Link.
      StarterKit.configure({ heading: { levels: [3] }, link: false }),
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' } }),
    ],
    content: entry?.bodyHtml || SUGGESTED_TEMPLATE,
    immediatelyRender: false, // avoid SSR hydration mismatch in Next
    editorProps: { attributes: { class: CONTENT_CLASS } },
  })

  function setLink() {
    if (!editor) return
    const prev = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('Link URL', prev ?? 'https://')
    if (url === null) return
    if (url === '') { editor.chain().focus().extendMarkRange('link').unsetLink().run(); return }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  function handleSave() {
    if (!editor) return
    setError('')
    // Don't let the untouched suggested outline get saved/approved as real commentary.
    const strip = (h: string) => h.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    if (strip(editor.getHTML()) === strip(SUGGESTED_TEMPLATE)) {
      setError('Replace the suggested outline with your commentary before saving.')
      return
    }
    startTransition(async () => {
      const res = await saveCommentary({
        id: entry?.id,
        clientSlug,
        viewKey,
        bodyHtml: editor.getHTML(),
        periodStart,
        periodEnd,
      })
      if (res.ok) onDone()
      else setError(res.error)
    })
  }

  if (!editor) return null

  return (
    <div className="space-y-3 rounded-lg border border-white/[0.08] bg-bg-surface p-4">
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-xs text-text-muted">
          Period start
          <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)}
            className="rounded border border-white/[0.08] bg-bg-base px-2 py-1 text-sm text-white" />
        </label>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          Period end
          <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)}
            className="rounded border border-white/[0.08] bg-bg-base px-2 py-1 text-sm text-white" />
        </label>
      </div>

      <div className="rounded-md border border-white/[0.08] bg-bg-base">
        <div className="flex flex-wrap gap-1 border-b border-white/[0.08] p-2">
          <ToolbarButton active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} label="B" />
          <ToolbarButton active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} label="I" />
          <ToolbarButton active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} label="H" />
          <ToolbarButton active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} label="• List" />
          <ToolbarButton active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} label="1. List" />
          <ToolbarButton active={editor.isActive('link')} onClick={setLink} label="🔗 Link" />
        </div>
        <EditorContent editor={editor} />
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex items-center gap-2">
        <Button type="button" onClick={handleSave} disabled={isPending}>{isPending ? 'Saving…' : 'Save draft'}</Button>
        <Button type="button" variant="ghost" onClick={onDone} disabled={isPending}>Cancel</Button>
      </div>
      {entry?.status === 'approved' && (
        <p className="text-xs text-text-muted">Editing an approved entry creates a new draft; the approved version stays visible to the client until the new draft is approved.</p>
      )}
    </div>
  )
}
