import { expect, test, vi } from 'vitest'
import { render } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'

// registry.ts eagerly imports the sentiment-insights and pr-synopsis parts,
// which transitively import lib/db/client (throws at module init without
// DATABASE_URL). Same placeholder pattern as ctx.snapshot.test.ts /
// components/charts/capsule-column-chart.test.tsx.
vi.hoisted(() => {
  process.env.DATABASE_URL ??= 'postgresql://user:password@host.tld/dbname'
})

import { PR_INFLUENCE_PARTS } from './registry'
import { FIXTURE_PR_INFLUENCE_CTX } from './__fixtures__/pr-influence-ctx'

test('pr-synopsis@1 renders null under SHOW_AI_NARRATIVE=false', () => {
  const impl = PR_INFLUENCE_PARTS['pr-synopsis'][1]
  const resolved = { id: impl.id, version: impl.version, label: impl.defaultLabel }
  const { container } = render(<TooltipProvider>{impl.render(FIXTURE_PR_INFLUENCE_CTX, resolved)}</TooltipProvider>)
  expect(container.firstChild).toBeNull()
})
