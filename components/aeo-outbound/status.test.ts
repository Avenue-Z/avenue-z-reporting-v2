import { expect, test } from 'vitest'
import { STATUS_UI, actionsFor, snapshotUrl } from './status'

test('actionsFor is exactly the spec §10 table', () => {
  expect(actionsFor('draft')).toEqual(['open', 'rerun', 'discard'])
  expect(actionsFor('live')).toEqual(['open', 'copy', 'revoke', 'edit', 'rerun'])
  expect(actionsFor('revoked')).toEqual(['open', 'edit', 'rerun'])
  expect(actionsFor('failed')).toEqual(['rerun', 'discard'])
  expect(actionsFor('generating')).toEqual([])
})

test('actionsFor returns a fresh array each call', () => {
  const a = actionsFor('draft')
  a.push('copy')
  expect(actionsFor('draft')).toEqual(['open', 'rerun', 'discard'])
})

test('every status has a pill label', () => {
  expect(Object.fromEntries(Object.entries(STATUS_UI).map(([k, v]) => [k, v.label]))).toEqual({
    generating: 'Generating', draft: 'Draft', live: 'Live', revoked: 'Revoked', failed: 'Failed',
  })
})

test('snapshotUrl builds the public link', () => {
  expect(snapshotUrl('https://reports.example.test', 'abc_DEF-123')).toBe('https://reports.example.test/snapshot/abc_DEF-123')
})
