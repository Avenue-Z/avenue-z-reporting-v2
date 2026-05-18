import Link from 'next/link'

export default function UnauthorizedPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-4xl font-extrabold text-white">Access Denied</h1>
      <p className="text-text-muted">
        You don&apos;t have permission to view this page.
      </p>
      <Link
        href="/"
        className="mt-4 rounded-[100px] bg-[#3a3a3a] px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-bg-subtle"
      >
        Go Home
      </Link>
    </div>
  )
}
