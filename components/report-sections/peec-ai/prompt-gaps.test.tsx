'use client'

import { expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { PromptGapsResult } from '@/lib/peec/prompt-gaps'
import { PromptGapsBlock, gatedPromptGaps, canToggleClientVisibility } from './prompt-gaps'
import { isClientVisible } from '@/lib/report-sections/mutations'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/app/actions/report-sections', () => ({ setClientVisible: vi.fn(async () => ({ ok: true })) }))

const RESULT: PromptGapsResult = {
  ok: true,
  rows: [
    { promptId: 'p1', text: 'best crm for startups', topic: 'CRM', status: 'not-cited',
      otherSites: [{ url: 'https://reddit.com/r/crm', namesCompetitor: false }, { url: 'https://rival.com/x', namesCompetitor: true }], otherSitesMore: 2 },
    { promptId: 'p2', text: 'crm pricing compare', topic: 'CRM', status: 'lost', otherSites: [], otherSitesMore: 0 },
    { promptId: 'p3', text: 'crm integrations list', topic: 'CRM', status: 'declining', otherSites: [], otherSitesMore: 0 },
  ],
}

function renderBlock(over: Partial<Parameters<typeof PromptGapsBlock>[0]> = {}) {
  return render(
    <TooltipProvider>
      <PromptGapsBlock result={RESULT} audience="internal" clientVisible={false} canToggle={false} clientSlug="acme" {...over} />
    </TooltipProvider>,
  )
}

test('client + not visible renders nothing, no prompt text', () => {
  const { container } = renderBlock({ audience: 'client' })
  expect(container.innerHTML).toBe('')
  expect(screen.queryByText(/best crm/)).toBeNull()
})

test('client + visible shows table, no chip, no switch', () => {
  renderBlock({ audience: 'client', clientVisible: true })
  expect(screen.getByText('best crm for startups')).toBeTruthy()
  expect(screen.queryByText('Internal')).toBeNull()
  expect(screen.queryByRole('switch')).toBeNull()
})

test('internal + not visible shows table and Internal chip', () => {
  renderBlock()
  expect(screen.getByText('best crm for startups')).toBeTruthy()
  expect(screen.getByText('Internal')).toBeTruthy()
  expect(screen.queryByRole('switch')).toBeNull()
})

test('internal + canToggle shows the switch reflecting state', () => {
  renderBlock({ canToggle: true, clientVisible: true })
  const sw = screen.getByRole('switch', { name: 'Visible to client' })
  expect(sw.getAttribute('aria-checked')).toBe('true')
  expect(screen.queryByText('Internal')).toBeNull()
})

test('error results show copy and no rows', () => {
  renderBlock({ result: { ok: false, reason: 'incomplete' } })
  expect(screen.getByText(/came back incomplete/)).toBeTruthy()
  expect(screen.queryByText('best crm for startups')).toBeNull()
  renderBlock({ result: { ok: false, reason: 'unavailable' } })
  expect(screen.getByText(/couldn't be loaded/)).toBeTruthy()
})

test('statuses, column header, competitor mark and +n', () => {
  renderBlock()
  expect(screen.getByText('Not cited')).toBeTruthy()
  expect(screen.getByText('Lost')).toBeTruthy()
  expect(screen.getByText('Declining')).toBeTruthy()
  expect(screen.getByText('Other sites cited')).toBeTruthy()
  expect(screen.getAllByText('competitor')).toHaveLength(1)
  expect(screen.getByText('+2')).toBeTruthy()
})

test('caller gate: client + Off never computes; rejected config (null) stays hidden', () => {
  const compute = vi.fn(() => RESULT)
  // getClientBySlug rejected -> config null -> not visible
  const visible = isClientVisible(null, 'peec-ai:content-impact', 'prompt-gaps')
  expect(gatedPromptGaps({ audience: 'client', clientVisible: visible, hasPeecData: true }, compute)).toBeNull()
  expect(compute).not.toHaveBeenCalled()
})

test('caller gate: internal and client + On compute; no Peec data does not', () => {
  const compute = vi.fn(() => RESULT)
  expect(gatedPromptGaps({ audience: 'internal', clientVisible: false, hasPeecData: true }, compute)).toBe(RESULT)
  expect(gatedPromptGaps({ audience: 'client', clientVisible: true, hasPeecData: true }, compute)).toBe(RESULT)
  expect(compute).toHaveBeenCalledTimes(2)
  expect(gatedPromptGaps({ audience: 'internal', clientVisible: true, hasPeecData: false }, compute)).toBeNull()
  expect(compute).toHaveBeenCalledTimes(2)
})

test('client + visible + incomplete or unavailable renders nothing, no error copy (M9b)', () => {
  for (const reason of ['incomplete', 'unavailable'] as const) {
    const { container, unmount } = renderBlock({ audience: 'client', clientVisible: true, result: { ok: false, reason } })
    expect(container.innerHTML).toBe('')
    unmount()
  }
})

test('canToggleClientVisibility: only an INTERNAL_ADMIN on the internal view', () => {
  expect(canToggleClientVisibility('internal', 'INTERNAL_ADMIN')).toBe(true)
  expect(canToggleClientVisibility('internal', 'INTERNAL_ANALYST')).toBe(false)
  expect(canToggleClientVisibility('client', 'INTERNAL_ADMIN')).toBe(false)
  expect(canToggleClientVisibility('internal', undefined)).toBe(false)
})
