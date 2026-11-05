import { afterEach, expect, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { NoAccess, NotAdmin } from './no-access'

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

// Paul's review of #388 (C11): one component for both access views.
test('unavailable says try again, never that the tool is limited to the team', () => {
  render(<NoAccess admins={['boss@avenuez.com']} unavailable />)
  expect(screen.getByText("Couldn't check access just now. Reload in a moment.")).toBeInTheDocument()
  expect(screen.queryByText('This tool is limited to the New Business team.')).toBeNull()
})

test('the not-admin page says who the admins are', () => {
  render(<NotAdmin admins={['boss@avenuez.com']} />)
  expect(screen.getByText('Only New Business admins can change these settings.')).toBeInTheDocument()
  expect(screen.getByText('Admins: boss@avenuez.com.')).toBeInTheDocument()
})
