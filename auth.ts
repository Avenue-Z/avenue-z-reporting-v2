import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import Credentials from 'next-auth/providers/credentials'
import { getClientByEmail } from '@/lib/db/queries'

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
        // In production, validate against a hashed password store.
        // For now, check that the email exists in client config.
        const email = credentials?.email as string | undefined
        if (!email) return null

        const user = await getClientByEmail(email)
        if (!user) return null

        return { id: email, email, name: email.split('@')[0] }
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
        const clientConfig = await getClientByEmail(user.email)
        if (clientConfig) {
          token.role = clientConfig.role
          token.clientSlug = clientConfig.slug
          token.demoMode = clientConfig.demoMode
        } else if (user.email.endsWith(`@${WORKSPACE_DOMAIN}`)) {
          token.role = WORKSPACE_DEFAULT_ROLE
          token.clientSlug = WORKSPACE_DEFAULT_SLUG
          token.demoMode = false
        } else {
          token.role = 'CLIENT_VIEWER'
          token.clientSlug = null
          token.demoMode = false
        }
      }
      return token
    },
    async session({ session, token }) {
      session.user.role = token.role as string
      session.user.clientSlug = token.clientSlug as string | null
      session.user.demoMode = (token.demoMode as boolean | undefined) ?? false
      return session
    },
  },
  pages: {
    signIn: '/login',
  },
})
