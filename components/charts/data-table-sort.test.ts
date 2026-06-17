// Run: npx tsx components/charts/data-table-sort.test.ts
import { strict as assert } from 'node:assert'
import { sortRows } from './data-table'

const rows = [{ c: 1 }, { c: 3 }, { c: 2 }] as unknown as Record<string, React.ReactNode>[]
assert.deepEqual(sortRows(rows, 'c', 'desc', (r) => Number(r.c)).map((r) => r.c), [3, 2, 1])
assert.deepEqual(sortRows(rows, 'c', 'asc', (r) => Number(r.c)).map((r) => r.c), [1, 2, 3])
console.log('ok')
