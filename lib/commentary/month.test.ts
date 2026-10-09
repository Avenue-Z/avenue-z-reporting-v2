import { expect, test } from 'vitest'
import { clientOpensNote, eligibleEntries, isOrganicSocialViewKey, monthOfEntry, pickMonthDefault } from './month'
import type { CommentaryEntry } from './types'

const E = (id: string, periodStart: string, periodEnd: string, updatedAt = '2026-10-05T10:00:00.000Z'): CommentaryEntry => ({
  id, viewKey: 'organic-social:instagram', bodyHtml: '', periodStart, periodEnd, status: 'approved', updatedBy: 'w@avenuez.com', updatedAt,
  approvedBy: null, approvedAt: null, deletedAt: null, deletedBy: null,
})
const CLOCK = { today: '2026-10-20', lastCompleteUtcDay: '2026-10-19', liveDayInProgress: false }

test('an entry belongs to the month of its periodStart', () => {
  expect(monthOfEntry(E('a', '2026-08-01', '2026-09-05'))).toBe('2026-08')
})
test('membership AND the client cutoff; the team has no cutoff', () => {
  const all = [E('sep', '2026-09-01', '2026-09-30'), E('cross', '2026-09-01', '2026-10-19'), E('aug', '2026-08-01', '2026-08-31')]
  expect(eligibleEntries(all, '2026-09', '2026-09-30').map((e) => e.id)).toEqual(['sep'])
  expect(eligibleEntries(all, '2026-09', null).map((e) => e.id)).toEqual(['sep', 'cross'])
  expect(eligibleEntries(all, '2026-07', null)).toEqual([])
})
test('a whole-month entry is preferred over a newer rolling-window one', () => {
  expect(pickMonthDefault([E('roll', '2026-09-10', '2026-10-09', '2026-10-09T00:00:00.000Z'), E('whole', '2026-09-01', '2026-09-30', '2026-10-01T00:00:00.000Z')], '2026-09')?.id).toBe('whole')
  expect(pickMonthDefault([E('roll', '2026-09-10', '2026-10-09')], '2026-09')?.id).toBe('roll')
  expect(pickMonthDefault([], '2026-09')).toBeNull()
})
test('the team note says when clients will see an entry the cutoff still withholds (spec 3.9 example)', () => {
  expect(clientOpensNote(E('a', '2026-08-01', '2026-09-05'), { firstMonth: '2026-08' }, { ...CLOCK, today: '2026-09-15' })).toBe('Clients see this from Oct 12')
  expect(clientOpensNote(E('cross', '2026-09-01', '2026-10-19'), { firstMonth: '2026-08' }, CLOCK)).toBe('Clients see this from Nov 12')
  expect(clientOpensNote(E('sep', '2026-09-01', '2026-09-30'), { firstMonth: '2026-08' }, CLOCK)).toBeNull()
  expect(clientOpensNote(E('x', '2026-09-01', '2026-10-19'), null, CLOCK)).toBeNull()
  expect(clientOpensNote(E('x', '2026-09-01', '2026-10-19'), { firstMonth: '2026-08', opensOnDay: 3 }, CLOCK)).toBeNull()
})
test('only Organic Social view keys follow the month', () => {
  expect(['organic-social', 'organic-social:tiktok', 'organic-social:instagram'].map(isOrganicSocialViewKey)).toEqual([true, true, true])
  expect(['peec-ai', 'meta-ads', 'organic-socialx', 'paid-search'].map(isOrganicSocialViewKey)).toEqual([false, false, false, false])
})
