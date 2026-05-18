# PR Placements Module — Claude Code Spec

## Overview

Add a **PR Placements** module to the existing Next.js reporting dashboard. The module pulls media coverage data from the NewsAPI.ai (Event Registry) API, displays it per client, and provides charts, a placements table, and export functionality. Client queries are hardcoded in a config file — no user-facing search input.

---

## Deliverables

1. `lib/newsapi.ts` — API client and types
2. `config/clients.ts` — per-client query definitions (extends existing mock data pattern)
3. `app/api/pr-placements/route.ts` — server-side API route (keeps API key off client)
4. `components/pr/` — all UI components
5. `app/(dashboard)/clients/[clientId]/pr/page.tsx` — PR tab page

> Adapt file paths to match the existing project structure. If the project uses `pages/` router instead of `app/`, adjust accordingly.

---

## 1. Environment Variable

Add to `.env.local`:

```
NEWSAPI_AI_KEY=your_key_here
```

Get a key at https://newsapi.ai/register. Free plan includes 2,000 searches/month. Each fetch = 1 token.

---

## 2. Client Config — `config/clients.ts`

Extend (or create) the existing client config to include a `prConfig` block per client. Wire into whatever client list/mock data structure already exists in the project.

```typescript
export interface PRConfig {
  keywords: string[];           // OR'd together — any match returns the article
  excludeKeywords?: string[];   // terms to suppress (competitor names, noise)
  sourceLocationUri?: string[]; // e.g. ["http://en.wikipedia.org/wiki/United_States"]
  language?: string;            // ISO3 code, default "eng"
  dataTypes?: ('news' | 'pr' | 'blog')[]; // default: ['news', 'pr']
  lookbackDays?: number;        // default: 31 (max for 1 token; use 7 for tighter window)
}

export interface Client {
  id: string;
  name: string;
  // ... existing fields ...
  prConfig: PRConfig;
}

// Example — replace with real clients
export const clients: Client[] = [
  {
    id: 'acme-corp',
    name: 'Acme Corp',
    prConfig: {
      keywords: ['Acme Corp', 'AcmeCorp', 'acme.com'],
      excludeKeywords: ['Acme Anvil', 'Wile E'],
      sourceLocationUri: ['http://en.wikipedia.org/wiki/United_States'],
      language: 'eng',
      dataTypes: ['news', 'pr'],
      lookbackDays: 31,
    },
  },
  {
    id: 'globex',
    name: 'Globex',
    prConfig: {
      keywords: ['Globex', 'globex.com', '"Hank Scorpio"'],
      language: 'eng',
      dataTypes: ['news', 'pr', 'blog'],
      lookbackDays: 31,
    },
  },
];
```

**Keyword tips for Claude Code to note in comments:**
- Use `"exact phrase"` (with quotes inside the string) for multi-word brand names to reduce false positives
- Add domain names as keywords to catch product coverage that may not name the brand
- `excludeKeywords` is critical for common words — suppress aggressively

---

## 3. TypeScript Types — `lib/newsapi.ts`

### Types

```typescript
export type DataType = 'news' | 'pr' | 'blog';

export interface RawArticle {
  uri: string;
  title: string;
  url: string;
  date: string;       // "YYYY-MM-DD"
  time?: string;      // "HH:MM:SS"
  sentiment?: number; // -1.0 to +1.0, English only
  source: {
    uri: string;
    title: string;
    ranking?: {
      importanceRank?: number;      // 0–100 percentile; lower = more important
      alexaGlobalRank?: number;
      alexaCountryRank?: number;
    };
  };
  shares?: {
    facebook?: number;
    twitter?: number;
    linkedIn?: number;
  };
}

export interface Placement {
  uri: string;
  title: string;
  url: string;
  date: string;
  source: string;
  sourceDomain: string;
  tier: 1 | 2 | 3;
  importanceRank: number;   // raw percentile from API
  socialScore: number;      // sum of all shares
  shares: { facebook: number; twitter: number; linkedIn: number };
  sentiment: number | null;
  dataType: DataType;
}

export interface PRSummary {
  totalHits: number;
  tier1Count: number;
  tier2Count: number;
  tier3Count: number;
  totalSocialScore: number;
  avgSentiment: number | null;
  avgImportanceRank: number | null;
}
```

