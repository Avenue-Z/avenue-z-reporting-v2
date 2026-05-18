# GWS OAuth Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow any `@avenuez.com` Google Workspace user to sign in to the reporting platform and be auto-provisioned as `INTERNAL_ANALYST`, while preserving existing credentials login and hardcoded role overrides in `clients.config.ts`.

**Architecture:** Three changes confined to `auth.ts`: (1) configure NextAuth's Google provider with `hd=avenuez.com` to scope the account picker, (2) add a `signIn` callback that rejects non-`@avenuez.com` Google sign-ins server-side, and (3) extend the `jwt` callback to auto-provision unlisted `@avenuez.com` emails as `INTERNAL_ANALYST` / `clientSlug: 'avenue-z'`. A Google Cloud OAuth client must be provisioned and `.env.local` updated before any code change takes effect.

**Tech Stack:** Next.js 16 (App Router), NextAuth v5 beta, TypeScript. No test framework is configured in this project, so verification is by `npx tsc --noEmit`, `npm run lint`, and the manual browser scenarios at the end.

**Reference:** [Design spec](../specs/2026-05-18-gws-oauth-login-design.md)

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `auth.ts` | Modify | All code changes — provider config + two callback changes |
| `.env.local` | Modify (manual) | Populate `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` with real values |
| Google Cloud Console | Configure (manual, external) | OAuth 2.0 Client + Internal consent screen |

No other files change. Login page, `clients.config.ts`, and helpers are untouched.

---

## Task 1: Google Cloud Console + `.env.local` setup (manual)

This is a one-time prerequisite. **No code changes in this task.** Skip the dev-server-restart step if the server isn't running.

**Files:**
- Modify: `.env.local` (root of repo, gitignored)

- [ ] **Step 1: Create the OAuth 2.0 Client in Google Cloud Console**

  Go to https://console.cloud.google.com/ and choose (or create) a project owned by the `avenuez.com` workspace.

  Navigate to **APIs & Services → OAuth consent screen**:
  - User type: **Internal**
  - Fill in App name (e.g., "Avenue Z Reporting"), user support email, developer contact.
  - Save. No scopes need to be added beyond the defaults — NextAuth requests `openid email profile`.

  Navigate to **APIs & Services → Credentials → + Create Credentials → OAuth client ID**:
  - Application type: **Web application**
  - Name: "Avenue Z Reporting (dev)"
  - **Authorized redirect URIs:** add `http://localhost:3000/api/auth/callback/google`
  - Click Create. Copy the Client ID and Client Secret.

- [ ] **Step 2: Paste the credentials into `.env.local`**

  Open `.env.local` and replace the empty `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` values with the real ones from the previous step:

  ```env
  AUTH_GOOGLE_ID=<paste client id here>
  AUTH_GOOGLE_SECRET=<paste client secret here>
  ```

  Do not commit this file — it is already gitignored.

- [ ] **Step 3: Verify env values are populated (no secrets printed)**

  Run:

  ```bash
  awk -F= '/^AUTH_GOOGLE_ID=/ {print "AUTH_GOOGLE_ID length:", length($2)} /^AUTH_GOOGLE_SECRET=/ {print "AUTH_GOOGLE_SECRET length:", length($2)}' .env.local
  ```

  Expected output (lengths will vary, but both > 0):

  ```
  AUTH_GOOGLE_ID length: 72
  AUTH_GOOGLE_SECRET length: 35
  ```

  If either length is `0`, repeat Step 2.

- [ ] **Step 4: Restart the dev server**

  Next.js loads env vars at process start. If the dev server is already running, stop it (Ctrl-C in its terminal, or `kill` the background task) and start it again:

  ```bash
  npm run dev
  ```

  Wait for the `✓ Ready in` line.

- [ ] **Step 5: Smoke test the OAuth flow (will still fail domain check until Task 2)**

  Open `http://localhost:3000/login`. Click "Sign in with Google". You should now see the Google account picker (not "Error 400: invalid_request"). Don't complete sign-in yet — proceed to Task 2.

  No commit in this task — `.env.local` is gitignored and there are no tracked file changes.

