import { expect, test } from 'vitest'
import { ERROR_CODES } from '@/lib/aeo-outbound/error-codes'
import { failureText } from './failure-text'

const ID = '00000000-0000-4000-8000-000000000001'
test.each([
  ['no_project', "This Peec project isn't available any more. Pick another."],
  ['own_brand_count', "In Peec, mark exactly one brand as the client's own brand, then Rerun."],
  ['no_data', 'Peec has no data for this project in that period. Pick other dates.'],
  ['own_brand_no_row', "Peec's report for this period is empty. Pick other dates or check the project in Peec."],
  ['zero_retrievals', "Peec's report for this period is empty. Pick other dates or check the project in Peec."],
  ['history_too_long', 'Peec took too long on the full history. Pick a start and end date (90 days at most) and generate again.'],
  ['timeout', 'Peec or the copy writer took too long. Rerun.'],
  ['copy_failed', `Writing the copy failed. Rerun. If it fails twice, send engineering this id: ${ID}.`],
  ['copy_outside_sources', `Writing the copy failed. Rerun. If it fails twice, send engineering this id: ${ID}.`],
  ['peec_error', 'Peec returned an error. Rerun in a few minutes.'],
  ['contract_violation', `Peec's data changed shape (peec.brands_report.visibility). Send engineering this id: ${ID}.`],
  ['stale', 'It stopped before finishing. Rerun.'],
  ['internal', `Something went wrong on our side. Rerun, or send engineering this id: ${ID}.`],
])('the code-to-text map: %s', (code, text) => {
  expect(failureText(code, 'peec.brands_report.visibility', ID)).toBe(text)
})
test('every error code has its own words, and a row with no code shows its stored text', () => {
  for (const c of ERROR_CODES) expect(failureText(c, 'stored', ID)).not.toBe('stored')
  expect(failureText(null, 'Copy generation failed. Rerun.', ID)).toBe('Copy generation failed. Rerun.')
  expect(failureText('some_future_code', 'Stored text.', ID)).toBe('Stored text.')
  expect(failureText(null, null, ID)).toBe('')
})
