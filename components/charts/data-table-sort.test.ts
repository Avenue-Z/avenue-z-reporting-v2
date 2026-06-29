// Run: npx tsx components/charts/data-table-sort.test.ts
import { strict as assert } from 'node:assert'

// data-table may transitively import a server action → lib/db/client, which throws at
// module init without DATABASE_URL. Set a placeholder first, then dynamic-import
// inside the async IIFE.
process.env.DATABASE_URL ??= 'postgresql://user:password@host.tld/dbname'

;(async () => {
  const { sortRows, columnSortAccessor } = await import('./data-table')

  const rows = [{ c: 1 }, { c: 3 }, { c: 2 }] as unknown as Record<string, React.ReactNode>[]
  assert.deepEqual(sortRows(rows, 'c', 'desc', (r) => Number(r.c)).map((r) => r.c), [3, 2, 1])
  assert.deepEqual(sortRows(rows, 'c', 'asc', (r) => Number(r.c)).map((r) => r.c), [1, 2, 3])

  // columnSortAccessor: declarative numeric sort by a hidden field; missing/non-number → -Infinity
  {
    const acc = columnSortAccessor({ key: '__value__', label: 'Value', sortable: true, sortKey: '__value__sort', sortType: 'number' })!
    assert.equal(acc({ __value__sort: 42 } as Record<string, React.ReactNode>), 42)
    assert.equal(acc({} as Record<string, React.ReactNode>), -Infinity)
  }
  // columnSortAccessor: declarative string sort by the column's own key
  {
    const acc = columnSortAccessor({ key: 'Channel', label: 'Channel', sortable: true, sortType: 'string' })!
    assert.equal(acc({ Channel: 'Meta' } as Record<string, React.ReactNode>), 'Meta')
    assert.equal(acc({} as Record<string, React.ReactNode>), '')
  }
  // columnSortAccessor: an explicit function still wins (client callers)
  {
    const acc = columnSortAccessor({ key: 'x', label: 'x', sortable: true, sortValue: () => 7 })!
    assert.equal(acc({} as Record<string, React.ReactNode>), 7)
  }
  // columnSortAccessor: no sort declared → undefined (not sortable)
  assert.equal(columnSortAccessor({ key: 'x', label: 'x' }), undefined)

  console.log('ok')
})()

