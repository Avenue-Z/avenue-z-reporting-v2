import { expect, test } from 'vitest'
import { render } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { resolveSection } from '@/lib/report-sections/resolve'
import { lookup, mergeRegistries } from '@/lib/report-sections/registry'
import { PEEC_PARTS } from './parts/registry'
import { BESPOKE_PARTS } from './parts/bespoke/registry'
import { PEEC_TEMPLATE } from './template'
import { FIXTURE_PEEC_CTX } from './parts/__fixtures__/peec-ctx'

// overview-synopsis renders via <Suspense> with an async child when SHOW_AI_NARRATIVE=true.
// Since SHOW_AI_NARRATIVE=false in this codebase, the part returns null synchronously
// and no async resolution is required — no vi.mock needed. If SHOW_AI_NARRATIVE is ever
// flipped on in tests, add: vi.mock('./overview-synopsis', () => ({ OverviewSynopsis: () => <p>synopsis stub</p> }))
// TooltipProvider is required because InfoTooltip (used in kpi-cards, domains-row) renders
// a Radix Tooltip that must be inside a TooltipProvider context.

test('AEO parity: no override renders the full v1 composition incl. domains-row grid', () => {
  const reg = mergeRegistries(PEEC_PARTS, BESPOKE_PARTS)
  const resolved = resolveSection(PEEC_TEMPLATE, undefined)
  const { container } = render(
    <TooltipProvider>
      <div className="space-y-8">
        {resolved.map((r) => {
          const impl = lookup(reg, r.id, r.version)
          return impl ? <div key={`${r.id}@${r.version}`}>{impl.render(FIXTURE_PEEC_CTX, r)}</div> : null
        })}
      </div>
    </TooltipProvider>,
  )
  // Regression-prone spot: assert the domains-row grid wrapper is present.
  expect(container.querySelector('.lg\\:grid-cols-\\[1fr_280px\\]')).not.toBeNull()
  // Snapshot against the inner div (the space-y-8 container), not the TooltipProvider wrapper.
  expect(container.querySelector('.space-y-8')).toMatchSnapshot()
})
