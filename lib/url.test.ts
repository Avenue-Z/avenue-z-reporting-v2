// lib/url.test.ts
// Run: npx tsx lib/url.test.ts
import { strict as assert } from 'node:assert'
import { urlJoinKey } from './url'

assert.equal(urlJoinKey('https://www.Example.com/Blog/Post/'), 'example.com/blog/post')
assert.equal(urlJoinKey('http://example.com/a?b=1#x'), 'example.com/a')
assert.equal(urlJoinKey('https://example.com'), 'example.com')
assert.equal(urlJoinKey('/Guide/Intro/'), '/guide/intro')
assert.equal(urlJoinKey('/'), '/')
assert.equal(urlJoinKey('Example.com/Path'), 'example.com/path')
assert.equal(urlJoinKey(''), null)
assert.equal(urlJoinKey(undefined), null)
assert.equal(urlJoinKey('   '), null)

console.log('url.test.ts: all assertions passed')
