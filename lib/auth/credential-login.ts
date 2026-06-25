import { isClientRole, normalizeEmail } from '@/lib/admin/access'

export interface AuthRecord {
  email: string
  role: string
  clientId: string
  slug: string
  sharedPasswordHash: string | null
}

interface Args {
  email: string
  password: string
  record: AuthRecord | null
  verify: (plain: string, hash: string) => Promise<boolean>
}

/**
 * Decide whether a credentials login succeeds. Pure: all I/O is injected.
 * Returns the NextAuth user object on success, or null on any failure.
 * Fails closed: no record, non-client role, missing shared password, or
 * mismatch all return null.
 */
export async function evaluateCredentialLogin(
  args: Args,
): Promise<{ id: string; email: string; name: string } | null> {
  const email = normalizeEmail(args.email ?? '')
  if (!email || !args.password) return null
  const { record } = args
  if (!record) return null
  if (!isClientRole(record.role)) return null          // internal users use Google
  if (!record.sharedPasswordHash) return null           // fail closed
  const ok = await args.verify(args.password, record.sharedPasswordHash)
  if (!ok) return null
  return { id: record.email, email: record.email, name: record.email.split('@')[0] }
}
