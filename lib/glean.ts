// Glean Client API utility — server-side only, never import in client components

const GLEAN_INSTANCE = process.env.GLEAN_INSTANCE ?? ''
const GLEAN_API_TOKEN = process.env.GLEAN_API_TOKEN ?? ''

export const GLEAN_BASE_URL = `https://${GLEAN_INSTANCE}-be.glean.com/rest/api/v1`

export function getGleanHeaders(actAsEmail?: string): HeadersInit {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${GLEAN_API_TOKEN}`,
    'Content-Type': 'application/json',
  }
  // Global tokens require X-Scio-Actas to specify the user context
  if (actAsEmail) {
    headers['X-Scio-Actas'] = actAsEmail
  }
  return headers
}

export function getLast7DaysRange(): { from: string; to: string } {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - 7)
  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  }
}

export function buildMeetingPrepPrompt(
  clientName: string,
  dateRange: { from: string; to: string }
): string {
  return `You are preparing a concise client meeting brief for Avenue Z, a marketing agency.

Search for recent activity related to "${clientName}" from ${dateRange.from} to ${dateRange.to}.

Write a SHORT, scannable brief. Use this exact format with these exact markdown headings. Keep each section to 2-4 bullet points max. No long paragraphs.

# Meeting Prep: ${clientName}

## What Happened This Week
The 3-4 most important things that happened — campaigns launched, deliverables completed, decisions made, issues raised. One sentence per bullet.

## Action Items
2-4 specific things the Avenue Z team needs to address or bring up in the meeting. Be concrete.

## Risks & Blockers
Any unresolved issues, missed deadlines, or concerns. If none, say "No blockers identified."

## Talking Points for the Meeting
3-4 suggested talking points or questions to bring to the client. Frame as conversation starters.

Rules:
- Keep the entire brief under 400 words
- Use bullet points, not paragraphs
- Be specific — include names, dates, campaign names when available
- If you find limited information, say so briefly and move on
- Do not include section headers if you have nothing for that section`
}
