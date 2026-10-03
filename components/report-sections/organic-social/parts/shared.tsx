import { DashTimeoutError } from '@/lib/dash-social/client'

export async function safe<T>(p: Promise<T>): Promise<{ data?: T; error?: 'timeout' | 'error' }> {
  try { return { data: await p } }
  catch (e) { return { error: e instanceof DashTimeoutError ? 'timeout' : 'error' } }
}

/** The YTD blocks pick their own months, so a viewer cannot shorten their range (fix list X4). */
export const YTD_TIMEOUT_TEXT = 'Taking longer than usual. Try again in a minute.'

/** `timeoutText` replaces only the timeout copy; absent, the card is exactly as before for every other part. */
export function Fallback({ kind, timeoutText }: { kind: 'timeout' | 'error'; timeoutText?: string }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface p-6 text-sm text-text-muted">
      {kind === 'timeout' ? (timeoutText ?? 'Taking longer than usual — try a shorter date range.') : "Couldn't load this section."}
    </div>
  )
}
