import { expect, test } from 'vitest'
import { render } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { PEEC_PARTS } from './registry'
import { FIXTURE_PEEC_CTX } from './__fixtures__/peec-ctx'

test('domains-row@1 golden', () => {
  const impl = PEEC_PARTS['domains-row'][1]
  const resolved = { id: 'domains-row', version: 1, label: impl.defaultLabel }
  const { container } = render(
    <TooltipProvider>{impl.render(FIXTURE_PEEC_CTX, resolved)}</TooltipProvider>
  )
  expect(container.textContent).not.toBe('')
  expect(container.firstChild).toMatchSnapshot()
})
