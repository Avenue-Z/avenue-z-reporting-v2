# Code Review Record — `fix/export-acceptance-order-insensitive` (PR #356)

**Feature under review:** PR #356, `test(export): staff = client PDF check compares reading order by position, not extraction order`

**Diff range reviewed:** `e659cfb..b4660cb`, one commit on `dev`. No unrelated code.

**Reviewers:** Paul, Thomas.

**This document changes no code.**

| Area | Files |
|---|---|
| Comparison | `e2e/export/pdf-check.ts` (`printedContent`) |
| Call site | `e2e/export/acceptance.mts:133` (`body`) |
| Tests | `e2e/export/pdf-check.test.ts` (new), pinned in `vitest.config.ts` |

The PR is test infrastructure only. No app code changes.

---

## §1 How it works

**What the check is for.** The export acceptance run exports the same report twice: once as a staff editor, once as a client. It asserts the two PDFs print the same, so nothing staff-only (editors, drafts, buttons) reaches a staff export. It is a local check: poppler's `pdftotext -bbox-layout` gives every word with its page and box.

**Before.** `body()` joined the words in pdftotext's **extraction order**, without spaces. It stripped everything up to the stamp's time and appended each page's first-word height. The extraction order is pdftotext's reading heuristic, not the layout. Two renders of the same layout, differing by sub-pixel placement, can be read in different orders. On AEO Technical Audit, a wrapped table header ("REDIRECTED / LOW-VALUE ENDPOINT / STRATEGIC PAGE") came out in a different order, so the check failed with identical words.

**After.** `printedContent(pdf)` returns, per page, where it starts and its lines (since round 1, §6; at `b4660cb` it was one string per page):
1. **Lines by height.** The page's words, sorted by height, then by left edge, are grouped into lines. A word joins the current line when its top is within 2 pt of the line's first word (`:62`). Sub-pixel placement moves words about 0.07 pt; real lines are about 9 pt or more apart.
2. **Reading order.** Lines read top to bottom, and words in a line left to right, joined without spaces. Spaces are dropped as before, because letter-spaced titles split into words differently ("TECHNI CAL" / "TECHNICAL").
3. **Stamp time.** Only page 1's stamp time is dropped, because the two exports run a minute apart. The old strip ran through the timezone, so the reporting period after it was already compared; what's newly compared is the stamp's date, and the client name and page title in the header.
4. **Page start.** The page's start (its first word's height) is kept, so a moved page break is a difference. Since round 1 it matches within the 2 pt line tolerance, not rounded.

**Still caught:** any changed, missing or extra word; two rows in a different order; a moved page break; a different reporting period.

**Why not sort characters, as first suggested?** Sorting would make the check blind to two rows swapping order between the staff and client exports. Geometric order fixes the flake without that loss.

---

## §2 Verification method

- **Unit, executed:**
  - `e2e/export/pdf-check.test.ts` has 8 cases: read order, split title, sub-pixel jitter, stamp time vs date, changed number, extra word, swapped rows, moved page start.
  - A probe ran today's `body()` logic against them. It failed the read-order case, which reproduces the flake. It also failed the stamp-date case, because the old logic never compared the date.
  - The new implementation passes all 8.
- **Real PDFs, executed.** I re-compared every staff/client pair from four of today's acceptance runs under both the old and the new comparison:
  - **The read-order flake** (`aeo-avenue-z-technical-audit`, run `mEQHQ7`): old says different, new says **same**.
  - **The real difference** (`aeo-avenue-z-technical-audit`, run `FqLJhl`): staff got a cached audit, the client a fresh one, 274 vs 275 pages. Old says different, and new **still says different**.
  - **All other pairs** (Organic Social, AEO, Paid Media, Executive Overview; 40+): same under both.
- **Suite:** `npx vitest run` 2470/2470. `tsc` clean, `check:rsc` passes, lint clean.

**Not run:** a full live acceptance run on this branch. `dev` doesn't yet have the AEO, Paid Media or Executive Overview runs (#350, #352, #354). The comparison was instead run directly on their PDFs.

---

## §3 Findings

**Sev:** **●** correctness · **○** cleanup/convention.
**Status:** CONFIRMED (proven in-tree) · PLAUSIBLE (code assumption confirmed, external trigger unverified).

