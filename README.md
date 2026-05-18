# Avenue Z Reporting Platform

White-labeled, multi-client marketing reporting platform built on the **Supermetrics API**. Supermetrics handles all data sourcing, OAuth connections, and workspace permissions — this app is a presentation and routing layer on top of those APIs.

## Tech Stack

- **Next.js 15** (App Router, React Server Components)
- **TypeScript** (strict mode)
- **Auth.js v5** (Google + Credentials providers)
- **Tailwind CSS v4** + **shadcn/ui** + **Tremor**
- **Supermetrics API** (server-side only)
- **Vercel** (deployment)

## Getting Started

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local

# Run dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment Variables

```env
AUTH_SECRET=                          # openssl rand -base64 32
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
NEXT_PUBLIC_APP_URL=
APP_URL=
SUPERMETRICS_API_KEY_FUN_SPOT=       # One per client
```

## Architecture

### Two Audiences

- **Internal (Avenue Z team)** — `/dashboard` — full access to all clients and reports
- **Clients** — `/portal/[clientSlug]` — scoped view of their own data only

### Client Configuration

Clients are defined in `lib/clients.config.ts` — no database required. Each entry specifies the client slug, Supermetrics workspace ID, enabled report sections, and authorized users with roles.

To onboard a new client: add an entry to `clients.config.ts`, set their API key in environment variables, redeploy.

### Roles

| Role | Access |
|------|--------|
| `INTERNAL_ADMIN` | All clients, all reports, auth hub |
| `INTERNAL_ANALYST` | All clients, all reports (read-only) |
| `CLIENT_ADMIN` | Own client: auth hub + enabled reports |
| `CLIENT_VIEWER` | Own client: enabled reports (read-only) |

### Report Sections

Reports are tabbed per-client, controlled via `?section=` URL params. Each section is a self-contained React Server Component in `components/report-sections/`.

| Slug | Section |
|------|---------|
| `exec-summary` | Executive Summary |
| `ga4` | Web Analytics (GA4) |
| `meta-ads` | Meta Ads |
| `google-ads` | Google Ads |
| `email-marketing` | Email Marketing |
| `blended-performance` | Blended Performance |
| `linkedin-ads` | LinkedIn Ads |
| `tiktok-ads` | TikTok Ads |
| `snapchat-ads` | Snapchat Ads |
| `reddit-ads` | Reddit Ads |
| `bing-ads` | Microsoft Ads |
| `shopify-performance` | Shopify Performance |
| `hubspot-performance` | HubSpot Performance |

### Key Directories

```
app/
  login/                     # Auth.js sign-in
  dashboard/                 # Internal Avenue Z view
    [clientSlug]/reports/    # Tabbed report page
  portal/                    # Client-facing view
    [clientSlug]/reports/    # Tabbed report page
  api/auth/                  # Auth.js + Supermetrics callback

components/
  report-sections/           # One component per report section
  layout/                    # Sidebar, header, logo

lib/
  clients.config.ts          # Client registry
  constants.ts               # Chart colors, report names
  supermetrics/              # API client, auth helpers, types
```

## Development

```bash
npm run dev       # Start dev server
npm run build     # Production build
npm run lint      # ESLint
```

## Deployment

Deploy to Vercel. Set all environment variables in Vercel project settings. The `.env.local` file is gitignored.
