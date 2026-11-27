import { describe, it, expect } from 'vitest'
import { brandDomainRows, usedAsSourceByBrand, multiRowBrands, distinctAnswersByBrand, distinctAnswersByBrandModel } from './used-as-source'

const rows = [
  { domain: 'renaissancebenefits.com', answers: 3294, totalAnswers: 8981 },
  { domain: 'guardianlife.com', answers: 1855, totalAnswers: 8981 },
  { domain: 'www.metlife.com', answers: 600, totalAnswers: 8981 },
  { domain: 'investor.metlife.com', answers: 500, totalAnswers: 8981 },
]
const brands = [
  { name: 'Renaissance', domains: ['renaissancebenefits.com', 'tenncare.renaissancebenefits.com'] },
  { name: 'Guardian', domains: ['guardianlife.com'] },
  { name: 'Dearborn', domains: ['dearborngroup.com'] },
  { name: 'NoDomains', domains: [] },
  { name: 'MetLife', domains: ['metlife.com'] },
]

describe('brandDomainRows', () => {
  it('matches a bare domain, its www form and subdomains', () => {
    expect(brandDomainRows(['metlife.com'], rows).map((r) => r.domain)).toEqual(['www.metlife.com', 'investor.metlife.com'])
  })
})

describe('usedAsSourceByBrand', () => {
  it('computes one-row brands, zero and null cases', () => {
    const m = usedAsSourceByBrand(brands, rows)
    expect(m.get('Renaissance')).toBeCloseTo(36.68, 2)
    expect(m.get('Guardian')).toBeCloseTo(20.65, 2)
    expect(m.get('Dearborn')).toBe(0)
    expect(m.get('NoDomains')).toBeNull()
    expect(m.get('MetLife')).toBeNull()
  })
  it('uses distinct answers for a multi-row brand', () => {
    const m = usedAsSourceByBrand(brands, rows, new Map([['MetLife', 900]]))
    expect(m.get('MetLife')).toBeCloseTo(10.02, 2)
  })
  it('is null for every brand when the window has no rows', () => {
    const m = usedAsSourceByBrand(brands, [])
    expect([...m.values()].every((v) => v === null)).toBe(true)
  })
})

describe('multiRowBrands', () => {
  it('lists brands with more than one matching row', () => {
    expect(multiRowBrands(brands, rows)).toEqual([{ name: 'MetLife', domains: ['www.metlife.com', 'investor.metlife.com'] }])
  })
})

describe('distinctAnswersByBrand', () => {
  it('counts distinct chat ids across a brand\'s domains', () => {
    const multi = [{ name: 'MetLife', domains: ['www.metlife.com', 'investor.metlife.com'] }]
    const chats = [
      { domain: 'www.metlife.com', chat: { id: 'c1' } },
      { domain: 'investor.metlife.com', chat: { id: 'c1' } },
      { domain: 'www.metlife.com', chat: { id: 'c2' } },
      { domain: 'other.com', chat: { id: 'c9' } },
      { domain: 'www.metlife.com' },
    ]
    expect(distinctAnswersByBrand(multi, chats).get('MetLife')).toBe(2)
  })
})

describe('distinctAnswersByBrandModel', () => {
  const multi = [{ name: 'MetLife', domains: ['www.metlife.com', 'investor.metlife.com'] }]
  it('counts a chat on two of the brand domains once per model', () => {
    const m = distinctAnswersByBrandModel(multi, [
      { domain: 'www.metlife.com', chat: { id: 'c1' }, model: { id: 'chatgpt-4o' } },
      { domain: 'investor.metlife.com', chat: { id: 'c1' }, model: { id: 'chatgpt-4o' } },
      { domain: 'www.metlife.com', chat: { id: 'c2' }, model_channel: { id: 'gemini-scraper' } },
      { domain: 'other.com', chat: { id: 'c3' }, model: { id: 'chatgpt-4o' } },
    ])
    expect(m.get('MetLife')?.get('ChatGPT')).toBe(1)
    expect(m.get('MetLife')?.get('Gemini')).toBe(1)
  })
})
