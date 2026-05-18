'use server'

import { signIn, signOut } from '@/auth'

export async function signInWithGoogle() {
  await signIn('google', { redirectTo: '/' })
}

export async function signInWithCredentials(formData: FormData) {
  await signIn('credentials', {
    email:      formData.get('email') as string,
    password:   formData.get('password') as string,
    redirectTo: '/',
  })
}

export async function signOutAction() {
  await signOut({ redirectTo: '/login' })
}
