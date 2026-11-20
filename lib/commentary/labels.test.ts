import { expect, test } from 'vitest'
import { ANALYSIS_LABELS, INSIGHTS_LABELS, INSIGHTS_OUTLINE, KEYWORD_LABELS, RECOMMENDATIONS_LABELS, addText, emptyMonthText, emptyText, untouchedOutline } from './labels'

test('the Insights wording', () => {
  expect(INSIGHTS_LABELS).toEqual({ title: 'Insights', noun: 'insights', outline: INSIGHTS_OUTLINE })
  expect(addText(INSIGHTS_LABELS)).toBe('Add insights')
  expect(emptyText(INSIGHTS_LABELS)).toBe('No insights yet.')
  expect(emptyMonthText(INSIGHTS_LABELS, 'September 2026')).toBe('No insights for September 2026 yet')
})

test('the Recommendations wording', () => {
  expect(RECOMMENDATIONS_LABELS).toEqual({ title: 'Recommendations', noun: 'recommendations', outline: null })
  expect(addText(RECOMMENDATIONS_LABELS)).toBe('Add recommendations')
  expect(emptyText(RECOMMENDATIONS_LABELS)).toBe('No recommendations yet.')
  expect(emptyMonthText(RECOMMENDATIONS_LABELS, 'September 2026')).toBe('No recommendations for September 2026 yet')
})

test('labels are plain data, so they can cross the RSC boundary', () => {
  expect(JSON.parse(JSON.stringify(RECOMMENDATIONS_LABELS))).toEqual(RECOMMENDATIONS_LABELS)
})

// Paul, #334 round 2 (tracked item): the Recommendations box seeded the Insights outline. Each box carries its own
// outline with its labels; Recommendations has none, so it opens empty and the untouched-outline guard never fires.
test('the Insights outline is the suggested structure, verbatim; Recommendations has none', () => {
  expect(INSIGHTS_OUTLINE).toBe(
    '<ul>' +
    '<li>Headline with business framing</li>' +
    '<li>Prior-period change</li>' +
    '<li>Why it changed</li>' +
    '<li>Operational caveats</li>' +
    '<li>Bigger-picture trend context</li>' +
    '<li>Cross-channel notes</li>' +
    '<li>Risks or watchouts, if relevant</li>' +
    '<li>Next steps</li>' +
    '</ul>')
})

test('the untouched-outline guard: only a non-null outline can be untouched', () => {
  expect(untouchedOutline(INSIGHTS_OUTLINE, INSIGHTS_OUTLINE)).toBe(true)
  expect(untouchedOutline('<ul><li>Headline with business framing</li><li>Prior-period change</li><li>Why it changed</li><li>Operational caveats</li><li>Bigger-picture trend context</li><li>Cross-channel notes</li><li>Risks or watchouts, if relevant</li><li>Next steps</li></ul> ', INSIGHTS_OUTLINE)).toBe(true)
  expect(untouchedOutline('<p>Real words</p>', INSIGHTS_OUTLINE)).toBe(false)
  expect(untouchedOutline('', null)).toBe(false)
  expect(untouchedOutline('<p></p>', null)).toBe(false)
})

test('the Social Listening analysis and keyword wording (spec section 9): no outline', () => {
  expect(ANALYSIS_LABELS).toEqual({ title: 'Analysis', noun: 'analysis', outline: null })
  expect(addText(ANALYSIS_LABELS)).toBe('Add analysis')
  expect(emptyMonthText(ANALYSIS_LABELS, 'October 2026')).toBe('No analysis for October 2026 yet')
  expect(KEYWORD_LABELS).toEqual({ title: 'Keywords in this topic', noun: 'keywords', outline: null })
  expect(addText(KEYWORD_LABELS)).toBe('Add keywords')
  expect(JSON.parse(JSON.stringify(KEYWORD_LABELS))).toEqual(KEYWORD_LABELS)
})
