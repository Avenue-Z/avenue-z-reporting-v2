'use client'

import { useState, useTransition } from 'react'
import { submitReportRequest } from '@/app/actions/report-request'

const REPORT_TYPE_OPTIONS = [
  'Paid Media (Google Ads, Meta, LinkedIn, etc.)',
  'Email Marketing',
  'SEO / Search Console',
  'E-commerce / Shopify',
  'CRM / HubSpot / Salesforce',
  'Social Media Analytics',
  'Custom / Other',
]

export function RequestAReportReport({ clientSlug, submittedBy }: { clientSlug: string; submittedBy?: string }) {
  const [reportType, setReportType] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('idle')
    setErrorMsg('')
    startTransition(async () => {
      const result = await submitReportRequest({
        clientSlug,
        reportType,
        description,
        submittedBy: submittedBy ?? 'unknown',
      })
      if (result.success) {
        setStatus('success')
        setReportType('')
        setDescription('')
      } else {
        setStatus('error')
        setErrorMsg(result.error ?? 'Something went wrong.')
      }
    })
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="rounded-lg border border-white/[0.08] bg-bg-surface p-6">
        <h2 className="text-xl font-extrabold text-white">Request a Report</h2>
        <p className="mt-2 text-sm text-text-muted">
          Don't see the data you need? Submit a request and the Avenue Z team
          will review it and get back to you.
        </p>
      </div>

      {/* Form */}
      <div className="rounded-lg border border-white/[0.08] bg-bg-surface p-6">
        {status === 'success' ? (
          <div className="flex flex-col items-start gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#60FF80]/10 text-[#60FF80]">
                ✓
              </span>
              <p className="text-base font-semibold text-white">Request submitted!</p>
            </div>
            <p className="text-sm text-text-muted">
              We've received your request and will follow up shortly.
            </p>
            <button
              onClick={() => setStatus('idle')}
              className="mt-2 rounded-md border border-white/[0.10] bg-white/[0.04] px-4 py-2 text-sm text-white transition-colors hover:bg-white/[0.08]"
            >
              Submit another request
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Report type */}
            <div className="space-y-2">
              <label className="text-xs font-extrabold uppercase tracking-widest text-text-muted">
                Report type
              </label>
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
                required
                className="w-full rounded-md border border-white/[0.10] bg-white/[0.04] px-3 py-2 text-sm text-white outline-none transition-colors focus:border-white/20 focus:bg-white/[0.06]"
              >
                <option value="" disabled className="bg-[#0f0f0f]">
                  Select a report type…
                </option>
                {REPORT_TYPE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt} className="bg-[#0f0f0f]">
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <label className="text-xs font-extrabold uppercase tracking-widest text-text-muted">
                What data or insights do you need?
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                rows={5}
                placeholder="Describe the metrics, dimensions, date ranges, or goals you have in mind…"
                className="w-full resize-none rounded-md border border-white/[0.10] bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-text-muted outline-none transition-colors focus:border-white/20 focus:bg-white/[0.06]"
              />
            </div>

            {/* Error */}
            {status === 'error' && (
              <p className="text-sm text-[#FF4444]">{errorMsg}</p>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isPending}
              className="rounded-md bg-white px-5 py-2 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {isPending ? 'Submitting…' : 'Submit Request'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
