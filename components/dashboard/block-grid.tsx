'use client'

import { useState, useTransition, type ReactNode } from 'react'
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { saveDashboardConfig } from '@/app/actions/dashboard'
import { reorderBlocks } from './config-mutations'
import type { DashboardConfig, PersistedBlock } from '@/lib/dashboard/types'

export interface BlockGridProps {
  blocks: PersistedBlock[]
  canEdit: boolean
  slug: string
  config: DashboardConfig
  /** Rendered child per block (the resolved block renderer, e.g. <KpiBlock>). */
  renderBlock: (block: PersistedBlock) => ReactNode
}

export function BlockGrid({ blocks, canEdit, slug, config, renderBlock }: BlockGridProps) {
  const [pending, startTransition] = useTransition()
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const ids = blocks.map((b) => b.id)

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    if (from < 0 || to < 0) return
    const next = reorderBlocks(config, from, to)
    startTransition(async () => {
      const res = await saveDashboardConfig(slug, next)
      if (!res.ok) setErrorMsg(res.error)
    })
  }

  // Non-editors: skip dnd entirely, plain grid.
  if (!canEdit) {
    return (
      <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
        {blocks.map((b) => (
          <div key={b.id}>{renderBlock(b)}</div>
        ))}
      </div>
    )
  }

  return (
    <>
      {errorMsg && (
        <p className="mb-3 text-xs text-[#FF6666]" role="alert">
          Save failed: {errorMsg}
        </p>
      )}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={ids} strategy={rectSortingStrategy}>
          <div className={`grid grid-cols-2 gap-5 lg:grid-cols-4 ${pending ? 'opacity-70' : ''}`}>
            {blocks.map((b) => (
              <SortableBlock key={b.id} id={b.id}>
                {renderBlock(b)}
              </SortableBlock>
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </>
  )
}

function SortableBlock({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
  }
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="cursor-grab">
      {children}
    </div>
  )
}
