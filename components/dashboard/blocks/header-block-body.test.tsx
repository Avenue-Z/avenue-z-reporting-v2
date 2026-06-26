// components/dashboard/blocks/header-block-body.test.tsx
// Run: npx tsx components/dashboard/blocks/header-block-body.test.tsx
import { strict as assert } from 'node:assert'
import { renderToString } from 'react-dom/server'
import { HeaderBlockBody } from './header-block-body'

// Default level (undefined) → h2
{
  const html = renderToString(<HeaderBlockBody name="Section title" />)
  assert.equal(html.includes('<h2'), true, 'default renders h2')
  assert.equal(html.includes('Section title'), true)
}

// Explicit level 1 → h1
{
  const html = renderToString(<HeaderBlockBody name="Big title" level={1} />)
  assert.equal(html.includes('<h1'), true)
}

// Explicit level 3 → h3
{
  const html = renderToString(<HeaderBlockBody name="Small title" level={3} />)
  assert.equal(html.includes('<h3'), true)
}

console.log('ok')