---

## Task 2: Update `auth.ts` — provider config + callbacks

All three code changes happen together in this task because they form one cohesive change and the file is small (45 lines). Single commit at the end.

**Files:**
- Modify: [auth.ts](../../../auth.ts) (entire file rewrite, shown below)

- [ ] **Step 1: Read the current file to confirm starting state**

  Run:

  ```bash
  cat auth.ts
  ```

  Expected: matches the current 45-line file with `Google,` (no config), an `authorize` Credentials callback, a `jwt` callback that calls `getClientByEmail`, and a `session` callback. If anything looks different, stop and re-sync with the spec before proceeding.

- [ ] **Step 2: Replace the contents of `auth.ts`**

  Overwrite `auth.ts` with this exact content:

  ```ts
  import NextAuth from 'next-auth'
  import Google from 'next-auth/providers/google'
  import Credentials from 'next-auth/providers/credentials'
  import { getClientByEmail } from '@/lib/clients.config'

  const WORKSPACE_DOMAIN = 'avenuez.com'
  const WORKSPACE_DEFAULT_ROLE = 'INTERNAL_ANALYST'
  const WORKSPACE_DEFAULT_SLUG = 'avenue-z'

  export const { handlers, auth, signIn, signOut } = NextAuth({
    providers: [
      Google({
        authorization: {
          params: {
            hd: WORKSPACE_DOMAIN,
            prompt: 'select_account',
          },
        },
      }),
      Credentials({
        credentials: {
          email: { label: 'Email', type: 'email' },
          password: { label: 'Password', type: 'password' },
        },
        async authorize(credentials) {
          // In production, validate against a hashed password store.
          // For now, check that the email exists in client config.
          const email = credentials?.email as string | undefined
          if (!email) return null

          const user = getClientByEmail(email)
          if (!user) return null

          return { id: email, email, name: email.split('@')[0] }
        },
      }),
    ],
    callbacks: {
      async signIn({ account, profile }) {
        if (account?.provider !== 'google') return true
        const email = profile?.email
        const verified = (profile as { email_verified?: boolean } | null | undefined)?.email_verified
        if (!email?.endsWith(`@${WORKSPACE_DOMAIN}`) || !verified) return false
        return true
      },
      async jwt({ token, user }) {
        if (user?.email) {
          const clientConfig = getClientByEmail(user.email)
          if (clientConfig) {
            token.role = clientConfig.role
            token.clientSlug = clientConfig.slug
          } else if (user.email.endsWith(`@${WORKSPACE_DOMAIN}`)) {
            token.role = WORKSPACE_DEFAULT_ROLE
            token.clientSlug = WORKSPACE_DEFAULT_SLUG
          } else {
            token.role = 'CLIENT_VIEWER'
            token.clientSlug = null
          }
        }
        return token
      },
      async session({ session, token }) {
        session.user.role = token.role as string
        session.user.clientSlug = token.clientSlug as string | null
        return session
      },
    },
    pages: {
      signIn: '/login',
    },
  })
  ```

  Three things changed relative to the prior version:
  1. `Google,` → `Google({ authorization: { params: { hd, prompt } } })`
  2. New `signIn` callback gates Google sign-ins on domain + email_verified.
  3. `jwt` callback now has three branches (hardcoded → workspace auto-provision → fallback) instead of the prior single lookup.

- [ ] **Step 3: Type-check**

  Run:

  ```bash
  npx tsc --noEmit
  ```

  Expected: exits 0 with no output. If TypeScript complains about `email_verified`, double-check the cast in the `signIn` callback matches the code above exactly.

- [ ] **Step 4: Lint**

  Run:

  ```bash
  npm run lint
  ```

  Expected: no errors. Warnings about `as` casts are tolerable if they appear, but the code above is written to avoid them.

