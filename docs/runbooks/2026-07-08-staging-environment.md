# Runbook — Stable Staging Environment for Stakeholder Testing (Vercel Pro)

**Date:** 2026-07-08
**Purpose:** Give non-technical stakeholders (Avenue Z leadership, service owners, Ren
team) a **stable URL** where they can test unreleased work — logging in with real
`@avenuez.com` SSO or a client credential — **without merging to `main`** and **without
needing a Vercel account.**

## Why a stable branch (not a per-commit preview)

Google/SSO sign-in only works on hosts pre-registered as **Authorized redirect URIs** in
the Google OAuth client. Vercel's per-commit preview URLs change every push and can't be
pre-registered, so `@avenuez` login fails on them. A **long-lived `staging` branch** with
a **stable URL** can be registered once — that is the fix.

## Context / fixed values (as of 2026-07-08)

- Repo: `Avenue-Z/avenue-z-reporting-v2` · Vercel team slug: `avenue-z-technology`
- Branch flow: `feature → dev → main`. `staging` is a NEW long-lived branch off `dev`;
  you merge feature branches into it to stage them. It is never deleted (URL stays stable).
- Dev/staging Neon DB endpoint: `ep-still-tree-aqs8ui6d` (db `neondb`) — already has
  migration `0017` (report_commentary) and the renaissance commentary opt-in applied.
- OAuth callback path (Auth.js v5): `/api/auth/callback/google`
- Client QA login (on the dev DB, so it works on staging too):
  `qa-client@renaissance.test` / `RenClientQA-2026` (CLIENT_VIEWER, renaissance).

Ownership tags below: **[eng]** = git (done in-repo) · **[you]** = Vercel / Google Cloud /
DNS dashboards.

---

## Phase 1 — `staging` branch  **[eng — done]**

`staging` was created off the `feat/report-commentary` tip (which is `dev` + the commentary
feature) and pushed. Ongoing: to stage new work, `git checkout staging && git merge <feature>
&& git push` — the staging URL auto-updates. Never delete `staging`.

## Phase 2 — Staging environment in Vercel  **[you]**

Vercel → project → **Settings → Environments → Create Environment** → name **Staging**:

- **Git branch:** track `staging` (every push deploys here).
- **Domain** (pick one):
  - **Custom subdomain (recommended):** `staging.reports.avenuez.com`. In **Settings →
    Domains**, add it and assign to the Staging env / `staging` branch. DNS: add the CNAME
    Vercel shows (typically `cname.vercel-dns.com`) on `staging.reports`.
  - **No-DNS option:** use the auto branch alias
    `avenue-z-reporting-v2-git-staging-avenue-z-technology.vercel.app` (stable; always the
    latest `staging` deploy).

A Custom Environment gets its **own env vars and its own Deployment Protection**, separate
from Production and from throwaway feature previews — which is exactly what staging needs.

## Phase 3 — Env vars (Staging scope)  **[you]**

Set everything the app needs to render + authenticate, scoped to Staging:

- **DB:** `DATABASE_URL`, `DATABASE_URL_UNPOOLED` → the dev/staging Neon DB
  (`ep-still-tree-aqs8ui6d`). *(Cleaner isolation: a dedicated Neon "staging" branch — then
  re-run `0017` + the opt-in SQL there. See Phase 6.)*
- **Auth:** `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, and
  `NEXT_PUBLIC_APP_URL` / `APP_URL` = the exact staging URL (must match the host Auth.js
  sees, and the Google redirect URI in Phase 4).
- **Feature flags/secrets:** `COMMENTARY_APPROVERS=<approver emails>` plus the data-source
  secrets the report sections need (`GOOGLE_SERVICE_ACCOUNT_KEY`, HubSpot/Supermetrics/Peec/
  Profound keys, etc.) — copy the values from Production so sections actually render.

## Phase 4 — Register the staging host with Google OAuth (the SSO unblock)  **[you]**

Google Cloud Console → **APIs & Services → Credentials → the OAuth 2.0 Client**:

- **Authorized redirect URIs:** add `https://<staging-url>/api/auth/callback/google`
- **Authorized JavaScript origins:** add `https://<staging-url>`

The host must **exactly** match `NEXT_PUBLIC_APP_URL`/`APP_URL`. After this, `@avenuez`
Google/SSO login works on staging. (Per-commit previews never can — only this stable host.)

## Phase 5 — Access for non-Vercel-account stakeholders  **[you]**

Staging env → **Deployment Protection** → one of:
- **Password Protection** — share URL + one password (best for a group).
- **Shareable Links** — per-person, revocable (best for a few named people).
- **Disable Vercel Authentication** for Staging — URL reachable; the app's own `/login` is
  still the gate.

## Phase 6 — Seed what stakeholders need to see  **[mostly done]**

- **Client view login** already exists on the dev DB (`qa-client@renaissance.test` /
  `RenClientQA-2026`); staging uses that DB, so it works there.
- **Approve a commentary entry** (as an `@avenuez` user) so the client view isn't blank —
  clients see approved-only.
- *(If you chose a dedicated Neon staging branch in Phase 3, re-run there:* migration `0017`
  *(see `docs/superpowers/…` / `drizzle/0017_public_famine.sql`), the renaissance opt-in
  SQL, and the client-login SQL.)*

## Phase 7 — Verify + hand off  **[you]**

On the staging URL: (a) `@avenuez` Google login → staff view (editor + approve);
(b) client credential → client view (approved-only, read-only); (c) approve an entry →
shows in the portal and in the browser PDF export (`window.print()`). Then send stakeholders
the stable URL + password/instructions.

## Ongoing use

- Stage new work: `git checkout staging && git merge <feature-branch> && git push`.
- Keep `staging` permanent so its URL + registered OAuth host stay valid.
- `main` / Production are never touched by this flow.

## Teardown / caveats

- Staging shares the **dev DB**, so QA data (test commentary, the `qa-client` user, the
  test shared password on renaissance) lives there. Clean up when done:
  `delete from report_commentary where …;` `delete from users where email='qa-client@renaissance.test';`
  `update clients set shared_password_hash = null where slug='renaissance';` (only if it was null before).
- Rotate/remove the shareable link or password when a review round ends.
