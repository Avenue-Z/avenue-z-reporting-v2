'use client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { FIXTURE_PEEC_CTX } from '../parts/__fixtures__/peec-ctx'
import { PEEC_TEMPLATE } from '../template'
import type { PeecCtx } from '../ctx'
import type { KpiId } from '@/lib/report-sections/aeo-kpis'
import type { AiKpiWindow } from '@/lib/ga4/ai-kpis'

const MAP = vi.hoisted(() => ({}) as Record<string, string>)

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/dashboard/renaissance/reports',
  useSearchParams: () => new URLSearchParams('section=peec-ai'),
}))
vi.mock('@/app/actions/aeo-kpis', () => ({ setAeoKpis: vi.fn() }))
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

import { PEEC_PARTS } from '../parts/registry'
import { kpiStripHidden } from '../parts/kpi-cards.v2'
import { ProviderSection } from '../index'

const win = (total: number, sessions: number, leads: number): AiKpiWindow => ({
  totalSessions: total,
  bySource: [{ source: 'chatgpt.com', sessions, keyEvents: leads }],
  leadsBySource: null,
})

function ctxWith(over: { saved?: KpiId[] | null; audience?: 'internal' | 'client'; ga4Connected?: boolean; showDeltas?: boolean }): PeecCtx {
  const ga4Connected = over.ga4Connected ?? true
  return {
    ...FIXTURE_PEEC_CTX,
    audience: over.audience ?? 'client',
    showDeltas: over.showDeltas ?? true,
    kpi: {
      saved: over.saved === undefined ? null : over.saved,
      ga4Connected,
      ga4: ga4Connected ? { status: 'ok', now: win(1000, 80, 8), prior: win(900, 70, 6) } : { status: 'not-configured' },
      profoundSentiment: null,
    },
  }
}

function renderPart(ctx: PeecCtx) {
  const impl = PEEC_PARTS['kpi-cards'][2]
  return render(<TooltipProvider>{impl.render(ctx, { id: 'kpi-cards', version: 2, label: 'Snapshot KPIs' })}</TooltipProvider>)
}

beforeEach(() => {
  for (const k of Object.keys(MAP)) delete MAP[k]
})

describe('kpi-cards@2', () => {
  it('five tiles use lg:grid-cols-5; two use lg:grid-cols-2', () => {
    const five = renderPart(ctxWith({ saved: ['visibility', 'share-of-voice', 'sentiment', 'ai-sessions', 'ai-leads'] }))
    expect(five.container.querySelector('.lg\\:grid-cols-5')).not.toBeNull()
    five.unmount()
    const two = renderPart(ctxWith({ saved: ['visibility', 'sentiment'] }))
    expect(two.container.querySelector('.lg\\:grid-cols-2')).not.toBeNull()
    expect(two.container.querySelector('.lg\\:grid-cols-5')).toBeNull()
  })

  it('deltas off hides every delta line', () => {
    const { container } = renderPart(ctxWith({ showDeltas: false }))
    const lines = [...container.querySelectorAll('p')].filter((p) => p.textContent?.endsWith('vs previous period'))
    expect(lines).toHaveLength(0)
  })

  it('deltas on shows delta lines', () => {
    const { container } = renderPart(ctxWith({}))
    const lines = [...container.querySelectorAll('p')].filter((p) => p.textContent?.endsWith('vs previous period'))
    expect(lines.length).toBeGreaterThan(0)
  })

  it('staff see the editor and unconnected tiles', () => {
    renderPart(ctxWith({ audience: 'internal', ga4Connected: false, saved: ['visibility', 'ai-leads'] }))
    expect(screen.getByText('Edit KPIs')).toBeTruthy()
    expect(screen.getByText('Source not connected')).toBeTruthy()
  })

  it('client sees no empty section', () => {
    const ctx = ctxWith({ audience: 'client', ga4Connected: false, saved: ['ai-leads', 'ai-cvr'] })
    expect(kpiStripHidden(ctx)).toBe(true)
    MAP['kpi-cards@2'] = '01'
    MAP['footer@1'] = '05'
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
          kpi={ctx.kpi}
        />
      </TooltipProvider>,
    )
    expect(container.querySelector('#aeo-section-01')).toBeNull()
    expect(container.textContent).not.toContain('01 SNAPSHOT KPIS')
    expect(container.querySelector('#aeo-section-05')).not.toBeNull()
  })

  it('staff empty state', () => {
    renderPart(ctxWith({ audience: 'internal', saved: [] }))
    expect(screen.getByText('No KPIs selected. Use Edit KPIs to choose up to five.')).toBeTruthy()
  })
})
