import { expect, test } from 'vitest'
import { noteCapabilities } from './permissions'

const APPROVERS = 'approver@avenuez.com'
const none = { canEdit: false, canApprove: false }

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
  process.env.COMMENTARY_APPROVERS = 'approver@avenuez.com'
  delete process.env.CHART_NOTES_APPROVERS
  expect(noteCapabilities('INTERNAL_ADMIN', 'approver@avenuez.com')).toEqual({ canEdit: true, canApprove: false })
  process.env.CHART_NOTES_APPROVERS = 'approver@avenuez.com'
  expect(noteCapabilities('INTERNAL_ADMIN', 'approver@avenuez.com')).toEqual({ canEdit: true, canApprove: true })
  delete process.env.COMMENTARY_APPROVERS
  delete process.env.CHART_NOTES_APPROVERS
})
