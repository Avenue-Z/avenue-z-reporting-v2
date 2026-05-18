'use client'

import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { CHART_COLORS } from '@/lib/constants'

interface MeetingPrepBriefProps {
  clientName: string
  clientSlug: string
}

interface BriefData {
  brief: string
  generatedAt: string
  clientName: string
  dateRange: { from: string; to: string }
}

export function MeetingPrepBrief({ clientName, clientSlug }: MeetingPrepBriefProps) {
  const [briefData, setBriefData] = useState<BriefData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function generateBrief() {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/glean/meeting-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientName, clientSlug }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || `Failed to generate brief (${res.status})`)
      }

      const data: BriefData = await res.json()
      setBriefData(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const formattedDate = briefData
    ? new Date(briefData.generatedAt).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : null

  return (
    <div className="space-y-8">
      {/* Section heading */}
      <div>
        <p className="text-sm font-bold uppercase tracking-widest text-text-muted">
          Internal Only
        </p>
        <h2 className="text-3xl font-extrabold uppercase text-white">
          Meeting{' '}
          <span className="gradient-text-full">Prep</span>
        </h2>
      </div>

      {/* Brief card */}
      <div className="rounded-lg border border-white/[0.08] bg-bg-surface px-6 py-6">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-white">
              {clientName} Meeting Brief
            </h3>
            {formattedDate && (
              <p className="mt-0.5 text-xs text-text-muted">
                Generated {formattedDate} &middot; Last 7 days
              </p>
            )}
          </div>
          <button
            onClick={generateBrief}
            disabled={loading}
            className="rounded-[100px] px-5 py-2.5 text-sm font-bold transition-colors disabled:opacity-50"
            style={{
              background: briefData ? '#3a3a3a' : undefined,
              backgroundImage: briefData
                ? undefined
                : 'linear-gradient(135deg, #FFFC60, #60FF80, #60FDFF)',
              color: briefData ? '#FFFFFF' : '#000000',
            }}
          >
            {loading
              ? 'Generating...'
              : briefData
                ? 'Refresh Brief'
                : 'Generate Brief'}
          </button>
        </div>

        {/* Initial empty state */}
        {!briefData && !loading && !error && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white/[0.06]">
              <svg
                className="h-6 w-6 text-text-muted"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z"
                />
              </svg>
            </div>
            <p className="text-sm font-bold text-white">
              Prepare for your {clientName} meeting
            </p>
            <p className="mt-1 max-w-xs text-xs text-text-muted">
              Pulls the last 7 days of Slack, email, docs, and activity from
              Z/OS and synthesizes a meeting brief.
            </p>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-brand-cyan" />
            <p className="text-sm font-bold text-white">
              Z/OS is searching for {clientName} activity...
            </p>
            <p className="mt-1 text-xs text-text-muted">
              Scanning Slack, Gmail, Docs, and Meet from the past 7 days
            </p>
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div className="rounded-lg border border-[#FF4444]/30 bg-[#FF4444]/10 p-4">
            <p className="text-sm font-bold" style={{ color: CHART_COLORS.negative }}>
              Failed to generate brief
            </p>
            <p className="mt-0.5 text-xs text-text-muted">{error}</p>
            <button
              onClick={generateBrief}
              className="mt-3 rounded-[100px] bg-[#3a3a3a] px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-bg-subtle"
            >
              Retry
            </button>
          </div>
        )}

        {/* Brief content */}
        {briefData && !loading && (
          <div className="space-y-6">
            <ReactMarkdown
              components={{
                h1: ({ children }) => (
                  <h1 className="text-2xl font-extrabold text-white">
                    {children}
                  </h1>
                ),
                h2: ({ children }) => (
                  <>
                    <div className="mt-8 mb-4 h-px bg-white/[0.06]" />
                    <h2 className="text-sm font-extrabold uppercase tracking-widest text-brand-cyan">
                      {children}
                    </h2>
                  </>
                ),
                h3: ({ children }) => (
                  <h3 className="mb-3 mt-5 text-sm font-extrabold uppercase tracking-widest text-text-muted">
                    {children}
                  </h3>
                ),
                p: ({ children }) => (
                  <p className="mb-3 text-base leading-relaxed text-white/70">
                    {children}
                  </p>
                ),
                ul: ({ children }) => (
                  <ul className="mb-2 space-y-3">
                    {children}
                  </ul>
                ),
                ol: ({ children }) => (
                  <ol className="mb-2 list-inside list-decimal space-y-3 text-base text-white/70">
                    {children}
                  </ol>
                ),
                li: ({ children }) => (
                  <li className="flex gap-3 text-base leading-relaxed text-white/70">
                    <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand-cyan" />
                    <span>{children}</span>
                  </li>
                ),
                a: ({ href, children }) => (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-cyan underline-offset-4 hover:underline"
                  >
                    {children}
                  </a>
                ),
                hr: () => <div className="my-6 h-px bg-white/[0.06]" />,
                strong: ({ children }) => (
                  <strong className="font-bold text-white">{children}</strong>
                ),
              }}
            >
              {briefData.brief}
            </ReactMarkdown>
          </div>
        )}
      </div>

      <p className="text-xs text-text-muted">
        Powered by Z/OS &middot; Internal use only &middot; Not visible to clients
      </p>
    </div>
  )
}
