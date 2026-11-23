// lib/peec/owned-hosts.test.ts
import { describe, it, expect } from 'vitest'
import { ownedHostKeys, isOwnedHost } from './owned-hosts'

describe('isOwnedHost (FB-050 suffix rule)', () => {
  const owned = ownedHostKeys([{ domain: 'www.X.com' }, { domain: '' }])

  it('normalises Own domains to join keys', () => {
    expect([...owned]).toEqual(['x.com'])
  })
  it('owns the root and its subdomains', () => {
    expect(isOwnedHost('x.com', owned)).toBe(true)
    expect(isOwnedHost('blog.x.com', owned)).toBe(true)
  })
  it('does not own a host that merely ends with the same letters', () => {
    expect(isOwnedHost('notx.com', owned)).toBe(false)
  })
  it('null is not owned', () => {
    expect(isOwnedHost(null, owned)).toBe(false)
  })
})
