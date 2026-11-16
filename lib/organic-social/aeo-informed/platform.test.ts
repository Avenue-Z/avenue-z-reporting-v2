// lib/organic-social/aeo-informed/platform.test.ts
import { describe, it, expect } from 'vitest'
import { peecPlatformOf } from './platform'

describe('peecPlatformOf: the eight platforms Peec can register a channel on', () => {
  it.each([
    ['https://www.linkedin.com/pulse/x', 'linkedin'], ['https://www.youtube.com/watch?v=a', 'youtube'], ['https://youtu.be/abc', 'youtube'],
    ['https://m.youtube.com/watch?v=a', 'youtube'], ['https://www.instagram.com/p/a', 'instagram'], ['https://www.tiktok.com/@a/video/1', 'tiktok'],
    ['https://old.reddit.com/r/x', 'reddit'], ['https://medium.com/@a/post', 'medium'], ['https://www.facebook.com/a/posts/1', 'facebook'],
    ['https://www.quora.com/question', 'quora'],
  ])('%s is %s', (u, p) => expect(peecPlatformOf(u)).toBe(p))
  it.each(['https://notlinkedin.com/x', 'https://linkedin.com.evil.example/x', 'https://example.com', 'not a url', ''])('%s has none', (u) => expect(peecPlatformOf(u)).toBeNull())
})
