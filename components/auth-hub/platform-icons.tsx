import type { PlatformId } from '@/lib/platforms/constants'
import { PLATFORM_LOGOS } from '@/lib/platforms/constants'

/** Platform logo path — keyed by platform ID */
export function getPlatformLogo(platformId: PlatformId): string {
  return PLATFORM_LOGOS[platformId]
}

// Re-export for convenience
export { PLATFORM_LOGOS }
