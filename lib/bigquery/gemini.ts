import { GoogleGenAI } from '@google/genai'
import type { FunSpotData } from './client'

const PROJECT_ID = process.env.BQ_PROJECT_ID!

let _client: GoogleGenAI | null = null

function getClient(): GoogleGenAI {
  if (!_client) {
    _client = new GoogleGenAI({
      vertexai: true,
      project: PROJECT_ID,
      location: 'global',
    })
  }
  return _client
}

function formatCurrency(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US')
}

function buildDataContext(data: FunSpotData): string {
  const metaCPA = data.metaAds.conversions > 0 ? data.metaAds.spend / data.metaAds.conversions : 0
  const metaROAS = data.metaAds.spend > 0 ? data.metaAds.conversionValue / data.metaAds.spend : 0

  return `
## Fun Spot America — Marketing Performance Data
**Period:** ${data.dateRange.startDate} to ${data.dateRange.endDate}
**Active Paid Channels:** Meta Ads only (Google Ads not currently active)

### Meta Ads (Facebook & Instagram)
- Spend: ${formatCurrency(data.metaAds.spend)}
- Impressions: ${formatNumber(data.metaAds.impressions)}
- Clicks: ${formatNumber(data.metaAds.clicks)}
- CTR: ${data.metaAds.impressions > 0 ? ((data.metaAds.clicks / data.metaAds.impressions) * 100).toFixed(2) + '%' : 'N/A'}
- CPC: ${data.metaAds.clicks > 0 ? formatCurrency(data.metaAds.spend / data.metaAds.clicks) : 'N/A'}
- Conversions: ${formatNumber(data.metaAds.conversions)}
- CPA: ${metaCPA > 0 ? formatCurrency(metaCPA) : 'N/A'}
- Conversion Value: ${formatCurrency(data.metaAds.conversionValue)}
- ROAS: ${metaROAS > 0 ? metaROAS.toFixed(2) + 'x' : 'N/A'}

### Website Analytics (GA4)
- Sessions: ${formatNumber(data.ga4.sessions)}
- Total Users: ${formatNumber(data.ga4.totalUsers)}
- New Users: ${formatNumber(data.ga4.newUsers)}
- Engaged Sessions: ${formatNumber(data.ga4.engagedSessions)}
- Engagement Rate: ${data.ga4.sessions > 0 ? ((data.ga4.engagedSessions / data.ga4.sessions) * 100).toFixed(1) + '%' : 'N/A'}
- Conversions: ${formatNumber(data.ga4.conversions)}
- Ecommerce Purchases: ${formatNumber(data.ga4.ecommercePurchases)}
- Total Revenue: ${formatCurrency(data.ga4.totalRevenue)}
${data.ga4.ecommercePurchases > 0 ? `- Note: Ecommerce tracking was recently set up, so purchase data may only cover a few days.` : ''}

### Top Traffic Channels (GA4)
${data.ga4.topChannels.map((ch) => `- ${ch.channel}: ${formatNumber(ch.sessions)} sessions, ${formatNumber(ch.users)} users, ${formatNumber(ch.conversions)} conversions`).join('\n')}
`
}

export interface ConversationalSummaryResponse {
  headline: string
  greeting: string
  highlights: {
    label: string
    value: string
    delta: string
    sentiment: 'positive' | 'negative' | 'neutral'
    narrative: string
  }[]
  channelBreakdown: {
    channel: string
    spend: string
    conversions: string
    cpa: string
    roas: string
  }[]
  callouts: {
    type: 'win' | 'watch'
    text: string
  }[]
  closing: string
}

export async function generateConversationalSummary(data: FunSpotData): Promise<ConversationalSummaryResponse> {
  const client = getClient()

  const dataContext = buildDataContext(data)

  const prompt = `You are a senior digital marketing strategist at Avenue Z, a marketing agency. You are writing a performance summary for your client Fun Spot America, a theme park in Orlando, FL.

Given the following marketing performance data, generate a conversational, executive-friendly summary. Be specific with numbers. Be honest — if something is underperforming, say so diplomatically. If ecommerce data is very low or zero, note that tracking was just recently enabled and not to read into those numbers yet.

${dataContext}

Respond with a JSON object matching this exact structure:

{
  "headline": "A short 5-8 word headline summarizing overall performance (e.g., 'Strong traffic growth with efficient spend.')",
  "greeting": "A 2-3 sentence natural language intro paragraph summarizing the period at a high level.",
  "highlights": [
    {
      "label": "Short label (e.g., 'Website Traffic', 'Meta Ads', 'Google Ads')",
      "value": "The key metric value (e.g., '89,234 sessions')",
      "delta": "Not available for this period — use 'N/A' or leave empty",
      "sentiment": "positive, negative, or neutral based on the data",
      "narrative": "2-3 sentence analysis of this area. Be specific with numbers from the data."
    }
  ],
  "channelBreakdown": [
    {
      "channel": "Channel name",
      "spend": "Formatted spend",
      "conversions": "Number",
      "cpa": "Cost per conversion or '—' if no conversions",
      "roas": "Return on ad spend or '—' if no spend"
    }
  ],
  "callouts": [
    { "type": "win", "text": "Something that went well, based on the actual data" },
    { "type": "watch", "text": "Something to monitor or improve, based on the actual data" }
  ],
  "closing": "2-3 sentence forward-looking paragraph with recommendations based on what the data shows."
}

Generate 3-5 highlights covering: website traffic, Meta Ads, and optionally ecommerce if there's data. Google Ads is not active for this client — do not mention it.
Generate 2-3 wins and 1-2 watch items.
Include GA4 organic/direct traffic as a row in channelBreakdown with spend as "$0".
All numbers must come from the actual data provided — do not fabricate or estimate.`

  const response = await client.models.generateContent({
    model: 'gemini-2.5-flash-lite',
    contents: prompt,
    config: {
      temperature: 0.7,
      maxOutputTokens: 2048,
      responseMimeType: 'application/json',
    },
  })

  const text = response.text

  if (!text) {
    throw new Error('Gemini returned no content')
  }

  return JSON.parse(text) as ConversationalSummaryResponse
}
