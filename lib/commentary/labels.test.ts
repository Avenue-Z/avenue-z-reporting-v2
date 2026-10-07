import { expect, test } from 'vitest'
import { INSIGHTS_LABELS, RECOMMENDATIONS_LABELS, addText, emptyMonthText, emptyText } from './labels'

test('the Insights wording', () => {
  expect(INSIGHTS_LABELS).toEqual({ title: 'Insights', noun: 'insights' })
  expect(addText(INSIGHTS_LABELS)).toBe('Add insights')
  expect(emptyText(INSIGHTS_LABELS)).toBe('No insights yet.')
  expect(emptyMonthText(INSIGHTS_LABELS, 'September 2026')).toBe('No insights for September 2026 yet')
})

test('the Recommendations wording', () => {
  expect(RECOMMENDATIONS_LABELS).toEqual({ title: 'Recommendations', noun: 'recommendations' })
  expect(addText(RECOMMENDATIONS_LABELS)).toBe('Add recommendations')
  expect(emptyText(RECOMMENDATIONS_LABELS)).toBe('No recommendations yet.')
  expect(emptyMonthText(RECOMMENDATIONS_LABELS, 'September 2026')).toBe('No recommendations for September 2026 yet')
})

test('labels are plain data, so they can cross the RSC boundary', () => {
  expect(JSON.parse(JSON.stringify(RECOMMENDATIONS_LABELS))).toEqual(RECOMMENDATIONS_LABELS)
})
