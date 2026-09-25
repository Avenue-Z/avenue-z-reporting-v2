import { afterEach, expect, test, vi } from 'vitest'
import { noteCapabilities } from './permissions'

const APPROVERS = 'approver@avenuez.com'
const none = { canEdit: false, canApprove: false }

// vi.stubEnv restores each variable, even after a failed expect, and never deletes one the runner set
// (Paul's second review of #273, R8).
afterEach(() => { vi.unstubAllEnvs() })

test('any team member with an @avenuez.com email can write; approving also needs the list', () => {
  expect(noteCapabilities('INTERNAL_ANALYST', 'writer@avenuez.com', APPROVERS)).toEqual({ canEdit: true, canApprove: false })
  expect(noteCapabilities('INTERNAL_ADMIN', 'approver@avenuez.com', APPROVERS)).toEqual({ canEdit: true, canApprove: true })
})

test('a client role gets nothing, whatever its email', () => {
  expect(noteCapabilities('CLIENT_ADMIN', 'approver@avenuez.com', APPROVERS)).toEqual(none)
  expect(noteCapabilities('CLIENT_VIEWER', 'writer@avenuez.com', APPROVERS)).toEqual(none)
})

test('a team role with no email, or one outside @avenuez.com, gets nothing', () => {
  expect(noteCapabilities('INTERNAL_ADMIN', null, APPROVERS)).toEqual(none)
  expect(noteCapabilities('INTERNAL_ADMIN', 'someone@example.com', APPROVERS)).toEqual(none)
})

test('no role or an unknown role gets nothing', () => {
  expect(noteCapabilities(undefined, 'approver@avenuez.com', APPROVERS)).toEqual(none)
  expect(noteCapabilities('SUPERUSER', 'approver@avenuez.com', APPROVERS)).toEqual(none)
})

test('notes read their own list: Commentary\'s COMMENTARY_APPROVERS grants nothing here', () => {
  vi.stubEnv('COMMENTARY_APPROVERS', 'approver@avenuez.com')
  vi.stubEnv('CHART_NOTES_APPROVERS', undefined)
  expect(noteCapabilities('INTERNAL_ADMIN', 'approver@avenuez.com')).toEqual({ canEdit: true, canApprove: false })
  vi.stubEnv('CHART_NOTES_APPROVERS', 'approver@avenuez.com')
  expect(noteCapabilities('INTERNAL_ADMIN', 'approver@avenuez.com')).toEqual({ canEdit: true, canApprove: true })
})
