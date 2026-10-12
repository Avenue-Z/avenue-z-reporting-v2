# TikTok tab: design

Status: approved in chat on 2026-09-18 ("start on the tiktok tab"), under the standing
rule that work follows Jasmine's outlines and does not touch Renaissance. PR 247.

## The problem

Joy of Life's outline has three tabs: Instagram, Facebook, TikTok. The tab list,
`ORGANIC_SOCIAL_SUBSECTIONS` in `lib/constants.ts`, has Overview, Instagram, Facebook,
LinkedIn and X, and no TikTok. So Joy of Life's TikTok content shows only on Overview, and
all three outlines remove Overview. Without a tab, it would appear nowhere.

## What the tab list drives

Traced on this branch:

| Caller | What it does with the list |
|---|---|
| `components/layout/sidebar.tsx`, `components/layout/portal-sidebar.tsx` | List a client's tabs from `organicSocialSubsections(client)`: a label and a link each, nothing keyed by platform. |
| `app/dashboard/[clientSlug]/reports/page.tsx`, `app/portal/[clientSlug]/reports/page.tsx` | `resolveOrganicSubsection` turns the `subsection` URL parameter into a tab. An unknown, hidden or unconfigured tab falls back to Overview. The tab's channel is passed to the Organic Social section. |

A tab is offered to a client only when its channel is in the client's resolved channels
and the client has not hidden it. After the previous commit, a client with no allowlist
resolves to the four original channels, so it can never be offered a TikTok tab.

Everything the tab then renders already handles TikTok on this branch: the platform
headline tiles (`PLATFORM_KPIS.TIKTOK`), both graphs (TikTok's daily follower and
engagement data were probed on 2026-09-18), Top Content (`CONTENT_METRIC.TIKTOK`, the
`TikTok` display label), and Commentary (`organic-social:tiktok`, derived from `CHANNELS`).

## The design

Append one entry to `ORGANIC_SOCIAL_SUBSECTIONS`:

```ts
{ id: 'organic-tiktok', label: 'TikTok', channel: 'TIKTOK' },
```

- **Id** `organic-tiktok` follows the `organic-` namespacing that keeps Organic Social tab
  ids from colliding with other sections' ids in the flat `hidden_reports` list.
- **Label** `TikTok`, as the outline and the channel label spell it.
- **Appended last**, so every existing tab keeps its position. Joy of Life gets Instagram,
  Facebook, TikTok, the outline's order.

Rejected: deriving the tab list from `CHANNELS`. `CHANNELS` orders X before LinkedIn, the
tab list orders LinkedIn before X, so deriving it would reorder Renaissance's tabs.

## What each client sees

| Client | Allowlist | Tabs (Overview still listed until its removal is built) |
|---|---|---|
| Renaissance | none | unchanged: Overview, Instagram, Facebook, LinkedIn, X |
| A Place For Mom | instagram, facebook, linkedin | Overview, Instagram, Facebook, LinkedIn |
| Joy of Life | instagram, facebook, tiktok | Overview, Instagram, Facebook, **TikTok** |
| Kenect Nashville (outline) | instagram | Overview, Instagram |

Kenect's staging record (`akara-living`) also names facebook, against its Instagram-only
outline. That waits on Jasmine's question 1 and is not changed here.

## Tests, written first

- The existing order test changes on purpose: the list ends with `organic-tiktok`.
- Joy of Life's allowlist gets Instagram, Facebook, TikTok, in that order, and
  `organic-tiktok` resolves to the TikTok channel with the label "TikTok".
- A Place For Mom's and Kenect's allowlists get exactly their outline's tabs, no TikTok.
- A client with no allowlist (Renaissance) is never offered the TikTok tab, and a
  hand-typed `subsection=organic-tiktok` URL falls back to Overview.
- The TikTok tab can be hidden per client, like any other tab.
- The TikTok tab has a Commentary view, as the outline puts Commentary on every tab.

## Proof that Renaissance is untouched

The drift check after the change: every `REN.*` line identical in prod, staging and dev,
including `REN.RESOLVED_TABS`. The `SUBSECTIONS` line, which describes the code, gains the
TikTok entry. No database write.

## Edge cases

The `subsection` URL parameter is untrusted input, and this adds a value it can take:

- **Input boundaries:** fix. A TikTok tab URL for a client without TikTok falls back to
  Overview; tested.
- **External failure, operator visibility, bounds, state and concurrency, security:**
  decline. Nothing new is fetched or stored; the tab reuses the same parts and the same
  error handling as every other platform tab; no trust boundary moves.
