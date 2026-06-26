'use server'

import { AuthError } from 'next-auth'
import { redirect } from 'next/navigation'
import { signIn, signOut } from '@/auth'

export async function signInWithGoogle() {
  await signIn('google', { redirectTo: '/' })
}

export async function signInWithCredentials(formData: FormData) {
  try {
    await signIn('credentials', {
      email:      formData.get('email') as string,
      password:   formData.get('password') as string,
      redirectTo: '/',
    })
  } catch (error) {
    // A successful sign-in throws NEXT_REDIRECT (handled by re-throwing below);
    // a failed one throws AuthError — surface it on /login via the ?error= banner.
    if (error instanceof AuthError) {
      redirect(`/login?error=${error.type}`)
    }
    throw error
  }
}

export async function signOutAction() {
  await signOut({ redirectTo: '/login' })
}
