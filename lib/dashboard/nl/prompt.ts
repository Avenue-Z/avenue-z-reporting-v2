import type { SourceKind } from './types'

const SUPERMETRICS_SCHEMA = `{
  "config": {
    "name": string,                         // human label, e.g. "Facebook Ad Spend"
    "binding": { "source": "supermetrics", "dsId": string, "metricField": string, "account": string },
    "format": "currency" | "percent" | "count" | "number",
    "range": null
  },
  "confidence": number,                       // 0..1 for the core metric
  "alternatives": { "metric"?: [{ "value": string, "label": string, "confidence"?: number }],
                    "account"?: [{ "value": string, "label": string, "confidence"?: number }] },
  "clarify"?: string                          // set ONLY if the request is too vague to pick a metric
}`

const TRIPLEWHALE_SCHEMA = `{
  "config": {
    "name": string,
    "binding": { "source": "triplewhale", "metric": string },
    "format": "currency" | "percent" | "count" | "number",
    "range": null
  },
  "confidence": number,
  "alternatives": { "metric"?: [{ "value": string, "label": string, "confidence"?: number }],
                    "account"?: [{ "value": string, "label": string, "confidence"?: number }] },
  "clarify"?: string
}`

export function buildResolutionPrompt(source: SourceKind, userPrompt: string): string {
  const schema = source === 'supermetrics' ? SUPERMETRICS_SCHEMA : TRIPLEWHALE_SCHEMA
  return `You are resolving a marketing-metric request into a structured dashboard block for the ${source} data source.

Use your ${source} tools to discover and VALIDATE the exact metric field and account that exist for this workspace. Rank alternative metric/account matches best-first.

User request: "${userPrompt}"

Return EXACTLY ONE fenced JSON object matching this schema and NOTHING else (no prose before or after):
\`\`\`json
${schema}
\`\`\`

Rules:
- Pick the single best-guess metric/account for "config"; put other plausible matches in "alternatives" (max 5 each, ranked).
- Set "confidence" to your confidence (0..1) that the core metric is what the user meant.
- If the request is too vague to choose a metric at all, set "clarify" to a single short narrowing question and omit a meaningful "config".
- "range" must be null (the block inherits the dashboard's time range).
- Use only metric fields and accounts that your tools confirm exist. Do not invent identifiers.`
}
