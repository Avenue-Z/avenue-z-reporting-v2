import { expect, test, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'

// Toggle import pulls a server action transitively — stub it (same pattern as the golden test).
vi.mock('@/app/actions/organic-social', () => ({ setDesignationAction: vi.fn(async () => ({ ok: true })) }))

import { SortableTopContent, type PlatformGroup } from './sortable-top-content'
import type { TopContentPost } from '@/lib/organic-social/content-types'

const mk = (id: number, engagements: number): TopContentPost => ({
  id, channel: 'INSTAGRAM', platform: 'Instagram', publishedAt: '2026-07-01',
  caption: `cap-${id}`, url: null, mediaType: 'IMAGE', mediaGroup: null, creative: null,
  metrics: { effectiveness: null, engagementRate: null, engagements, impressions: id },
  sourceType: 'organic',
})

// 18 posts with distinct engagements 18..1 so the sort order is deterministic and knowable.
const owned: PlatformGroup[] = [{ platform: 'Instagram', posts: Array.from({ length: 18 }, (_, i) => mk(i + 1, 18 - i)) }]

const renderIt = () =>
  render(
    <TooltipProvider>
      <SortableTopContent owned={owned} influencer={[]} clientSlug="renaissance" canEdit={false} />
    </TooltipProvider>,
  )

const captionsShown = () => screen.getAllByText(/^cap-\d+$/).map((el) => el.textContent)

test('page 1 shows the top 15 by the active metric with a pager reading 1–15 of 18', () => {
  renderIt()
  const shown = captionsShown()
  expect(shown).toHaveLength(15)
  // engagements desc → ids 1..15 (engagements 18..4) are the top 15; 16,17,18 are held back.
  expect(shown).not.toContain('cap-16')
  expect(screen.getByText(/1[–-]15 of 18/)).toBeInTheDocument()
})

test('Next advances to the remaining 3 posts and disables further paging', () => {
  renderIt()
  fireEvent.click(screen.getByRole('button', { name: /next/i }))
  const shown = captionsShown()
  expect(shown).toHaveLength(3)
  expect(shown).toEqual(expect.arrayContaining(['cap-16', 'cap-17', 'cap-18']))
  expect(screen.getByText(/16[–-]18 of 18/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /next/i })).toBeDisabled()
})

test('changing the sort metric resets back to page 1', () => {
  renderIt()
  fireEvent.click(screen.getByRole('button', { name: /next/i })) // go to page 2
  expect(screen.getByText(/16[–-]18 of 18/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /Views \/ Impr\./i })) // change sort
  expect(screen.getByText(/1[–-]15 of 18/)).toBeInTheDocument() // back to page 1
})
