// components/dashboard/blocks/narrative-block-body.test.tsx
// Run: npx tsx components/dashboard/blocks/narrative-block-body.test.tsx
//
// Behavioral test only — we don't assert react-markdown's exact HTML output
// (that's version-dependent and react-markdown's ESM-only deps can fail to
// resolve under tsx in some setups). The visual fidelity is verified at the
// final smoke test by manually adding a markdown narrative block in the UI.
import { strict as assert } from 'node:assert'
import { renderToString } from 'react-dom/server'
import { NarrativeBlockBody } from './narrative-block-body'

// Empty body → placeholder copy visible
{
  const html = renderToString(<NarrativeBlockBody name="Notes" />)
  assert.equal(html.includes('Notes'), true, 'name visible')
  assert.equal(html.includes('No content yet'), true, 'empty placeholder shown')
}

// Whitespace-only body still shows placeholder (not interpreted as content)
{
  const html = renderToString(<NarrativeBlockBody name="Notes" body="   " />)
  assert.equal(html.includes('No content yet'), true, 'whitespace treated as empty')
}

// Non-empty body → placeholder is gone (we don't assert exact rendered HTML)
{
  const html = renderToString(<NarrativeBlockBody name="Notes" body="Highlights" />)
  assert.equal(html.includes('Notes'), true)
  assert.equal(html.includes('No content yet'), false, 'placeholder hidden when body present')
  assert.equal(html.includes('Highlights'), true, 'body content present somewhere')
}

console.log('ok')
