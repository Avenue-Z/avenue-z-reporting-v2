// lib/organic-social/aeo-informed/contract-yaml.test.ts
// The YAML files in docs/contracts/aeo-informed-social/ are generated from contract.ts. If someone edits either by hand, this fails.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { renderContractFiles, CONTRACT_DIR } from './contract-yaml'

const root = join(process.cwd(), CONTRACT_DIR)
const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [relative(root, p)] })

describe('the committed contract files match what contract.ts generates', () => {
  const expected = renderContractFiles()
  it('every generated file exists on disk with identical content', () => {
    for (const [path, text] of Object.entries(expected)) expect(readFileSync(join(root, path), 'utf8'), path).toBe(text)
  })
  it('there is no stray file in the folder (README.md is the only hand-written one)', () => {
    const onDisk = walk(root).filter((p) => p !== 'README.md').sort()
    expect(onDisk).toEqual(Object.keys(expected).sort())
  })
})

describe('the generator refuses what it cannot render faithfully', () => {
  it('throws on an attribute combination it does not emit', async () => {
    const { jsonTypeForTest } = await import('./contract-yaml')
    expect(() => jsonTypeForTest({ name: 'a', kind: 'bool', nullable: true })).toThrow(/unsupported/)
    expect(() => jsonTypeForTest({ name: 'a', kind: 'int', max: 3 })).toThrow(/unsupported/)
    expect(() => jsonTypeForTest({ name: 'a', kind: 'idList', nullable: true })).toThrow(/unsupported/)
    expect(() => jsonTypeForTest({ name: 'a', kind: 'string', oneOf: ['x'] })).toThrow(/unsupported/)
  })
})

describe('what is generated', () => {
  const files = renderContractFiles()
  it('declares 6 raw boundaries, 1 input and 5 outputs, all in observe mode', () => {
    const c = files['contract.yaml']
    expect((c.match(/mode: observe/g) ?? []).length).toBe(12)
    expect(c).not.toMatch(/mode: (warn|enforce)/)
    expect(c).toContain('system: aeo-informed-social')
  })
  it('every output schema lists its fields in order, with nullability and ranges', () => {
    const s = files['schemas/aeo/socials_table/1.0.0.yaml']
    expect(s).toContain('{name: rank, type: int, minimum: 1}')
    expect(s).toContain('{name: retrievalsDelta, type: int, nullable: true}')
    expect(s).toContain('{name: retrievedPct, type: float, minimum: 0, maximum: 1}')
    expect(files['schemas/aeo/graph_points/1.0.0.yaml']).toContain('enum: ["used_as_source_all", "citations_all", "citations_linkedin", "citations_instagram"]')
  })
  it('a raw schema is a JSON Schema with the required fields of the contract', () => {
    const s = files['schemas/peec/reports_urls_response/1.0.0.yaml']
    expect(s).toContain('"citation_position_sum"')
    expect(s).toContain('kind: payload')
    expect(s).not.toMatch(/"required": \[[^\]]*"channel_title"/) // optional: not in the required list
  })
  it('the generated files say they are generated', () => {
    for (const [p, t] of Object.entries(files)) expect(t, p).toContain('contract.ts')
  })
})
