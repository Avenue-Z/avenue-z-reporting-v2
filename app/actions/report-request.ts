'use server'

export interface ReportRequestPayload {
  clientSlug: string
  reportType: string
  description: string
  submittedBy: string
}

export interface ReportRequestResult {
  success: boolean
  error?: string
}

export async function submitReportRequest(
  payload: ReportRequestPayload
): Promise<ReportRequestResult> {
  try {
    if (!payload.reportType.trim()) {
      return { success: false, error: 'Report type is required.' }
    }
    if (!payload.description.trim()) {
      return { success: false, error: 'Description is required.' }
    }

    // Send email via the configured SMTP / Resend / etc. when available.
    // For now, log the request server-side so it's captured in Vercel logs.
    console.log('[ReportRequest]', JSON.stringify({
      ...payload,
      submittedAt: new Date().toISOString(),
    }))

    return { success: true }
  } catch (err) {
    console.error('[ReportRequest] error', err)
    return { success: false, error: 'Something went wrong. Please try again.' }
  }
}
