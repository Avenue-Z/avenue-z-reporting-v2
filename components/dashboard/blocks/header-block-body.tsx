import { EditableText } from '../editable-text'

/** Static section header. The text is the block `name`, inline-editable in edit mode. */
export function HeaderBlockBody({
  name, level, canEdit, slug, blockId,
}: {
  name: string
  level?: 1 | 2 | 3
  canEdit: boolean
  slug: string
  blockId: string
}) {
  const lvl = level ?? 2
  const cls =
    lvl === 1 ? 'text-3xl font-extrabold uppercase tracking-widest text-white'
    : lvl === 2 ? 'text-xl font-bold uppercase tracking-wide text-white/90'
    : 'text-xs font-semibold uppercase tracking-widest text-text-muted'
  const as = lvl === 1 ? 'h1' : lvl === 2 ? 'h2' : 'h3'
  return (
    <EditableText
      value={name}
      slug={slug}
      target={{ kind: 'blockText', blockId, field: 'name' }}
      canEdit={canEdit}
      as={as}
      className={`px-1 py-2 ${cls}`}
    />
  )
}
