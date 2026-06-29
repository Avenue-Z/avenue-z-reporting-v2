import type { BlockConfig, DashboardConfig, EditTarget, LabelOverrides, PersistedBlock } from '@/lib/dashboard/types'

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

/** Replace a block's name/format/binding by id, preserving its id, range, and layout. */
export function updateBlock(
  config: DashboardConfig,
  blockId: string,
  patch: Omit<BlockConfig, 'id'>,
): DashboardConfig {
  return {
    ...config,
    blocks: config.blocks.map((b) =>
      b.id === blockId ? { ...b, name: patch.name, format: patch.format, binding: patch.binding } : b,
    ),
  }
}

/** Patch one copy field (name / narrativeBody) on a single block. Pure. */
export function setBlockText(
  config: DashboardConfig,
  blockId: string,
  field: 'name' | 'narrativeBody',
  value: string,
): DashboardConfig {
  return {
    ...config,
    blocks: config.blocks.map((b) => (b.id === blockId ? { ...b, [field]: value } : b)),
  }
}

/** Set or clear a dashboard-wide dimension label override. Empty value (after trim)
 *  deletes the entry; emptied nested objects are pruned, and labelOverrides is
 *  dropped entirely when nothing remains. Pure. */
export function setLabelOverride(
  config: DashboardConfig,
  target: Extract<EditTarget, { kind: 'labelValue' | 'labelDim' }>,
  value: string,
): DashboardConfig {
  const trimmed = value.trim()
  const lo: LabelOverrides = { ...(config.labelOverrides ?? {}) }

  if (target.kind === 'labelDim') {
    const dims = { ...(lo.dims ?? {}) }
    if (trimmed === '') delete dims[target.dimKey]
    else dims[target.dimKey] = trimmed
    if (Object.keys(dims).length === 0) delete lo.dims
    else lo.dims = dims
  } else {
    const values = { ...(lo.values ?? {}) }
    const inner = { ...(values[target.dimKey] ?? {}) }
    if (trimmed === '') delete inner[target.rawValue]
    else inner[target.rawValue] = trimmed
    if (Object.keys(inner).length === 0) delete values[target.dimKey]
    else values[target.dimKey] = inner
    if (Object.keys(values).length === 0) delete lo.values
    else lo.values = values
  }

  const empty = !lo.values && !lo.dims
  const { labelOverrides: _drop, ...rest } = config
  return empty ? rest : { ...rest, labelOverrides: lo }
}

/** Write back grid positions/sizes from react-grid-layout onto each block's layout. */
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
