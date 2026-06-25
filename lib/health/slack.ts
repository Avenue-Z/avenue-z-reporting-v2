/**
 * Post health transitions to the internal Slack channel via an incoming
 * webhook. Failures are logged, never thrown — a missed post must not fail
 * the sweep (state is still upserted, so the next real change re-alerts).
 */
export async function postHealthChanges(text: string): Promise<void> {
  const url = process.env.SLACK_HEALTH_WEBHOOK_URL
  if (!url) {
    console.error('[health] SLACK_HEALTH_WEBHOOK_URL not set; skipping Slack post')
    return
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
    if (!res.ok) console.error(`[health] Slack post failed: ${res.status}`)
  } catch (err) {
    console.error('[health] Slack post error', err)
  }
}
