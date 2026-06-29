// components/charts/metric-delta.test.tsx
// Run: npx tsx components/charts/metric-delta.test.tsx
import { strict as assert } from 'node:assert'
import { renderToString } from 'react-dom/server'
import { MetricDelta } from './metric-delta'

// Positive → up arrow, green, formatted percent + label
{
  const html = renderToString(<MetricDelta delta={5} label="vs prior period" />)
  assert.equal(html.includes('↑'), true)
  assert.equal(html.includes('5.0%'), true)
  assert.equal(html.includes('vs prior period'), true)
  assert.equal(html.includes('text-brand-green'), true)
}

// Negative → down arrow, red
{
  const html = renderToString(<MetricDelta delta={-3.2} label="vs prior year" />)
  assert.equal(html.includes('↓'), true)
  assert.equal(html.includes('3.2%'), true)
  assert.equal(html.includes('text-[#FF4444]'), true)
}

// Zero → dash, muted
{
  const html = renderToString(<MetricDelta delta={0} label="vs prior period" />)
  assert.equal(html.includes('—'), true)
  assert.equal(html.includes('text-text-muted'), true)
}

// invertDelta → negative is good (green)
{
  const html = renderToString(<MetricDelta delta={-4} label="x" invertDelta />)
  assert.equal(html.includes('text-brand-green'), true)
}

console.log('ok')
