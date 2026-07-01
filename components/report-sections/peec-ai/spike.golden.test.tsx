import { expect, test } from 'vitest'
import { render } from '@testing-library/react'
import { Sparkles } from 'lucide-react'
import { SectionHeader } from './section-header'

test('spike: golden snapshot captures real rendered markup', () => {
  const { container } = render(<SectionHeader icon={Sparkles} title="Frozen title" />)
  // The assertion that matters: the snapshot contains the ACTUAL text/markup,
  // not an empty wrapper. Assert both, so a wrapper-only render fails loudly.
  expect(container.textContent).toContain('Frozen title')
  expect(container.firstChild).toMatchSnapshot()
})
