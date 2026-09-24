// Test helper (not app code): walk and serialise the element tree a server component or route
// RETURNS, without rendering it. Used by the locked months parity and acceptance tests.
import { isValidElement, type ReactElement } from 'react'

type El = ReactElement<Record<string, unknown>>

function typeName(t: unknown): string {
  if (typeof t === 'string') return t
  if (typeof t === 'symbol') return t.description ?? String(t)
  const f = t as { displayName?: string; name?: string } | null
  return f?.displayName ?? f?.name ?? 'Anonymous'
}

/** A JSON-safe copy of a returned tree: component types become names, functions become '[fn]'. */
export function elementTree(node: unknown): unknown {
  if (node === null || node === undefined || typeof node === 'boolean') return null
  if (Array.isArray(node)) return node.map(elementTree)
  if (typeof node === 'function') return '[fn]'
  if (typeof node !== 'object') return node
  if (!isValidElement(node)) {
    return Object.fromEntries(Object.entries(node as Record<string, unknown>).map(([k, v]) => [k, elementTree(v)]))
  }
  const e = node as El
  return {
    type: typeName(e.type),
    key: e.key,
    props: Object.fromEntries(Object.entries(e.props ?? {}).map(([k, v]) => [k, elementTree(v)])),
  }
}

/** Every element in a returned tree (through every prop, not only children) matching `pred`. */
export function findElements(node: unknown, pred: (e: El) => boolean): El[] {
  const out: El[] = []
  const walk = (n: unknown): void => {
    if (!n || typeof n !== 'object') return
    if (Array.isArray(n)) { n.forEach(walk); return }
    if (!isValidElement(n)) return
    const e = n as El
    if (pred(e)) out.push(e)
    Object.values(e.props ?? {}).forEach(walk)
  }
  walk(node)
  return out
}

export type RouteResult = { redirect: string } | { element: unknown }

/** Awaits a route; a Next redirect (digest `NEXT_REDIRECT;replace;<url>;307;`) comes back as its URL. */
export async function runRoute(p: Promise<unknown>): Promise<RouteResult> {
  try {
    return { element: await p }
  } catch (err) {
    const d = (err as { digest?: unknown }).digest
    if (typeof d === 'string' && d.startsWith('NEXT_REDIRECT;')) return { redirect: d.split(';')[2] }
    throw err
  }
}

export async function redirectOf(p: Promise<unknown>): Promise<string | null> {
  const r = await runRoute(p)
  return 'redirect' in r ? r.redirect : null
}
