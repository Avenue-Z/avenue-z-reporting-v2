# Onboarding A Place For Mom (Organic Social only)

Read-only investigation completed 2026-09-15. This runbook records what the
onboarding actually requires, and the one piece of it that is NOT a database
change.

---

## 1. Onboarding is a database change. No code, no migration.

I checked this rather than assuming it:

- `organic-social` is already a valid `ReportSlug` (`lib/db/schema.ts:9`) and is
  already in `ALL_REPORT_SLUGS` (`lib/constants.ts:233`).
- Section templates are **global per section, not per client**
  (`getSectionTemplate` filters on `section_slug` only, `lib/db/queries.ts:260`).
  Production already holds `organic-social` and `organic-social:platform`, so a
  new client inherits them.
- `DASH_API_TOKEN` is a single brand-agnostic bearer token
  (`lib/organic-social/base.ts:28`). The brand is selected per request by
  `brandId`, so onboarding needs **no new secret**. The token already works in
  production.
- Nothing hardcodes a client list. `HIDDEN_CLIENT_SLUGS` holds only
  `kind-patches` (`lib/constants.ts:43`), and `getVisibleClients` filters on
  that plus `dashboardOnly` (`lib/db/queries.ts:127-129`), so a new client
  appears in the dashboard automatically.
- **No schema drift.** All three databases (dev `ep-still-tree`, staging
  `ep-restless-union`, prod `ep-green-violet`) carry every one of the 36 columns
  `schema.ts` declares. Verified 2026-09-15. No migration is needed, and there is
  no repeat of the missing-column failure that broke a prod script in September.

A Place For Mom does not exist in any of the three databases today.

## 2. The rows

Only three columns are required (NOT NULL with no default): `slug`, `name`,
`enabled_reports`. Everything else defaults or is nullable.

`dash_social_config` is nullable in the schema but is what makes the section
work: without it `dashClientFor` throws `dash_social_config missing for <slug>`
(`lib/organic-social/base.ts:27`) and the tab renders an error card.

```sql
INSERT INTO clients (slug, name, enabled_reports, dash_social_config)
VALUES (
  'a-place-for-mom',
  'A Place For Mom',
  ARRAY['organic-social'],
  '{"brandId": 24350}'::jsonb
);
```

Then one `users` row per person. Roles are `INTERNAL_ADMIN`,
`INTERNAL_ANALYST`, `CLIENT_ADMIN`, `CLIENT_VIEWER`.

```sql
INSERT INTO users (email, role, client_id)
SELECT '<email>', '<ROLE>', id FROM clients WHERE slug = 'a-place-for-mom';
```

Run against dev, then staging, then prod.

## 3. The Dash brand id: 24350

Supplied 2026-09-15. Renaissance is `26952` for comparison.

**Corroborating signal, not proof:** `24350` is already the example brand id in
the `DashSocialConfig` docstring (`lib/db/schema.ts:133`) and in the original
plan doc (`docs/superpowers/plans/2026-06-23-renaissance-organic-social.md:388`).
So it is a real Dash brand id that somebody had to hand in June. That confirms
the shape is right. It does not confirm the brand is A Place For Mom.

**It has not been verified against the live API.** `DASH_API_TOKEN` is empty in
`.env.local`, so no call was made from here. It also could not have been looked
up by name: `DashSocialClient` implements only `getMedia` and `getContent`
(`lib/dash-social/client.ts:89`, `:97`), both of which require a brand id you
already hold, and there is no brand-listing or brand-search call. The captured
fixtures contain only brand `26952` and carry no brand-name field.

Verify before prod, either with a real token (see §5) or by loading the page on
dev and confirming the posts are A Place For Mom's.

## 4. Two things to get right

**Leave the `channels` allowlist out.** Omitted means all four supported
channels. An allowlist that matches no supported channel resolves to `[]` and
**silently blanks the whole section** with no error. This is a known open
follow-up on `DashSocialConfig` (`lib/db/schema.ts:135-138`): validation at write
time does not exist yet. Only set it if the client genuinely does not run all
four platforms.

**A wrong brand id fails quietly.** It returns a valid-looking response with no
posts, which renders as an empty section rather than an error. Verify against
live data before trusting the tab.

## 5. Verification

The brand id is unverified (§3), so verify on dev BEFORE staging or prod.

1. Row exists with `enabled_reports = {organic-social}` and a non-null
   `dash_social_config`.
2. `/dashboard/a-place-for-mom/reports/organic-social` loads.
3. **The posts are recognisably A Place For Mom's.** This is the step that
   actually validates `24350`. A wrong brand id returns a valid-looking response
   for somebody else's brand, or an empty one, and neither raises an error.
4. All four platform tabs show data, not empty states.

With a real `DASH_API_TOKEN` this can be checked without creating any row, by
calling CONTENT directly for brand `24350` and reading the captions:

```
GET https://dashboard.dashsocial.com/reports/data
    ?brand_ids=24350&channels=FACEBOOK&metrics=TOTAL_ENGAGEMENTS
    &report_type=CONTENT&start_date=<start>&end_date=<end>&limit=500
Authorization: Bearer $DASH_API_TOKEN
```

`limit` is mandatory (omitting it silently returns 6 posts) and `aggregate_by`
must never be sent (it returns 0 items). See `lib/dash-social/client.ts:97`.

---

## 6. NOT a database change: the locked client view

The ask is that A Place For Mom gets a locked view, one month at a time, with no
live access. **Half of that already exists and half is code that has not been
written.**

**The data half already works.** Once a reporting window closes, the app freezes
that month's posts into `top_content_snapshots` and stops querying the vendor for
them (`lib/organic-social/frozen.ts`). So a finished month's numbers are already
stable and will not drift under the client.

**The access half does not exist.** I grepped for a locked, fixed, or allowlisted
date-range setting and there is none. Every client currently gets the full date
picker and can roll it forward to today. Restricting a client to a single closed
month is a code change, not a configuration flip, and it is the real work this
branch is named for.

**One wrinkle to design around.** A month only freezes on the first render of a
closed window, which means **a person has to open that month before a snapshot
exists**. It is not a scheduled job, and the cache-warm cron will not do it,
because that cron renders a rolling window and rolling windows are deliberately
never frozen. In practice the freeze has landed around the 4th of the following
month, well before the 12th-of-month reporting deadline, but that is an analyst's
habit rather than a guarantee. A locked "last month" view needs to decide what it
shows when nothing has been frozen yet.

None of this blocks onboarding. The client can be created and Organic Social
wired up now; the locked view is separate work on top.
