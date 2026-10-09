import { createHash } from 'node:crypto'
import { expect, test } from 'vitest'
import { AIVX_CSS } from './css'
import { AIVX_JS } from './js'
import { AIVX_FAVICON_TAG } from './favicon'
import { AIVX_SHARE_BLOCK } from './share'

const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')
test('the AIVx stylesheet and page script are byte-identical to ff18697', () => {
  expect(sha(AIVX_CSS)).toBe('2925c9bd76410aaa8e6ea832a7fd9e20d981efcb65fa68958545cf3b251c833e')
  expect(sha(AIVX_JS)).toBe('6453e61c22b1b171d3c5f951f901e356087e0dd507e9951808332255183a9bb6')
})
test('favicon and share block have the expected shape', () => {
  expect(AIVX_FAVICON_TAG.startsWith('<link rel="icon" type="image/png" href="data:image/png;base64,')).toBe(true)
  expect(AIVX_SHARE_BLOCK).toContain('class="share-toast"')
  expect(AIVX_SHARE_BLOCK).toContain("document.querySelector('.share-btn')")
  expect(AIVX_SHARE_BLOCK).not.toContain('{{')
  expect(AIVX_SHARE_BLOCK).toContain('Copy failed. Please copy: ')
  expect(AIVX_SHARE_BLOCK).not.toMatch(new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`))
})
