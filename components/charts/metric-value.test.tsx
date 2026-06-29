// components/charts/metric-value.test.tsx
// Run: npx tsx components/charts/metric-value.test.tsx
import { strict as assert } from 'node:assert'
import { renderToString } from 'react-dom/server'
import { MetricValue } from './metric-value'

// Base typography + content
{
  const html = renderToString(<MetricValue className="text-white">$1,234</MetricValue>)
  assert.equal(html.includes('text-3xl'), true)
  assert.equal(html.includes('font-extrabold'), true)
  assert.equal(html.includes('$1,234'), true)
  assert.equal(html.includes('text-white'), true)
}

// Caller color class is applied (target/ceiling banding)
{
  const html = renderToString(<MetricValue className="text-brand-green">9</MetricValue>)
  assert.equal(html.includes('text-brand-green'), true)
}

console.log('ok')
