import { expect, test } from 'vitest'
import { render } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { PEEC_PARTS } from './registry'
import { FIXTURE_PEEC_CTX } from './__fixtures__/peec-ctx'

test('llm-breakdown@1 golden', () => {
  const impl = PEEC_PARTS['llm-breakdown'][1]
  const resolved = { id: 'llm-breakdown', version: 1, label: impl.defaultLabel }
  const { container } = render(
    <TooltipProvider>{impl.render(FIXTURE_PEEC_CTX, resolved)}</TooltipProvider>
  )
  expect(container.textContent).not.toBe('')
  expect(container.firstChild).toMatchSnapshot()
})
