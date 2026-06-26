// components/dashboard/block-grid-defaults.test.ts
// Run: npx tsx components/dashboard/block-grid-defaults.test.ts
import { strict as assert } from 'node:assert'
import type { BlockKind } from '@/lib/dashboard/types'
import { DEFAULT_LAYOUT, GRID_COLS_LG } from './block-grid-defaults'

const ALL_KINDS: BlockKind[] = ['kpi', 'bar', 'line', 'table', 'narrative', 'header']

// Every BlockKind has an entry.
for (const k of ALL_KINDS) {
  const entry = DEFAULT_LAYOUT[k]
  assert.ok(entry, `DEFAULT_LAYOUT missing entry for kind '${k}'`)
}

// w/h/minW/minH are positive integers; w ≤ GRID_COLS_LG; minW ≤ w; minH ≤ h.
for (const k of ALL_KINDS) {
  const { w, h, minW, minH } = DEFAULT_LAYOUT[k]
  assert.ok(Number.isInteger(w) && w > 0, `${k}.w must be positive integer`)
  assert.ok(Number.isInteger(h) && h > 0, `${k}.h must be positive integer`)
  assert.ok(Number.isInteger(minW) && minW > 0, `${k}.minW must be positive integer`)
  assert.ok(Number.isInteger(minH) && minH > 0, `${k}.minH must be positive integer`)
  assert.ok(w <= GRID_COLS_LG, `${k}.w (${w}) must fit the ${GRID_COLS_LG}-col grid`)
  assert.ok(minW <= w, `${k}.minW must be ≤ w`)
  assert.ok(minH <= h, `${k}.minH must be ≤ h`)
}

console.log('ok')
