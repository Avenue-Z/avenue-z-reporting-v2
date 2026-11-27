import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { FIXTURE_PEEC_CTX } from '../parts/__fixtures__/peec-ctx'
import { PEEC_TEMPLATE } from '../template'

// No mock of V2_PART_SECTIONS: the real map, where kpi-cards@2 is the only entry.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/dashboard/renaissance/reports',
  useSearchParams: () => new URLSearchParams('section=peec-ai'),
}))
vi.mock('@/app/actions/aeo-kpis', () => ({ setAeoKpis: vi.fn() }))
vi.mock('@/lib/peec/coverage-projection', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/peec/coverage-projection')>()),
  getCoverageProjection: vi.fn(() => new Promise(() => {})),
}))
vi.mock('@/lib/peec/url-citations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/peec/url-citations')>()),
  getUrlCitations: vi.fn(() => new Promise(() => {})),
}))

import { ProviderSection } from '../index'

describe('hidden KPI strip with the real section map', () => {
  it('a client with no visible tile keeps the v2 layout but loses section 01', () => {
    const { container } = render(
      <TooltipProvider>
        <ProviderSection
          data={FIXTURE_PEEC_CTX.data}
          provider="peec"
          aiTraffic={{ available: false, sessions: 0, sessionsPrior: null }}
          template={PEEC_TEMPLATE}
          override={{ versions: { 'kpi-cards': 2 } }}
          audience="client"
          compare="previous_period"
          showDeltas
          kpi={{ saved: ['ai-leads', 'ai-cvr'], ga4Connected: false, ga4: { status: 'not-configured' }, profoundSentiment: null }}
        />
      </TooltipProvider>,
    )
    expect(screen.getByRole('switch', { name: 'Show deltas' })).toBeTruthy()
    expect(container.querySelector('#aeo-section-01')).toBeNull()
    expect(container.textContent).not.toContain('01 SNAPSHOT KPIS')
  })
})
