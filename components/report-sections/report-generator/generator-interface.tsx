'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Send, Sparkles, RotateCcw, Download, ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ReportCanvas } from './report-canvas'
import type { ReportBlock } from './report-canvas'
import type { DataSnapshot } from '@/lib/report-generator/context'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Message {
  role: 'user' | 'assistant'
  content: string
}

// ---------------------------------------------------------------------------
// Formatting helpers (client-safe — no server imports)
// ---------------------------------------------------------------------------

function fmt(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`
}

function fmtDelta(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`
}

function fmtCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}

// ---------------------------------------------------------------------------
// Suggested prompts
// ---------------------------------------------------------------------------

const SUGGESTED_PROMPTS = [
  { label: 'Executive summary',      prompt: "Build an executive summary of this month's performance for a client deck" },
  { label: 'Top wins this period',   prompt: 'What are the top 3 wins we should highlight to the client this period?' },
  { label: 'Channel breakdown',      prompt: 'Give me a channel-by-channel performance breakdown with recommendations' },
  { label: 'Where to focus next',    prompt: 'Based on the data, where should we focus budget and effort next month?' },
  { label: 'Inbound pipeline story', prompt: 'Tell the inbound funnel story — leads, quality, and pipeline impact' },
  { label: 'AEO visibility',         prompt: 'Summarize our AI search visibility and what it means for the client' },
]

// ---------------------------------------------------------------------------
// Response engine
//
// Uses the live DataSnapshot to populate real values.
// Replace the body of each case with a real API call when ready:
//
// TODO: POST /api/report-generator
//   body: { prompt, clientName, snapshot }
//   The route should:
//     1. Serialize snapshot as structured context
//     2. Optionally query Glean (GLEAN_INSTANCE + GLEAN_API_TOKEN from lib/glean.ts)
//        for company/account knowledge (proposals, briefs, past reports)
//     3. Call Claude API (ANTHROPIC_API_KEY) with combined context + prompt
//     4. Return { message, blocks } — or stream blocks incrementally
// ---------------------------------------------------------------------------

