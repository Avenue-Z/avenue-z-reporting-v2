const SCHEMA = `{
  "config": {
    "name": string,                         // human label, e.g. "Blended ROAS"
    "binding": {
      "source": "aggregate",
      "op": "+" | "-" | "*" | "/",
      "left":  <leaf>,
      "right": <leaf>
    },
    "format": "currency" | "percent" | "count" | "number",
    "range": null
  },
  "confidence": number,                       // 0..1 for the overall formula
  "alternatives": {
    "left"?:  { "metric"?: [{ "value": string, "label": string, "confidence"?: number }],
               "account"?: [{ "value": string, "label": string, "confidence"?: number }] },
    "right"?: { "metric"?: [{ "value": string, "label": string, "confidence"?: number }],
               "account"?: [{ "value": string, "label": string, "confidence"?: number }] }
  },
  "clarify"?: string                          // set ONLY if the formula is too vague to resolve
}
where <leaf> is either
  { "source": "supermetrics", "dsId": string, "metricField": string, "account": string }
  or { "source": "triplewhale", "metric": string }`

export function buildAggregatePrompt(formula: string): string {
  return `You are resolving a cross-source marketing formula into a structured aggregate dashboard block.

An aggregate combines exactly TWO metric operands with ONE binary operator (+, -, *, /). Each operand is a leaf metric from either Supermetrics or TripleWhale (they may be from different sources). Use your Supermetrics and TripleWhale tools to discover and VALIDATE each operand's exact metric/account. Rank alternative matches best-first per operand.

Formula: "${formula}"

Return EXACTLY ONE fenced JSON object matching this schema and NOTHING else (no prose before or after):
\`\`\`json
${SCHEMA}
\`\`\`

Rules:
- "left" and "right" are the two operands; "op" is the operator between them (e.g. revenue / spend → op "/").
- Pick the single best-guess metric/account for each operand; put other plausible matches in "alternatives.left" / "alternatives.right" (max 5 each, ranked).
- Set "confidence" (0..1) for the overall formula resolution.
- If the formula is too vague to identify two operands and an operator, set "clarify" to a single short narrowing question and omit a meaningful "config".
- "range" must be null (the block inherits the dashboard's time range).
- Use only metric fields and accounts your tools confirm exist. Do not invent identifiers.`
}
