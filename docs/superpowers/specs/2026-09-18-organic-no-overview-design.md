# Organic Social without Overview: design

Status: approved in chat on 2026-09-18, under the standing rule that work follows Jasmine's
outlines and does not touch Renaissance.

## The problem

All three outlines (A Place For Mom, Joy of Life, Kenect Nashville) begin "[remove]
Overview". Today Organic Social's Overview cannot be removed for a client:

- `visibleSubsections` (`lib/constants.ts`) drops tabs a client lists in `hidden_reports`,
  but always keeps the Overview entry (id `null`). Its own comment says so.
- `resolveOrganicSubsection` falls back to the first tab, which is always Overview, so a
  report opened with no tab, or with an unknown one, lands on Overview.

## What must not change

`visibleSubsections` is shared: the AEO sidebars (`components/layout/sidebar.tsx:513`,
`components/layout/portal-sidebar.tsx:177`) and the other sections use it, including for
Renaissance. It is not edited.

Renaissance's `hidden_reports` (read 2026-09-18) is `["technical-audit","content-impact"]`
in prod and dev and `["technical-audit"]` in staging. It hides nothing in Organic Social and
must keep Overview first, exactly as today.

## The design

- A named id, `ORGANIC_OVERVIEW_TAB_ID = 'organic-overview'`, in `lib/constants.ts`. A
  client hides Organic Social's Overview by listing it in `hidden_reports`, the existing
  per-client setting for hiding tabs. Namespaced like the platform tab ids, because
  `hidden_reports` is one flat list across sections.
- `organicSocialSubsections(client)` drops the Overview entry when the client lists that id
  and at least one platform tab remains. If none remains, Overview stays, so a client can
  never be left with no tabs (the page resolves a tab from that list and needs one).
- `resolveOrganicSubsection` is unchanged. Its fallback, the first tab, is now the first
  platform tab for such a client: a report opened with no tab lands on Instagram for all
  three new clients, the first tab in each outline.
- The sidebars and both report pages already take their tabs from these two functions, so
  they follow without edits.
- No schema change and no migration. Turning it on for a client is a `hidden_reports`
  value, written separately on staging only, with approval.

Rejected: a new `dashSocialConfig` flag (a second mechanism for the same job that
`hidden_reports` already does), and changing `visibleSubsections` (shared with every
section, Renaissance's included).

## What each client sees once its setting is written

| Client | Tabs |
|---|---|
| Renaissance | unchanged: Overview, Instagram, Facebook, LinkedIn, X |
| A Place For Mom | Instagram, Facebook, LinkedIn |
| Joy of Life | Instagram, Facebook, TikTok (the TikTok tab is PR 247) |
| Kenect Nashville | Instagram (its record's name and channel list wait on Jasmine's question 1) |

## Tests, written first

- The id is `organic-overview`.
- A client listing it gets only its platform tabs, in outline order.
- With Overview hidden, no tab or an unknown tab opens the first platform tab; a named
  platform tab still opens.
- Renaissance's real settings keep Overview first and every tab as today.
- Hiding Overview never leaves zero tabs.
- Listing `organic-overview` does not hide another section's Overview.

## Proof that Renaissance is untouched

The drift check: every surface line, `REN.RESOLVED_TABS` included, and its row and users,
identical in prod, staging and dev. No database write in this change.

## Edge cases

`hidden_reports` is stored configuration and the `subsection` URL parameter is untrusted
input; both feed this logic:

- **Input boundaries:** fix. An unknown or hidden tab, or none, resolves to a real tab;
  a client can never be left with zero tabs.
- **External failure, operator visibility, bounds, state and concurrency, security:**
  decline. Nothing is fetched or stored; a pure function of the client record.