- [ ] **Step 5: Restart dev server**

  If `npm run dev` is running, stop it and start again so the new `auth.ts` is loaded:

  ```bash
  npm run dev
  ```

  Wait for `✓ Ready in`.

- [ ] **Step 6: Commit**

  ```bash
  git add auth.ts
  git commit -m "$(cat <<'EOF'
  Gate Google sign-in to @avenuez.com and auto-provision staff

  - Configure Google provider with hd=avenuez.com and prompt=select_account
    so the account picker is scoped to the workspace
  - Add signIn callback that rejects non-@avenuez.com Google sign-ins and
    requires email_verified=true (defense-in-depth; hd is UX-only)
  - Extend jwt callback to assign INTERNAL_ANALYST + clientSlug=avenue-z
    for unlisted @avenuez.com users. Hardcoded users in clients.config.ts
    still override.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 3: Manual verification

No test framework is configured. Run through these five scenarios in a browser against `http://localhost:3000`. Use an incognito window between scenarios to avoid stale session cookies.

**Files:** none — verification only.

- [ ] **Step 1: Happy path — auto-provision an unlisted `@avenuez.com` user**

  - Open `http://localhost:3000/login` in an incognito window.
  - Click "Sign in with Google".
  - Choose a real `@avenuez.com` account that is **not** `nick@avenuez.com` or `demo@avenuez.com` (e.g., your own).
  - Expected: redirect to `/` and the dashboard renders. To confirm the role/slug, open DevTools → Application → Cookies → `authjs.session-token` (or `__Secure-authjs.session-token`) and decode the JWT at https://jwt.io. The payload should contain `"role":"INTERNAL_ANALYST"` and `"clientSlug":"avenue-z"`.

- [ ] **Step 2: Hardcoded override — `nick@avenuez.com` stays INTERNAL_ADMIN**

  - New incognito window, sign in with `nick@avenuez.com` via Google.
  - Expected: session JWT has `"role":"INTERNAL_ADMIN"` (not overwritten by the auto-provision branch). `clientSlug` is `"avenue-z"`.

- [ ] **Step 3: Domain rejection — non-`@avenuez.com` Google account is denied**

  - New incognito window, click "Sign in with Google", choose a personal `@gmail.com` account.
  - Expected: NextAuth redirects to `/login?error=AccessDenied` (or similar — the "Default" error message in [app/login/page.tsx:11](../../../app/login/page.tsx#L11) is shown). No session cookie is set.

  If a non-`@avenuez.com` account doesn't appear in the picker because the consent screen is set to Internal, that's the *stronger* enforcement layer working — the test still passes. To exercise the `signIn` callback directly, temporarily change the consent screen to External, repeat, then revert to Internal.

- [ ] **Step 4: Credentials login still works**

  - New incognito window. Submit the credentials form with email `demo@avenuez.com` and password `demo`.
  - Expected: redirect to `/`. Session JWT has `"role":"INTERNAL_ANALYST"` and `"clientSlug":"avenue-z"` (from the hardcoded entry in `clients.config.ts`).

- [ ] **Step 5: Preview Access button still works**

  - New incognito window. Click the "Preview Access" button on `/login`.
  - Expected: redirect to `/`. Same session as Step 4.

- [ ] **Step 6: Production build sanity check**

  Run:

  ```bash
  npm run build
  ```

  Expected: build succeeds. No new warnings or errors related to `auth.ts`. Stop the dev server first if port 3000 is in use during the build (Next.js build doesn't need it, but some setups complain).

  No commit in this task unless build surfaces a fix.

---

## Done

After all three tasks are checked off and Task 3 scenarios pass:

- The branch `feature/oauth-changes` contains one new commit (Task 2) on top of the spec commit (`31d27de`).
- `auth.ts` is the only code file changed.
- `.env.local` is updated locally but not tracked.
- The Google Cloud OAuth client and consent screen are configured.

Production rollout (adding the prod redirect URI to the OAuth client, deploying with prod env vars) is out of scope for this plan and tracked separately when the prod URL is known.
