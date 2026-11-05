import { afterEach, expect, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { SnapshotNotFound } from './snapshot-not-found'

afterEach(() => cleanup())
test('the not-found page names the problem, explains it and links back to the hub', () => {
  render(<SnapshotNotFound />)
  expect(screen.getByRole('heading', { level: 1, name: 'This snapshot no longer exists' })).toBeInTheDocument()
  expect(screen.getByText('It may have been discarded, or the link is wrong.')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Back to New Business' })).toHaveAttribute('href', '/tools/new-business')
})
