# GLEAN_MEETING_PREP.md
## Feature: "Prepare for Meeting" — Glean Knowledge Integration
### Avenue Z Internal Dashboard · Claude Code Context Document

---

## 1. Feature Overview

Add a **"Prepare for Meeting"** tab/section to each client's internal portal page in the Avenue Z reporting dashboard. When an Avenue Z team member opens a client's internal page, they can trigger a Glean-powered brief that:

- Searches Glean for the past 7 days of communication and activity related to that client (Slack threads, Gmail, Google Meet notes, shared docs, etc.)
- Synthesizes results into a structured **meeting prep brief** using Glean's Chat API
- Displays the brief in a readable, scannable format matching the dashboard's existing dark-first design system

The result should feel like a smart briefing assistant, not a raw search dump.

---

## 2. Existing Platform Context

### Stack
- **Framework:** Next.js 15 (App Router)
- **Auth:** Auth.js v5
- **UI:** shadcn/ui + Tremor + Tailwind CSS v4
- **Deployment:** Vercel Pro
- **Client registry:** `clients.config.ts` (flat file, no database — source of truth for all client metadata)
- **Design:** Dark-first. Five Avenue Z accent colors. Nunito Sans typography. Gradient system defined in `BRAND.md`.

### Relevant Existing Patterns
- Internal portal pages live at a route like `/internal/[clientSlug]` or similar — confirm the exact route in the codebase before creating files
- The `clients.config.ts` registry includes `clientSlug`, display name, and related metadata per client
- API routes follow the pattern `app/api/[feature]/route.ts`
- Server components fetch data; client components handle interactivity
- Environment variables are stored in `.env.local` (local) and Vercel environment variables (production)

---

## 3. Architecture Decision

### Recommended Approach: Server-Side API Route + Client Component

**Why not call Glean directly from the browser?**
The Glean API token must never be exposed to the client. All Glean calls go through a Next.js API route that acts as a secure proxy.

**Why not a Server Component with direct fetch?**
The brief generation can take 5–15 seconds (Glean is doing LLM + search). A streaming API route + client-side progressive rendering gives a better UX than a blocking server render.

### Data Flow

```
Client Page Component
  └─ User clicks "Generate Meeting Brief"
       └─ POST /api/glean/meeting-brief  { clientSlug, clientName }
            └─ Server: Build Glean chat prompt with date range
            └─ Server: Call Glean Chat API (streaming SSE)
            └─ Stream chunks back to browser
  └─ Client renders streamed markdown progressively
```

---

## 4. Files to Create

### 4.1 Environment Variables

Add to `.env.local` and Vercel dashboard (Production + Preview):

```bash
# Glean API Configuration
GLEAN_API_TOKEN=your_glean_token_here
GLEAN_INSTANCE=avenuez          # Your Glean instance name (e.g., "avenuez" → avenuez-be.glean.com)
```

> **How to find your instance name:** Log into Glean → Settings → the subdomain before `-be.glean.com` is your instance.
> **Where to get the token:** Glean Admin Console → Workspace Settings → API Tokens → Create token with `CHAT` and `SEARCH` scopes.

---

### 4.2 Glean API Utility  
**File:** `lib/glean.ts`

Create a typed utility module for Glean API calls.

```typescript
// lib/glean.ts
// Glean Client API utility — server-side only, never import in client components

const GLEAN_INSTANCE = process.env.GLEAN_INSTANCE!;
const GLEAN_API_TOKEN = process.env.GLEAN_API_TOKEN!;

export const GLEAN_BASE_URL = `https://${GLEAN_INSTANCE}-be.glean.com/rest/api/v1`;

export interface GleanChatMessage {
  author: 'USER' | 'GLEAN_AI';
  fragments: Array<{
    text?: string;
    citation?: {
      sourceDocument?: {
        title?: string;
        url?: string;
        snippet?: string;
      };
    };
  }>;
}

export interface GleanChatResponse {
  messages: GleanChatMessage[];
  chatId?: string;
  followUpPrompts?: string[];
}

