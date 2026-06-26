/**
 * DEV/TEST HELPER — set a TEST shared password on a client and provision an
 * external admin (and optionally a viewer) so the client-login + Team flow can
 * be tested locally WITHOUT first logging into the internal dashboard.
 *
 *   npx tsx --env-file=.env.local scripts/dev-set-client-access.ts \
 *     <clientSlug> <sharedPassword> <adminEmail> [viewerEmail]
 *
 * This sets a TEST password only. The real shared password for production is
 * still unset by design and is chosen by Avenue Z via the dashboard UI
 * (/dashboard/<clientSlug>/access).
 */
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { clients, users } from '@/lib/db/schema'
import { hashPassword } from '@/lib/auth/password'

async function main() {
  const [slug, password, adminEmail, viewerEmail] = process.argv.slice(2)
  if (!slug || !password || !adminEmail) {
    console.error('Usage: tsx scripts/dev-set-client-access.ts <clientSlug> <sharedPassword> <adminEmail> [viewerEmail]')
    process.exit(1)
  }

  const client = await db.query.clients.findFirst({ where: eq(clients.slug, slug) })
  if (!client) {
    console.error(`No client found with slug "${slug}". Run \`npm run db:seed\` or check existing slugs.`)
    process.exit(1)
  }

  await db.update(clients)
    .set({ sharedPasswordHash: await hashPassword(password), updatedAt: new Date() })
    .where(eq(clients.id, client.id))

  const seats: ReadonlyArray<readonly [string, 'CLIENT_ADMIN' | 'CLIENT_VIEWER']> = [
    [adminEmail, 'CLIENT_ADMIN'],
    ...(viewerEmail ? ([[viewerEmail, 'CLIENT_VIEWER']] as const) : []),
  ]
  for (const [email, role] of seats) {
    await db.insert(users)
      .values({ email: email.toLowerCase(), role, clientId: client.id })
      .onConflictDoUpdate({ target: users.email, set: { role, clientId: client.id } })
  }

  console.log(`\n✅ Set a TEST shared password on "${client.name}" (${slug}).`)
  console.log(`Log in at /login with one of these emails + the password you passed:`)
  console.log(`   external admin (Team page):  ${adminEmail.toLowerCase()}`)
  if (viewerEmail) console.log(`   viewer:                      ${viewerEmail.toLowerCase()}`)
  console.log(`\n⚠️  TEST password only — the real production shared password is still`)
  console.log(`   unset and is chosen by Avenue Z in /dashboard/${slug}/access.`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
