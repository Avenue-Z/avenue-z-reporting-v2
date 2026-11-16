import { expect, test } from 'vitest'
import { cleanSearch, toHubRow } from './hub-rows'
import type { ReportSummary } from './store'

const NOW = Date.parse('2026-10-08T15:00:00Z')
const S = {
  id: 'c7d8e0a1-1111-4111-8111-111111111111', peecProjectId: 'or_a', peecProjectName: 'Acme pitch', brandName: null, status: 'generating',
  error: null, errorCode: null, progressStep: 4, shareToken: 'tok', shareRecipient: null, openCount: 0, firstOpenedAt: null, lastOpenedAt: null,
  createdAt: new Date('2026-10-08T14:50:00Z'), createdBy: 'ryan@avenuez.com', approvedAt: null, approvedBy: null, shareRevokedAt: null,
  requestedStart: '2026-09-01', requestedEnd: '2026-09-30', opensPerson: 0, opensAutomated: 0,
} as unknown as ReportSummary

test('a hub row is plain data: the project name stands in for a missing brand, a stale generating row reads failed with the stale code', () => {
  expect(toHubRow(S, NOW)).toEqual({
    id: S.id, brand: 'Acme pitch', linkBrand: null, projectId: 'or_a', projectName: 'Acme pitch', status: 'failed',
    createdAt: '2026-10-08T14:50:00.000Z', createdBy: 'ryan@avenuez.com', approvedAt: null,
    error: 'Timed out', errorCode: 'stale', progressStep: 4, token: null, recipient: null,
    openCount: 0, opensPerson: 0, opensAutomated: 0, firstOpenedAt: null, lastOpenedAt: null,
    requestedStart: '2026-09-01', requestedEnd: '2026-09-30',
  })
  const live = toHubRow({ ...S, status: 'approved', brandName: 'Acme', approvedAt: new Date('2026-10-02T15:00:00Z'), openCount: 3, opensPerson: 1, opensAutomated: 2 } as ReportSummary, NOW)
  expect(live).toMatchObject({ status: 'live', brand: 'Acme', linkBrand: 'Acme', token: 'tok', approvedAt: '2026-10-02T15:00:00.000Z', opensPerson: 1, opensAutomated: 2 })
})

test('search text is trimmed, collapsed, capped at 100 characters, the first of several, and empty means none', () => {
  expect(cleanSearch('  Acme \n  Co ')).toBe('Acme Co')
  expect(cleanSearch(['one', 'two'])).toBe('one')
  expect(cleanSearch('x'.repeat(150))).toHaveLength(100)
  for (const v of [undefined, null, '', '   ', 5]) expect(cleanSearch(v)).toBeNull()
})
