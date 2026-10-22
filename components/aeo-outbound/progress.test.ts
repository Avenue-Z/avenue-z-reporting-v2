import { expect, test } from 'vitest'
import { PROGRESS_STEPS, SECOND_ATTEMPT_LABEL, SLOW, elapsedLabel, isSlow, progressText, progressView } from './progress'

const START = '2026-10-08T15:00:00.000Z'
const at = (s: number) => Date.parse(START) + s * 1000
test('every step label, in order (spec v1.1 §16.3); there is no step 7, and no step 8 since the pull stopped reading Peec\'s actions', () => {
  expect(PROGRESS_STEPS.map((r) => [r.step, r.label])).toEqual([
    [1, 'Finding the project in Peec'], [2, 'Reading the brands tracked'], [3, 'Reading the project profile'], [4, 'Finding the days with data'],
    [5, 'Loading brand visibility and AI models'], [6, 'Loading the sources AI used'], [9, 'Writing the copy'],
  ])
  expect(SECOND_ATTEMPT_LABEL).toBe('Writing the copy, second attempt')
})
test('the one-line form: the current step, an ellipsis, then minutes and seconds', () => {
  expect(progressText(4, START, at(18))).toBe('Finding the days with data… 0:18')
  expect(progressText(0, START, at(2))).toBe('Starting… 0:02')
  expect(progressText(2, START, at(4))).toBe('Reading the brands tracked… 0:04')
  expect(progressText(9, START, at(41))).toBe('Writing the copy… 0:41')
  expect(progressText(10, START, at(65))).toBe('Writing the copy, second attempt… 1:05')
})
test('a client clock behind the server shows 0:00', () => {
  expect(progressText(1, START, at(-5))).toBe('Finding the project in Peec… 0:00')
  expect(elapsedLabel(Number.NaN)).toBe('0:00')
  expect(progressText(1, 'not a date', at(5))).toBe('Finding the project in Peec… 0:00')
})
test('the checklist: rows before the step done, the step current, later rows waiting; the bar counts done rows of 7', () => {
  const states = (step: number) => progressView(step).rows.map((r) => r.state)
  expect(progressView(0)).toEqual({ rows: PROGRESS_STEPS.map((r) => ({ label: r.label, state: 'waiting' })), done: 0, total: 7, current: 'Starting' })
  expect(states(1)).toEqual(['current', 'waiting', 'waiting', 'waiting', 'waiting', 'waiting', 'waiting'])
  expect(states(5)).toEqual(['done', 'done', 'done', 'done', 'current', 'waiting', 'waiting'])
  expect([progressView(5).done, progressView(5).current]).toEqual([4, 'Loading brand visibility and AI models'])
  expect(states(6)).toEqual(['done', 'done', 'done', 'done', 'done', 'current', 'waiting'])
  // A row a pull before this change left at step 8 shows the step before it, never "Starting".
  expect(progressView(8)).toEqual(progressView(6))
  expect(progressView(9).done).toBe(6)
  expect(progressView(10).rows[6]).toEqual({ label: 'Writing the copy, second attempt', state: 'current' })
  expect(progressView(10).done).toBe(6)
  expect(progressView(Number.NaN).current).toBe('Starting')
})
test('slow after 90 seconds, with the stop time from the generation deadline', () => {
  expect(isSlow(89_999)).toBe(false)
  expect(isSlow(90_000)).toBe(true)
  expect(SLOW).toBe('Taking longer than usual. It stops by itself after 4 minutes 30 seconds.')
})
