import { afterEach, expect, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { NoAccess } from './no-access'

afterEach(() => cleanup())
test('the no-access page names who to ask', () => {
  render(<NoAccess admins={['boss@avenuez.com', 'ryan@avenuez.com']} />)
  expect(screen.getByText('This tool is limited to the New Business team.')).toBeInTheDocument()
  expect(screen.getByText('Ask a New Business admin (boss@avenuez.com, ryan@avenuez.com) to add you.')).toBeInTheDocument()
})
test('with no admins known it still says who to ask', () => {
  render(<NoAccess admins={[]} />)
  expect(screen.getByText('Ask a New Business admin to add you.')).toBeInTheDocument()
})
