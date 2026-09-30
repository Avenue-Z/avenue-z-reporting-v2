import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import Credentials from 'next-auth/providers/credentials'
import { getClientByEmail, getUserAuthRecord } from '@/lib/db/queries'
import { jwtCallback } from '@/lib/auth/jwt-callback'
import { evaluateCredentialLogin } from '@/lib/auth/credential-login'
import { evaluateTestAdminLogin } from '@/lib/auth/test-admin'
import { verifyPassword } from '@/lib/auth/password'

const WORKSPACE_DOMAIN = 'avenuez.com'

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      authorization: {
        params: {
          hd: WORKSPACE_DOMAIN,
          prompt: 'select_account',
        },
      },
    }),
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const email = credentials?.email as string | undefined
        const password = credentials?.password as string | undefined
        if (!email || !password) return null
        const testAdmin = evaluateTestAdminLogin(
          { email, password },
          {
            email: process.env.TEST_ADMIN_EMAIL,
            password: process.env.TEST_ADMIN_PASSWORD,
            vercelEnv: process.env.VERCEL_ENV,
          },
        )
        if (testAdmin) return testAdmin
        const record = await getUserAuthRecord(email)
        return evaluateCredentialLogin({ email, password, record, verify: verifyPassword })
      },
    }),
  ],
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== 'google') return true
      const email = profile?.email
      const verified = (profile as { email_verified?: boolean } | null | undefined)?.email_verified
      if (!email?.endsWith(`@${WORKSPACE_DOMAIN}`) || !verified) return false
      return true
    },
    // Sets the role and slug at sign-in, and re-reads them from the database on every later request, so a
    // removed or moved client user loses the old access on the next click (lib/auth/jwt-callback.ts).
    jwt: ({ token, user }) => jwtCallback(
      { token, user: user as { email?: string | null; role?: string; clientSlug?: string | null } | undefined },
      {
        lookup: getClientByEmail,
        testAdmin: { email: process.env.TEST_ADMIN_EMAIL, password: process.env.TEST_ADMIN_PASSWORD, vercelEnv: process.env.VERCEL_ENV },
      },
    ),
    async session({ session, token }) {
      session.user.role = token.role as string
      session.user.clientSlug = token.clientSlug as string | null
      return session
    },
  },
  pages: {
    signIn: '/login',
  },
})