function generateResponse(
  prompt: string,
  snapshot: DataSnapshot,
): { message: string; blocks: ReportBlock[] } {
  const lower = prompt.toLowerCase()
  const id    = () => Math.random().toString(36).slice(2, 8)

  const { ga4, inbound, pipeline, peec, dateLabel } = snapshot

  // ── Helpers to build metric items ──────────────────────────────────────
  function ga4Metrics() {
    if (!ga4) return [
      { label: 'Sessions',    value: '—', context: 'GA4 not connected' },
      { label: 'Users',       value: '—', context: 'GA4 not connected' },
      { label: 'Bounce Rate', value: '—', context: 'GA4 not connected' },
    ]
    return [
      { label: 'Sessions',    value: fmt(ga4.sessions),        delta: ga4.sessionsDelta },
      { label: 'Users',       value: fmt(ga4.users),           delta: ga4.usersDelta    },
      { label: 'Bounce Rate', value: fmtPct(ga4.bounceRate),   delta: ga4.bounceDelta   },
    ]
  }

  function inboundMetrics() {
    if (!inbound) return [
      { label: 'New Contacts', value: '—', context: 'HubSpot not connected' },
      { label: 'ICP Contacts', value: '—', context: 'HubSpot not connected' },
      { label: 'ICP Rate',     value: '—', context: 'HubSpot not connected' },
    ]
    return [
      { label: 'New Contacts', value: fmt(inbound.total), delta: inbound.totalDelta },
      { label: 'ICP Contacts', value: fmt(inbound.icp) },
      { label: 'MCP Contacts', value: fmt(inbound.mcp) },
      { label: 'ICP Rate',     value: fmtPct(inbound.icpRate) },
    ]
  }

  function pipelineMetrics() {
    if (!pipeline) return [
      { label: 'Open Deals',    value: '—', context: 'HubSpot not connected' },
      { label: 'Pipeline Value',value: '—', context: 'HubSpot not connected' },
    ]
    return [
      { label: 'Open Deals',     value: fmt(pipeline.openDeals) },
      { label: 'Pipeline Value', value: fmtCurrency(pipeline.totalValue) },
      { label: 'Avg Deal Value', value: fmtCurrency(pipeline.avgDealValue) },
    ]
  }

  function peecMetrics() {
    if (!peec) return [
      { label: 'AI Visibility', value: '—', context: 'Peec AI not connected' },
      { label: 'Share of Voice', value: '—', context: 'Peec AI not connected' },
    ]
    return [
      { label: 'AI Visibility',   value: fmtPct(peec.ownVisibility) },
      { label: 'Share of Voice',  value: fmtPct(peec.ownSov) },
      { label: 'Tracked Prompts', value: fmt(peec.trackedPrompts) },
      { label: 'Total Citations', value: fmt(peec.totalCitations) },
    ]
  }

  // ── Narrative helpers ───────────────────────────────────────────────────
  function ga4Narrative(): string {
    if (!ga4) return 'Web analytics data is not yet connected. Add the GA4 property ID and service account key to populate real metrics.'
    const trend = ga4.sessionsDelta >= 5
      ? `up ${fmtDelta(ga4.sessionsDelta)} vs the prior period`
      : ga4.sessionsDelta <= -5
      ? `down ${fmtDelta(ga4.sessionsDelta)} vs the prior period`
      : 'roughly flat vs the prior period'
    return `Website sessions are ${trend} at ${fmt(ga4.sessions)} over the ${dateLabel.toLowerCase()}. ${fmt(ga4.users)} users visited the site. Bounce rate is ${fmtPct(ga4.bounceRate)}.`
  }

  function inboundNarrative(): string {
    if (!inbound) return 'HubSpot inbound data is not yet connected. Add the HubSpot access token to populate real contact metrics.'
    const trend = inbound.totalDelta >= 5
      ? `up ${fmtDelta(inbound.totalDelta)} vs prior period`
      : inbound.totalDelta <= -5
      ? `down ${fmtDelta(inbound.totalDelta)} vs prior period`
      : 'tracking similarly to the prior period'
    return `${fmt(inbound.total)} new contacts came in over the ${dateLabel.toLowerCase()} — ${trend}. ICP-quality leads account for ${fmtPct(inbound.icpRate)} of the total (${fmt(inbound.icp)} contacts), with ${fmt(inbound.mcp)} MCP-quality contacts.`
  }

  function pipelineNarrative(): string {
    if (!pipeline) return 'Pipeline data is not yet connected. Ensure the HubSpot access token has deal access.'
    return `There are currently ${fmt(pipeline.openDeals)} open deals in the pipeline with a combined value of ${fmtCurrency(pipeline.totalValue)}. Average deal size is ${fmtCurrency(pipeline.avgDealValue)}.`
  }

  function peecNarrative(): string {
    if (!peec) return 'Peec AI data is not yet connected. Set PEEC_AI_CUSTOMER_TOKEN and the client\'s peecCustomerProjectId to populate AI visibility metrics.'
    return `The brand has ${fmtPct(peec.ownVisibility)} AI visibility across ${fmt(peec.trackedPrompts)} tracked prompts, with ${fmtPct(peec.ownSov)} share of voice. ${fmt(peec.totalCitations)} total citations tracked. Strongest performance is on ${peec.topLLM}.`
  }

  // ── Wins narrative ──────────────────────────────────────────────────────
  function buildWins(): string[] {
    const wins: string[] = []
    if (ga4 && ga4.sessionsDelta >= 3)
      wins.push(`Web traffic is up ${fmtDelta(ga4.sessionsDelta)} — ${fmt(ga4.sessions)} sessions over the past 30 days.`)
    if (inbound && inbound.icpRate >= 20)
      wins.push(`Strong lead quality: ${fmtPct(inbound.icpRate)} ICP rate with ${fmt(inbound.icp)} ideal-fit contacts.`)
    if (pipeline && pipeline.openDeals > 0)
      wins.push(`${fmt(pipeline.openDeals)} open deals totalling ${fmtCurrency(pipeline.totalValue)} in the active pipeline.`)
    if (peec && peec.ownVisibility >= 10)
      wins.push(`AI search presence is building — ${fmtPct(peec.ownVisibility)} visibility across ${fmt(peec.trackedPrompts)} tracked prompts on ${peec.topLLM}.`)
    if (wins.length === 0)
      wins.push('Performance data is available — connect remaining channels for a full wins summary.')
    return wins
  }

  // ── Route to the right response ─────────────────────────────────────────
  if (lower.includes('executive') || lower.includes('exec') || lower.includes('summary')) {
    const narrative = [ga4Narrative(), inboundNarrative()].filter(Boolean).join(' ')
    return {
      message: "Here's an executive summary. Real metrics are pulled from your connected channels.",
      blocks: [
        { id: id(), type: 'heading',   content: 'Executive Summary' },
        { id: id(), type: 'narrative', content: narrative, source: `Cross-channel · ${dateLabel}` },
        { id: id(), type: 'metrics',   metrics: [
          ...ga4Metrics().slice(0, 2),
          ...inboundMetrics().slice(0, 2),
        ], source: `GA4 + HubSpot · ${dateLabel}` },
      ],
    }
  }

  if (lower.includes('win') || lower.includes('highlight') || lower.includes('best')) {
    return {
      message: "Added a top wins section. These are drawn from live data across your connected channels.",
      blocks: [
        { id: id(), type: 'divider' },
        { id: id(), type: 'heading', content: 'Top Wins This Period' },
        { id: id(), type: 'bullets', items: buildWins(), source: `Live data · ${dateLabel}` },
      ],
    }
  }

  if (lower.includes('channel') || lower.includes('breakdown')) {
    return {
      message: "Added a channel breakdown with live metrics from each connected source.",
      blocks: [
        { id: id(), type: 'divider' },
        { id: id(), type: 'heading',   content: 'Channel Performance Breakdown' },

        ...(ga4 ? [
          { id: id(), type: 'heading'   as const, content: 'Web Analytics (GA4)' },
          { id: id(), type: 'narrative' as const, content: ga4Narrative(), source: `GA4 · ${ga4.startDate} – ${ga4.endDate}` },
          { id: id(), type: 'metrics'   as const, metrics: ga4Metrics(), source: 'Google Analytics 4' },
        ] : []),

        ...(inbound ? [
          { id: id(), type: 'heading'   as const, content: 'Inbound Funnel (HubSpot)' },
          { id: id(), type: 'narrative' as const, content: inboundNarrative(), source: `HubSpot · ${inbound.startDate} – ${inbound.endDate}` },
          { id: id(), type: 'metrics'   as const, metrics: inboundMetrics(), source: 'HubSpot CRM' },
        ] : []),

        ...(peec ? [
          { id: id(), type: 'heading'   as const, content: 'Answer Engine Optimization (Peec AI)' },
          { id: id(), type: 'narrative' as const, content: peecNarrative(), source: 'Peec AI' },
          { id: id(), type: 'metrics'   as const, metrics: peecMetrics(), source: 'Peec AI' },
        ] : []),
      ],
    }
  }

  if (lower.includes('focus') || lower.includes('next') || lower.includes('recommend') || lower.includes('budget')) {
    const recs: string[] = []
    if (ga4 && ga4.bounceRate > 55)
      recs.push(`Bounce rate is ${fmtPct(ga4.bounceRate)} — review landing page experience and page load times for high-traffic pages.`)
    if (ga4 && ga4.sessionsDelta < -5)
      recs.push(`Sessions are down ${fmtDelta(ga4.sessionsDelta)} — investigate traffic source changes and ensure SEO and paid channels are healthy.`)
    if (inbound && inbound.icpRate < 15)
      recs.push(`ICP rate is ${fmtPct(inbound.icpRate)} — review lead gen targeting and form placement to attract more ideal-fit contacts.`)
    if (inbound && inbound.totalDelta < -10)
      recs.push(`Inbound lead volume is down ${fmtDelta(inbound.totalDelta)} — audit top-performing forms and traffic sources from the prior period.`)
    if (peec && peec.ownVisibility < 15)
      recs.push(`AI visibility is ${fmtPct(peec.ownVisibility)} — prioritize AEO content targeting the ${fmt(peec.trackedPrompts)} tracked prompts where the brand is underrepresented.`)
    if (recs.length === 0)
      recs.push('Performance looks solid across connected channels. Focus on connecting any remaining data sources for a full cross-channel view.')
    recs.push('Connect the Glean integration to layer in account history, past proposals, and team context for richer recommendations.')
    return {
      message: "Added a data-driven recommendations section based on your live metrics.",
      blocks: [
        { id: id(), type: 'divider' },
        { id: id(), type: 'heading', content: 'Recommendations for Next Period' },
        { id: id(), type: 'bullets', items: recs, source: `Analysis · ${dateLabel}` },
      ],
    }
  }

  if (lower.includes('inbound') || lower.includes('funnel') || lower.includes('lead') || lower.includes('pipeline')) {
    return {
      message: "Added an inbound funnel and pipeline section with live HubSpot data.",
      blocks: [
        { id: id(), type: 'divider' },
        { id: id(), type: 'heading',   content: 'Inbound Funnel & Pipeline' },
        { id: id(), type: 'narrative', content: `${inboundNarrative()} ${pipelineNarrative()}`, source: `HubSpot CRM · ${dateLabel}` },
        { id: id(), type: 'metrics',   metrics: [...inboundMetrics(), ...pipelineMetrics()], source: 'HubSpot CRM' },
      ],
    }
  }

  if (lower.includes('aeo') || lower.includes('ai search') || lower.includes('visibility') || lower.includes('peec')) {
    return {
      message: "Added an AEO section with live Peec AI data.",
      blocks: [
        { id: id(), type: 'divider' },
        { id: id(), type: 'heading',   content: 'AI Search Visibility (AEO)' },
        { id: id(), type: 'narrative', content: peecNarrative(), source: 'Peec AI' },
        { id: id(), type: 'metrics',   metrics: peecMetrics(), source: 'Peec AI · Live data' },
        { id: id(), type: 'bullets',   items: [
          `Top-performing LLM: ${peec?.topLLM ?? 'Not connected'}`,
          `${fmt(peec?.trackedPrompts ?? 0)} prompts tracked across AI tools`,
          `${fmt(peec?.totalCitations ?? 0)} total brand citations captured`,
        ], source: 'Peec AI' },
      ],
    }
  }

  // Default
  const allMetrics = [
    ...(ga4     ? [{ label: 'Sessions',      value: fmt(ga4.sessions),             delta: ga4.sessionsDelta  }] : []),
    ...(inbound ? [{ label: 'New Contacts',   value: fmt(inbound.total),            delta: inbound.totalDelta }] : []),
    ...(pipeline? [{ label: 'Pipeline Value', value: fmtCurrency(pipeline.totalValue)                         }] : []),
    ...(peec    ? [{ label: 'AI Visibility',  value: fmtPct(peec.ownVisibility)                               }] : []),
  ]

  return {
    message: "I've added a section to your report. Ask a follow-up or use one of the suggested prompts for a deeper cut.",
    blocks: [
      { id: id(), type: 'divider' },
      { id: id(), type: 'narrative', content: `Responding to: "${prompt}"`, source: `Avenue Z · ${dateLabel}` },
      ...(allMetrics.length > 0
        ? [{ id: id(), type: 'metrics' as const, metrics: allMetrics, source: `Live data · ${dateLabel}` }]
        : []
      ),
    ],
  }
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface GeneratorInterfaceProps {
  clientName:    string
  activeChannels: string[]
  snapshot:      DataSnapshot
}

export function GeneratorInterface({ clientName, activeChannels, snapshot }: GeneratorInterfaceProps) {
  const [messages, setMessages]         = useState<Message[]>([])
  const [blocks, setBlocks]             = useState<ReportBlock[]>([])
  const [input, setInput]               = useState('')
  const [isGenerating, setIsGenerating] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef       = useRef<HTMLTextAreaElement>(null)
  const canvasRef      = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isGenerating])

  const handleSend = useCallback((text?: string) => {
    const message = (text ?? input).trim()
    if (!message || isGenerating) return

    setMessages((prev) => [...prev, { role: 'user', content: message }])
    setInput('')
    setIsGenerating(true)

    // TODO: Replace with real API call — see comment in generateResponse above
    setTimeout(() => {
      const { message: reply, blocks: newBlocks } = generateResponse(message, snapshot)
      setBlocks((prev) => [...prev, ...newBlocks])
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }])
      setIsGenerating(false)
      setTimeout(() => {
        canvasRef.current?.scrollTo({ top: canvasRef.current.scrollHeight, behavior: 'smooth' })
      }, 100)
    }, 900 + Math.random() * 500)
  }, [input, isGenerating, snapshot])

  function handleReset() {
    setMessages([])
    setBlocks([])
    setInput('')
  }

  function handleDownload() {
    // TODO: Replace with Puppeteer server route or react-pdf for proper export
    window.print()
  }

  const hasContent = blocks.length > 0

  // Status line shows which channels have live data
  const liveChannels = [
    snapshot.ga4       && 'GA4',
    snapshot.inbound   && 'HubSpot',
    snapshot.pipeline  && 'Pipeline',
    snapshot.peec      && 'Peec AI',
  ].filter(Boolean) as string[]

  return (
    <div className="flex h-[calc(100vh-12rem)] flex-col overflow-hidden rounded-xl border border-white/[0.06]">

      {/* Toolbar */}
      <div className="flex shrink-0 items-center justify-between border-b border-white/[0.06] bg-bg-surface px-5 py-3">
        <div className="flex items-center gap-2">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-lg"
            style={{ backgroundImage: 'linear-gradient(135deg, #FFFC60, #60FF80, #60FDFF)' }}
          >
            <Sparkles className="h-3.5 w-3.5 text-black" />
          </span>
          <div>
            <p className="text-sm font-bold text-white">Report Generator</p>
            <p className="text-[11px] text-text-muted">
              {liveChannels.length > 0
                ? `Live: ${liveChannels.join(', ')} · ${clientName}`
                : `No channels connected · ${clientName}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasContent && (
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-3 py-1.5 text-xs font-semibold text-text-muted transition-colors hover:border-white/[0.15] hover:text-white"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </button>
          )}
          <button
            onClick={handleDownload}
            disabled={!hasContent}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all',
              hasContent
                ? 'border border-white/[0.08] text-white hover:border-white/[0.2] hover:bg-white/[0.04]'
                : 'cursor-not-allowed border border-white/[0.04] text-white/20'
            )}
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex min-h-0 flex-1">

        {/* Chat panel */}
        <div className="flex w-80 shrink-0 flex-col border-r border-white/[0.06]">
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {messages.length === 0 && !isGenerating ? (
              <div className="flex flex-col gap-3">
                <p className="text-xs font-semibold text-text-muted">Start with a prompt</p>
                <div className="flex flex-col gap-1.5">
                  {SUGGESTED_PROMPTS.map(({ label, prompt }) => (
                    <button
                      key={label}
                      onClick={() => handleSend(prompt)}
                      className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-left transition-colors hover:border-white/[0.12] hover:bg-white/[0.04]"
                    >
                      <span className="text-xs font-semibold text-white/70">{label}</span>
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-white/20" />
                    </button>
                  ))}
                </div>
                {liveChannels.length > 0 && (
                  <div className="mt-2 rounded-lg border border-[#60FF80]/20 bg-[#60FF80]/[0.04] px-3 py-2.5">
                    <p className="text-[11px] font-semibold text-[#60FF80]">Live data connected</p>
                    <p className="text-[11px] text-white/50 mt-0.5">{liveChannels.join(', ')}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {messages.map((msg, i) => (
                  <div key={i} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                    <div className={cn(
                      'max-w-[90%] rounded-xl px-3 py-2 text-xs leading-relaxed',
                      msg.role === 'user'
                        ? 'bg-white/[0.1] text-white'
                        : 'border border-white/[0.06] bg-white/[0.02] text-white/70'
                    )}>
                      {msg.content}
                    </div>
                  </div>
                ))}
                {isGenerating && (
                  <div className="flex justify-start">
                    <div className="flex items-center gap-1.5 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#60FDFF]" style={{ animationDelay: '0ms' }} />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#60FF80]" style={{ animationDelay: '150ms' }} />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#FFFC60]" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Input */}
          <div className="shrink-0 border-t border-white/[0.06] p-3">
            <div className="flex items-end gap-2 rounded-xl border border-white/[0.08] bg-black/40 px-3 py-2.5 focus-within:border-[#60FDFF]/30">
              <textarea
                ref={inputRef}
                rows={2}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
                }}
                placeholder="Ask a question about the data…"
                disabled={isGenerating}
                className="flex-1 resize-none bg-transparent text-xs text-white placeholder:text-text-muted outline-none"
              />
              <button
                onClick={() => handleSend()}
                disabled={!input.trim() || isGenerating}
                className="mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-opacity disabled:opacity-30"
                style={{
                  backgroundImage: input.trim() && !isGenerating
                    ? 'linear-gradient(135deg, #FFFC60, #60FF80, #60FDFF)'
                    : undefined,
                  backgroundColor: !input.trim() || isGenerating ? 'rgba(255,255,255,0.1)' : undefined,
                }}
              >
                <Send className="h-3.5 w-3.5 text-black" />
              </button>
            </div>
            <p className="mt-1.5 text-center text-[10px] text-text-muted">
              Enter to send · Shift+Enter for new line
            </p>
          </div>
        </div>

        {/* Report canvas */}
        <div className="min-w-0 flex-1 overflow-hidden">
          <ReportCanvas
            ref={canvasRef}
            blocks={blocks}
            clientName={clientName}
            isGenerating={isGenerating}
          />
        </div>
      </div>
    </div>
  )
}
