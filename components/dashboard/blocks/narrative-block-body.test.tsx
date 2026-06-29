// components/dashboard/blocks/narrative-block-body.test.tsx
// Run: npx tsx components/dashboard/blocks/narrative-block-body.test.tsx
//
// Guards two things: (1) the empty/whitespace placeholder behavior, and
// (2) that markdown renders to *styled* elements. The `prose` classes used
// previously were no-ops (no @tailwindcss/typography plugin installed), so
// headings/lists rendered as flat, unstyled text — present but invisible as
// markdown. We now style each element explicitly via react-markdown's
// `components` map; these assertions fail if that mapping regresses.
import { strict as assert } from 'node:assert'
import { renderToStaticMarkup } from 'react-dom/server'

// narrative-block-body imports the server action → lib/db/client, which throws at
// module init without DATABASE_URL. Set a placeholder first, then dynamic-import
// inside the async IIFE (tsx compiles this file as CJS, which rejects top-level
// await, and static imports are hoisted above the assignment).
process.env.DATABASE_URL ??= 'postgresql://user:password@host.tld/dbname'

;(async () => {
  const { NarrativeBlockBody } = await import('./narrative-block-body')

  // Empty body → placeholder copy visible, no markdown container
  {
    const html = renderToStaticMarkup(<NarrativeBlockBody name="Notes" canEdit={false} slug="s" blockId="b" />)
    assert.equal(html.includes('Notes'), true, 'name visible')
    assert.equal(html.includes('No content yet'), true, 'empty placeholder shown')
    assert.equal(html.includes('<h2'), false, 'no markdown rendered for empty body')
  }

  // Whitespace-only body still shows placeholder (not interpreted as content)
  {
    const html = renderToStaticMarkup(<NarrativeBlockBody name="Notes" body="   " canEdit={false} slug="s" blockId="b" />)
    assert.equal(html.includes('No content yet'), true, 'whitespace treated as empty')
  }

  // Non-empty markdown → placeholder gone, structure rendered to styled elements
  {
    const md = `## Highlights
- Cost **down 12%**
- Conversions up 8%

A paragraph with a [link](https://example.com).`
    const html = renderToStaticMarkup(<NarrativeBlockBody name="Notes" body={md} canEdit={false} slug="s" blockId="b" />)
    assert.equal(html.includes('No content yet'), false, 'placeholder hidden when body present')
    assert.match(html, /<h2 class="[^"]*font-bold[^"]*">Highlights<\/h2>/, 'heading styled')
    assert.match(html, /<ul class="[^"]*list-disc[^"]*">/, 'bullet list styled')
    assert.match(html, /<strong class="font-semibold[^"]*">down 12%<\/strong>/, 'bold styled')
    assert.match(html, /<a class="[^"]*text-brand-cyan[^"]*" target="_blank"[^>]*href="https:\/\/example\.com">link<\/a>/, 'link styled + safe target')
  }

  console.log('ok')
})()

