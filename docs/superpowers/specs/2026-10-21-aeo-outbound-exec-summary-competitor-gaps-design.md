# AEO Outbound: Executive Summary, and competitor domains in the gaps bullet (design)

Status: draft for review, 2026-10-21. Code cited at dev `5fedaa52`, read this session.

## 1. What Ryan asked (round 3, verbatim)

1. "Changing headline signal page title to Executive Summary"
2. "For the COMPETITOR DOMAIN GAPS: section on Competitive Visibility page, some of the domains listed were not
   competitors mentioned. Only include competitor domains"

The page swap, the Cited Sources rename and the bullet wording wait on his answer to my question 1; they are not here.

## 2. How it works today

**The headline label.** `PAGE_WORDS_V1.headline_label` is "Headline signal" (`config.ts:74`). New rows take page words
from `pageDefaults` (`slots.ts:76-78`, called at `generate.ts:101`); rows from before v1.1 fill missing words from
`PAGE_WORDS_V1` (`slots.ts:83`), which `v1-compat.test.ts` pins. It shows as the section label above the headline
(`render.ts:257`, uppercased by AIVx's `.exec-label`) and as menu item 01 (`render.ts:237`). It is a per-row editable
slot; it is not a setting.

**The gaps list.** `buildSnapshotData` computes `gapDomains` (`metrics.ts:247-260`): rows with retrieved chats above 0
(`:253`), not classified `COMPETITOR` or `OWN` and not any roster brand's site (`:254`), whose `mentioned_brands`
include a roster competitor and not the own brand (`:255-256`), top 4 by `retrieved_chat_count` (`:258-259`). So it
lists third-party sites, never a competitor's own site: the spec of record says so on purpose ("A rival's own homepage
isn't a place the prospect can earn coverage", `docs/superpowers/specs/2026-10-08-aeo-outbound-snapshot-design.md:218`).
The list is printed:
- in the bullet "Competitor domain gaps: The largest gaps include {d1} at {n1} retrievals, ..." (`sentences.ts:195-198`);
- in the Data block Glean reads, "Competitor domain gaps (sites where competitors appear and the brand does not, by
  answers that used them): ..." (`prompt.ts:57`), for every row version; `v1-compat.test.ts:14-16` pins it for a
  version 1 row through `__fixtures__/v1-row.ts:64`;
- as allowed domains for grounding (`grounding.ts:131`).
Rows store their own `gapDomains`, so a draft made earlier keeps its list.

**Measured (2026-10-21, read only, all 33 PITCH projects with domain data, last 90 days):** competitors' own sites
(Peec `COMPETITOR` or a roster competitor's domain, not the brand's) exist on 32 of 33; those where the brand is not
mentioned exist on 31 of 33 (empty on PE Firms (Blue Owl), whose three competitor sites all mention the brand, and on
Paycom - Branded, which has none). PocketGuard: ynab.com, monarchmoney.com, copilot.money, actualbudget.org.

## 3. The changes

**E1. Executive Summary.** `pageDefaults` sets `headline_label: 'Executive Summary'` for new rows (Ryan's casing,
decision D2). `PAGE_WORDS_V1` is unchanged, so rows from before v1.1 and `v1-compat` are untouched. Existing drafts
keep the word stored on them; approved reports never change.

**E2. The gaps list holds competitors' own sites.** In `buildSnapshotData` (review round 1, M1 and M2):
- `competitorsTracked === 0`: `gapDomains` is `[]`, as today, so a report that names no competitor lists no
  competitor site (the code names no outside brand then, `prompt.ts:34-36`, `grounding.ts:133`).
