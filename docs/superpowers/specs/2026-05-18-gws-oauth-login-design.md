# GWS OAuth Login — Design

**Date:** 2026-05-18
**Branch:** `feature/oauth-changes`
**Owner:** paul.ramirez@avenuez.com

## Goal

Allow any user in the Avenue Z Google Workspace (`@avenuez.com`) to sign in to the reporting platform via Google OAuth without being individually enrolled in `lib/clients.config.ts`. Unlisted staff should be auto-provisioned as `INTERNAL_ANALYST`. Existing credentials login and Preview Access bypass remain unchanged.

## Current state

- `auth.ts` registers two NextAuth v5 providers: `Google` (default config) and `Credentials`.
- `.env.local` has the keys `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` but their values are empty, which is why the live OAuth flow returns `Error 400: invalid_request — Missing required parameter: client_id`.
- The `jwt` callback resolves role/clientSlug via `getClientByEmail`. If the email isn't listed, the user gets `CLIENT_VIEWER` and `clientSlug: null`, which makes the dashboard unusable for internal staff who aren't hardcoded.
- The login page exposes three entry points: credentials form, Preview Access demo button, and "Avenue Z employee? Sign in with Google" footnote. All three stay.
- Only two users are hardcoded as internal: `nick@avenuez.com` (INTERNAL_ADMIN) and `demo@avenuez.com` (INTERNAL_ANALYST).

## Non-goals

- No changes to credentials login behavior.
- No changes to the Preview Access button.
- No changes to login page layout or copy.
- No changes for non-`@avenuez.com` users — they continue to be governed by `clients.config.ts`.
- No database/persistence — role assignment remains in-memory at JWT mint time.

## Design

### 1. Google Cloud Console (manual prerequisite)

Performed by the engineer setting this up — not code.

- Create an OAuth 2.0 Client ID of type *Web application* in a Google Cloud project owned by the `avenuez.com` workspace.
- Configure the OAuth consent screen as **Internal**. This is the strongest enforcement layer: Google itself refuses to issue tokens to accounts outside the workspace.
- Add `http://localhost:3000/api/auth/callback/google` to **Authorized redirect URIs** for development. Production redirect URI is added when the prod URL is known.
- Populate `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` in `.env.local` with the real values, then restart the dev server so Next.js loads them.

### 2. `auth.ts` — Google provider config

Configure the Google provider to scope the account picker to the workspace and force a fresh chooser on each sign-in:

```ts
Google({
  authorization: {
    params: {
      hd: 'avenuez.com',
      prompt: 'select_account',
    },
  },
}),
```

`hd` is a UX hint only — it can be bypassed by a determined caller — so it is paired with a server-side check below.

### 3. `auth.ts` — `signIn` callback

Add a `signIn` callback that gates Google sign-ins on domain and email verification. Credentials sign-ins pass through unchanged.

```ts
async signIn({ account, profile }) {
  if (account?.provider === 'google') {
    const email = profile?.email
    const verified = (profile as { email_verified?: boolean } | null | undefined)?.email_verified
    if (!email?.endsWith('@avenuez.com') || !verified) return false
  }
  return true
},
```

Rejecting here causes NextAuth to redirect back to `/login?error=AccessDenied`. The existing `ERROR_MESSAGES` map in [app/login/page.tsx](../../../app/login/page.tsx) falls back to the `Default` message for unknown error codes, which is acceptable for v1.

### 4. `auth.ts` — `jwt` callback

Update the existing `jwt` callback so it resolves role/clientSlug in priority order:

1. If the email is in `clients.config.ts`, use the configured role and slug (existing behavior — preserves `nick@` as ADMIN).
2. Otherwise, if the email ends in `@avenuez.com`, assign `role: 'INTERNAL_ANALYST'` and `clientSlug: 'avenue-z'`.
3. Otherwise, fall back to `role: 'CLIENT_VIEWER'` and `clientSlug: null` (existing fallback).

```ts
async jwt({ token, user }) {
  if (user?.email) {
    const cfg = getClientByEmail(user.email)
    if (cfg) {
      token.role = cfg.role
      token.clientSlug = cfg.slug
    } else if (user.email.endsWith('@avenuez.com')) {
      token.role = 'INTERNAL_ANALYST'
      token.clientSlug = 'avenue-z'
    } else {
      token.role = 'CLIENT_VIEWER'
      token.clientSlug = null
    }
  }
  return token
},
```

The `session` callback is unchanged — it already copies `token.role` and `token.clientSlug` onto `session.user`.

### 5. Login page

No changes to [app/login/page.tsx](../../../app/login/page.tsx).

## Security model

Three independent layers, in order of strength:

1. **Google Workspace consent screen = Internal.** Google's OAuth server refuses to issue tokens to accounts outside `avenuez.com`. This is the primary enforcement.
2. **`hd=avenuez.com` parameter.** The account picker only displays `@avenuez.com` accounts. UX guardrail; not relied on for security.
3. **`signIn` callback domain + `email_verified` check.** Final server-side check before NextAuth issues a session.

If any one of these layers fails or is misconfigured, the others still block unauthorized access.

## Testing

Manual verification after implementation:

1. **Happy path:** Sign in with an `@avenuez.com` Google account that is *not* in `clients.config.ts`. Confirm the resulting session has `role: 'INTERNAL_ANALYST'` and `clientSlug: 'avenue-z'`, and that the dashboard renders.
2. **Hardcoded override:** Sign in with `nick@avenuez.com`. Confirm session has `role: 'INTERNAL_ADMIN'` (not overwritten by the auto-provision path).
3. **Domain rejection:** Attempt to sign in with a personal Gmail account. Confirm NextAuth redirects to `/login?error=AccessDenied` and no session is created.
4. **Credentials still work:** Sign in with the existing credentials form using `demo@avenuez.com` / `demo`. Confirm normal demo session.
5. **Preview Access still works:** Click the Preview Access button. Confirm demo session.

## Open questions

None. All decisions resolved during brainstorming:

- Default role for unlisted `@avenuez.com` users → `INTERNAL_ANALYST`.
- Default `clientSlug` for unlisted staff → `'avenue-z'`.
- Credentials and Preview Access → kept.
- Hardcoded users in `clients.config.ts` → still take precedence.
