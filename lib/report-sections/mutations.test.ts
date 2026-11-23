import { describe, expect, test } from 'vitest'
import { applyClientVisible, isClientVisible, mergePreservingSharedParts, INTERNAL_ONLY_BLOCKS } from './mutations'

const VK = 'peec-ai:content-impact'

describe('client visibility', () => {
  test('merge keeps clientVisible from prev', () => {
    const merged = mergePreservingSharedParts({ clientVisible: ['prompt-gaps'] }, { hidden: ['x'] })
    expect(merged.clientVisible).toEqual(['prompt-gaps'])
  })
  test('merge never lets the incoming body set clientVisible', () => {
    expect(mergePreservingSharedParts(undefined, { clientVisible: ['prompt-gaps'] }).clientVisible).toBeUndefined()
    expect(mergePreservingSharedParts({}, { clientVisible: ['prompt-gaps'] }).clientVisible).toBeUndefined()
  })
  test('applyClientVisible adds then removes, other fields untouched', () => {
    const base = { other: { hidden: ['z'] }, [VK]: { hidden: ['a'] } }
    const on = applyClientVisible(base, VK, 'prompt-gaps', true)
    expect(on[VK]).toEqual({ hidden: ['a'], clientVisible: ['prompt-gaps'] })
    expect(on.other).toEqual({ hidden: ['z'] })
    const twice = applyClientVisible(on, VK, 'prompt-gaps', true)
    expect(twice[VK].clientVisible).toEqual(['prompt-gaps'])
    const off = applyClientVisible(on, VK, 'prompt-gaps', false)
    expect(off[VK].clientVisible).toEqual([])
    expect(off[VK].hidden).toEqual(['a'])
  })
  test('isClientVisible false when absent', () => {
    expect(isClientVisible(undefined, VK, 'prompt-gaps')).toBe(false)
    expect(isClientVisible(null, VK, 'prompt-gaps')).toBe(false)
    expect(isClientVisible({}, VK, 'prompt-gaps')).toBe(false)
    expect(isClientVisible({ [VK]: { clientVisible: ['prompt-gaps'] } }, VK, 'prompt-gaps')).toBe(true)
  })
  test('prompt-gaps is internal-only', () => {
    expect(INTERNAL_ONLY_BLOCKS).toContain('prompt-gaps')
  })
})