### Tier mapping

```typescript
// importanceRank is a percentile: 0 = most important sources
// Lower rank = higher-tier publication
export function getTier(importanceRank: number): 1 | 2 | 3 {
  if (importanceRank <= 30) return 1;
  if (importanceRank <= 70) return 2;
  return 3;
}
```

### Normalizer

```typescript
export function normalizeArticle(raw: RawArticle, dataType: DataType): Placement {
  const rank = raw.source?.ranking?.importanceRank ?? 99;
  const fb = raw.shares?.facebook ?? 0;
  const tw = raw.shares?.twitter ?? 0;
  const li = raw.shares?.linkedIn ?? 0;

  return {
    uri: raw.uri,
    title: raw.title,
    url: raw.url,
    date: raw.date,
    source: raw.source?.title ?? raw.source?.uri ?? 'Unknown',
    sourceDomain: raw.source?.uri ?? '',
    tier: getTier(rank),
    importanceRank: rank,
    socialScore: fb + tw + li,
    shares: { facebook: fb, twitter: tw, linkedIn: li },
    sentiment: typeof raw.sentiment === 'number' ? raw.sentiment : null,
    dataType,
  };
}
```

### Summary calculator

```typescript
export function calcSummary(placements: Placement[]): PRSummary {
  const withSentiment = placements.filter(p => p.sentiment !== null);
  const withRank = placements.filter(p => p.importanceRank < 99);

  return {
    totalHits: placements.length,
    tier1Count: placements.filter(p => p.tier === 1).length,
    tier2Count: placements.filter(p => p.tier === 2).length,
    tier3Count: placements.filter(p => p.tier === 3).length,
    totalSocialScore: placements.reduce((s, p) => s + p.socialScore, 0),
    avgSentiment: withSentiment.length
      ? withSentiment.reduce((s, p) => s + p.sentiment!, 0) / withSentiment.length
      : null,
    avgImportanceRank: withRank.length
      ? withRank.reduce((s, p) => s + p.importanceRank, 0) / withRank.length
      : null,
  };
}
```

---

## 4. API Route — `app/api/pr-placements/route.ts`

**Why server-side:** The NewsAPI.ai key must never be exposed in client bundles.

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { clients } from '@/config/clients';
import { normalizeArticle } from '@/lib/newsapi';

