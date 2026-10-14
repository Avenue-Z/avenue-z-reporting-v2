import { expect, test } from 'vitest'
import { FRAME_HEIGHT, FRAME_MIN_HEIGHT, toolbarHeightVar } from './frame-height'

test('spec 2026-10-14 editor space §4.2: the frame is the screen under the toolbar, 16px above and below, and the fallback is the old 140px', () => {
  expect(FRAME_HEIGHT).toBe('calc(100vh - var(--aeo-toolbar-h, 108px) - 32px)')
  expect(FRAME_MIN_HEIGHT).toBe(320)
})

test('the toolbar height rounds up to a whole pixel, so a draft never scrolls by a fraction', () => {
  expect(toolbarHeightVar(51)).toBe('51px')
  expect(toolbarHeightVar(50.4)).toBe('51px')
  expect(toolbarHeightVar(0)).toBe('0px')
})
