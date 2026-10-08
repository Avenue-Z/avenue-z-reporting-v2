import { expect, test, vi } from 'vitest'
import { render } from '@testing-library/react'
import { findElements } from '@/lib/test-utils/element-tree'

vi.mock('@/lib/organic-social/headlines', () => ({ getPlatformHeadlines: vi.fn(() => new Promise(() => {})) }))
import { engagementBreakdownV1 } from './engagement-breakdown'

// Every loading placeholder must carry data-export-pending, or the PDF export can print it (lib/export/readiness.ts).
test("the engagement breakdown's loading placeholder is marked pending", () => {
  const tree = engagementBreakdownV1.render({ clientSlug: 'c', dateRange: 'last_30_days', compareRange: 'previous_period', channel: 'INSTAGRAM', role: 'CLIENT_VIEWER' } as never, { id: 'engagement-breakdown', version: 1 } as never)
  const [suspense] = findElements(tree, (e) => e.props.fallback !== undefined)
  const { container } = render(<>{suspense.props.fallback as React.ReactNode}</>)
  expect(container.querySelector('[data-export-pending]')).not.toBeNull()
})
