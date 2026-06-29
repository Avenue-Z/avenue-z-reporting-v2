// components/dashboard/blocks/pills-block-body.test.tsx
// Run: npx tsx components/dashboard/blocks/pills-block-body.test.tsx
import { strict as assert } from 'node:assert'
import { renderToString } from 'react-dom/server'
import { PillsBlockBody } from './pills-block-body'

// Renders name + value + delta in one row container
{
  const html = renderToString(<PillsBlockBody name="Sessions" value="$1.2k" delta="↑ 5%" />)
  assert.equal(html.includes('Sessions'), true)
  assert.equal(html.includes('$1.2k'), true)
  assert.equal(html.includes('↑ 5%'), true)
}

// Badge slot renders when provided
{
  const html = renderToString(<PillsBlockBody name="X" value="1" delta="0" badge={<span>BADGE</span>} />)
  assert.equal(html.includes('BADGE'), true)
}

console.log('ok')
