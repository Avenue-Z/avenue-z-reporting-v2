import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const refresh = vi.fn()
const setAeoKpis = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('@/app/actions/report-sections', () => ({ setAeoKpis: (...a: unknown[]) => setAeoKpis(...a) }))

import { KpiEditor } from './kpi-editor'
import { AEO_KPI_IDS, type KpiId } from '@/lib/report-sections/aeo-kpis'
import { KPI_CATALOG } from './kpi-catalog'

const options = (disabled: Partial<Record<KpiId, string>> = {}) =>
  AEO_KPI_IDS.map((id) => ({
    id,
    label: KPI_CATALOG[id].label,
    group: KPI_CATALOG[id].source === 'ga4' ? 'GA4' : 'Peec',
    disabledReason: disabled[id] ?? null,
  }))

const open = () => fireEvent.click(screen.getByRole('button', { name: 'Edit KPIs' }))

beforeEach(() => {
  refresh.mockReset()
  setAeoKpis.mockReset()
})

describe('KpiEditor', () => {
  it('five selected: counter and every unchecked box disabled', () => {
    render(<KpiEditor clientSlug="renaissance" selected={['visibility', 'share-of-voice', 'visibility-rank', 'used-as-source', 'sentiment']} options={options()} />)
    open()
    expect(screen.getByText('5 of 5 selected')).toBeTruthy()
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[]
    for (const b of boxes) expect(b.disabled).toBe(!b.checked)
  })

  it('a box with a disabled reason is disabled and shows it', () => {
    render(<KpiEditor clientSlug="renaissance" selected={[]} options={options({ 'ai-leads': 'Source not connected' })} />)
    open()
    expect((screen.getByLabelText('AI search leads') as HTMLInputElement).disabled).toBe(true)
    expect(screen.getByText('Source not connected')).toBeTruthy()
  })

  it('Save sends ids in catalog order then refreshes', async () => {
    setAeoKpis.mockResolvedValue({ ok: true })
    render(<KpiEditor clientSlug="renaissance" selected={['sentiment']} options={options()} />)
    open()
    fireEvent.click(screen.getByLabelText('AI visibility'))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(setAeoKpis).toHaveBeenCalledWith('renaissance', ['visibility', 'sentiment'])
  })

  it('a failed save shows the error and does not refresh', async () => {
    setAeoKpis.mockResolvedValue({ ok: false, error: 'forbidden' })
    render(<KpiEditor clientSlug="renaissance" selected={[]} options={options()} />)
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.getByText('forbidden')).toBeTruthy())
    expect(refresh).not.toHaveBeenCalled()
  })

  it('Cancel restores the original selection', () => {
    render(<KpiEditor clientSlug="renaissance" selected={['visibility']} options={options()} />)
    open()
    fireEvent.click(screen.getByLabelText('AI visibility'))
    fireEvent.click(screen.getByLabelText('Sentiment'))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    open()
    expect((screen.getByLabelText('AI visibility') as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText('Sentiment') as HTMLInputElement).checked).toBe(false)
  })
})
