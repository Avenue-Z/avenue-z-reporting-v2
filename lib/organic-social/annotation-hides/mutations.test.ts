import { expect, test } from 'vitest'
import { authorizeAnnotationHide } from './mutations'

const OK = { channel: 'INSTAGRAM', chart: 'followers', day: '2026-08-10', hidden: true }

test('accepts a real platform, chart and day', () => {
  expect(authorizeAnnotationHide(OK)).toEqual({ ok: true })
  expect(authorizeAnnotationHide({ ...OK, chart: 'engagements', hidden: false })).toEqual({ ok: true })
})

test('rejects an unknown platform', () => {
  expect(authorizeAnnotationHide({ ...OK, channel: 'MYSPACE' })).toEqual({ ok: false, error: 'invalid channel' })
})

test('rejects an unknown chart', () => {
  expect(authorizeAnnotationHide({ ...OK, chart: 'reach' })).toEqual({ ok: false, error: 'invalid chart' })
})

test('rejects a day that is not yyyy-mm-dd', () => {
  expect(authorizeAnnotationHide({ ...OK, day: '8/10/2026' })).toEqual({ ok: false, error: 'invalid day' })
})

test('rejects a day that does not exist', () => {
  expect(authorizeAnnotationHide({ ...OK, day: '2026-02-30' })).toEqual({ ok: false, error: 'invalid day' })
})

test('rejects a hidden flag that is not true or false', () => {
  expect(authorizeAnnotationHide({ ...OK, hidden: 'yes' })).toEqual({ ok: false, error: 'invalid hidden' })
})
