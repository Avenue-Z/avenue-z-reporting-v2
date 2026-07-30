import { expect, test } from 'vitest'
import { gridColsBase, gridColsMd } from './platform-headlines'

function cols(cls: string): number {
  return Number(cls.match(/(\d+)$/)![1])
}

// "Orphan" = a last row with exactly 1 card while earlier rows are full — the layout defect
// gridCols(n) exists to avoid (PR #174 review: the pre-fix fallback regressed at n%4===1,
// e.g. 13, 17). n <= c is always safe (single, non-full row, not an orphan).
function isOrphan(n: number, c: number): boolean {
  return n > c && n % c === 1
}

// n<=5 is a fixed special case in both helpers (Overview's exact, unchanging KPI count) and
// intentionally isn't tuned for orphan-avoidance below that floor; the sweep starts where
// platform subpages actually live (n>5, per the reviewed 9/10/11 counts) through headroom for
// future KPI growth.
test('gridColsMd never orphans the last row for n=6..25', () => {
  for (let n = 6; n <= 25; n++) {
    const c = cols(gridColsMd(n))
    expect(isOrphan(n, c), `n=${n} -> md:grid-cols-${c}`).toBe(false)
  }
})

test('gridColsBase never orphans the last row for n=6..25', () => {
  for (let n = 6; n <= 25; n++) {
    const c = cols(gridColsBase(n))
    expect(isOrphan(n, c), `n=${n} -> grid-cols-${c}`).toBe(false)
  }
})

// Pins today's four live counts (Overview 5, Facebook 9, LinkedIn/X 10, Instagram 11) to their
// intentional designed layout, not just "whatever avoids an orphan" — the fallback added for
// unseen counts must not disturb these.
test.each([
  [5, 'md:grid-cols-5'],
  [9, 'md:grid-cols-3'],
  [10, 'md:grid-cols-5'],
  [11, 'md:grid-cols-4'],
])('gridColsMd(%i) === %s', (n, expected) => {
  expect(gridColsMd(n)).toBe(expected)
})
