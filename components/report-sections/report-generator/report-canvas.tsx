'use client'

import { forwardRef } from 'react'
import { FileText, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReportBlockType = 'heading' | 'narrative' | 'bullets' | 'metrics' | 'divider'

export interface MetricItem {
  label: string
  value: string
  delta?: number
  context?: string
}

export interface ReportBlock {
  id: string
  type: ReportBlockType
  content?: string           // heading, narrative
  items?: string[]           // bullets
  metrics?: MetricItem[]     // metrics grid
  source?: string            // e.g. "GA4 · Last 30 days"
}

interface ReportCanvasProps {
  blocks: ReportBlock[]
  clientName: string
  isGenerating: boolean
}

// ---------------------------------------------------------------------------
// Block renderers
// ---------------------------------------------------------------------------

function DeltaBadge({ delta }: { delta: number }) {
  const pos = delta >= 0
  return (
    <span className={cn(
      'ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums',
      pos ? 'bg-[#60FF80]/10 text-[#60FF80]' : 'bg-[#FF4444]/10 text-[#FF4444]'
    )}>
      {pos ? '+' : ''}{delta.toFixed(1)}%
    </span>
  )
}

function HeadingBlock({ content }: { content: string }) {
  return (
    <h2 className="text-lg font-extrabold text-white">{content}</h2>
  )
}

function NarrativeBlock({ content, source }: { content: string; source?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm leading-relaxed text-white/80">{content}</p>
      {source && (
        <span className="flex items-center gap-1 text-[11px] text-text-muted">
          <Sparkles className="h-3 w-3 text-[#60FDFF]" />
          {source}
        </span>
      )}
    </div>
  )
}

function BulletsBlock({ items, source }: { items: string[]; source?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-white/80">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#60FDFF]" />
            {item}
          </li>
        ))}
      </ul>
      {source && (
        <span className="flex items-center gap-1 text-[11px] text-text-muted">
          <Sparkles className="h-3 w-3 text-[#60FDFF]" />
          {source}
        </span>
      )}
    </div>
  )
}

function MetricsBlock({ metrics, source }: { metrics: MetricItem[]; source?: string }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {metrics.map((m, i) => (
          <div
            key={i}
            className="flex flex-col gap-0.5 rounded-lg border border-white/[0.06] bg-white/[0.03] p-3"
          >
            <span className="text-[11px] font-semibold text-text-muted">{m.label}</span>
            <div className="flex items-baseline">
              <span className="text-lg font-bold text-white tabular-nums">{m.value}</span>
              {m.delta !== undefined && <DeltaBadge delta={m.delta} />}
            </div>
            {m.context && (
              <span className="text-[11px] text-text-muted">{m.context}</span>
            )}
          </div>
        ))}
      </div>
      {source && (
        <span className="flex items-center gap-1 text-[11px] text-text-muted">
          <Sparkles className="h-3 w-3 text-[#60FDFF]" />
          {source}
        </span>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Canvas
// ---------------------------------------------------------------------------

export const ReportCanvas = forwardRef<HTMLDivElement, ReportCanvasProps>(
  function ReportCanvas({ blocks, clientName, isGenerating }, ref) {
    const isEmpty = blocks.length === 0 && !isGenerating

    return (
      <div
        ref={ref}
        className="flex h-full flex-col overflow-y-auto rounded-xl border border-white/[0.06] bg-bg-surface"
      >
        {/* Canvas header */}
        <div className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-6 py-4">
          <div className="flex items-center gap-2.5">
            <FileText className="h-4 w-4 text-text-muted" />
            <span className="text-sm font-bold text-white">Report Preview</span>
          </div>
          <span className="text-xs text-text-muted">{clientName}</span>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {isEmpty ? (
            /* Empty state */
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <div
                className="flex h-14 w-14 items-center justify-center rounded-2xl"
                style={{ backgroundImage: 'linear-gradient(135deg, #FFFC6022, #60FF8022, #60FDFF22)' }}
              >
                <FileText className="h-6 w-6 text-white/30" />
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-sm font-semibold text-white/50">Your report will appear here</p>
                <p className="max-w-xs text-xs text-text-muted">
                  Ask a question on the left and the AI will build your report section by section.
                </p>
              </div>
            </div>
          ) : (
            /* Report blocks */
            <div className="flex flex-col gap-5">
              {blocks.map((block) => {
                if (block.type === 'divider') {
                  return <hr key={block.id} className="border-white/[0.06]" />
                }
                if (block.type === 'heading') {
                  return <HeadingBlock key={block.id} content={block.content ?? ''} />
                }
                if (block.type === 'narrative') {
                  return <NarrativeBlock key={block.id} content={block.content ?? ''} source={block.source} />
                }
                if (block.type === 'bullets') {
                  return <BulletsBlock key={block.id} items={block.items ?? []} source={block.source} />
                }
                if (block.type === 'metrics') {
                  return <MetricsBlock key={block.id} metrics={block.metrics ?? []} source={block.source} />
                }
                return null
              })}

              {/* Generating indicator */}
              {isGenerating && (
                <div className="flex items-center gap-2 text-xs text-text-muted">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#60FDFF]" style={{ animationDelay: '0ms' }} />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#60FF80]" style={{ animationDelay: '150ms' }} />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#FFFC60]" style={{ animationDelay: '300ms' }} />
                  <span className="ml-1">Building section…</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }
)
