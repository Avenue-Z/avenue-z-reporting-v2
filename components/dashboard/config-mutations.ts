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
