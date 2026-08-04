import type { TopContentPost } from '../content-types'
import type { SourceType } from '../types'

// Complete hashtag tokens only: '#ad' / '#sponsored' bounded by a non-word char (or
// string end), case-insensitive. '#adventure' / '#advice' must NOT match. The tag lives
// in the caption text — 0 of 17 occurrences appeared only in a `hashtags` field, and just
// 76 of 1,962 posts populate `hashtags` at all (findings §2.1), so caption is the source.
const AD_TOKEN = /#(ad|sponsored)\b/i

/** Head-start suggestion, used ONLY where no stored designation exists. If #ad turns
 *  out not to be a standing convention (Hannah Q1), this narrows here and nowhere else;
 *  stored designations are unaffected. */
export function suggestDesignation(post: TopContentPost): SourceType {
  return AD_TOKEN.test(post.caption) ? 'influencer' : 'organic'
}
