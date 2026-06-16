// lib/url.test.ts
// Run: npx tsx lib/url.test.ts
import { strict as assert } from 'node:assert'
import { urlJoinKey, labelFromPath } from './url'

assert.equal(urlJoinKey('https://www.Example.com/Blog/Post/'), 'example.com/blog/post')
assert.equal(urlJoinKey('http://example.com/a?b=1#x'), 'example.com/a')
assert.equal(urlJoinKey('https://example.com'), 'example.com')
assert.equal(urlJoinKey('/Guide/Intro/'), '/guide/intro')
assert.equal(urlJoinKey('/'), '/')
assert.equal(urlJoinKey('Example.com/Path'), 'example.com/path')
assert.equal(urlJoinKey(''), null)
assert.equal(urlJoinKey(undefined), null)
assert.equal(urlJoinKey('   '), null)

// labelFromPath: derive a readable title from a URL/path slug (last segment)
assert.equal(labelFromPath('/blog/openai-amazon-multi-year-strategic-partnership'), 'Openai Amazon Multi Year Strategic Partnership')
assert.equal(labelFromPath('https://avenuez.com/blog/good-cro-playbook'), 'Good Cro Playbook')
assert.equal(labelFromPath('/blog/post_with_underscores'), 'Post With Underscores')
assert.equal(labelFromPath('/blog/x/'), 'X')        // trailing slash normalized
assert.equal(labelFromPath('/services'), 'Services')
assert.equal(labelFromPath('/'), 'Home')
assert.equal(labelFromPath(''), '')
assert.equal(labelFromPath(null), '')
assert.equal(labelFromPath(undefined), '')

console.log('url.test.ts: all assertions passed')
