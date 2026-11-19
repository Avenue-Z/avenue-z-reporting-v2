// lib/organic-social/social-listening/params.ts
// The Social Listening tab's URL param (spec docs/superpowers/specs/2026-11-19-social-listening-tab-design.md, section 4).
import type { SlTopic } from './types'

/** `sl=industry` opens the Industry pill; anything else, or nothing, is Brand (the default, which the pills leave out of
 *  the URL). The PDF ignores it and prints brand then industry (R2-5). */
export function parseSlTopic(raw: unknown): SlTopic {
  return raw === 'industry' ? 'industry' : 'brand'
}
