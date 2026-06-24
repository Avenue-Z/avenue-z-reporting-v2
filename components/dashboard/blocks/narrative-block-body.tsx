import ReactMarkdown from 'react-markdown'

/** Static narrative panel. `body` is markdown rendered via react-markdown.
 *  Empty body shows a quiet placeholder so the empty state is legible. */
export function NarrativeBlockBody({ name, body }: { name: string; body?: string }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface px-6 py-5 h-full">
      <p className="text-xs font-extrabold uppercase tracking-widest text-text-muted">{name}</p>
      <div className="mt-3 prose prose-invert max-w-none text-sm text-white/90">
        {body && body.trim() !== ''
          ? <ReactMarkdown>{body}</ReactMarkdown>
          : <p className="italic text-text-muted">No content yet — edit this block to add notes.</p>}
      </div>
    </div>
  )
}
