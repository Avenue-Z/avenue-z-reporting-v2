import { expect, test, vi } from 'vitest'
import type { ReactElement } from 'react'
import { render } from '@testing-library/react'

// Records each Bar and Line's props (the export turns animation off), then renders the real one. Recharts finds
// its children by type, so the recorders carry the real components' displayNames.
const { barProps, lineProps } = vi.hoisted(() => ({ barProps: [] as Record<string, unknown>[], lineProps: [] as Record<string, unknown>[] }))
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts')
  const { cloneElement } = await import('react')
  const Bar = Object.assign((p: Record<string, unknown>) => { barProps.push(p); return <actual.Bar {...p} /> }, { displayName: actual.Bar.displayName })
  const Line = Object.assign((p: Record<string, unknown>) => { lineProps.push(p); return <actual.Line {...p} /> }, { displayName: actual.Line.displayName })
  return {
    ...actual, Bar, Line,
    ResponsiveContainer: ({ children }: { children: ReactElement<{ width?: number; height?: number }> }) => cloneElement(children, { width: 800, height: 300 }),
  }
})

import { BarChart } from './bar-chart'
import { ComboChart } from './combo-chart'
import { ExportModeProvider } from '@/components/export/export-mode'

const DATA = [{ d: 'Sep 1', a: 3, b: 5 }, { d: 'Sep 2', a: 9, b: 2 }]
const charts = () => (
  <>
    <BarChart data={DATA} xKey="d" yKeys={[{ key: 'a' }]} />
    <ComboChart data={DATA} xKey="d" bar={{ key: 'a', color: '#39A0FF', label: 'A' }} line={{ key: 'b', color: '#60FF80', label: 'B' }} />
  </>
)

// A PDF taken mid-animation prints half-drawn bars (spec 2026-10-08-pdf-export-all-reports-design §4).
test('in the export, bars and lines draw complete on first paint, and the bar chart keeps its dark panel', () => {
  barProps.length = 0; lineProps.length = 0
  const { container } = render(<ExportModeProvider>{charts()}</ExportModeProvider>)
  expect(barProps.length).toBe(2)
  expect(lineProps.length).toBe(1)
  expect([...barProps, ...lineProps].every((p) => p.isAnimationActive === false)).toBe(true)
  expect(container.querySelectorAll('[data-export-chart]')).toHaveLength(1) // BarChart owns its panel; ComboChart's is its parent's
})

test('outside the export, the charts are unchanged: animated, no export marker', () => {
  barProps.length = 0; lineProps.length = 0
  const { container } = render(charts())
  expect([...barProps, ...lineProps].every((p) => !('isAnimationActive' in p))).toBe(true)
  expect(container.querySelector('[data-export-chart]')).toBeNull()
})
