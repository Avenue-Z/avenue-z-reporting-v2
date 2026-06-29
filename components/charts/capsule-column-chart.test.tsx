// components/charts/capsule-column-chart.test.tsx
// Run: npx tsx components/charts/capsule-column-chart.test.tsx
import { strict as assert } from 'node:assert'
import { renderToString } from 'react-dom/server'
import { CHART_COLORS } from '@/lib/constants'

// CapsuleColumnChart imports EditableText → server action → lib/db/client, which throws at
// module init without DATABASE_URL. Set a placeholder first, then dynamic-import
// inside the async IIFE.
process.env.DATABASE_URL ??= 'postgresql://user:password@host.tld/dbname'

;(async () => {
  const { CapsuleColumnChart } = await import('./capsule-column-chart')

  // Category names render as axis labels; columns use the brand-cyan fill.
  {
    const html = renderToString(
      <CapsuleColumnChart
        rows={[
          { name: 'facebook-ads', key: 'facebook-ads', value: 1400000, label: '$1,400,000' },
          { name: 'google-ads', key: 'google-ads', value: 300000, label: '$300,000' },
        ]}
        slug="s"
        canEdit={false}
        dimKey="channel"
      />
    )
    assert.equal(html.includes('facebook-ads'), true)
    assert.equal(html.includes('google-ads'), true)
    assert.equal(html.includes(CHART_COLORS.primary), true)   // current column fill
  }

  // Idle (SSR, no hover) does NOT render the value/compare tooltip.
  {
    const html = renderToString(
      <CapsuleColumnChart
        rows={[{ name: 'x', key: 'x', value: 100, label: '100', prior: 80, priorLabel: '80' }]}
        compareLabel="Prior period"
        slug="s"
        canEdit={false}
        dimKey="channel"
      />
    )
    assert.equal(html.includes('Prior period'), false)        // tooltip (value + compare) only on hover
  }

  // Prior present → NO on-chart prior marker (comparison lives only in the tooltip).
  {
    const html = renderToString(
      <CapsuleColumnChart
        rows={[{ name: 'x', key: 'x', value: 100, label: '100', prior: 80, priorLabel: '80' }]}
        slug="s"
        canEdit={false}
        dimKey="channel"
      />
    )
    assert.equal(html.includes('border-white/40'), false)
  }

  console.log('ok')
})()

