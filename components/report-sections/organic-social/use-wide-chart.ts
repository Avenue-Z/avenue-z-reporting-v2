import { useSyncExternalStore } from 'react'

const WIDE = '(min-width: 640px)'

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
  const m = window.matchMedia(WIDE)
  m.addEventListener('change', onChange)
  return () => m.removeEventListener('change', onChange)
}

/** True on a screen wide enough to pin callouts to their dots, option B (Tailwind's `sm`, 640px).
 *  The server renders wide, which is what a desktop gets; a phone switches to the row once it
 *  hydrates. A browser without matchMedia, such as the test DOM, gets the row. */
export function useWideChart(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => typeof window.matchMedia === 'function' && window.matchMedia(WIDE).matches,
    () => true,
  )
}
