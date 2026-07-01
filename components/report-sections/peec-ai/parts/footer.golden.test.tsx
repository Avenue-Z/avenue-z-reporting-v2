import { expect, test } from 'vitest'
import { render } from '@testing-library/react'
import { PEEC_PARTS } from './registry'
import { FIXTURE_PEEC_CTX } from './__fixtures__/peec-ctx'

test('footer@1 golden', () => {
  const impl = PEEC_PARTS['footer'][1]
  const resolved = { id: 'footer', version: 1, label: impl.defaultLabel }
  const { container } = render(<>{impl.render(FIXTURE_PEEC_CTX, resolved)}</>)
  expect(container.textContent).not.toBe('')
  expect(container.firstChild).toMatchSnapshot()
})
