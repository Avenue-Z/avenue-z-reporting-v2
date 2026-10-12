# Code Review Record — `fix/export-glyph-fonts` (PR #339)

**Feature under review:** PR #339 — `fix(export): arrows and emoji print as boxes on Vercel; load fonts that cover them`
**Diff range reviewed:** `2cda36f..c986a33` (one commit, `c986a33`, on `dev` after #332/#333). No unrelated code.
**Reviewers:** Paul, Thomas.
**This document changes no code.**

| File | Change |
|---|---|
| `app/export/export-theme.css` | the export's `--font-sans` falls back to Noto Sans Math and Noto Color Emoji |
| `app/export/[clientSlug]/organic-social/page.tsx` | loads those two fonts (Google Fonts stylesheet, hoisted by React) |
| `lib/export/readiness.ts` | not ready while any web font is loading |
| `e2e/export/{acceptance.mts,pdf-check.ts}` | every font embedded in a PDF must be one the page loads (`fontsOf` via `pdffonts`) |
| tests | page loads the stylesheet; readiness waits on loading fonts; the reporter test's fake `document.fonts` gains `status` |

---

## §1 How it works

**What a client saw.** In a PDF exported on Vercel, every KPI delta read "▯ 13% vs prior period": the `↑` / `↓`
(`components/charts/kpi-card.tsx:76`, `metric-delta.tsx`) printed as the missing-glyph box. The same applied to
"View post ↗", the "Sorted by … ↓" line, `◫` (the carousel badge, `post-card.tsx`) and emoji in post captions.

**Why.** The page's font is Nunito Sans (`app/globals.css:1`, Google Fonts). Its latin subset lists U+2191/U+2193 in
`unicode-range`, but the font has no glyph for them, nor for `↗` (U+2197), `◫` (U+25EB) or any emoji. A desktop
Chrome falls back per character to a system font that has the glyph. The server's `@sparticuz/chromium` has one system
font, Open Sans, which has none of them, so Chromium draws `.notdef` (a box).

**The fix.** Under `.export-theme` only, `--font-sans` becomes
`'Nunito Sans', 'Noto Sans Math', 'Noto Color Emoji', sans-serif`. Tailwind's `font-sans` reads that variable, so
every element of the export inherits the stack. Chromium still uses Nunito for every character Nunito has; it
reaches the Noto fonts only for the missing ones. The export page links
`fonts.googleapis.com/css2?family=Noto+Sans+Math&family=Noto+Color+Emoji&display=block`. Both are served as
`unicode-range` pieces, so a PDF downloads only the pieces its characters need. Those pieces load lazily (when text
needing them is laid out), which can be after the reporter's one-time `document.fonts.ready` wait. So
`isDocumentReady` now also requires `document.fonts.status === 'loaded'` on every poll.

**What doesn't change.** The live report page (its fonts, its arrows in a desktop browser), the numbers, the layout
and page breaks. The arrow glyph shape changes slightly in the PDF: Noto Sans Math's arrow is thinner than Lucida
Grande's.

---

## §2 Verification method

- **Root cause, executed:**
  - `pdffonts` on the `565c45b` Vercel preview PDF (producer `Skia/PDF m153`): Nunito plus `OpenSans-Regular` only,
    and `pdftotext` shows no arrow characters before "12.1% vs prior".
  - `pdffonts` on a local export: Nunito plus `LucidaGrande-Bold`, `HiraginoSans-W3`, `Menlo-Bold` and
    `AppleColorEmoji`.
  - A throwaway puppeteer probe calling CDP `CSS.getPlatformFontsForNode` on a page using only Nunito Sans:
    `↑ ↓` → Lucida Grande, `↗` → Hiragino Sans, `◫` → Menlo, emoji → Apple Color Emoji (all system fonts).
    `— – · … ’ “` → Nunito (web).
- **Font choice, executed:** the same probe per candidate font. Noto Sans Math covers `↑ ↓ ↗ ◫`. Noto Sans Symbols
  misses `◫`, and Noto Sans Symbols 2 misses the arrows. Noto Color Emoji covers the emoji and keycaps.
- **Unit:** `npx vitest run` 2331/2331, `tsc` clean, lint 0 errors on changed files.
- **Acceptance, real Chrome:** `npm run e2e:export` on a production build (Node 26.7.0), with a new check that every
  embedded font matches `NunitoSans|NotoSansMath|NotoColorEmoji`. Renaissance (client) and A Place for Mom Instagram
  (staff and client) each embed only those three. Before the fix they embedded the four macOS fonts. All other
  checks still pass: blocks, box, links, staff = client, size 2.49 / 1.14 MB.
- **Visual:** the A Place for Mom KPI page rasterised (`pdftoppm`): arrows drawn.
- **Not verified (flagged):** an export on a Vercel deploy of this head. The acceptance check makes the PDF
  independent of system fonts, which is the Vercel difference, but the first deploy export is the confirmation.

---

## §3 Findings

Sev: **●** correctness · **○** cleanup/convention. Status: CONFIRMED (proven in-tree) · PLAUSIBLE (code confirmed,
external trigger unverified).

| # | Sev | Status | Location | Finding |
|---|-----|--------|----------|---------|
| 1 | ○ | CONFIRMED | `export-theme.css` (`--font-sans`) | The fallback fonts come from `fonts.gstatic.com` at render time, a new runtime dependency of the export (Nunito already was one). |
| 2 | ○ | PLAUSIBLE | `lib/export/readiness.ts` | If a font piece fails to load, `document.fonts` settles to `loaded` with the face errored: readiness doesn't hang, and the glyph prints as a box again. Silent; nothing logs it. |
| 3 | ○ | CONFIRMED | `e2e/export/acceptance.mts` | The new font check is local-only, like the rest of the acceptance script (no Chromium in CI). |

---

## §4 Detail

**#1 — Runtime font fetch.** The alternative is bundling font files, either into the page (self-hosted `@font-face`)
or into Chromium (`chromium.font()`). That removes the fetch but adds about 10 MB (Noto Color Emoji) to the function
or the repo. Google Fonts' `unicode-range` pieces keep a typical export to a few small downloads. *Suggested:* keep
as is. Revisit if exports run where Google Fonts is blocked.

**#2 — A failed font load.** `FontFaceSet.status` becomes `loaded` once no face is loading, whether each load
succeeded or failed. So a failure can't stall the export until the 40 s budget runs out; it degrades to today's box.
*Suggested:* accept. A log of failed faces (`document.fonts` entries with `status === 'error'`, reported by the ready
reporter) is possible if it ever recurs.

**#3 — Local-only check.** Same standing as the rest of `e2e:export` (record #332 §3 #8).

---

## §5 Follow-ups

**Needs a live call first**
- One signed-in Export PDF on #339's Vercel preview: the arrows and caption emoji render.

**Decide together**
- #2: whether a failed font load should be logged.

**Cleanup**
- None.
