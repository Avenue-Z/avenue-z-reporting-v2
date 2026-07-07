import { describe, expect, test } from 'vitest'
import { sanitizeCommentaryHtml } from './sanitize'

describe('sanitizeCommentaryHtml', () => {
  test('keeps allowed formatting tags', () => {
    const html = '<p><strong>Bold</strong> and <em>italic</em></p><ul><li>one</li></ul><h3>H</h3>'
    expect(sanitizeCommentaryHtml(html)).toBe(html)
  })
  test('strips <script> and its content', () => {
    expect(sanitizeCommentaryHtml('<p>ok</p><script>alert(1)</script>')).toBe('<p>ok</p>')
  })
  test('strips event-handler attributes', () => {
    expect(sanitizeCommentaryHtml('<p onclick="steal()">x</p>')).toBe('<p>x</p>')
  })
  test('drops javascript: hrefs but keeps http/https/mailto and adds safe rel/target', () => {
    expect(sanitizeCommentaryHtml('<a href="javascript:alert(1)">x</a>')).toBe('x')
    const safe = sanitizeCommentaryHtml('<a href="https://x.com">x</a>')
    expect(safe).toContain('href="https://x.com"')
    expect(safe).toContain('rel="noopener noreferrer"')
    expect(safe).toContain('target="_blank"')
    expect(sanitizeCommentaryHtml('<a href="mailto:a@b.com">m</a>')).toContain('href="mailto:a@b.com"')
  })
  test('strips disallowed tags (img, iframe) but keeps text', () => {
    expect(sanitizeCommentaryHtml('<p>hi</p><img src=x onerror=alert(1)>')).toBe('<p>hi</p>')
    expect(sanitizeCommentaryHtml('<iframe src="evil"></iframe>text')).toBe('text')
  })
  test('handles empty/nullish input', () => {
    expect(sanitizeCommentaryHtml('')).toBe('')
  })
})
