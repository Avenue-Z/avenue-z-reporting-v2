'use client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { FIXTURE_PEEC_CTX } from '../parts/__fixtures__/peec-ctx'
import { PEEC_TEMPLATE } from '../template'

const MAP = vi.hoisted(() => ({}) as Record<string, string>)

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/dashboard/renaissance/reports',
  useSearchParams: () => new URLSearchParams('section=peec-ai'),
}))
vi.mock('./sections', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./sections')>()),
  V2_PART_SECTIONS: MAP,
}))
vi.mock('@/lib/peec/coverage-projection', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/peec/coverage-projection')>()),
  getCoverageProjection: vi.fn(() => new Promise(() => {})),
}))
vi.mock('@/lib/peec/url-citations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/peec/url-citations')>()),
  getUrlCitations: vi.fn(() => new Promise(() => {})),
}))

import { ProviderSection } from '../index'

const TITLE = 'How visible is the brand across AI answer engines?'

function renderSection(compare: 'previous_period' | 'previous_year' | 'none') {
  return render(
    <TooltipProvider>
      <ProviderSection
        data={FIXTURE_PEEC_CTX.data}
        provider="peec"
        aiTraffic={{ available: false, sessions: 0, sessionsPrior: null }}
        template={PEEC_TEMPLATE}
        override={undefined}
        audience="internal"
        compare={compare}
        showDeltas
      />
    </TooltipProvider>,
  )
}

beforeEach(() => {
  for (const k of Object.keys(MAP)) delete MAP[k]
})

describe('ProviderSection', () => {
  // A second render in one test comes back empty (the async competitor parts suspend), so v1 is measured in its own test.
  let v1Blocks = 0
  it('v1 (empty map): top SectionHeader, no section anchors, no deltas switch', () => {
    const { container } = renderSection('previous_period')
    expect(screen.getByText(TITLE)).toBeTruthy()
    expect(container.querySelector('[id^="aeo-section-"]')).toBeNull()
    expect(screen.queryByRole('switch')).toBeNull()
    v1Blocks = container.querySelectorAll('[data-export-block]').length
  })

  it('v2: no top header, section anchor, deltas switch', () => {
    MAP['footer@1'] = '05'
    const { container } = renderSection('previous_period')
    expect(screen.queryByText(TITLE)).toBeNull()
    expect(container.querySelector('#aeo-section-05')).not.toBeNull()
    expect(screen.getByRole('switch', { name: 'Show deltas' }).getAttribute('aria-disabled')).toBe('false')
  })

  it('v2 keeps the same part export-block wrappers as v1', () => {
    MAP['footer@1'] = '05'
    const { container } = renderSection('previous_period')
    expect(v1Blocks).toBeGreaterThan(0)
    expect(container.querySelectorAll('[data-export-block]').length).toBe(v1Blocks)
  })

  it('v2 with compare none: the switch is disabled', () => {
    MAP['footer@1'] = '05'
    renderSection('none')
    expect(screen.getByRole('switch', { name: 'Show deltas' }).getAttribute('aria-disabled')).toBe('true')
  })
})
