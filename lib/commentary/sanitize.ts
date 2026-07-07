import sanitizeHtml, { type Attributes } from 'sanitize-html'

// The client-facing XSS boundary. Allow only the formatting Tiptap can emit
// (bold/italic/underline, lists, a single heading level, links). Everything else
// — scripts, event handlers, img/iframe, javascript: URLs — is stripped.
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ['p', 'br', 'strong', 'em', 'u', 'ul', 'ol', 'li', 'h3', 'a'],
  allowedAttributes: { a: ['href', 'target', 'rel'] },
  allowedSchemes: ['http', 'https', 'mailto'],
  disallowedTagsMode: 'discard',
  transformTags: {
    a: ((tagName: string, attribs: Attributes) => {
      const href = attribs.href || ''
      // Drop the link if it has a javascript: scheme (text content is preserved)
      if (href.toLowerCase().startsWith('javascript:')) {
        return false
      }
      return {
        tagName: 'a',
        attribs: {
          href,
          target: '_blank',
          rel: 'noopener noreferrer',
        },
      }
    }) as unknown as sanitizeHtml.Transformer,
  },
}

export function sanitizeCommentaryHtml(dirty: string): string {
  return sanitizeHtml(dirty ?? '', OPTIONS)
}
