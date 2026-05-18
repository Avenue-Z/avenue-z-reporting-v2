import { cookies } from 'next/headers'

export interface DemoSession {
  role: 'internal' | 'client'
  clientSlug?: string
  clientName?: string
}

const COOKIE_NAME = 'demo-session'

export async function getDemoSession(): Promise<DemoSession | null> {
  const cookieStore = await cookies()
  const raw = cookieStore.get(COOKIE_NAME)?.value
  if (!raw) return null
  try {
    return JSON.parse(raw) as DemoSession
  } catch {
    return null
  }
}
