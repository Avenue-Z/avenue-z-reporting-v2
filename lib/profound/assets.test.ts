import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/cache', () => ({ cached: (_v: string, _n: string, fn: unknown) => fn }))

import { assetDomains, type ProfoundAsset } from './assets'

const asset = (website: string | null, alternateDomains: string[] = []): ProfoundAsset => ({ name: 'A', website, alternateDomains, isOwned: false })

// Final review M5: Profound stores websites as typed, so they are normalised to a bare host before matching hostnames.
describe('assetDomains', () => {
  it('strips the protocol, path and query and lowercases', () => {
    expect(assetDomains(asset('https://AvenueZ.com/about?x=1'))).toEqual(['avenuez.com'])
  })
  it('strips a port and a trailing dot', () => {
    expect(assetDomains(asset('avenuez.com:443'))).toEqual(['avenuez.com'])
    expect(assetDomains(asset('avenuez.com.'))).toEqual(['avenuez.com'])
  })
  // Security review ruling: parsed with the URL API; never a suffix key a whole TLD would match.
  it('drops a host with no dot or a leading dot, and anything unparseable', () => {
    expect(assetDomains(asset('com'))).toEqual([])
    expect(assetDomains(asset('.avenuez.com'))).toEqual([])
    expect(assetDomains(asset('https://exa mple.com'))).toEqual([])
    expect(assetDomains(asset('co.uk'))).toEqual(['co.uk'])
  })
  it('strips credentials and an explicit port, and reads a protocol-relative host', () => {
    expect(assetDomains(asset('https://user@avenuez.com:8443/x'))).toEqual(['avenuez.com'])
    expect(assetDomains(asset('//avenuez.com/path'))).toEqual(['avenuez.com'])
  })
  it('normalises alternate domains too and drops empty entries', () => {
    expect(assetDomains(asset(null, ['http://Blog.AvenueZ.com/', '  ', 'https://']))).toEqual(['blog.avenuez.com'])
  })
})
