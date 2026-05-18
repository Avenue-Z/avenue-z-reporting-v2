'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

const COOKIE_NAME = 'demo-session'

export async function demoLoginInternal() {
  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, JSON.stringify({ role: 'internal' }), {
    path: '/',
    httpOnly: true,
    maxAge: 60 * 60 * 24, // 24 hours
  })
  redirect('/dashboard')
}

export async function demoLoginClient(clientSlug: string, clientName: string) {
  const cookieStore = await cookies()
  cookieStore.set(
    COOKIE_NAME,
    JSON.stringify({ role: 'client', clientSlug, clientName }),
    { path: '/', httpOnly: true, maxAge: 60 * 60 * 24 }
  )
  redirect(`/portal/${clientSlug}/reports`)
}

export async function demoLogout() {
  const cookieStore = await cookies()
  cookieStore.delete(COOKIE_NAME)
  redirect('/login')
}
