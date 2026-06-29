import ReactMarkdown, { type Components } from 'react-markdown'
import { EditableText } from '../editable-text'

/** react-markdown passes a `node` prop to custom renderers; it isn't a valid DOM
 *  attribute (would render as node="[object Object]"), so drop it before spread. */
function noNode<T extends { node?: unknown }>({ node, ...rest }: T): Omit<T, 'node'> {
  void node
  return rest
}

/** Markdown element styling, scoped for a compact dashboard panel. Tailwind's
 *  Preflight strips default heading/list styling, so each element is styled
 *  explicitly here (rather than relying on the `@tailwindcss/typography` plugin,
 *  which isn't installed and whose article-tuned defaults are oversized here). */
const MD: Components = {
  h1: (p) => <h1 className="mb-1 mt-3 text-lg font-bold text-white first:mt-0" {...noNode(p)} />,
  h2: (p) => <h2 className="mb-1 mt-3 text-base font-bold text-white first:mt-0" {...noNode(p)} />,
  h3: (p) => <h3 className="mb-1 mt-2 text-sm font-semibold text-white first:mt-0" {...noNode(p)} />,
  p: (p) => <p className="my-2 leading-relaxed first:mt-0 last:mb-0" {...noNode(p)} />,
  ul: (p) => <ul className="my-2 list-disc space-y-1 pl-5 marker:text-text-muted" {...noNode(p)} />,
  ol: (p) => <ol className="my-2 list-decimal space-y-1 pl-5 marker:text-text-muted" {...noNode(p)} />,
  li: (p) => <li className="leading-relaxed" {...noNode(p)} />,
  strong: (p) => <strong className="font-semibold text-white" {...noNode(p)} />,
  em: (p) => <em className="italic" {...noNode(p)} />,
  a: (p) => <a className="text-brand-cyan underline hover:opacity-80" target="_blank" rel="noreferrer" {...noNode(p)} />,
  code: (p) => <code className="rounded bg-white/10 px-1 py-0.5 text-[12px]" {...noNode(p)} />,
  blockquote: (p) => <blockquote className="my-2 border-l-2 border-white/20 pl-3 italic text-white/70" {...noNode(p)} />,
}

/** Static narrative panel. `body` is markdown rendered via react-markdown in view
 *  mode; inline editing edits the raw markdown source (multiline). */
export function NarrativeBlockBody({
  name, body, canEdit, slug, blockId,
}: {
  name: string
  body?: string
  canEdit: boolean
  slug: string
  blockId: string
}) {
  const rendered =
    body && body.trim() !== ''
      ? <ReactMarkdown components={MD}>{body}</ReactMarkdown>
      : <p className="italic text-text-muted">No content yet — click to add notes.</p>
  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface px-6 py-5 h-full">
      <EditableText
        value={name}
        slug={slug}
        target={{ kind: 'blockText', blockId, field: 'name' }}
        canEdit={canEdit}
        as="p"
        className="text-xs font-extrabold uppercase tracking-widest text-text-muted"
      />
      <div className="mt-3 max-w-none text-sm text-white/90">
        <EditableText
          value={body ?? ''}
          slug={slug}
          target={{ kind: 'blockText', blockId, field: 'narrativeBody' }}
          canEdit={canEdit}
          multiline
          as="div"
          viewNode={rendered}
          placeholder="No content yet — click to add notes."
        />
      </div>
    </div>
  )
}
