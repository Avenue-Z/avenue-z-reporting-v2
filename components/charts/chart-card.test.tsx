// components/charts/chart-card.test.tsx
// Run: npx tsx components/charts/chart-card.test.tsx
import { strict as assert } from 'node:assert'
import { renderToString } from 'react-dom/server'
import { ChartCard } from './chart-card'

// Canonical chrome + h3 title + body
{
  const html = renderToString(<ChartCard title="Traffic by Channel"><span>BODY</span></ChartCard>)
  assert.equal(html.includes('border-white/[0.06]'), true)
  assert.equal(html.includes('px-6'), true)
  assert.equal(html.includes('<h3'), true)
  assert.equal(html.includes('text-lg'), true)
  assert.equal(html.includes('font-bold'), true)
  assert.equal(html.includes('Traffic by Channel'), true)
  assert.equal(html.includes('BODY'), true)
}

// fill → grid-cell layout classes
{
  const html = renderToString(<ChartCard title="X" fill><span>B</span></ChartCard>)
  assert.equal(html.includes('h-full'), true)
  assert.equal(html.includes('flex-1'), true)
}

// bodyClassName passes through (table overflow)
{
  const html = renderToString(<ChartCard title="X" bodyClassName="overflow-auto"><span>B</span></ChartCard>)
  assert.equal(html.includes('overflow-auto'), true)
}

console.log('ok')
