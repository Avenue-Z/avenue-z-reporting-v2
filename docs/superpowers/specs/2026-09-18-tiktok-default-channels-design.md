# TikTok: keep it off clients that did not ask for it

Status: approved in chat on 2026-09-18. PR 247.

## The problem

`resolveChannels` (`lib/organic-social/metrics.ts`) turns a client's channel allowlist
into the channels it reports on. When the allowlist is absent or empty it returns every
entry in `CHANNELS`. PR 247 adds `TIKTOK` to `CHANNELS`, so any client with no allowlist
gains TikTok without anyone deciding it.

Read on 2026-09-18, read only: Renaissance is the only client with no allowlist, in prod,
staging and dev. Every other client with Organic Social names its channels.

The drift check on this branch, before this fix, shows the effect on Renaissance in all
three environments: `REN.RESOLVED_CHANNELS` gains `TIKTOK`, and ten `REN.RENDERS.TIKTOK.*`
lines appear. On screen, its live Overview would gain a "TikTok / no data" headline
section: Dash answers a brand with no TikTok account with HTTP 200 and no data rather
than an error, so the drop-on-error path never fires.

Writing an allowlist onto Renaissance's row would fix it and is forbidden: Renaissance's
config row does not change. The fix has to be in code.

## Where the channel list is used

Traced on this branch, every runtime caller:

| Caller | What the absent-allowlist result decides |
|---|---|
| `lib/organic-social/base.ts:30` (`dashClientFor`) | The channel list every Organic Social getter uses: headlines, trends, followers, top content. This is where the TikTok section comes from. |
| `lib/constants.ts:203` (`organicSocialSubsections`) | Which platform tabs a client gets. No TikTok tab exists yet, so no tab changes today. |
| `components/report-sections/organic-social/parts/top-content.tsx:39` | Reads `CHANNELS` for display order only. Posts only come from resolved channels. Unaffected. |
| `lib/commentary/views.ts:66` | Builds the commentary view registry from `CHANNELS`. A TikTok view key is only ever used on a TikTok tab. Unaffected. |

## The design

- Add `DEFAULT_CHANNELS` to `lib/organic-social/metrics.ts`: `INSTAGRAM`, `FACEBOOK`,
  `TWITTER`, `LINKEDIN`, in that order. These are the channels a client with no allowlist
  has always had. The list is closed: adding a channel to `CHANNELS` does not add it here.
- `resolveChannels`: an absent or empty allowlist returns `DEFAULT_CHANNELS`. Everything
  else is unchanged: a named allowlist still filters `CHANNELS`, in `CHANNELS` order,
  case-insensitive, unknown names ignored, and an all-unknown list still resolves to `[]`.
- `CHANNELS` keeps `TIKTOK`. It is how a named allowlist resolves TikTok, and where its
  label and KPIs are defined.
- No caller changes. No database write. Two comments that describe the old default are
  corrected: the `resolveChannels` doc comment and `DashSocialConfig.channels` in
  `lib/db/schema.ts`.

Rejected: splitting `CHANNELS` into a core list and an opt-in list (the same result,
about six files touched), and a per-channel opt-in flag (more machinery than one channel
needs).

## What each client resolves to

| Client | Allowlist | On `dev` today | PR 247 before this fix | After this fix |
|---|---|---|---|---|
| Renaissance (prod, staging, dev) | none | Instagram, Facebook, X, LinkedIn | the same plus TikTok | Instagram, Facebook, X, LinkedIn |
| Joy of Life (staging) | instagram, facebook, tiktok | Instagram, Facebook (`dev` does not know TikTok) | Instagram, Facebook, TikTok | Instagram, Facebook, TikTok |
| Every other client (staging) | named | unchanged | unchanged | unchanged |

## Tests, written first

- `scope.test.ts`: the existing "absent allowlist" test changes on purpose. Absent, `null`
  and `[]` resolve to exactly the four, not to every channel.
- `DEFAULT_CHANNELS` is exactly the four, in order, each one in `CHANNELS`, and never
  `TIKTOK`. Putting a channel into the default has to be a deliberate edit to this test.
- An allowlist that names `tiktok` resolves it (Joy of Life's shape).
- The wiring Renaissance actually goes through: `dashClientFor` for a client whose config
  has no `channels` returns the four; for Joy of Life's config it includes TikTok.
- `organicSocialSubsections` for a client with no allowlist returns exactly today's tabs.
  This also guards the TikTok tab that comes next.

## Proof that Renaissance is untouched

- The drift check after the fix: every `REN.*` line is identical to the baseline in prod,
  staging and dev. The only differences left are the lines that describe the code rather
  than Renaissance (`CHANNELS`, `LABEL.TIKTOK`, `KPI.TIKTOK.*`), which were already on
  this branch before this fix.
- No database is written.

## Edge cases in the code this touches

`resolveChannels` decides which Dash requests are made, so the six checks apply:

- **External failure:** decline. Unchanged. A channel with no account answers 200 with
  no data, which is why this fix exists.
- **Operator visibility:** decline. Nothing new can fail.
- **Bounds:** fix. The default is now a fixed four, however long `CHANNELS` grows.
- **Input boundaries:** decline. Allowlist parsing is unchanged. Validating an allowlist
  when it is written is an existing, tracked follow-up (`lib/db/schema.ts`).
- **State and concurrency:** decline. A pure function over its argument.
- **Security:** decline. No trust boundary moves.

## Next, separately

The TikTok tab Joy of Life's outline needs: its own commit on PR 247, same process,
agreed on 2026-09-18. Today there is no TikTok entry in `ORGANIC_SOCIAL_SUBSECTIONS`, so
Joy of Life's TikTok would show only on Overview, which the outlines remove.
