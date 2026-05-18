import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import Credentials from 'next-auth/providers/credentials'
import { getClientByEmail } from '@/lib/clients.config'

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google,
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

        const user = getClientByEmail(email)
        if (!user) return null

        return { id: email, email, name: email.split('@')[0] }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.email) {
        const clientConfig = getClientByEmail(user.email)
        token.role = clientConfig?.role ?? 'CLIENT_VIEWER'
        token.clientSlug = clientConfig?.slug ?? null
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
