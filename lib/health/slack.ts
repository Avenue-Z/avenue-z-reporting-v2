/**
 * Post health transitions to the internal Slack channel via the Slack Web API
 * (chat.postMessage with a bot token), matching the renaissance-ad-spend-pacing
 * notifier. Failures are logged, never thrown — a missed post must not fail the
 * sweep (state is still upserted, so the next real change re-alerts).
 *
 * Requires SLACK_BOT_TOKEN (xoxb-… bot token with chat:write) and
 * SLACK_CHANNEL_ID (the channel's ID, e.g. C0123ABCD — not the #name).
 */
export async function postHealthChanges(text: string): Promise<void> {
  const token = process.env.SLACK_BOT_TOKEN
  const channel = process.env.SLACK_CHANNEL_ID
  if (!token || !channel) {
    console.error('[health] SLACK_BOT_TOKEN or SLACK_CHANNEL_ID not set; skipping Slack post')
    return
  }
  try {
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({ channel, text }),
    })
    // chat.postMessage returns HTTP 200 even on logical errors; the real status
    // is the `ok` field in the JSON body (e.g. invalid_auth, channel_not_found).
    const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null
    if (!res.ok || !body?.ok) {
      console.error(`[health] Slack post failed: ${body?.error ?? `HTTP ${res.status}`}`)
    }
  } catch (err) {
    console.error('[health] Slack post error', err)
  }
}