| # | Sev | Status | Location | Finding |
|---|-----|--------|----------|---------|
| 1 | ● | CONFIRMED | `acceptance.mts:133` (before) | The staff = client check compared extraction order, so identical PDFs could fail. **Fixed by this PR.** |
| 2 | ○ | PLAUSIBLE | `pdf-check.ts:62` | A word whose top sits almost exactly 2 pt below its line's first word could cluster differently on two renders, for example a small label beside a large KPI number. Not seen in 40+ pairs. |
| 3 | ○ | PLAUSIBLE | `pdf-check.ts:66` | The stamp's date is now compared, so a staff export at 11:59 PM and a client export at 12:00 AM would differ. This is intentional, since the date and period are content, and rare. |
| 4 | ○ | CONFIRMED | `pdf-check.ts:67` | The page start rounds to a whole point (unchanged from before). A start at x.5 could round differently on two renders. Not seen. **Fixed** `89ca070` (§6 R1). |
| 5 | ○ | CONFIRMED | `pdf-check.test.ts` | The tests didn't pin the line grouping: with the tolerance at `< 10` or `< 1000`, or the anchor at `line.at(-1)`, all 8 passed (Thomas ran each). | **Fixed** `89ca070` (§6 R2). |

---

## §4 Detail

**#1: Extraction order.** pdftotext's `-bbox-layout` emits words in its own reading order: blocks, then lines, then words. With multi-line table header cells, which line of which cell comes first depends on sub-pixel heights. The new key depends only on positions, grouped by the 2 pt line tolerance, so two renders of the same layout produce the same key, except within about 0.1 pt of a 2 pt line boundary (#2). The half-point page-start exception (#4) is gone since round 1.

**#2: Line tolerance.** The cluster is anchored on the line's first word, so heights can't drift along a chain of words. *Suggested only if it is ever seen:* group by vertical overlap (`yMin < line.yMax`) instead of a fixed tolerance.

**#3: Stamp date.** *Suggested only if it ever bites:* drop the whole `Exported … (AM|PM) TZ` span and keep the period, which follows it.

---

## §5 Follow-ups

**Cleanup (none block the ship):**
- #2: overlap-based grouping, if a mis-clustered line is ever seen.
- #3: a narrower stamp strip, if a run ever straddles midnight.

**Merge order:** independent of the open PDF export PRs (#348, #350, #352, #354). None of them touch these lines, and their staff = client checks use the same `body()`, so they pick this up.

---

## §6 Review round 1 (Thomas): resolutions

Thomas approved with nits, and two record corrections. All are resolved on the branch (`b4660cb..b142b05`):

| # | Where | Finding | Resolution |
|---|---|---|---|
| R1 | `pdf-check.ts:67` | The page start rounded with no tolerance, so 0.07 pt of jitter at x.5 still flaked. | **Fixed** `89ca070`: `printedContent` returns `{ start, lines }` per page, and starts match within the 2 pt tolerance. Test: 60.46 vs 60.53. |
| R2 | `pdf-check.ts:62` | The grouping wasn't pinned by any test. | **Fixed** `89ca070`: a word moved to the next line is a difference; >2 pt is a new line; 0/1.9/3.8 make two lines. Re-ran Thomas's three mutations: each now fails 1–5 tests. |
| R3 | `pdf-check.ts:66` | The time strip ran on every page. | **Fixed** `89ca070`: page 1 only, and a test shows a time on page 2 is compared. |
| R4 | `acceptance.mts:133` | A failure said FAIL with no page or line. | **Fixed** `89ca070`: `printedDifference()` names the first differing page and line, and the check's message carries it. On today's real cache-refresh pair it read `page 2, line 10: "358274181177" vs "358275181177"`. |
| R5 | `pdf-check.ts:8` (pre-existing) | A negative coordinate parsed as `NaN`. | **Fixed** `89ca070`: signed parse, via an extracted, tested `parseBbox()`. |
| R6 | `pdf-check.ts` (found during the fixes) | pdftotext's `&apos;` wasn't decoded, so every check for text with an apostrophe silently never matched. | **Fixed** `b142b05`, tested. |
| R7 | record lines 30, 71 | The period was already compared; "same key" was absolute. | Corrected in §1 and §4. |

**Verification:**
- `npx vitest run`: 2476/2476, with 15 `pdf-check` tests. Lint is clean.
- **Real PDF pairs:** the read-order flake compares equal, the real cache-refresh difference still fails, and every other pair matches.

**Merge note:** the stacked export PRs (#350, #352, #354) each add a staff = client check using the old `body()` string. When they meet this on `dev`, those lines move to `sameExport()`.

