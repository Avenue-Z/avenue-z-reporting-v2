import type { DashboardConfig, PersistedBlock } from '@/lib/dashboard/types'

type Range = NonNullable<PersistedBlock['range']>

export function reorderBlocks(
  config: DashboardConfig,
  fromIndex: number,
  toIndex: number,
): DashboardConfig {
  const next = config.blocks.slice()
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)
  return { ...config, blocks: next }
}

export function removeBlock(config: DashboardConfig, blockId: string): DashboardConfig {
  return { ...config, blocks: config.blocks.filter((b) => b.id !== blockId) }
}

export function setBlockRange(
  config: DashboardConfig,
  blockId: string,
  range: Range,
): DashboardConfig {
  return {
    ...config,
    blocks: config.blocks.map((b) => (b.id === blockId ? { ...b, range } : b)),
  }
}

export function resetBlockRange(config: DashboardConfig, blockId: string): DashboardConfig {
  return {
    ...config,
    blocks: config.blocks.map((b) => (b.id === blockId ? { ...b, range: null } : b)),
  }
}

export function addBlock(config: DashboardConfig, block: PersistedBlock): DashboardConfig {
  return { ...config, blocks: [...config.blocks, block] }
}

export function applyLayoutChange(
  config: DashboardConfig,
  layout: { i: string; x: number; y: number; w: number; h: number }[],
): DashboardConfig {
  const byId = new Map(layout.map((l) => [l.i, l]))
  const blocks = config.blocks.map((b) => {
    const l = byId.get(b.id)
    if (!l) return b
    return { ...b, layout: { x: l.x, y: l.y, w: l.w, h: l.h } }
  })
  return { ...config, blocks }
}
