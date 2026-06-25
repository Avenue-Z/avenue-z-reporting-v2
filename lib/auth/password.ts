import bcrypt from 'bcryptjs'

const SALT_ROUNDS = 12

/** Hash a plaintext shared password for storage in clients.shared_password_hash. */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS)
}

/** Constant-time compare. Returns false for an empty/missing hash (fail closed). */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!hash) return false
  return bcrypt.compare(plain, hash)
}
