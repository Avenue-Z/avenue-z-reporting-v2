import type { PartRegistry } from '@/lib/report-sections/types'
import type { PeecCtx } from '../../ctx'

// Bespoke, client-specific parts live in THIS folder only and are merged at render time.
// The core section (parts/registry.ts) must never import from here.
export const BESPOKE_PARTS: PartRegistry<PeecCtx> = {}
