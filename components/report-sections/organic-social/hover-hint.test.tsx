import { expect, test } from 'vitest'
import { render } from '@testing-library/react'
import { HoverHint } from './hover-hint'

test('a question mark badge with the text, no provider needed', () => {
  const { getByText, container } = render(<HoverHint text="Top Performers by metric (Views/Engagements)" />)
  expect(getByText('?')).toBeTruthy()
  expect(getByText('Top Performers by metric (Views/Engagements)')).toBeTruthy()
  expect(container.querySelector('.group-hover\\:opacity-100')).not.toBeNull()
})
