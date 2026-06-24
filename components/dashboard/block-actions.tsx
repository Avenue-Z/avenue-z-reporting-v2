'use client'

import { createContext, useContext } from 'react'

/** Optimistic block actions provided by DashboardShell and consumed by
 *  MetricBlockShell (a server-instantiated client island reached via context). */
export interface BlockActions {
  /** Hide a block immediately (optimistic delete) before the save round-trip. */
  hide: (id: string) => void
  /** Restore a block if its delete save failed. */
  unhide: (id: string) => void
}

const noop: BlockActions = { hide: () => {}, unhide: () => {} }

export const BlockActionsContext = createContext<BlockActions>(noop)

export const useBlockActions = (): BlockActions => useContext(BlockActionsContext)