- Otherwise a row is a gap when all hold:
  - `retrieved_chat_count` above 0 (unchanged);
  - it belongs to a competitor the report compares, `keptIds` (`metrics.ts:147`, the ranked set after the `rankAmong`
    cut): either its domain (lowercase, no `www.`) is a kept competitor's roster domain or a subdomain of one, empty
    entries skipped, or Peec classifies it `COMPETITOR` and its `mentioned_brands` include a kept competitor;
  - it is not the brand's own site: not classified `OWN` and not an own domain or subdomain (`ownMatch`,
    `metrics.ts:217-221`); own wins over competitor;
  - its `mentioned_brands` do not include the own brand (decision D1: it stays a gap, as Ryan's heading says).
- Top 4 by `retrieved_chat_count`, ties by domain, as today (`:258`). `DECISIONS.competitorSiteGaps` still switches it
  off; its comment (`config.ts:9`) and the `contracts.ts:76` comment are updated. `competitorIds` (`metrics.ts:247`)
  and the old "mentions a roster competitor" condition go; `isRosterSite` stays only if still used.

**E3. The Data line says what the list now holds** (review round 1, m1: no new data field). Glean only ever reads a
freshly built row (`generate.ts:49`, `:62`, `:77`), and grounding reads the Data block only for its numbers and domains
(`grounding.ts:131`, `:145-146`), which the parenthetical has none of. So for a version 2 row (`prompt.ts:33`) the line
reads "Competitor domain gaps (competitors' own sites where the brand does not appear, by answers that used them): ...";
a version 1 row keeps today's text (`v1-row.ts:64`, pinned by `v1-compat.test.ts:14-16`). An older version 2 draft's
grounding is unchanged, since only the words in brackets differ.

**E4. The bullet.** Lead and text unchanged: "Competitor domain gaps: The largest gaps include ...". No
`SENTENCES_VERSION` bump: the wording and rounding do not change, only the stored list does, and each row's sentence is
built from its own stored list.

## 4. Who sees it

New reports: "Executive Summary" and competitor sites. Drafts in flight and approved reports: unchanged. No
migration, no setting, no `PAGE_KEYS` change. Other round-3 PRs touch `pageDefaults` (#412) and the bullets (pending);
whichever merges second resolves the overlap.

## 5. Edge cases

| Case | Behaviour |
|---|---|
| No competitor site retrieved, or every one mentions the brand | `gapDomains` empty; the bullet is left out, as today (`sentences.ts:195`) |
| A competitor site classified CORPORATE by Peec | Counts, by the roster domain match |
| A COMPETITOR-classified site off the roster that mentions a kept competitor | Counts |
| The brand's own subdomain classified COMPETITOR | Never counts (own match wins) |
| No competitors tracked | Always empty, as today |
| A competitor cut by `rankAmong` | Its sites never count |
| A COMPETITOR-classified site that mentions no kept competitor | Never counts |
| Competitor site with retrieved chats 0 or null | Never counts (unchanged) |
| A row made before this ships | Its stored list and bullet unchanged; a version 2 row's Data line changes only in its bracketed words, which grounding never reads (E3) |

## 6. Tests (written first)

| File | Proves |
|---|---|
| `slots.test.ts` | `pageDefaults` sets "Executive Summary"; `:140`'s expected object updated |
| `metrics.test.ts` | Competitor sites by roster domain (with `www.`, and subdomain) and by class with a kept competitor mentioned; own sites never; brand-mentioned never; zero chats never; a `rankAmong`-cut competitor never; no competitors tracked gives `[]`; empty roster domain entries skipped; top 4. Rewritten: `:76-79` (now `alpha.com`), `:239-262` |
| `prompt.test.ts` | New wording on a version 2 row (and "none" when empty), old wording on version 1; `v1-compat.test.ts` unchanged and passing |
| `sentences.test.ts` | `:36` and `:149-156` rewritten with competitor rows; the live-shape fixture gains one roster-domain row and its header comment (`__fixtures__/sentences-live-shape.ts:1-3`) is updated |
| `grounding.test.ts` | A fresh new row has no flags |
| `config.test.ts` | Unchanged (`competitorSiteGaps` still true) |

## 7. Decisions for Thomas

- **D1.** Keep "the brand isn't mentioned there" (a true gap, Ryan's heading; empty on 2 of 33) or list competitor
  sites regardless (empty on 1 of 33). Recommended: keep it.
- **D2.** "Executive Summary" in Ryan's casing (my earlier call, approved), editable per report.
- **D3 (review round 2, MAJOR 1).** The edge row "A COMPETITOR-classified site that mentions no kept competitor | Never
  counts" contradicts E2: a kept competitor's own homepage (roster domain) counts whatever its class or mentions, and
  `mentioned_brands` is often empty (`contracts.ts:76`). Proposed: reword the row to "off every kept competitor's roster
  domains", and test both (roster row with empty mentions counts; the same row off the roster never counts).
- **D4 (review round 2, MAJOR 2).** A competitor cut by `rankAmong` could still be listed through the class path (a
  COMPETITOR-classed comparison page that mentions a kept brand). (a) Add to E2 "and not a non-kept competitor's roster
  domain or subdomain", as own wins; (b) let such pages count. Recommended (a). `rankAmong` is null today (every
  competitor kept), so this only matters if the setting is used.

## 8. Deliberate parity changes and not touched

- A Glean field naming a listed competitor domain is no longer flagged `domain_not_in_data` (the domain is now in the
  Data block, `grounding.ts:131`), so it no longer asks for a retry (review round 1, M4). Accepted: the Data line says
  these are competitors' own sites; the pillars PR (#412) stops Glean writing opportunities altogether.
- A Rerun of an older draft is a new generation (`generate/route.ts:59-91`): it gets "Executive Summary" and the new list.
- The editor's field name for the label stays "Headline label" (`labels.ts:11`).

Not touched:

`PAGE_WORDS_V1`, the bullet wording, the page order and titles, the pillars, the charts, the toggle, AIVx files.

## 9. Minor findings carried to the plan (review round 1)

- m3: one competitor's subdomains can fill all four places (ynab.com, support.ynab.com, ...). Accepted for now; noted
  for Ryan.
- m4: own and competitor sharing a parent domain: own wins (E2). Roster `www.` is stripped on both sides (`bare`).
- m5: the Data line wording follows D1; if D1 lists sites regardless, it reads "(competitors' own sites, by answers that
  used them)".
- m6: §2's measurement came from a read-only scratch probe (session scratchpad `probe-r3/compgaps.mts`, last 90 days,
  retrieved chats above 0); it did not apply the `rankAmong` or kept-competitor tie of E2. With `rankAmong` null (the
  current setting) every roster competitor is kept.
- m8: a grounding test that a new row's Glean field naming a listed competitor domain is not flagged, and an older row's
  flags are unchanged.

## 10. Review round 2 (changed lines only): two MAJORs to Thomas (D3, D4), minors to the plan

- r2-3: a kept id with no roster row (from the brands report, `metrics.ts:141-142`, `:147`) has no roster domains and
  can only match by Peec's class; test a non-roster kept brand mentioned on a COMPETITOR row.
- r2-4: an older draft's Data block is re-read on every slot save (`slots/route.ts:80`, `:98`); the test that its flags
  are unchanged moves into §6's grounding row.
- r2-5: §8's mechanism: competitor domains are allowed because they are in `gapDomains` (`grounding.ts:131`), not
  because of the Data block.

