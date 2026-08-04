import type { TopContentPost } from '../content-types'
import type { SourceType } from '../types'
import { suggestDesignation } from './suggest'

/** Resolution order (spec 2 §4.4): stored row → suggestDesignation() → 'organic'. */
export function resolveDesignation(post: TopContentPost, stored: Map<number, SourceType>): SourceType {
  return stored.get(post.id) ?? suggestDesignation(post)
}

/** Split into owned + influencer, stamping each post's resolved sourceType. Input
 *  order is preserved within each bucket (posts arrive engagement-sorted from
 *  fetchTopContent). Influencer posts never compete in the owned ranking. */
export function partitionPosts(
  posts: TopContentPost[],
  stored: Map<number, SourceType>,
): { owned: TopContentPost[]; influencer: TopContentPost[] } {
  const owned: TopContentPost[] = []
  const influencer: TopContentPost[] = []
  for (const post of posts) {
    const sourceType = resolveDesignation(post, stored)
    const tagged = { ...post, sourceType }
    ;(sourceType === 'influencer' ? influencer : owned).push(tagged)
  }
  return { owned, influencer }
}