export function getGleanHeaders(): HeadersInit {
  return {
    'Authorization': `Bearer ${GLEAN_API_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Returns today's date and 7 days ago in ISO format for prompt construction
 */
export function getLast7DaysRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 7);
  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  };
}

/**
 * Build the meeting prep prompt for a given client
 */
export function buildMeetingPrepPrompt(clientName: string, dateRange: { from: string; to: string }): string {
  return `You are preparing a client meeting brief for Avenue Z, a digital marketing and analytics agency. 

Search for all communication, activity, documents, Slack messages, emails, and notes related to our client "${clientName}" from ${dateRange.from} to ${dateRange.to} (the past 7 days).

Produce a structured meeting preparation brief with the following sections:

## 📋 Meeting Prep Brief: ${clientName}
**Period Covered:** ${dateRange.from} → ${dateRange.to}

### 🔑 Key Topics to Discuss
List 3–5 action items or topics that emerged from recent communication that should be addressed in the meeting.

### 📣 Recent Highlights
Summarize the most significant things that happened with this client in the past week — deliverables completed, campaigns launched, issues surfaced, decisions made.

### ⚠️ Open Items / Risks
Any unresolved questions, blockers, or concerns that need follow-up.

### 📊 Campaigns & Deliverables in Flight
What is actively running or being built for this client right now?

### 💬 Conversation Threads Worth Noting
Key Slack or email threads that contain important context for the meeting.

### 🧭 Suggested Talking Points
3–5 suggested talking points or questions to bring to the client meeting based on what you found.

Be concise and specific. If you cannot find information about this client, say so clearly and suggest what search terms or channels to check manually.`;
}
```

---

### 4.3 API Route — Meeting Brief  
**File:** `app/api/glean/meeting-brief/route.ts`

This is the secure server-side proxy. It calls Glean and streams the response back.

```typescript
// app/api/glean/meeting-brief/route.ts
import { NextRequest } from 'next/server';
import { auth } from '@/auth'; // Auth.js v5 — adjust import path if needed
import {
  GLEAN_BASE_URL,
  getGleanHeaders,
  getLast7DaysRange,
  buildMeetingPrepPrompt,
} from '@/lib/glean';

export const runtime = 'nodejs'; // Glean SSE streaming needs Node.js runtime

export async function POST(request: NextRequest) {
  // Auth guard — internal only
  const session = await auth();
  if (!session?.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const body = await request.json();
  const { clientName, clientSlug } = body;

  if (!clientName || !clientSlug) {
    return new Response('clientName and clientSlug are required', { status: 400 });
  }

  const dateRange = getLast7DaysRange();
  const prompt = buildMeetingPrepPrompt(clientName, dateRange);

  // Call Glean Chat API
  const gleanResponse = await fetch(`${GLEAN_BASE_URL}/chat`, {
    method: 'POST',
    headers: getGleanHeaders(),
    body: JSON.stringify({
      messages: [
        {
          author: 'USER',
          fragments: [{ text: prompt }],
        },
      ],
      // Optional: saveChat: false to avoid cluttering Glean history with automated calls
      saveChat: false,
    }),
  });

  if (!gleanResponse.ok) {
    const error = await gleanResponse.text();
    console.error('[Glean API Error]', gleanResponse.status, error);
    return new Response(`Glean API error: ${gleanResponse.status}`, {
      status: gleanResponse.status,
    });
  }

  const data = await gleanResponse.json() as {
    messages: Array<{
      author: string;
      fragments: Array<{ text?: string; citation?: { sourceDocument?: { title?: string; url?: string } } }>;
    }>;
  };

  // Extract the AI response text and citations
  const aiMessage = data.messages?.find((m) => m.author === 'GLEAN_AI');
  if (!aiMessage) {
    return new Response('No response from Glean', { status: 502 });
  }

  // Assemble markdown from fragments (text + inline citations)
  let brief = '';
  const sources: Array<{ title: string; url: string }> = [];

  for (const fragment of aiMessage.fragments) {
    if (fragment.text) {
      brief += fragment.text;
    }
    if (fragment.citation?.sourceDocument) {
      const src = fragment.citation.sourceDocument;
      if (src.title && src.url) {
        sources.push({ title: src.title, url: src.url });
      }
    }
  }

  // Append sources section if we have citations
  if (sources.length > 0) {
    brief += '\n\n---\n\n### 📎 Sources\n';
    sources.forEach((s, i) => {
      brief += `${i + 1}. [${s.title}](${s.url})\n`;
    });
  }

  // Return as JSON — client will render the markdown
  return Response.json({
    brief,
    generatedAt: new Date().toISOString(),
    clientName,
    dateRange,
  });
}
```

---

### 4.4 Meeting Brief UI Component  
**File:** `components/internal/MeetingPrepBrief.tsx`

Client component that handles the trigger button, loading state, and rendered output.

```typescript
// components/internal/MeetingPrepBrief.tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Sparkles, RefreshCw, AlertTriangle } from 'lucide-react';

// Install if not already present: npm install react-markdown
// This renders the markdown brief from Glean properly
import ReactMarkdown from 'react-markdown';

interface MeetingPrepBriefProps {
  clientName: string;
  clientSlug: string;
}

interface BriefData {
  brief: string;
  generatedAt: string;
  clientName: string;
  dateRange: { from: string; to: string };
}

export function MeetingPrepBrief({ clientName, clientSlug }: MeetingPrepBriefProps) {
  const [briefData, setBriefData] = useState<BriefData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generateBrief() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/glean/meeting-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientName, clientSlug }),
      });

      if (!res.ok) {
        throw new Error(`Failed to generate brief (${res.status})`);
      }

      const data: BriefData = await res.json();
      setBriefData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  const formattedDate = briefData
    ? new Date(briefData.generatedAt).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div>
            <CardTitle className="text-base font-semibold">Meeting Prep Brief</CardTitle>
            {formattedDate && (
              <p className="text-xs text-muted-foreground mt-0.5">Generated {formattedDate}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {briefData && (
            <Badge variant="outline" className="text-xs font-normal">
              Last 7 days
            </Badge>
          )}
          <Button
            onClick={generateBrief}
            disabled={loading}
            size="sm"
            variant={briefData ? 'outline' : 'default'}
            className="gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Generating...
              </>
            ) : briefData ? (
              <>
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                Generate Brief
              </>
            )}
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {/* Initial state — not yet generated */}
        {!briefData && !loading && !error && (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted/50">
              <Sparkles className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">Prepare for your {clientName} meeting</p>
            <p className="mt-1 text-xs text-muted-foreground max-w-xs">
              Pulls the last 7 days of Slack, email, docs, and activity from Glean and synthesizes a meeting brief.
            </p>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Loader2 className="mb-3 h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-medium">Searching Glean for {clientName} activity...</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Scanning Slack, Gmail, Docs, and Meet from the past 7 days
            </p>
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive shrink-0" />
              <div>
                <p className="text-sm font-medium text-destructive">Failed to generate brief</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{error}</p>
              </div>
            </div>
            <Button onClick={generateBrief} size="sm" variant="outline" className="mt-3 gap-2">
              <RefreshCw className="h-3.5 w-3.5" />
              Retry
            </Button>
          </div>
        )}

        {/* Brief content */}
        {briefData && !loading && (
          <div className="prose prose-sm prose-invert max-w-none">
            {/* 
              prose-invert works with Tailwind Typography plugin for dark themes.
              If not installed: npm install @tailwindcss/typography
              Add to tailwind.config: plugins: [require('@tailwindcss/typography')]
            */}
            <ReactMarkdown
              components={{
                h2: ({ children }) => (
                  <h2 className="text-base font-semibold text-foreground mt-6 mb-2 first:mt-0">{children}</h2>
                ),
                h3: ({ children }) => (
                  <h3 className="text-sm font-semibold text-foreground/90 mt-4 mb-1.5">{children}</h3>
                ),
                p: ({ children }) => (
                  <p className="text-sm text-muted-foreground mb-2 leading-relaxed">{children}</p>
                ),
                ul: ({ children }) => (
                  <ul className="text-sm text-muted-foreground space-y-1 mb-3 list-disc list-inside">{children}</ul>
                ),
                li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                a: ({ href, children }) => (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    {children}
                  </a>
                ),
                hr: () => <hr className="border-border/50 my-4" />,
                strong: ({ children }) => (
                  <strong className="font-semibold text-foreground">{children}</strong>
                ),
              }}
            >
              {briefData.brief}
            </ReactMarkdown>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

---

### 4.5 Integration into the Client Internal Page

**Where to add it:** Find the existing internal client page component — likely at a path such as:
- `app/(internal)/clients/[slug]/page.tsx`
- `app/internal/[slug]/page.tsx`
- Or wherever the internal portal currently renders per-client

**What to do:**

1. Import and add the `<MeetingPrepBrief>` component near the top of the client internal page, above or alongside existing sections.
2. Pass `clientName` and `clientSlug` from the client config.

```typescript
// Example integration snippet — adapt to actual file path and props shape
import { MeetingPrepBrief } from '@/components/internal/MeetingPrepBrief';
import { getClientConfig } from '@/lib/clients.config'; // adjust import

// Inside the page component or a section of it:
const client = getClientConfig(slug); // however you currently look up client config

// In JSX:
<MeetingPrepBrief 
  clientName={client.displayName}  // e.g. "Fun Spot"
  clientSlug={client.slug}          // e.g. "fun-spot"
/>
```

---

## 5. Dependencies to Install

Run this in the project root:

```bash
npm install react-markdown
```

If Tailwind Typography is not already installed (needed for `prose` classes in the brief):

```bash
npm install @tailwindcss/typography
```

Then add to `tailwind.config.ts` (or `tailwind.config.js`):

```typescript
// tailwind.config.ts
export default {
  // ... existing config
  plugins: [
    require('@tailwindcss/typography'),
    // ... other plugins
  ],
};
```

> **Check first:** Run `grep -r "typography" package.json tailwind.config*` to see if it's already installed.

---

## 6. Glean Authentication Setup (One-Time)

### Getting Your API Token

1. Open Glean → click your avatar → **Admin settings** (you need admin or workspace manager role)
2. Navigate to **Workspace settings → Tokens**
3. Click **Create token**
4. Set:
   - Name: `avenue-z-dashboard-meeting-prep`
   - Type: **User-scoped** (so it searches as your user and respects permissions)
   - Scopes: `CHAT`, `SEARCH`
   - Expiration: Set to a reasonable period (90 days, then rotate)
5. Copy the token — you only see it once

### Finding Your Instance Name

Your Glean URL when logged in looks like: `https://avenuez.glean.com`
The instance name is `avenuez`. The API base URL is then: `https://avenuez-be.glean.com/rest/api/v1`

### Important Note on Token Type

- **User-scoped token:** The brief will search Glean as the token owner (you). Results will reflect only what that user has access to in Glean. Good for a personal dev/staging setup.
- **Global token with `X-Glean-ActAs` header:** The brief searches as the logged-in user. Best for production — each Avenue Z team member gets results based on their own Glean access. Requires Glean admin to generate a global token.

For production, if you want per-user search context, update `getGleanHeaders()` in `lib/glean.ts` to:

```typescript
export function getGleanHeaders(actAsEmail?: string): HeadersInit {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${process.env.GLEAN_API_TOKEN!}`,
    'Content-Type': 'application/json',
  };
  if (actAsEmail) {
    headers['X-Glean-Auth-Type'] = 'GLOBAL';
    headers['X-Glean-ActAs'] = actAsEmail;
  }
  return headers;
}
```

And in the API route, pass the session user's email:

```typescript
const session = await auth();
const actAsEmail = session?.user?.email ?? undefined;
// ...
headers: getGleanHeaders(actAsEmail),
```

---

## 7. Future Enhancements (Phase 2 Ideas)

Once the core brief is working, consider these extensions:

### 7.1 Dedicated Glean Agent
Instead of the generic Chat API, build a named Glean Agent in the Glean Agent Builder specifically tuned for meeting prep. Then call it via:

```
POST /rest/api/v1/agents/runs/stream  { agent_id: "your-meeting-prep-agent-id" }
```

This gives you a reusable, prompt-engineered agent that Avenue Z can maintain in Glean's own UI without touching the dashboard code.

### 7.2 Per-Client Glean Search Scope
Add client-specific search terms to `clients.config.ts`:

```typescript
// clients.config.ts — extend the client type
export interface ClientConfig {
  slug: string;
  displayName: string;
  gleanSearchTerms?: string[]; // e.g. ["Fun Spot", "funspot", "#fun-spot-slack-channel"]
}
```

Then build a more targeted search prompt using those terms.

### 7.3 Caching / TTL
Cache the generated brief in-memory or in Vercel KV for 30–60 minutes so multiple team members loading the same client page don't re-trigger Glean on every load.

```typescript
// Vercel KV (if added): cache key = `meeting-brief:${clientSlug}:${dateRange.from}`
```

### 7.4 Streaming Response
For faster perceived performance, convert the API route to use a `ReadableStream` and return SSE chunks, then stream-render in the UI using a `useEffect` + `EventSource` or the Vercel AI SDK's `useCompletion` hook.

---

## 8. Testing Checklist

Before deploying:

- [ ] `GLEAN_API_TOKEN` and `GLEAN_INSTANCE` are set in `.env.local`
- [ ] Verify the Glean token works: `curl -X POST https://<instance>-be.glean.com/rest/api/v1/chat -H 'Authorization: Bearer <token>' -H 'Content-Type: application/json' -d '{"messages":[{"author":"USER","fragments":[{"text":"test"}]}]}'` → should return 200
- [ ] `npm install react-markdown` completed
- [ ] `MeetingPrepBrief` component renders without errors on the client internal page
- [ ] "Generate Brief" button fires, shows loading state, and returns a brief
- [ ] Auth guard on `/api/glean/meeting-brief` returns 401 for unauthenticated requests
- [ ] Test with at least 2 clients to confirm `clientName` is correctly passed into the Glean prompt
- [ ] Add `GLEAN_API_TOKEN` and `GLEAN_INSTANCE` to Vercel environment variables (Production + Preview)
- [ ] Deploy to Vercel and smoke test

---

## 9. Security Notes

- `GLEAN_API_TOKEN` is **server-only** — it must never appear in any `'use client'` component or be passed to the browser
- The API route at `/api/glean/meeting-brief` is protected by `auth()` — only authenticated Avenue Z staff can trigger it
- Glean's own permission layer applies: the API will only surface content the token owner (or `X-Glean-ActAs` user) has access to in Glean, so sensitive client data won't leak across accounts
- Rate limits: Glean's Chat API is subject to rate limiting — don't auto-trigger on page load, always make it a manual user action

---

*Generated for Avenue Z internal use · Glean Client API v1 · Next.js 15 App Router*