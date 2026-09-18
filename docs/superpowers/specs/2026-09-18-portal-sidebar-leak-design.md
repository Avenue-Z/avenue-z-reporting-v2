# Stop sending every client's record to the portal: design

Status: approved in chat on 2026-09-18 ("fix the portal data leak"). On PR 250, which lists
this as finding 5 and an open item.

## The problem

`app/portal/[clientSlug]/layout.tsx` calls `getAllClients()` and passes the result to
`PortalSidebar`. `PortalSidebar` is a client component (`'use client'`), so its props are
serialized into the page and reach the browser of whoever is logged in, including every
client user. `getAllClients()` returns every client's full row with its users. The sidebar
then uses one of them: the client whose slug is in the URL.

So any logged-in client user can read, from the page data:

- every client's settings, including Dash brand ids, Google Ads, Meta, LinkedIn and
  Salesforce account ids, GA4 property ids and env var names
- every client's `shared_password_hash`
- every client user's email address

Adding the three new clients widens it: each would receive Renaissance's record and each
other's. Found by reading the code; the chain is unambiguous.

## What the sidebar actually reads

Traced in `components/layout/portal-sidebar.tsx`: `slug` (to pick the client), `name`,
`logoUrl`, `enabledReports`, `hiddenReports`, and, through `organicSocialSubsections` and
`resolveOrganicSubsection`, `dashSocialConfig.channels`. Nothing else.

## The design

- `lib/portal/sidebar-client.ts`: a type `PortalSidebarClient` with only those fields, and
  `toPortalSidebarClient(client)`, the one place that decides what reaches the browser.
  From `dashSocialConfig` it keeps only `channels`; the brand id stays on the server.
- The layout loads the current client with `getClientBySlug(clientSlug)` and passes
  `client={toPortalSidebarClient(...)}`. It no longer calls `getAllClients`.
- `PortalSidebar` takes `client` instead of `clients`. Everything it renders is unchanged:
  links still use the slug from the URL, and a missing client still renders nothing.
- `organicSocialSubsections` and `resolveOrganicSubsection` accept any object with a
  channel allowlist and hidden tabs (`OrganicTabsClient`), not only a full `Client`. Type
  only; a full `Client` still fits, so every other caller is unchanged.

Not in scope: the internal dashboard sidebar also receives every client, but only Avenue Z
staff reach it, and staff can see every client anyway.

## Proof that Renaissance sees the same portal

- Before any change, snapshots of `PortalSidebar` for a client shaped like Renaissance (its
  real enabled and hidden reports from prod, no channel allowlist), on the Organic Social,
  AEO and Paid Media pages, as a client viewer and as a client admin. After the change the
  same snapshots must pass unchanged.
- The drift check, all three environments: row and users identical, surface identical.

## Tests

- The mapper returns exactly the seven fields, keeps the channel list, and none of the
  secret values planted in a full fixture appear anywhere in its output.
- A client's Organic Social tabs are the same from the trimmed record as from the full one.
- The layout, with the database mocked: it never calls `getAllClients`, and the sidebar's
  props carry only the trimmed record.

## Edge cases

Data crosses from the server to the browser here, a trust boundary:

- **Security:** fix. Only the seven fields cross; secrets, other clients and users do not.
- **Input boundaries:** decline. An unknown slug still gives no client and no sidebar, as
  today (a client user is already redirected away from another client's slug).
- **External failure:** decline. `getClientBySlug` fails the same way `getAllClients` did.
- **Operator visibility, bounds, state and concurrency:** decline. One cached read instead
  of one cached read of every client; nothing written.
