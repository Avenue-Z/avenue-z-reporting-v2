import { expect, test } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import { CLIENT_ROLES } from '@/lib/admin/access'
import { addClientUserStatement, seatCountQuery } from './admin-queries'

// A seat is a client login. Staff rows attached to a client (an internal admin or analyst with a
// client_id) are not seats: both screens already count client roles only (getClientAccessOverview,
// admin-queries.ts, which feeds access-panel.tsx "currently X/N used" and team-panel.tsx
// "N of M seats remaining"). The server checks counted every row, so a client with staff attached
// was refused invites its own screen said it had room for. Built offline: `.toSQL()` and
// `sqlToQuery` need no connection.

const clientId = 'c7d8e0a1-1111-4111-8111-111111111111'
const dialect = new PgDialect()

test('lowering the seat limit compares against client logins only', () => {
  const q = seatCountQuery(clientId).toSQL()
  const where = q.sql.slice(q.sql.indexOf(' where '))
  expect(where).toContain('"users"."client_id" = $')
  expect(where).toMatch(/"users"\."role" in \(\$\d+, \$\d+\)/)
  expect(q.params).toContain(clientId)
  expect(q.params.filter((p) => p !== clientId)).toEqual([...CLIENT_ROLES])
})

test('adding a user checks the cap against client logins only', () => {
  const q = dialect.sqlToQuery(addClientUserStatement({ clientId, email: 'a@b.co', role: 'CLIENT_VIEWER' }))
  const cap = q.sql.slice(q.sql.indexOf('WHERE'))
  // The seat subquery filters by client AND by role, and compares with max_seats.
  expect(cap).toMatch(/SELECT count\(\*\) FROM users WHERE \("users"\."client_id" = \$\d+ and "users"\."role" in \(\$\d+, \$\d+\)\)\)\s*<\s*\(SELECT max_seats FROM clients/)
  const roleParams = [...cap.matchAll(/\$(\d+)/g)].map((m) => q.params[Number(m[1]) - 1]).filter((p) => p !== clientId)
  expect(roleParams).toEqual([...CLIENT_ROLES])
})

test('no staff role is ever counted as a seat', () => {
  const staff = ['INTERNAL_ADMIN', 'INTERNAL_ANALYST']
  const count = seatCountQuery(clientId).toSQL()
  const insert = dialect.sqlToQuery(addClientUserStatement({ clientId, email: 'a@b.co', role: 'CLIENT_ADMIN' }))
  for (const role of staff) {
    expect(count.params).not.toContain(role)
    expect(insert.params).not.toContain(role)
  }
})

test('the inserted row keeps the email lowercased and the requested role', () => {
  const q = dialect.sqlToQuery(addClientUserStatement({ clientId, email: 'Jane.Doe@Client.COM', role: 'CLIENT_ADMIN' }))
  expect(q.sql).toMatch(/^\s*INSERT INTO users \(email, role, client_id\)/)
  expect(q.params.slice(0, 3)).toEqual(['jane.doe@client.com', 'CLIENT_ADMIN', clientId])
  expect(q.sql).toContain('RETURNING id')
})
