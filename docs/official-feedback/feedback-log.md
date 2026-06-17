# Official Feedback Log

Source of truth for all feedback on this branch. Every item gets an ID and stays here until `done` or `wontfix`.

**Statuses:** `new` → `triaged` → `needs-clarification` → `in-progress` → `done` / `wontfix`

**Rule:** New issues discovered while fixing another item get their own ID. No silent scope creep.

---

## Active

_(none)_

---

## Closed

### FB-001 — Consistent header treatment across all 4 AEO tabs

- **Status:** done
- **Source:** Google doc feedback from Tina (relayed by Thomas), with screenshot of the Content Impact header
- **Author:** Tina
- **Type:** design + copy
- **Scope:** Answer Engine Optimization section only (4 tabs: Overview, PR Influence, Content Impact, Technical Performance). Universal across every current and future client.

#### Verbatim ask

> I would like to have a consistent header across all the tabs and I REALLY like the style of the Content one. Can we basically copy/paste this across each of the 4 tabs and then just change out the icon / copy to be tailored to the purpose of each tab?

#### What was unambiguous

1. Use the Content Impact header as the reference visual treatment (green rounded-square icon container + bold question h2 + smaller gray subtitle).
2. Apply this same treatment to all 4 AEO tabs.
3. Each tab gets its own icon and its own copy "tailored to the purpose" of that tab.
4. Content Impact itself is the reference and stays as-is.

#### What was inferred (explicit interpretation choices)

| Decision | What I chose | Why |
|---|---|---|
| **Architecture: one shared component vs four copy-pasted blocks** | One shared component `section-header.tsx` | Tina said "consistent." A shared component enforces consistency mechanically and makes future header tweaks a one-file edit. The alternative (literal copy-paste into four files) would invite drift the moment anyone edits one. |
| **Color across all four tabs** | Green `#60FF80` everywhere | Tina said "consistent" + "style of the Content one" (which is green), and only called out icon and copy as the things that change per tab. She did not call out color. Strict literal read: same color. |
| **Technical Performance color flip** | Yellow `#FFFC60` → green `#60FF80` | Direct consequence of the universal-green decision above. Pre-existing yellow was overridden to match Tina's consistency directive. |
| **Overview icon** | `Sparkles` (lucide) | Tina did not specify. Sparkles is the AI/answer-engine themed icon in the lucide set; matches the page's role as the top-level AEO visibility view. |
| **Overview question copy** | "How visible is the brand across AI answer engines?" | Tina did not provide copy. Drafted to mirror Content Impact's voice (short question form). Reflects what the Overview page actually shows: visibility, share of voice, sentiment, competitor comparison. |
| **Overview subtitle copy** | "Visibility, share of voice, and sentiment across tracked LLMs, with side-by-side comparison to competitors." | Tina did not provide copy. Drafted by listing the actual metrics rendered on the page. |
| **PR Influence icon** | `Megaphone` (lucide) | Tina did not specify. Megaphone is the canonical PR icon in the lucide set. |
| **PR Influence question copy** | "How is AI-driven PR coverage performing?" | Lifted verbatim from a smaller `h3` already in the file (above the KPI section). Promoted to the header h2 to reuse existing approved language and minimize copy-interpretation risk. |
| **PR Influence subtitle copy** | "Where earned media earns LLM citations, which publications carry the most AI authority, and the opportunities to grow share of voice." | Tina did not provide copy. Drafted to mirror Content Impact's voice. |
| **Overview's existing "ANSWER ENGINE OPTIMIZATION" eyebrow + big "Overview" h2** | Removed entirely | None of the other three tabs has this eyebrow + big title pattern. Keeping it would make Overview inconsistent with Tina's "consistent across all tabs" ask. The top dark band of the page (`StickyReportHeader`) already shows "ANSWER ENGINE OPTIMIZATION" as the page title for the Overview subsection, so removing this block does not lose context. |
| **Technical Performance subtitle em-dash** | Replaced em-dash with a period | The user specified "no AI-looking punctuation like em-dashes" as a working rule going forward. Since the subtitle was being edited anyway (via the header swap), the em-dash was scrubbed at the same time. Content preserved otherwise. |

#### What was explicitly out of scope

- The top dark band (Avenue Z logo + page title + date/model filters) was already shared across all 4 tabs via `StickyReportHeader`. Not touched.
- Em-dashes elsewhere in the AEO codebase (tooltips, comments, table headers, the PR Influence demo-mode badge note string, etc.) were left untouched. Scrubbing them all would be a separate cleanup item.
- No per-client conditional logic was added. The change is structural and universal by construction.
- No changes to the Profound vs Peec provider branching logic in `index.tsx`. The header sits above that branch.

#### Files touched

| File | Change |
|---|---|
| `components/report-sections/peec-ai/section-header.tsx` | **New**. Shared component. Props: `icon`, `title`, `subtitle`, optional `badge`. Color hard-coded green. |
| `components/report-sections/peec-ai/content-impact.tsx` | Replaced the inline header markup with `<SectionHeader />`. Visual output unchanged. |
| `components/report-sections/peec-ai/technical-audit.tsx` | Replaced inline header with `<SectionHeader />`. Icon color shifted yellow to green. Subtitle em-dash replaced with period. |
| `components/report-sections/peec-ai/pr-influence.tsx` | Added `<SectionHeader />` at top of return. Imported `Megaphone` from lucide. |
| `components/report-sections/peec-ai/index.tsx` (Overview) | Removed the eyebrow + h2 block. Replaced with `<SectionHeader />`. Imported `Sparkles` from lucide. |

#### Scope of impact

- Every current AEO client (Avenue Z, Shopify, etc.) sees the new headers automatically. No DB change, no per-client config, no backfill.
- Every future AEO client added to the system gets the new headers automatically. No onboarding step.
- Renders in both the internal dashboard (`/dashboard/[clientSlug]/reports?section=peec-ai...`) and the client portal (`/portal/[clientSlug]/reports/peec-ai...`).

#### Verification

- TypeScript compilation: clean.
- Visual: Content Impact header is byte-identical to before (markup extracted into component, no style changes). Technical Performance, PR Influence, Overview now show the same green icon + question + subtitle treatment.
- Demo-mode badges preserved per tab: Tech and Overview use the inline-with-h2 slot; Content and PR Influence use their pre-existing separate-row signaling unchanged.

#### Open risks (where Tina is most likely to push back, in order)

1. **The Overview question/subtitle copy is my draft, not Tina's words.** If she has specific copy in mind, this is the highest-probability edit.
2. **The Sparkles icon for Overview** was my pick. If Tina prefers a different icon (e.g., Eye, BarChart3, Compass), trivial to swap one prop.
3. **The yellow-to-green color flip on Technical Performance** is the one place existing code was overwritten. If the yellow was a deliberate design decision, swap back by editing one constant in `section-header.tsx` (or pass color as a prop).
4. **The Megaphone icon for PR Influence** was my pick. Trivial swap if Tina wants Newspaper, Radio, or something else.
