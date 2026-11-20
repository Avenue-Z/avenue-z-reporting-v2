import { describe, expect, test } from 'vitest'
import { analysisHtmlToText, analysisTextToHtml, editorName } from './analysis-text'

describe('analysis text', () => {
  test('lines become paragraphs, "# " lines headings, as the mockup reads them', () => {
    expect(analysisTextToHtml('# A made-up theme\nA made-up line.\n\nAnother one.')).toBe('<h3>A made-up theme</h3><p>A made-up line.</p><p>Another one.</p>')
  })
  test('text is escaped, never markup', () => {
    expect(analysisTextToHtml('<script>x</script> & "q"')).toBe('<p>&lt;script&gt;x&lt;/script&gt; &amp; &quot;q&quot;</p>')
  })
  test('empty or blank text is empty', () => {
    expect(analysisTextToHtml('  \n \r\n')).toBe('')
  })
  test('round trip: HTML back to the same text', () => {
    const text = '# Heading\n\nFirst line.\n\nSecond & last <b>.'
    expect(analysisHtmlToText(analysisTextToHtml(text))).toBe(text)
  })
  test('HTML from the rich editor still reads back: lists as lines, other tags dropped', () => {
    expect(analysisHtmlToText('<p>One <strong>bold</strong></p><ul><li>a</li><li>b</li></ul>')).toBe('One bold\n\na\n\nb')
    expect(analysisHtmlToText('plain')).toBe('plain')
  })
})

describe('editorName', () => {
  test('the first part of the email, capitalised', () => {
    expect(editorName('someone.else@avenuez.com')).toBe('Someone')
    expect(editorName('writer@avenuez.com')).toBe('Writer')
    expect(editorName(null)).toBe('')
  })
})
