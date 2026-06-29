// components/dashboard/blocks/header-block-body.test.tsx
// Run: npx tsx components/dashboard/blocks/header-block-body.test.tsx
import { strict as assert } from 'node:assert'
import { renderToString } from 'react-dom/server'

// header-block-body imports the server action → lib/db/client, which throws at
// module init without DATABASE_URL. Set a placeholder first, then dynamic-import
// inside the async IIFE (tsx compiles this file as CJS, which rejects top-level
// await, and static imports are hoisted above the assignment).
process.env.DATABASE_URL ??= 'postgresql://user:password@host.tld/dbname'

;(async () => {
  const { HeaderBlockBody } = await import('./header-block-body')

  // Default level (undefined) → h2
  {
    const html = renderToString(<HeaderBlockBody name="Section title" canEdit={false} slug="s" blockId="b" />)
    assert.equal(html.includes('<h2'), true, 'default renders h2')
    assert.equal(html.includes('Section title'), true)
  }

  // Explicit level 1 → h1
  {
    const html = renderToString(<HeaderBlockBody name="Big title" level={1} canEdit={false} slug="s" blockId="b" />)
    assert.equal(html.includes('<h1'), true)
  }

  // Explicit level 3 → h3
  {
    const html = renderToString(<HeaderBlockBody name="Small title" level={3} canEdit={false} slug="s" blockId="b" />)
    assert.equal(html.includes('<h3'), true)
  }

  console.log('ok')
})()

