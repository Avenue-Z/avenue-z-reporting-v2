import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import Credentials from 'next-auth/providers/credentials'
import { getClientByEmail, getUserAuthRecord } from '@/lib/db/queries'
import { evaluateCredentialLogin } from '@/lib/auth/credential-login'
import { evaluateTestAdminLogin } from '@/lib/auth/test-admin'
import { verifyPassword } from '@/lib/auth/password'

const WORKSPACE_DOMAIN = 'avenuez.com'
const WORKSPACE_DEFAULT_ROLE = 'INTERNAL_ANALYST'
const WORKSPACE_DEFAULT_SLUG = 'avenue-z'

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
    async jwt({ token, user }) {
      if (user?.email) {
        // The preview-only test admin carries its own role/slug — trust it
        // directly rather than looking it up in the DB.
        const u = user as { email: string; role?: string; clientSlug?: string | null }
        if (u.role) {
          token.role = u.role
          token.clientSlug = u.clientSlug ?? null
          return token
        }
        const clientConfig = await getClientByEmail(user.email)
        if (clientConfig) {
          token.role = clientConfig.role
          token.clientSlug = clientConfig.slug
        } else if (user.email.endsWith(`@${WORKSPACE_DOMAIN}`)) {
          token.role = WORKSPACE_DEFAULT_ROLE
          token.clientSlug = WORKSPACE_DEFAULT_SLUG
        } else {
          token.role = 'CLIENT_VIEWER'
          token.clientSlug = null
        }
      }
      return token
    },
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
