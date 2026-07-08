# ARCHIVED — do not use

> **This document is historical.** It describes an architecture that no longer
> exists: a flat `lib/clients.config.ts` "database" (there is now **Neon Postgres +
> Drizzle**), `middleware.ts` route protection (now **`proxy.ts`**), **Next.js 15**
> (now 16), and **Supermetrics as the single data source** (it now backs only
> paid/social; GA4, GSC, HubSpot, Peec, and Profound use native APIs). It is kept
> only for git-history context and **must not be followed.**

## Read these instead (current)

1. [`/README.md`](../README.md) — quick start + Documentation Map
2. [`/ENGINEERS.md`](../ENGINEERS.md) — Reports-product onboarding
3. [`/CLAUDE.md`](../CLAUDE.md) — platform architecture reference
4. [`/lib/dashboard/ENGINEERS.md`](../lib/dashboard/ENGINEERS.md) — configurable dashboard

Superseded by the Postgres/Drizzle migration (PRs #8 / #13 / #14, May 2026). The
original content is preserved in git history: `git log --follow -p Guides/claude.md`.
