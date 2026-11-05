# Review log: AEO Outbound chart fixes spec (2026-10-21)

Spec: `2026-10-21-aeo-outbound-charts-design.md`. Two rounds, per the lean regimen. Reviewers were fresh subagents
given only the goal and the spec.

## Round 1 (whole spec, `7f0d0882`)

5 MAJOR, 9 MINOR. Every code citation checked out. MAJORs fixed in `e69c9294`: C5's algorithm defined (M1), the
figure the fallback redraws (M2), a loop guard (M3), a debounced resize (M4), D3 for custom-name projects (M5).
MINORs carried to §8a of the spec.

## Round 2 (changed lines only, `e69c9294`)

3 MAJOR, 5 MINOR. Not fixed: a MAJOR in round 2 comes to me as a decision.

- **F1 MAJOR.** `draw()` (`render.ts:156`) returns nothing, so "after the draw resolves" needs `draw(d,l,after)`:
  `p.then(after,restore)` on one chain when `p` is thenable, `after()` synchronously when not, `restore()` only on a
  throw. The fallback and `restore()` pass no callback. Test: a rejected `apply()` draw gives one `restore()`, no
  check, no unhandled rejection.
- **F2 MAJOR.** The init check must not run on a phone before `apply(true)`, or a narrow phone falls back twice.
  Fix: `if(!window.matchMedia){check();return}` and `if(mq.matches)apply(true);else check()`.
- **F3 MAJOR.** `cur = orig` right after `orig` is set in `init()`; `apply()` sets `cur` and clears `fallen` only just
  before its `draw`, never on its early returns; the whole check is wrapped in `try{}catch(e){}` so it can never stop
  `bottomRule()` (`render.ts:162`).
- F4 MINOR: every check records `w = el.clientWidth`; tests stub `clientWidth`.
- F5 MINOR: the resize retry redraws only when `fallen`, else only checks; it sets `restored=false` first.
- F6 MINOR: `fonts.ready` and `resize` registrations sit in `init()` after the first guard; test both, and their
  absence.
- F7 MINOR: round `left` values before finding column starts.
- F8 MINOR: the D3 wrap-trial numbers need a findings note.
