import type { PersistedBlock } from '@/lib/dashboard/types'

export type OptimisticAction =
  | { type: 'add'; block: PersistedBlock }
  | { type: 'remove'; id: string }

/** Reducer for the dashboard's optimistic block list. Pure; never mutates input. */
export function optimisticBlocksReducer(
  blocks: PersistedBlock[],
  action: OptimisticAction,
): PersistedBlock[] {
  if (action.type === 'add') return [...blocks, action.block]
  return blocks.filter((b) => b.id !== action.id)
}
