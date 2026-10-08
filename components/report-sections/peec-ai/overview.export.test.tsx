import { expect, test } from 'vitest'
import type { ReactElement } from 'react'
import { render, screen } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ExportModeProvider } from '@/components/export/export-mode'
import { ProviderTabs } from './provider-tabs'
import { PEEC_PARTS } from './parts/registry'
import { FIXTURE_PEEC_CTX } from './parts/__fixtures__/peec-ctx'

const inExport = (ui: ReactElement) => render(<TooltipProvider><ExportModeProvider>{ui}</ExportModeProvider></TooltipProvider>)
const part = (id: keyof typeof PEEC_PARTS) => PEEC_PARTS[id][1].render(FIXTURE_PEEC_CTX, { id, version: 1, label: PEEC_PARTS[id][1].defaultLabel })

test('with two providers the export prints the first, labelled, with no tab buttons', () => {
  inExport(<ProviderTabs availableProviders={['peec', 'profound']} clientSlug="c" sections={{ peec: <p>PEEC SECTION</p>, profound: <p>PROFOUND SECTION</p> }} />)
  expect(screen.queryAllByRole('button')).toHaveLength(0)
  expect(screen.getByText('Peec AI')).toBeTruthy()
  expect(screen.getByText('PEEC SECTION')).toBeTruthy()
  expect(screen.queryByText('PROFOUND SECTION')).toBeNull()
})

test('with one provider the export prints it with no label', () => {
  inExport(<ProviderTabs availableProviders={['profound']} clientSlug="c" sections={{ profound: <p>PROFOUND SECTION</p> }} />)
  expect(screen.getByText('PROFOUND SECTION')).toBeTruthy()
  expect(screen.queryByText('Profound')).toBeNull()
})

test("each table card's header is kept with its first rows; the KPI grid and the winners/losers cards are blocks", () => {
  for (const id of ['llm-breakdown', 'brand-rankings', 'domains-row'] as const) {
    const { container, unmount } = inExport(<>{part(id)}</>)
    const head = container.querySelector('[data-export-table]')?.closest('div.rounded-lg')?.querySelector('[data-export-keep-with-next]')
    expect(head, id).toBeTruthy()
    unmount()
  }
  expect(inExport(<>{part('kpi-cards')}</>).container.querySelector('.grid[data-export-block]')).not.toBeNull()
  expect(inExport(<>{part('winners-losers')}</>).container.querySelectorAll('[data-export-block]')).toHaveLength(2)
  const domains = inExport(<>{part('domains-row')}</>).container
  expect(domains.querySelector('[data-export-block][data-export-chart]')?.textContent).toContain('What kinds of sources do AI models cite?')
})
