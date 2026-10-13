import { afterEach, expect, test, vi } from 'vitest'
import { martRef } from './client'

afterEach(() => vi.unstubAllEnvs())

test('martRef defaults to the prod marts dataset', () => {
  vi.stubEnv('BQ_MARTS_DATASET', '')
  expect(martRef('mart_x')).toBe('`avenue-z-data-warehouse-prod.marts.mart_x`')
})
test('martRef honours BQ_MARTS_DATASET', () => {
  vi.stubEnv('BQ_MARTS_DATASET', 'dbt_dev_marts')
  expect(martRef('mart_x')).toBe('`avenue-z-data-warehouse-prod.dbt_dev_marts.mart_x`')
})
test('martRef refuses a dataset or table name that could inject SQL', () => {
  vi.stubEnv('BQ_MARTS_DATASET', 'marts`; drop')
  expect(() => martRef('mart_x')).toThrow(/invalid/)
  vi.stubEnv('BQ_MARTS_DATASET', '')
  expect(() => martRef('mart x')).toThrow(/invalid/)
})
