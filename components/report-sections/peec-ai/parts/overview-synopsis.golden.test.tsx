import { expect, test } from 'vitest'
import { render } from '@testing-library/react'
import { PEEC_PARTS } from './registry'
import { FIXTURE_PEEC_CTX } from './__fixtures__/peec-ctx'

test('overview-synopsis@1 golden', () => {
  const impl = PEEC_PARTS['overview-synopsis'][1]
  const resolved = { id: 'overview-synopsis', version: 1, label: impl.defaultLabel }
  const { container } = render(<>{impl.render(FIXTURE_PEEC_CTX, resolved)}</>)
  // SHOW_AI_NARRATIVE is false in dev/test, so this part renders null
  expect(container.firstChild).toBeNull()
  expect(container.firstChild).toMatchSnapshot()
})
