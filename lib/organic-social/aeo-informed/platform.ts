// lib/organic-social/aeo-informed/platform.ts
// The social platform a URL belongs to, for the eight platforms Peec lets a brand register a channel on (its enum on /brands/social-channels).
export type PeecPlatform = 'reddit' | 'youtube' | 'instagram' | 'tiktok' | 'linkedin' | 'medium' | 'facebook' | 'quora'

const DOMAINS: Record<PeecPlatform, string> = {
  reddit: 'reddit.com', youtube: 'youtube.com', instagram: 'instagram.com', tiktok: 'tiktok.com',
  linkedin: 'linkedin.com', medium: 'medium.com', facebook: 'facebook.com', quora: 'quora.com',
}

/** The host must be the platform's domain or a subdomain of it. A URL that does not parse has no platform. */
export function peecPlatformOf(url: string): PeecPlatform | null {
  let host: string
  try { host = new URL(url).hostname.toLowerCase() } catch { return null }
  if (host === 'youtu.be') return 'youtube'
  for (const p of Object.keys(DOMAINS) as PeecPlatform[]) if (host === DOMAINS[p] || host.endsWith('.' + DOMAINS[p])) return p
  return null
}
