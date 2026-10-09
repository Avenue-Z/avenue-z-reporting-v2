# Code Review Record — `fix/technical-audit-client-copy` (PR #362)

**Feature under review:** PR #362, `fix(aeo): Technical Audit's empty states speak to clients, not to us`

**Diff range reviewed:** `1d73ee6..efca12d`, one commit on `dev`. No unrelated code.

**Reviewers:** Paul, Thomas.

**This document changes no code.**

| Area | Files |
|---|---|
| Copy | `components/report-sections/peec-ai/technical-audit.tsx` (7 empty states), `technical-audit-tables.tsx` (2 lines) |
| Tests | `components/report-sections/peec-ai/technical-audit.client-copy.test.tsx` (new) |

---

## §1 How it works

The AEO Technical Audit tab (`TechnicalAuditReport`, an async server component) loads its five sources in one `Promise.allSettled`:
- the Screaming Frog crawl CSVs (`getSFData`);
- Sitebulb's Historical Hint Data (`getSitebulbData`);
- Peec agent analytics (`getAgentAnalytics`);
- Peec URL citations;
- a GA4 path/source query.

A source that rejects is logged server-side (`[technical-audit] … error:`, unchanged). A source that is missing or rejected leaves its section on a `DataUnavailable` card.

**Before**, those cards and two table notes addressed whoever configures the client:

| Where | Text |
|---|---|
| `technical-audit.tsx:409` | "configure sfPrevCsvFileId in database" |
| `technical-audit.tsx:443` | names `PEEC_AI_CUSTOMER_TOKEN` and `PEEC_AI_CUSTOMER_PROJECT_ID_AVENUE_Z` |
| several cards | "…not configured for client", "…unavailable for client" |
| the delta table and fix list | "upload a prior crawl CSV" |

Clients read this tab, and since the server PDF export (#348/#350) it also prints in their PDFs.

**After**, each says what is missing in the client's terms:

| Card | Copy |
|---|---|
| no crawl (×3) | "Site crawl data isn't available yet." |
| one crawl | "Only one crawl so far. Changes over time appear after the next crawl." |
| no Peec analytics (×2) | "AI bot activity isn't available for this site yet." |
| overlap | "Needs both site crawl data and AI bot activity." |
| no Sitebulb sheet | "The AEO checklist isn't available for this site yet." |

The setup detail (which field, env var or sheet to configure) moves to a code comment beside each card, for whoever wires up a client.

**Kept:** the footer's data-source attribution (`technical-audit.tsx:519`, "Data sources: Screaming Frog CSV (Google Drive), Sitebulb Historical Hint Data (Google Sheets), Peec Agent Analytics"). That's sourcing, not setup: it answers "where does this come from?".

**Not added:** a staff-only variant. The component receives only `clientSlug` and `dateRange`, so it has no role to switch on.

---

## §2 Verification method

- **Unit, executed:** `technical-audit.client-copy.test.tsx` renders the real component with every source mocked empty, then with one crawl and no prior. It asserts:
  - no setup text (config keys, env vars, "for client", "upload a prior crawl", "Requires both");
  - the new client copy prints;
  - the footer attribution stays.

  Both cases failed before the change; the failure output showed every setup string in place.
- **Suite:** `npx vitest run` 2489/2489. `tsc` clean, `check:rsc` passes.
- **Lint:** the 4 `prefer-const` errors in `technical-audit.tsx` match `dev`.
- **Not run:** a live render with a client missing a source. The copy is static, and the test renders the real component.

---

## §3 Findings

**Sev:** **●** correctness · **○** cleanup/convention.
**Status:** CONFIRMED (proven in-tree) · PLAUSIBLE (code confirmed, external trigger unverified).

| # | Sev | Status | Location | Finding |
|---|-----|--------|----------|---------|
| 1 | ● | CONFIRMED | `technical-audit.tsx:409`, `:443` (before) | Internal config text (a DB field, env var names) shown to clients and printed in their PDFs. **Fixed by this PR.** |
| 2 | ○ | CONFIRMED | `technical-audit.tsx:519` | The kept footer still names internal storage ("Google Drive", "Google Sheets"). This is sourcing, deliberately kept; trim it if we'd rather not. |
| 3 | ○ | PLAUSIBLE | `technical-audit.tsx`, `technical-audit-tables.tsx` | #350 adds export attributes on nearby lines of both files. Whichever PR merges second has a small conflict to resolve. |
| 4 | ○ | CONFIRMED | `DataUnavailable` | "Site crawl data isn't available yet." now covers both "not configured" and "the fetch failed". The failure stays visible in the server log (`[technical-audit] SF data error`), not on the page. |

---

## §4 Detail

**#4: One message, two causes.** Before, "not configured for client" and "data unavailable" hinted at which one it was, but only to someone who knew the setup. A client can act on neither. Staff can still tell them apart from the server log, which records every rejected source with its reason (unchanged).

---

## §5 Follow-ups

**Decide together**
- #2: keep or trim the storage names in the footer's attribution.

**Merge order**
- #3: independent of the PDF export stack. Resolve the nearby-line conflict with #350 at the second merge.

Nothing here blocks the ship.
