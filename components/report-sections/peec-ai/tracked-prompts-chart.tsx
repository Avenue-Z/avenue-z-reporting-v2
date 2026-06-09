'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { TrackedPrompt } from '@/lib/peec/client'

function ColHeader({ label, tooltip }: { label: string; tooltip?: string }) {
  if (!tooltip) {
    return (
      <th className="px-5 py-2.5 text-[10px] font-extrabold uppercase tracking-widest text-text-muted text-right">
        {label}
      </th>
    )
  }
  return (
    <th className="px-5 py-2.5 text-[10px] font-extrabold uppercase tracking-widest text-text-muted text-right">
      <span className="inline-flex items-center gap-1 justify-end">
        {label}
        <span className="group relative flex-shrink-0">
          <span className="flex h-3.5 w-3.5 cursor-default items-center justify-center rounded-full border border-white/20 text-[9px] font-bold leading-none text-text-muted">?</span>
          <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-52 -translate-x-1/2 rounded-md border border-white/[0.08] bg-bg-surface px-3 py-2 text-[11px] font-normal normal-case leading-relaxed tracking-normal text-text-muted opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100">
            {tooltip}
            <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-white/[0.08]" />
          </span>
        </span>
      </span>
    </th>
  )
}

function MetricCell({ value, suffix = '%', prefix = '' }: { value: number; suffix?: string; prefix?: string }) {
  if (value <= 0) return <span className="text-text-muted">—</span>
  return <span className="tabular-nums text-white">{prefix}{value.toFixed(1)}{suffix}</span>
}

type PromptGroup = {
  name: string
  prompts: TrackedPrompt[]
  avgVisibility: number
  avgSov: number
  avgPosition: number
}

function buildGroups(prompts: TrackedPrompt[]): PromptGroup[] {
  const map = new Map<string, TrackedPrompt[]>()
  for (const p of prompts) {
    const g = p.group ?? 'Other'
    if (!map.has(g)) map.set(g, [])
    map.get(g)!.push(p)
  }
  return Array.from(map.entries())
    .map(([name, items]) => {
      const visItems = items.filter((p) => p.visibility > 0)
      const sovItems = items.filter((p) => p.sov > 0)
      const posItems = items.filter((p) => p.position > 0)
      return {
        name,
        prompts: items,
        avgVisibility: visItems.length ? visItems.reduce((s, p) => s + p.visibility, 0) / visItems.length : 0,
        avgSov: sovItems.length ? sovItems.reduce((s, p) => s + p.sov, 0) / sovItems.length : 0,
        avgPosition: posItems.length ? posItems.reduce((s, p) => s + p.position, 0) / posItems.length : 0,
      }
    })
    .sort((a, b) => b.avgVisibility - a.avgVisibility)
}

function GroupRow({ group }: { group: PromptGroup }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <tr
        onClick={() => setOpen((v) => !v)}
        className="border-b border-white/[0.04] cursor-pointer hover:bg-white/[0.02] transition-colors select-none"
      >
        <td className="px-5 py-3" colSpan={1}>
          <span className="flex items-center gap-2">
            <span className={cn('text-[10px] text-text-muted transition-transform', open ? 'rotate-90' : '')}>▶</span>
            <span className="text-sm font-bold text-white">{group.name}</span>
            <span className="text-xs text-text-muted">({group.prompts.length})</span>
          </span>
        </td>
        <td className="px-5 py-3 text-right">
          <MetricCell value={group.avgVisibility} suffix="%" />
        </td>
        <td className="px-5 py-3 text-right">
          <MetricCell value={group.avgSov} suffix="%" />
        </td>
        <td className="px-5 py-3 text-right">
          <MetricCell value={group.avgPosition} suffix="" prefix="#" />
        </td>
      </tr>
      {open && group.prompts.map((p) => (
        <tr key={p.text} className="border-b border-white/[0.03] bg-white/[0.01] hover:bg-white/[0.02] transition-colors">
          <td className="pl-12 pr-5 py-2.5 text-sm text-text-muted max-w-sm">{p.text}</td>
          <td className="px-5 py-2.5 text-right">
            <MetricCell value={p.visibility} suffix="%" />
          </td>
          <td className="px-5 py-2.5 text-right">
            <MetricCell value={p.sov} suffix="%" />
          </td>
          <td className="px-5 py-2.5 text-right">
            <MetricCell value={p.position} suffix="" prefix="#" />
          </td>
        </tr>
      ))}
    </>
  )
}

export function TrackedPromptsChart({ prompts, brandName }: { prompts: TrackedPrompt[]; brandName?: string }) {
  const groups = buildGroups(prompts)
  const brand = brandName ?? 'your brand'

  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface">
      <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-bold uppercase tracking-widest text-text-muted">Which prompts are AI engines answering with our brand?</p>
          <span className="group relative flex-shrink-0">
            <span className="flex h-3.5 w-3.5 cursor-default items-center justify-center rounded-full border border-[#FF4444]/60 text-[9px] font-bold leading-none text-[#FF4444]">?</span>
            <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-64 -translate-x-1/2 rounded-md border border-white/[0.08] bg-bg-surface px-3 py-2 text-[11px] font-normal normal-case leading-relaxed tracking-normal text-text-muted opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100">
              Prompt metrics are live data from Peec.AI. Topic groupings are AI-inferred based on keyword patterns and may not be accurate — verify before sharing externally.
              <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-white/[0.08]" />
            </span>
          </span>
        </div>
        {prompts.length > 0 && (
          <p className="text-xs text-text-muted flex items-center gap-1">
            Total prompts: <span className="font-semibold text-white">{prompts.length.toLocaleString()}</span>
            <span className="group relative flex-shrink-0">
              <span className="flex h-3.5 w-3.5 cursor-default items-center justify-center rounded-full border border-white/20 text-[9px] font-bold leading-none text-text-muted">?</span>
              <span className="pointer-events-none absolute bottom-full right-0 z-10 mb-2 w-52 rounded-md border border-white/[0.08] bg-bg-surface px-3 py-2 text-[11px] font-normal normal-case leading-relaxed tracking-normal text-text-muted opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100">
                Total number of unique prompts tracked in Peec.AI across all AI models and channels.
                <span className="absolute right-2 top-full border-4 border-transparent border-t-white/[0.08]" />
              </span>
            </span>
          </p>
        )}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/[0.04]">
            <th className="px-5 py-2.5 text-[10px] font-extrabold uppercase tracking-widest text-text-muted text-left">Topic / Prompt</th>
            <ColHeader label="Visibility" tooltip="Percentage of AI responses where your brand appears. (Peec AI.)" />
            <ColHeader label="SOV"        tooltip="Percentage of your brand mentions in AI responses compared to all tracked brands mentioned. (Peec AI.)" />
            <ColHeader label="Position"   tooltip="Average ranking when your brand appears in AI responses (lower numbers are better). (Peec AI.)" />
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <GroupRow key={g.name} group={g} />
          ))}
        </tbody>
      </table>
    </div>
  )
}
