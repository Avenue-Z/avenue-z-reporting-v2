// lib/organic-social/social-listening/colors.ts
// The Social Listening tab's colours (spec docs/superpowers/specs/2026-11-19-social-listening-tab-design.md, section 9).
// Kept here, not in lib/constants.ts: CHART_COLORS.positive/neutral/negative are the delta colours and stay as they are.

/** Sentiment colours, as the approved mockup uses them (docs/social-listening/mock.template.html:25-27). */
export const SENTIMENT_COLORS = { pos: '#60FF80', neu: '#FFFC60', neg: '#FF4444' } as const

/** Media types are keyed by name; one Talkwalker does not list here, or a new one (TikTok, Threads), gets this. */
export const MEDIA_FALLBACK_COLOR = '#9CA3AF'
export const MEDIA_COLORS: Record<string, string> = {
  Facebook: '#39A0FF',
  Instagram: '#FF6B8A',
  X: '#60FDFF',
  LinkedIn: '#0A66C2',
  Reddit: '#FF4500',
  YouTube: '#FF0000',
  Blogs: '#FFFC60',
  'Online News Other': '#6034FF',
  Newspaper: '#B056D0',
  Magazine: '#96BF48',
  'Press Release': '#F2994A',
  Podcast: '#12CBC4',
  Substack: '#FF8C42',
  Other: '#596275',
}

export function mediaColor(media: string): string {
  return Object.prototype.hasOwnProperty.call(MEDIA_COLORS, media) ? MEDIA_COLORS[media] : MEDIA_FALLBACK_COLOR
}

/** The brand keyword cloud colours each theme by its sentiment in Talkwalker's own colours. These are the five the
 *  brand export uses (counted on the October export, 2026-11-19): two greens, one yellow, two reds. Any other colour
 *  makes no sentiment claim and keeps its own colour. The industry cloud's colours are decoration (25 one-off colours on
 *  the same export) and are never read as sentiment. */
const THEME_TONE: Record<string, 'pos' | 'neu' | 'neg'> = {
  '#1FCE6E': 'pos', '#4BD78B': 'pos', '#F2C100': 'neu', '#E74C3C': 'neg', '#EB6F63': 'neg',
}

export function themeTone(color: string): 'pos' | 'neu' | 'neg' | null {
  return THEME_TONE[color.trim().toUpperCase()] ?? null
}

/** The colour a brand theme is drawn in: its sentiment colour, or its own colour when the tone is unknown. */
export function brandThemeColor(color: string): string {
  const tone = themeTone(color)
  return tone ? SENTIMENT_COLORS[tone] : color
}
