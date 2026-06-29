import { NextResponse } from 'next/server'

// TEMPORARY diagnostic for the preview test-admin login. Reports whether this
// deployment actually received TEST_ADMIN_* env vars — masked, no secret values.
// Disabled on production. DELETE this route once the login is confirmed working.
export async function GET() {
  if (process.env.VERCEL_ENV === 'production') {
    return new NextResponse('Not found', { status: 404 })
  }

  const email = process.env.TEST_ADMIN_EMAIL
  const password = process.env.TEST_ADMIN_PASSWORD

  const maskEmail = (v?: string) => {
    if (!v) return null
    const at = v.indexOf('@')
    return at > 1 ? `${v.slice(0, 2)}***${v.slice(at)}` : '***'
  }

  return NextResponse.json({
    vercelEnv: process.env.VERCEL_ENV ?? '(unset)',
    gateAllowsLogin: process.env.VERCEL_ENV !== 'production',
    hasTestAdminEmail: !!email,
    testAdminEmailMasked: maskEmail(email),
    hasTestAdminPassword: !!password,
    passwordLength: password?.length ?? 0,
    passwordHasSurroundingWhitespace: password ? password !== password.trim() : false,
    passwordLooksQuoted: password ? /^["'].*["']$/.test(password) : false,
  })
}
