import { expect, test } from 'vitest'
import { isStoredNotes, NOTE_KINDS, noteGroup, noteText, type NoteKind } from './notes'

test('every kind belongs to the group spec v1.1 §4 names, and an old plain-string note is a Check these item', () => {
  const groups = Object.fromEntries(NOTE_KINDS.map((k) => [k, noteGroup({ kind: k, text: 'x' })]))
  const want: Record<NoteKind, string> = {
    needs_validation: 'fill',
    number_not_in_data: 'check', domain_not_in_data: 'check', long_dash: 'check', kpi_changed: 'check', brand_changed: 'check', date_not_in_window: 'check',
    high_visibility: 'check', missing_metric: 'check', no_competitors: 'check', no_data_brands: 'check',
    unchecked_number: 'check', peec_recommends: 'check',
    rank_basis: 'about', requested_range: 'check', same_day_data: 'check', project: 'about', peec_warning: 'about', own_domains: 'about', empty_source_mix: 'about', no_profile: 'about',
  }
  expect(groups).toEqual(want)
  expect(noteGroup('An old note')).toBe('check')
  expect(noteText('An old note')).toBe('An old note')
  expect(noteText({ kind: 'long_dash', path: 'why', text: 'contains a long dash; use a period or comma' })).toBe('contains a long dash; use a period or comma')
})

test('isStoredNotes accepts strings and well-formed Notes only', () => {
  expect(isStoredNotes(['a', { kind: 'project', text: 'b' }, { kind: 'number_not_in_data', path: 'why', text: 'c' }, { kind: 'date_not_in_window', path: 'why', text: 'd' }])).toBe(true)
  for (const bad of [null, 'a', [{ kind: 'nope', text: 'x' }], [{ kind: 'project' }], [{ kind: 'project', text: 'x', path: 5 }], [5]]) expect(isStoredNotes(bad)).toBe(false)
})
