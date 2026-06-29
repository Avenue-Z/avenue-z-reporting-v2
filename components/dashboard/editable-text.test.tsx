// components/dashboard/editable-text.test.tsx
// Run: npx tsx components/dashboard/editable-text.test.tsx
import { strict as assert } from 'node:assert'
import { renderToString } from 'react-dom/server'

// editable-text imports the server action → lib/db/client, which throws at
// module init without DATABASE_URL. Set a placeholder first, then dynamic-import
// inside the async IIFE (tsx compiles this file as CJS, which rejects top-level
// await, and static imports are hoisted above the assignment).
process.env.DATABASE_URL ??= 'postgresql://user:password@host.tld/dbname'

;(async () => {
  const { EditableText } = await import('./editable-text')

  // View mode (not editable): renders value in the chosen element/class, no edit affordance.
  {
    const html = renderToString(
      <EditableText value="Revenue" slug="s" target={{ kind: 'blockText', blockId: 'b', field: 'name' }} canEdit={false} as="h3" className="text-lg" />
    )
    assert.equal(html.includes('Revenue'), true)
    assert.equal(html.includes('<h3'), true)
    assert.equal(html.includes('text-lg'), true)
    assert.equal(html.includes('Click to edit'), false)
  }

  // Editable: renders value + the click-to-edit affordance (title attr).
  {
    const html = renderToString(
      <EditableText value="Revenue" slug="s" target={{ kind: 'blockText', blockId: 'b', field: 'name' }} canEdit as="h3" />
    )
    assert.equal(html.includes('Revenue'), true)
    assert.equal(html.includes('Click to edit'), true)
  }

  // viewNode is rendered in view mode (e.g. pre-rendered markdown for narrative body).
  {
    const html = renderToString(
      <EditableText value="# raw" slug="s" target={{ kind: 'blockText', blockId: 'b', field: 'narrativeBody' }} canEdit={false} viewNode={<em>rendered</em>} />
    )
    assert.equal(html.includes('rendered'), true)
    assert.equal(html.includes('# raw'), false)   // raw value not shown when viewNode given
  }

  console.log('ok')
})()
