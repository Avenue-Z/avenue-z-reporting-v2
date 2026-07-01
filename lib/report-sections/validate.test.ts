import { describe, expect, test } from 'vitest'
import { parseReportSectionConfig, parseSectionTemplate } from './validate'
import type { PartRegistry } from './types'

const reg: PartRegistry<unknown> = {
  a: { 1: { id: 'a', version: 1, published: true, defaultLabel: 'A', render: () => null } },
  x: { 2: { id: 'x', version: 2, published: true, defaultLabel: 'X', render: () => null } },
  draft: { 1: { id: 'draft', version: 1, published: false, defaultLabel: 'D', render: () => null } },
}
const registries = { 'peec-ai': reg }

describe('parseSectionTemplate', () => {
  test('accepts a valid template of published pins', () => {
    const t = parseSectionTemplate({ order: [{ id: 'a', version: 1 }], labels: { a: 'A' }, thresholds: {} }, reg)
    expect(t.order[0]).toEqual({ id: 'a', version: 1 })
  })
  test('rejects an unpublished version in a template', () => {
    expect(() => parseSectionTemplate({ order: [{ id: 'draft', version: 1 }], labels: {}, thresholds: {} }, reg)).toThrow(/not published/)
  })
  test('rejects an unknown pin', () => {
    expect(() => parseSectionTemplate({ order: [{ id: 'nope', version: 1 }], labels: {}, thresholds: {} }, reg)).toThrow(/unknown/)
  })
})

describe('parseReportSectionConfig', () => {
  test('accepts version pin + hide/order/relabel', () => {
    const c = parseReportSectionConfig({ 'peec-ai': { versions: { a: 1 }, hidden: ['a'], order: ['a'], labels: { a: 'A2' } } }, registries)
    expect(c['peec-ai'].versions).toEqual({ a: 1 })
  })
  test('rejects an unknown section slug', () => {
    expect(() => parseReportSectionConfig({ 'not-a-section': {} }, registries)).toThrow(/unknown section/)
  })
  test('rejects a non-integer version', () => {
    expect(() => parseReportSectionConfig({ 'peec-ai': { versions: { a: 1.5 } } }, registries)).toThrow(/version/)
  })
  test('rejects extraParts id duplicating a template id (use versions)', () => {
    // 'a' is a valid registry id; adding it via extraParts is the disallowed case.
    expect(() => parseReportSectionConfig({ 'peec-ai': { extraParts: [{ id: 'a', version: 1 }] } }, registries, { 'peec-ai': ['a'] })).toThrow(/extraParts/)
  })
  test('rejects a versions pin referencing an unknown id', () => {
    expect(() => parseReportSectionConfig({ 'peec-ai': { versions: { ghost: 9 } } }, registries)).toThrow(/unknown/)
  })
  test('rejects an unknown extraParts pin', () => {
    expect(() => parseReportSectionConfig({ 'peec-ai': { extraParts: [{ id: 'ghost', version: 9 }] } }, registries)).toThrow(/unknown/)
  })
  test('rejects a frozen snapshot pinning an unpublished version', () => {
    expect(() =>
      parseReportSectionConfig(
        { 'peec-ai': { frozen: { order: [{ id: 'draft', version: 1 }], labels: {}, thresholds: {} } } },
        registries,
      ),
    ).toThrow(/not published/)
  })
})
