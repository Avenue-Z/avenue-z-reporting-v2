// lib/organic-social/social-listening/analysis-text.ts
// The analysis box's plain text, as the approved mockup takes it (docs/social-listening/mock.template.html, richText): a
// blank line between paragraphs, a line starting "# " is a heading. Stored as commentary HTML (p and h3, which the
// commentary sanitizer keeps), and turned back into the same text to edit. Pure.

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const unesc = (s: string) =>
  s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')

/** Text to HTML: each non-blank line is a paragraph, or a heading when it starts with "# ". Empty text is "". */
export function analysisTextToHtml(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (l.startsWith('# ') ? `<h3>${esc(l.slice(2).trim())}</h3>` : `<p>${esc(l)}</p>`))
    .join('')
}

/** HTML back to the editor's text: headings get "# ", blocks are separated by a blank line, list items become lines,
 *  any other tag is dropped. */
export function analysisHtmlToText(html: string): string {
  const blocks: string[] = []
  const re = /<(h3|p|li)[^>]*>([\s\S]*?)<\/\1>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const inner = unesc(m[2].replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')).trim()
    if (!inner) continue
    blocks.push(m[1].toLowerCase() === 'h3' ? `# ${inner}` : inner)
  }
  if (blocks.length === 0) return unesc(html.replace(/<[^>]+>/g, '')).trim()
  return blocks.join('\n\n')
}

/** The name an editor is shown by: the first part of their email, capitalised (jane.doe@... is "Jane"). */
export function editorName(email: string | null | undefined): string {
  const first = (email ?? '').split('@')[0].split(/[._-]/)[0]
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : ''
}
