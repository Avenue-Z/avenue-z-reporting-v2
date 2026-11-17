import { describe, expect, test } from 'vitest'
import { render } from '@testing-library/react'
import { DataDelayedNotice, adsNoticeText } from './data-delayed-notice'

describe('adsNoticeText (C3)', () => {
  test('a range ending today, or stale marts: data delayed, showing through the newest day', () => {
    expect(adsNoticeText({ kind: 'clipped', from: null, through: '2026-11-16', empty: false }))
      .toBe('Data delayed — showing through Nov 16, 2026.')
  })
  test('on the Overview it names the channel', () => {
    expect(adsNoticeText({ kind: 'clipped', from: null, through: '2026-11-16', empty: false }, 'Paid Search'))
      .toBe('Paid Search data delayed — showing through Nov 16, 2026.')
  })
  test('a range starting before the history floor says where it now starts', () => {
    expect(adsNoticeText({ kind: 'clipped', from: '2026-04-01', through: null, empty: false }))
      .toBe('Paid Search history starts Apr 1, 2026, so this range is shown from then.')
  })
  test('Year to Date is clipped at both ends: both sentences', () => {
    expect(adsNoticeText({ kind: 'clipped', from: '2026-04-01', through: '2026-11-16', empty: false }))
      .toBe('Data delayed — showing through Nov 16, 2026. Paid Search history starts Apr 1, 2026, so this range is shown from then.')
  })
  test('nothing of the range is in yet', () => {
    expect(adsNoticeText({ kind: 'clipped', from: null, through: '2026-11-15', empty: true }))
      .toBe('Data delayed — showing through Nov 15, 2026, so this range has no data yet.')
  })
  test('a range entirely before the history floor', () => {
    expect(adsNoticeText({ kind: 'clipped', from: '2026-04-01', through: null, empty: true }))
      .toBe('Paid Search history starts Apr 1, 2026, so this range has no data.')
  })
  test('BigQuery failed', () => {
    expect(adsNoticeText({ kind: 'unavailable' })).toBe("Data delayed — Paid Search data can't be loaded right now. Try again shortly.")
  })
})

describe('DataDelayedNotice', () => {
  test('renders nothing without a notice', () => {
    expect(render(<DataDelayedNotice notice={null} />).container.innerHTML).toBe('')
  })
  test('renders the text as a note that prints in the PDF', () => {
    const { getByRole } = render(<DataDelayedNotice notice={{ kind: 'clipped', from: null, through: '2026-11-16', empty: false }} />)
    const note = getByRole('note')
    expect(note.textContent).toBe('Data delayed — showing through Nov 16, 2026.')
    expect(note.hasAttribute('data-export-block')).toBe(true)
    expect(note.hasAttribute('data-export-hide')).toBe(false)
  })
})
