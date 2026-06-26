import { AvenueZLogo } from '@/components/layout/avenue-z-logo'
import { signInWithCredentials, signInWithGoogle } from '@/app/actions/auth'

interface LoginPageProps {
  searchParams: Promise<{ error?: string }>
}

const ERROR_MESSAGES: Record<string, string> = {
  CredentialsSignin:      'Invalid email or password.',
  OAuthAccountNotLinked:  'This email is linked to a different sign-in method.',
  Default:                'Something went wrong. Please try again.',
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error } = await searchParams
  const errorMessage = error ? (ERROR_MESSAGES[error] ?? ERROR_MESSAGES.Default) : null

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-black px-4">

      {/* Main card */}
      <div className="w-full max-w-sm rounded-xl border border-white/[0.06] bg-bg-surface p-8">
        <div className="mb-6 flex justify-center">
          <AvenueZLogo height={22} className="text-white" />
        </div>

        <h1 className="mb-8 text-center text-xl font-extrabold text-white">
          Reporting Platform
        </h1>

        {/* Error banner */}
        {errorMessage && (
          <div className="mb-5 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {errorMessage}
          </div>
        )}

        {/* Credentials form */}
        <form action={signInWithCredentials} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-text-muted">
              Email
            </label>
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder-text-muted outline-none focus:border-white/20"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-text-muted">
              Password
            </label>
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
              placeholder="••••••••"
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder-text-muted outline-none focus:border-white/20"
            />
          </div>
          <button
            type="submit"
            className="mt-2 w-full rounded-full bg-white px-6 py-3 text-sm font-bold text-black transition-opacity hover:opacity-90"
          >
            Sign In
          </button>
        </form>
      </div>

      {/* Avenue Z employee Google sign-in footnote */}
      <div className="text-center text-sm text-text-muted">
        Avenue Z employee?{' '}
        <form action={signInWithGoogle} className="inline">
          <button
            type="submit"
            className="font-semibold text-white underline underline-offset-2 transition-opacity hover:opacity-70"
          >
            Sign in with Google
          </button>
        </form>
      </div>

    </div>
  )
}
