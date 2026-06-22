// Run: npx tsx components/charts/data-table-sort.test.ts
import { strict as assert } from 'node:assert'
import { sortRows } from './data-table'

type Row = Record<string, React.ReactNode>
const rows = [{ c: 1 }, { c: 3 }, { c: 2 }] as Row[]
// Default: sort by the column key itself.
assert.deepEqual(sortRows(rows, 'c', 'desc').map((r) => r.c), [3, 2, 1])
assert.deepEqual(sortRows(rows, 'c', 'asc').map((r) => r.c), [1, 2, 3])

// sortKey: a formatted column sorts by its raw numeric shadow field.
const rows2 = [{ x: '$1', _x: 1 }, { x: '$3', _x: 3 }, { x: '$2', _x: 2 }] as Row[]
assert.deepEqual(sortRows(rows2, 'x', 'desc', '_x').map((r) => r.x), ['$3', '$2', '$1'])
console.log('ok')