const NEWSAPI_BASE = 'https://eventregistry.org/api/v1';

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('clientId');
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 });

  const client = clients.find(c => c.id === clientId);
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

  const apiKey = process.env.NEWSAPI_AI_KEY;
  if (!apiKey) return NextResponse.json({ error: 'API key not configured' }, { status: 500 });

  const { prConfig } = client;
  const dataTypes = prConfig.dataTypes ?? ['news', 'pr'];

  const body = {
    action: 'getArticles',
    keyword: prConfig.keywords,
    keywordOper: 'or',
    ...(prConfig.excludeKeywords?.length && { ignoreKeyword: prConfig.excludeKeywords }),
    ...(prConfig.sourceLocationUri?.length && { sourceLocationUri: prConfig.sourceLocationUri }),
    ...(prConfig.language && { lang: prConfig.language }),
    articlesPage: 1,
    articlesCount: 100,
    articlesSortBy: 'date',
    articlesSortByAsc: false,
    articleBodyLen: 0,
    dataType: dataTypes,
    forceMaxDataTimeWindow: prConfig.lookbackDays === 7 ? 7 : 31,
    resultType: 'articles',
    // Request all fields needed for the dashboard
    includeArticleTitle: true,
    includeArticleUrl: true,
    includeArticleSource: true,
    includeArticleDate: true,
    includeArticleSocialScore: true,
    includeArticleSentiment: true,
    includeSourceTitle: true,
    includeSourceImportanceRank: true,
    includeSourceAlexaGlobalRank: true,
    ignoreSourceGroupUri: 'paywall/paywalled_sources', // skip paywalled sources
    apiKey,
  };

  try {
    const res = await fetch(`${NEWSAPI_BASE}/article/getArticles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      next: { revalidate: 3600 }, // cache for 1 hour — avoids burning tokens on every page load
    });

    if (!res.ok) throw new Error(`NewsAPI returned ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    const rawArticles = data.articles?.results ?? [];
    const placements = rawArticles.map((a: any) =>
      normalizeArticle(a, dataTypes.includes('pr') && a.isDuplicate ? 'pr' : 'news')
    );

    return NextResponse.json({
      placements,
      totalResults: data.articles?.totalResults ?? placements.length,
      clientId,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

**Caching note:** `next: { revalidate: 3600 }` caches the fetch for 1 hour per client. This prevents re-fetching (and burning tokens) on every navigation. Adjust to `revalidate: 0` to disable during development.

---

## 5. React Hook — `hooks/usePRPlacements.ts`

```typescript
import useSWR from 'swr';
import { Placement, PRSummary, calcSummary } from '@/lib/newsapi';

const fetcher = (url: string) => fetch(url).then(r => {
  if (!r.ok) throw new Error('Failed to fetch placements');
  return r.json();
});

export function usePRPlacements(clientId: string) {
  const { data, error, isLoading, mutate } = useSWR(
    clientId ? `/api/pr-placements?clientId=${clientId}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  const placements: Placement[] = data?.placements ?? [];
  const summary: PRSummary = calcSummary(placements);

  return {
    placements,
    summary,
    totalResults: data?.totalResults ?? 0,
    fetchedAt: data?.fetchedAt ?? null,
    isLoading,
    error,
    refresh: () => mutate(),
  };
}
```

Install SWR if not already present: `npm install swr`

---

## 6. Components — `components/pr/`

Build the following components. Match existing dashboard component patterns (class names, Tailwind usage, shadcn/ui components, etc.) already present in the project.

---

### `components/pr/PRStatCards.tsx`

Five stat cards in a responsive grid. Use the existing dashboard's stat card pattern if one exists.

| Card | Value | Notes |
|------|-------|-------|
| Total Hits | `summary.totalHits` | — |
| Tier 1 | `summary.tier1Count` | highlight in green |
| Est. Reach | `summary.totalSocialScore` | formatted: 12.4K, 1.2M |
| Avg Sentiment | `summary.avgSentiment` | 2 decimal places; green if > 0.1, red if < -0.1 |
| Avg Source Rank | `summary.avgImportanceRank` | display as `p{value}` e.g. `p24` |

---

### `components/pr/PRCoverageChart.tsx`

**Coverage over time** — bar chart showing article count per day.

- Use **Recharts** (likely already in project; if not: `npm install recharts`)
- X axis: dates (`MMM D` format)
- Y axis: article count
- Bar color: match dashboard primary accent
- Derive data by grouping `placements` by `placement.date`
- Show last 31 days; days with zero hits still appear on axis
- Tooltip: `{date}: {n} articles`

```typescript
// Data shape to derive:
interface DayCount { date: string; count: number; }

function buildTimelineData(placements: Placement[], days = 31): DayCount[] {
  const counts: Record<string, number> = {};
  // Initialize all days to 0
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    counts[d.toISOString().split('T')[0]] = 0;
  }
  placements.forEach(p => {
    if (counts[p.date] !== undefined) counts[p.date]++;
  });
  return Object.entries(counts).map(([date, count]) => ({ date, count }));
}
```

---

### `components/pr/PRTierChart.tsx`

**Tier breakdown** — donut or horizontal bar chart.

- Show Tier 1 / Tier 2 / Tier 3 counts and percentages
- Colors: Tier 1 = green, Tier 2 = blue, Tier 3 = amber (match dashboard palette)
- Include a simple legend with count + percentage per tier
- Use Recharts `PieChart` with `innerRadius` for donut, or `BarChart` horizontal — match whichever style fits existing charts

---

### `components/pr/PRSentimentChart.tsx`

**Sentiment distribution** — histogram bucketed into ranges.

- Buckets: Very Negative (< -0.5), Negative (-0.5 to -0.1), Neutral (-0.1 to 0.1), Positive (0.1 to 0.5), Very Positive (> 0.5)
- Only include articles where `sentiment !== null` (sentiment is English-only in the API)
- Show count of null-sentiment articles as a note below chart: `"Sentiment unavailable for {n} non-English articles"`
- Bar colors: red shades for negative, gray for neutral, green shades for positive

```typescript
// Bucket labels and thresholds
const SENTIMENT_BUCKETS = [
  { label: 'Very Negative', min: -1,   max: -0.5, color: '#991b1b' },
  { label: 'Negative',      min: -0.5, max: -0.1, color: '#ef4444' },
  { label: 'Neutral',       min: -0.1, max:  0.1, color: '#9ca3af' },
  { label: 'Positive',      min:  0.1, max:  0.5, color: '#22c55e' },
  { label: 'Very Positive', min:  0.5, max:  1.0, color: '#15803d' },
];
```

---

### `components/pr/PRPlacementsTable.tsx`

Sortable, filterable table of all placements. Use the project's existing table component/pattern if available (e.g. TanStack Table, shadcn/ui Table).

**Columns:**

| Column | Field | Notes |
|--------|-------|-------|
| Date | `placement.date` | `MMM D, YYYY` format |
| Headline | `placement.title` | link to `placement.url`, opens in new tab |
| Outlet | `placement.source` | subdomain below headline in muted text |
| Tier | `placement.tier` | colored badge: Tier 1 (green), Tier 2 (blue), Tier 3 (amber) |
| Source Rank | `placement.importanceRank` | display as `p{n}`; lower = better |
| Social Reach | `placement.socialScore` | formatted number |
| Sentiment | `placement.sentiment` | colored pill; null → `—` |
| Type | `placement.dataType` | small badge: `news` / `pr` / `blog` |

**Table features:**
- Client-side text filter (searches title + source)
- Column sort on all columns
- Pagination: 25 rows per page
- Show total result count above table: `{filtered} of {total} placements`

---

### `components/pr/PRExportButtons.tsx`

Two buttons: **Export CSV** and **Export JSON**. Both export the currently filtered/sorted placement list (not just the current page — all matching records).

**CSV columns (in order):**
`Date, Headline, Outlet, URL, Tier, Source Rank, Social Reach, Sentiment, FB Shares, Twitter Shares, LinkedIn Shares, Type`

**Filename pattern:** `{clientName}_pr_placements_{YYYY-MM-DD}.csv`

Both exports are client-side (no server round-trip). Use `URL.createObjectURL(blob)` pattern.

---

### `components/pr/PRPDFReport.tsx`

A **"Download PDF Report"** button that generates a single-client PR summary PDF. Use `@react-pdf/renderer` (`npm install @react-pdf/renderer`).

**PDF contents (one page per section):**

1. **Cover page** — client name, report title "PR Coverage Report", date range, generated date
2. **Summary page** — the 5 stat cards as a simple table, lookback period
3. **Top Placements** — top 20 by social reach, as a table: Date | Headline (truncated 80 chars) | Outlet | Tier | Social Reach | Sentiment
4. **Tier Breakdown** — text summary: "X Tier 1 placements (Y%), Z Tier 2..."
5. **Sentiment Summary** — bucket counts as a table

Keep the PDF simple and readable — no charts (canvas-to-image is unreliable in react-pdf). Style to match dashboard brand colors where possible using react-pdf's StyleSheet.

---

## 7. Page — `app/(dashboard)/clients/[clientId]/pr/page.tsx`

```typescript
'use client';

import { usePRPlacements } from '@/hooks/usePRPlacements';
import { clients } from '@/config/clients';
import PRStatCards from '@/components/pr/PRStatCards';
import PRCoverageChart from '@/components/pr/PRCoverageChart';
import PRTierChart from '@/components/pr/PRTierChart';
import PRSentimentChart from '@/components/pr/PRSentimentChart';
import PRPlacementsTable from '@/components/pr/PRPlacementsTable';
import PRExportButtons from '@/components/pr/PRExportButtons';
import PRPDFReport from '@/components/pr/PRPDFReport';

export default function PRPage({ params }: { params: { clientId: string } }) {
  const client = clients.find(c => c.id === params.clientId);
  const { placements, summary, totalResults, fetchedAt, isLoading, error, refresh } =
    usePRPlacements(params.clientId);

  if (!client) return <div>Client not found</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">PR Placements</h2>
          <p className="text-sm text-muted-foreground">
            Last {client.prConfig.lookbackDays ?? 31} days ·{' '}
            {fetchedAt ? `updated ${new Date(fetchedAt).toLocaleTimeString()}` : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <PRExportButtons placements={placements} clientName={client.name} />
          <PRPDFReport placements={placements} summary={summary} client={client} />
          <button onClick={refresh} className="...">Refresh</button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error.message}
        </div>
      )}

      {/* Stats */}
      <PRStatCards summary={summary} isLoading={isLoading} />

      {/* Charts — 3 column grid on large screens */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <PRCoverageChart placements={placements} isLoading={isLoading} />
        </div>
        <PRTierChart summary={summary} isLoading={isLoading} />
      </div>
      <PRSentimentChart placements={placements} isLoading={isLoading} />

      {/* Table */}
      <PRPlacementsTable
        placements={placements}
        totalResults={totalResults}
        isLoading={isLoading}
      />
    </div>
  );
}
```

---

## 8. Navigation

Add a **PR** tab/link to the existing client detail navigation. Exact implementation depends on how the existing nav is structured — add a route entry pointing to `/clients/[clientId]/pr`.

---

## 9. Token Budget Awareness

The free NewsAPI.ai plan includes **2,000 tokens/month**.

- Each `getArticles` call on recent data (last 31 days) = **1 token**
- The API route uses `next: { revalidate: 3600 }` — 1 fetch per client per hour max
- With 10 clients, worst case = 10 tokens/hour = 7,200/month — **exceeds free tier**
- **Recommendation for Claude Code:** add a note in `config/clients.ts` about token consumption, and consider increasing `revalidate` to `86400` (24h) for production to stay within budget

For paid plans: 5K tokens = $90/month, 10K = $150/month (see https://newsapi.ai/plans).

---

## 10. Dependencies Summary

| Package | Purpose | Install |
|---------|---------|---------|
| `swr` | data fetching + caching hook | `npm install swr` |
| `recharts` | charts (may already exist) | `npm install recharts` |
| `@react-pdf/renderer` | PDF export | `npm install @react-pdf/renderer` |

---

## 11. Key Constraints for Claude Code

- **Never expose `NEWSAPI_AI_KEY` in client-side code** — all API calls must go through the Next.js API route
- **Do not add a keyword search input** — queries are hardcoded per client in `config/clients.ts`
- **Match existing patterns** — before creating new components, check if the project already has a table component, stat card, chart wrapper, or loading skeleton to reuse
- **Sentiment is English-only** — the API only returns sentiment scores for English articles; always handle `null` sentiment gracefully
- **`importanceRank` is a percentile, lower = better** — Tier 1 is rank ≤ 30, NOT rank ≥ 70
- **`forceMaxDataTimeWindow` only accepts `7` or `31`** — do not pass other values
- **100 articles max per call** — the API returns up to 100 per request; `totalResults` may be higher but pagination is not implemented in v1 (can be added later)