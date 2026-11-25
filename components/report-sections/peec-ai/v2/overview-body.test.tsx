'use client'
import { expect, test } from 'vitest'
import { render } from '@testing-library/react'
import type { ResolvedPart } from '@/lib/report-sections/types'
import { groupParts } from './sections'
import { OverviewBody } from './overview-body'

const p = (id: string, version: number): ResolvedPart => ({ id, version, label: id })
const map = { 'a@2': '01', 'b@2': '02', 'c@2': '02' } as const
const parts = [p('syn', 1), p('a', 2), p('b', 2), p('bespoke', 1), p('c', 2), p('footer', 1)]

test('renders one header per section and parts in order', () => {
  const { container } = render(
    <OverviewBody groups={groupParts(parts, map)} renderPart={(r) => <p>{r.id}</p>} />,
  )
  expect(container.querySelectorAll('#aeo-section-02')).toHaveLength(1)
  expect(container.querySelectorAll('#aeo-section-01')).toHaveLength(1)
  expect(container.textContent?.match(/02 · VISIBILITY VS COMPETITORS/g)).toHaveLength(1)
  const order = Array.from(container.querySelectorAll('p'))
    .map((n) => n.textContent)
    .filter((t) => ['syn', 'a', 'b', 'bespoke', 'c', 'footer'].includes(t ?? ''))
  expect(order).toEqual(['syn', 'a', 'b', 'bespoke', 'c', 'footer'])
})
