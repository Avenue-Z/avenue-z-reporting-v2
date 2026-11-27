import { describe, it, expect } from 'vitest'
import { TA_SOURCES, isTaSource } from './types'

describe('isTaSource', () => {
  it('accepts the five sources and rejects others', () => {
    expect(TA_SOURCES.every(isTaSource)).toBe(true)
    expect(TA_SOURCES).toHaveLength(5)
    expect(isTaSource('gsc_cwv')).toBe(false)
  })
})
