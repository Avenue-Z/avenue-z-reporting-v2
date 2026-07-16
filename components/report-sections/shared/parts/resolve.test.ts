import { describe, expect, test } from 'vitest'
import { resolveSharedParts } from './resolve'
import type { PartRegistry } from '@/lib/report-sections/types'

const REG: PartRegistry<unknown> = {
  commentary: { 1: { id: 'commentary', version: 1, published: true, defaultLabel: 'Commentary', render: () => null } },
}

describe('resolveSharedParts', () => {
  test('resolves an opted-in shared part with its label', () => {
    expect(resolveSharedParts([{ id: 'commentary', version: 1 }], REG))
      .toEqual([{ id: 'commentary', version: 1, label: 'Commentary' }])
  })
  test('undefined / empty → []', () => {
    expect(resolveSharedParts(undefined, REG)).toEqual([])
    expect(resolveSharedParts([], REG)).toEqual([])
  })
  test('drops a pin whose id/version is not in the registry', () => {
    expect(resolveSharedParts([{ id: 'commentary', version: 9 }, { id: 'nope', version: 1 }], REG)).toEqual([])
  })
  test('preserves array order as render order', () => {
    const reg: PartRegistry<unknown> = {
      a: { 1: { id: 'a', version: 1, published: true, defaultLabel: 'A', render: () => null } },
      commentary: REG.commentary,
    }
    expect(resolveSharedParts([{ id: 'commentary', version: 1 }, { id: 'a', version: 1 }], reg).map((r) => r.id))
      .toEqual(['commentary', 'a'])
  })
})
