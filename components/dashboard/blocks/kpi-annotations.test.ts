// components/dashboard/blocks/kpi-annotations.test.ts
// Run: npx tsx components/dashboard/blocks/kpi-annotations.test.ts
import { strict as assert } from 'node:assert'
import { kpiAnnotationColor } from './kpi-annotations'

// No target, no ceiling → null.
assert.equal(kpiAnnotationColor(100), null)

// Value ≥ ceiling → 'ceiling' (ceiling wins, even if target is also met).
assert.equal(kpiAnnotationColor(300, 250, 280), 'ceiling')
assert.equal(kpiAnnotationColor(280, 250, 280), 'ceiling', 'boundary: ≥ ceiling')

// Value ≥ target and < ceiling → 'target'.
assert.equal(kpiAnnotationColor(260, 250, 280), 'target')
assert.equal(kpiAnnotationColor(250, 250, 280), 'target', 'boundary: ≥ target')

// Value < target → null.
assert.equal(kpiAnnotationColor(240, 250, 280), null)

// Target only (no ceiling): still works.
assert.equal(kpiAnnotationColor(300, 250), 'target')
assert.equal(kpiAnnotationColor(200, 250), null)

// Ceiling only (no target): only 'ceiling' or null possible.
assert.equal(kpiAnnotationColor(300, undefined, 280), 'ceiling')
assert.equal(kpiAnnotationColor(200, undefined, 280), null)

// Non-finite value → null (defensive; resolver shouldn't deliver NaN but be safe).
assert.equal(kpiAnnotationColor(Number.NaN, 250, 280), null)

console.log('ok')
