'use client'

import { useRef, useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { CHART_COLORS, AI_REFERRER_DOMAINS } from '@/lib/constants'

export interface MatrixPage {
  path:           string
  sessions:       number
  engagementRate: number  // 0–1
  avgDuration:    number  // seconds
}

interface ContentMatrixProps {
  pages:           MatrixPage[]
  /** Map of pagePath → AI referral session count */
  aiPageSessions?: Record<string, number>
}


function shortPath(p: string) {
  if (!p || p === '/') return '/ (Home)'
  const parts = p.split('/').filter(Boolean)
  if (parts.length === 1) return `/${parts[0]}`
  return `…/${parts[parts.length - 1]}`
}

function fmtDur(s: number) {
  const m = Math.floor(s / 60)
  const r = Math.round(s % 60)
  return `${m}m ${String(r).padStart(2, '0')}s`
}

const QUADRANTS = [
  {
    label:   'Content Stars',
    xHigh:   true,
    yHigh:   true,
    color:   CHART_COLORS.positive,
    tooltip: 'High traffic + high engagement. Your best-performing pages — people find them and actually read them. Double down with updates, internal links, and promotion.',
  },
  {
    label:   'Hidden Gems',
    xHigh:   false,
    yHigh:   true,
    color:   CHART_COLORS.primary,
    tooltip: 'High engagement but low traffic. Visitors love these pages — not enough people are finding them. Strong candidates for SEO, paid amplification, or internal linking from high-traffic pages.',
  },
  {
    label:   'Traffic Magnets',
    xHigh:   true,
    yHigh:   false,
    color:   CHART_COLORS.email,
    tooltip: 'High traffic but low engagement. Lots of visitors arrive but don\'t stick around. Often signals a mismatch between what the page promises and what it delivers. Good candidates for a content refresh.',
  },
  {
    label:   'Review Needed',
    xHigh:   false,
    yHigh:   false,
    color:   CHART_COLORS.neutral,
    tooltip: 'Low traffic and low engagement. Minimal reach and minimal resonance. Consider consolidating, redirecting, or deprecating these pages unless there\'s a strategic reason to keep them.',
  },
]

type ViewMode = 'general' | 'ai'

interface Tooltip {
  x: number
  y: number
  page: MatrixPage
  quadrant: string
  quadrantColor: string
  aiSessions?: number
  aiPct?: number
}

export function ContentMatrix({ pages, aiPageSessions = {} }: ContentMatrixProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dims, setDims]         = useState({ w: 600, h: 340 })
  const [tooltip, setTooltip]   = useState<Tooltip | null>(null)
  const [view, setView]         = useState<ViewMode>('general')
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!containerRef.current) return
    const obs = new ResizeObserver(([e]) => {
      setDims({ w: e.contentRect.width, h: 340 })
    })
    obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [])

  // In AI view, only show pages that received at least 1 AI referral session
  const displayPages = view === 'ai'
    ? pages.filter((p) => (aiPageSessions[p.path] ?? 0) > 0)
    : pages

  const hasAiData = Object.keys(aiPageSessions).length > 0

  if (!pages.length) return null

  const PAD = { top: 16, right: 16, bottom: 36, left: 48 }
  const cw  = Math.max(dims.w - PAD.left - PAD.right,  100)
  const ch  = Math.max(dims.h - PAD.top  - PAD.bottom, 100)

  const maxSessions    = Math.max(...displayPages.map((p) => p.sessions), 1)
  const medSessions    = displayPages.length > 0
    ? [...displayPages].sort((a, b) => a.sessions - b.sessions)[Math.floor(displayPages.length / 2)]?.sessions ?? maxSessions / 2
    : maxSessions / 2
  const medEngagement  = 0.5
  const maxDur         = Math.max(...displayPages.map((p) => p.avgDuration), 1)
  // AI view: larger bubbles so low-traffic pages stay visible
  const minR = view === 'ai' ? 8  : 5
  const maxR = view === 'ai' ? 22 : 18

  function xPos(sessions: number) {
    return PAD.left + (sessions / maxSessions) * cw
  }
  function yPos(engagement: number) {
    return PAD.top + (1 - engagement) * ch
  }
  function radius(dur: number) {
    return minR + (Math.sqrt(dur) / Math.sqrt(maxDur)) * (maxR - minR)
  }
  function quadrantFor(p: MatrixPage) {
    const xHigh = p.sessions       >= medSessions
    const yHigh = p.engagementRate >= medEngagement
    return QUADRANTS.find((q) => q.xHigh === xHigh && q.yHigh === yHigh)!
  }

  const xMid = xPos(medSessions)
  const yMid = yPos(medEngagement)

  return (
    <div className="rounded-xl border border-white/[0.06] bg-bg-surface p-6">
      <div className="mb-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
          Performance Matrix
        </p>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-extrabold text-white">Content Performance</h3>
            {/* Title tooltip */}
            <div className="group relative flex-shrink-0">
              <span className="flex h-4 w-4 cursor-default items-center justify-center rounded-full border border-white/20 text-[9px] font-bold leading-none text-text-muted">
                ?
              </span>
              <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-72 -translate-x-1/2 rounded-md border border-white/[0.08] bg-[#1e1e1e] px-3 py-2.5 text-xs leading-relaxed text-text-muted opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100">
                <p className="mb-1.5 font-semibold text-white">How to read this chart</p>
                <p className="mb-1"><span className="text-white">X-axis (→)</span> — Sessions: how much traffic the page receives.</p>
                <p className="mb-1"><span className="text-white">Y-axis (↑)</span> — Engagement rate: share of sessions where the visitor scrolled, clicked, or spent 10+ seconds on the page.</p>
                <p className="mb-1"><span className="text-white">Bubble size</span> — Average session duration. Larger = visitors spend more time.</p>
                <p>The dashed lines divide pages at the <span className="text-white">median</span> of each axis, creating four quadrants. Pages with fewer than 10 sessions are excluded.</p>
                <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-white/[0.08]" />
              </div>
            </div>
          </div>

          {/* View toggle */}
          {hasAiData && (
            <div className="flex items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.03] p-1">
              {(['general', 'ai'] as ViewMode[]).map((v) => (
                <button
                  key={v}
                  onClick={() => { setView(v); setTooltip(null) }}
                  className={cn(
                    'rounded-md px-3 py-1 text-[11px] font-semibold transition-all duration-150',
                    view === v
                      ? 'bg-white/[0.10] text-white'
                      : 'text-text-muted hover:text-white/60'
                  )}
                >
                  {v === 'general' ? 'General' : '✦ AI'}
                </button>
              ))}
            </div>
          )}
        </div>

        <p className="mt-1 text-xs text-text-muted">
          {view === 'ai'
            ? `Pages with AI referral traffic · ${displayPages.length} of ${pages.length} pages · Hover any page`
            : 'Sessions vs. engagement rate · Bubble size = avg session duration · Hover any page'
          }
        </p>
      </div>

      {/* Quadrant legend */}
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1">
        {QUADRANTS.map((q) => (
          <div key={q.label} className="group relative flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: q.color, opacity: 0.7 }} />
            <span className="text-[10px] text-text-muted">{q.label}</span>
            <div className="pointer-events-none absolute bottom-full left-0 z-20 mb-2 w-60 rounded-md border border-white/[0.08] bg-[#1e1e1e] px-3 py-2 text-[11px] leading-relaxed text-text-muted opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100">
              {q.tooltip}
              <div className="absolute left-3 top-full border-4 border-transparent border-t-white/[0.08]" />
            </div>
          </div>
        ))}
      </div>

      {/* Empty state for AI view */}
      {view === 'ai' && displayPages.length === 0 && (
        <div className="flex h-40 items-center justify-center">
          <p className="text-sm text-text-muted/50 italic">No pages with AI referral traffic detected in the last 30 days.</p>
        </div>
      )}

      {displayPages.length > 0 && (
        <div ref={containerRef} className="relative" style={{ height: dims.h }}>
          <svg
            width="100%"
            height={dims.h}
            style={{ overflow: 'visible' }}
            onMouseLeave={() => setTooltip(null)}
          >
            {/* Quadrant background fills */}
            <rect x={PAD.left} y={PAD.top} width={xMid - PAD.left} height={yMid - PAD.top}
                  fill={CHART_COLORS.primary} opacity={0.03} />
            <rect x={xMid} y={PAD.top} width={PAD.left + cw - xMid} height={yMid - PAD.top}
                  fill={CHART_COLORS.positive} opacity={0.03} />
            <rect x={PAD.left} y={yMid} width={xMid - PAD.left} height={PAD.top + ch - yMid}
                  fill={CHART_COLORS.neutral} opacity={0.03} />
            <rect x={xMid} y={yMid} width={PAD.left + cw - xMid} height={PAD.top + ch - yMid}
                  fill={CHART_COLORS.email} opacity={0.03} />

            {/* Grid */}
            <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + ch}
                  stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
            <line x1={PAD.left} y1={PAD.top + ch} x2={PAD.left + cw} y2={PAD.top + ch}
                  stroke="rgba(255,255,255,0.06)" strokeWidth={1} />

            {/* Median reference lines */}
            <line x1={xMid} y1={PAD.top} x2={xMid} y2={PAD.top + ch}
                  stroke="rgba(255,255,255,0.08)" strokeWidth={1} strokeDasharray="4 3" />
            <line x1={PAD.left} y1={yMid} x2={PAD.left + cw} y2={yMid}
                  stroke="rgba(255,255,255,0.08)" strokeWidth={1} strokeDasharray="4 3" />

            {/* Quadrant corner labels */}
            <text x={PAD.left + 6}         y={PAD.top + 14}     fill={CHART_COLORS.primary}  fontSize={9} opacity={0.5}>Hidden Gems</text>
            <text x={xMid + 6}             y={PAD.top + 14}     fill={CHART_COLORS.positive} fontSize={9} opacity={0.5}>Content Stars</text>
            <text x={PAD.left + 6}         y={PAD.top + ch - 6} fill={CHART_COLORS.neutral}  fontSize={9} opacity={0.5}>Review Needed</text>
            <text x={xMid + 6}             y={PAD.top + ch - 6} fill={CHART_COLORS.email}    fontSize={9} opacity={0.5}>Traffic Magnets</text>

            {/* Y axis labels */}
            <text x={PAD.left - 6} y={PAD.top + 4}      fill="#8A8A8A" fontSize={9} textAnchor="end">100%</text>
            <text x={PAD.left - 6} y={yMid + 4}         fill="#8A8A8A" fontSize={9} textAnchor="end">50%</text>
            <text x={PAD.left - 6} y={PAD.top + ch + 4} fill="#8A8A8A" fontSize={9} textAnchor="end">0%</text>

            {/* X axis labels */}
            <text x={PAD.left}      y={PAD.top + ch + 20} fill="#8A8A8A" fontSize={9} textAnchor="middle">0</text>
            <text x={xMid}          y={PAD.top + ch + 20} fill="#8A8A8A" fontSize={9} textAnchor="middle">{medSessions.toLocaleString()}</text>
            <text x={PAD.left + cw} y={PAD.top + ch + 20} fill="#8A8A8A" fontSize={9} textAnchor="middle">{maxSessions.toLocaleString()}</text>

            {/* Axis labels */}
            <text x={PAD.left + cw / 2} y={PAD.top + ch + 32} fill="#8A8A8A" fontSize={9} textAnchor="middle">Sessions</text>
            <text
              x={10}
              y={PAD.top + ch / 2}
              fill="#8A8A8A"
              fontSize={9}
              textAnchor="middle"
              transform={`rotate(-90, 10, ${PAD.top + ch / 2})`}
            >
              Engagement Rate
            </text>

            {/* Data points */}
            {displayPages.map((page, idx) => {
              const cx        = xPos(page.sessions)
              const cy        = yPos(page.engagementRate)
              const r         = radius(page.avgDuration)
              const q         = quadrantFor(page)
              const isActive  = tooltip?.page.path === page.path
              const aiSess    = aiPageSessions[page.path] ?? 0
              const aiPct     = page.sessions > 0 ? (aiSess / page.sessions) * 100 : 0

              const bubbleColor = q.color

              return (
                <circle
                  key={idx}
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill={bubbleColor}
                  opacity={isActive ? 0.95 : tooltip ? 0.2 : view === 'ai' ? 0.75 : 0.6}
                  stroke={bubbleColor}
                  strokeWidth={isActive ? 2 : view === 'ai' ? 1 : 0}
                  strokeOpacity={isActive ? 0.6 : 0.4}
                  style={{ cursor: 'pointer', transition: 'opacity 0.2s' }}
                  onMouseEnter={(e) => {
                    const rect = containerRef.current?.getBoundingClientRect()
                    if (!rect) return
                    setTooltip({
                      x:             e.clientX - rect.left,
                      y:             e.clientY - rect.top,
                      page,
                      quadrant:      q.label,
                      quadrantColor: q.color,
                      aiSessions:    aiSess,
                      aiPct,
                    })
                  }}
                />
              )
            })}
          </svg>

          {/* Floating tooltip */}
          {tooltip && (
            <div
              className="pointer-events-none absolute z-20 max-w-[220px] rounded-lg border border-white/[0.08] bg-[#1e1e1e] px-3 py-2.5 shadow-2xl"
              style={{
                left:      tooltip.x + 14,
                top:       tooltip.y - 60,
                transform: tooltip.x > dims.w * 0.65 ? 'translateX(-110%)' : undefined,
              }}
            >
              <p className="mb-1 truncate text-[11px] font-mono text-text-muted" title={tooltip.page.path}>
                {shortPath(tooltip.page.path)}
              </p>
              <p
                className="mb-2 text-[9px] font-bold uppercase tracking-wider"
                style={{ color: tooltip.quadrantColor }}
              >
                {tooltip.quadrant}
              </p>
              <div className="space-y-1">
                {[
                  { label: 'Sessions',     value: tooltip.page.sessions.toLocaleString() },
                  { label: 'Engagement',   value: `${(tooltip.page.engagementRate * 100).toFixed(1)}%` },
                  { label: 'Avg Duration', value: fmtDur(tooltip.page.avgDuration) },
                  ...(hasAiData && (tooltip.aiSessions ?? 0) > 0 ? [{
                    label: 'AI Sessions',
                    value: `${tooltip.aiSessions!.toLocaleString()} (${tooltip.aiPct!.toFixed(1)}%)`,
                  }] : []),
                ].map((r) => (
                  <div key={r.label} className="flex justify-between gap-4">
                    <span className="text-[10px] text-text-muted">{r.label}</span>
                    <span className="tabular-nums text-[10px] font-semibold text-white">{r.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Page list accordion ── */}
      {displayPages.length > 0 && (
        <div className="mt-6 border-t border-white/[0.06] pt-4 space-y-1">
          {QUADRANTS.map((q) => {
            const group = [...displayPages]
              .filter((p) => {
                const xHigh = p.sessions       >= medSessions
                const yHigh = p.engagementRate >= medEngagement
                return q.xHigh === xHigh && q.yHigh === yHigh
              })
              .sort((a, b) => b.sessions - a.sessions)

            if (group.length === 0) return null

            const isOpen = openGroups.has(q.label)
            const toggle = () => setOpenGroups((prev) => {
              const next = new Set(prev)
              next.has(q.label) ? next.delete(q.label) : next.add(q.label)
              return next
            })

            return (
              <div key={q.label} className="rounded-lg border border-white/[0.06] overflow-hidden">
                {/* Accordion header */}
                <button
                  onClick={toggle}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-white/[0.03]"
                >
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: q.color, opacity: 0.8 }} />
                  <span className="flex-1 text-xs font-semibold text-white">{q.label}</span>
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums"
                    style={{ backgroundColor: `${q.color}18`, color: q.color }}
                  >
                    {group.length}
                  </span>
                  <svg
                    width="10" height="10" viewBox="0 0 10 10" fill="none"
                    className="shrink-0 transition-transform duration-200"
                    style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                  >
                    <path d="M2 3.5L5 6.5L8 3.5" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>

                {/* Accordion body */}
                <div
                  className="overflow-hidden transition-all duration-300"
                  style={{ maxHeight: isOpen ? `${group.length * 44 + 16}px` : '0px' }}
                >
                  {/* Column headers */}
                  <div className="grid grid-cols-[1fr_80px_80px_80px] gap-2 border-t border-white/[0.06] px-4 py-2">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-text-muted/50">Page</span>
                    <span className="text-right text-[9px] font-bold uppercase tracking-wider text-text-muted/50">Sessions</span>
                    <span className="text-right text-[9px] font-bold uppercase tracking-wider text-text-muted/50">Engagement</span>
                    <span className="text-right text-[9px] font-bold uppercase tracking-wider text-text-muted/50">
                      {view === 'ai' ? 'AI Sessions' : 'Avg Duration'}
                    </span>
                  </div>

                  {/* Page rows */}
                  {group.map((page) => {
                    const aiSess = aiPageSessions[page.path] ?? 0
                    const aiPct  = page.sessions > 0 ? (aiSess / page.sessions) * 100 : 0
                    return (
                      <div
                        key={page.path}
                        className="grid grid-cols-[1fr_80px_80px_80px] gap-2 border-t border-white/[0.03] px-4 py-2.5 transition-colors duration-100 hover:bg-white/[0.02]"
                      >
                        <span
                          className="truncate font-mono text-[11px] text-white/70"
                          title={page.path}
                        >
                          {page.path}
                        </span>
                        <span className="text-right tabular-nums text-[11px] font-semibold text-white">
                          {page.sessions.toLocaleString()}
                        </span>
                        <span className="text-right tabular-nums text-[11px] font-semibold text-white">
                          {(page.engagementRate * 100).toFixed(1)}%
                        </span>
                        <span className="text-right tabular-nums text-[11px] font-semibold text-white">
                          {view === 'ai'
                            ? aiSess > 0
                              ? `${aiSess} (${aiPct.toFixed(1)}%)`
                              : '—'
                            : fmtDur(page.avgDuration)
                          }
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
