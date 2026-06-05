/**
 * Run `thunks` with at most `limit` in flight at once, returning settled
 * results in input order (like Promise.allSettled, but concurrency-capped).
 *
 * The input is a fixed array, so there is no growable queue — memory is bounded
 * by the input length. Per-element result types are preserved (variadic tuple),
 * so callers can destructure with full typing:
 *
 *   const [a, b] = await mapWithConcurrency([() => f1(), () => f2()], 4)
 */
export async function mapWithConcurrency<
  T extends readonly (() => Promise<unknown>)[],
>(
  thunks: readonly [...T],
  limit: number,
): Promise<{
  -readonly [K in keyof T]: PromiseSettledResult<Awaited<ReturnType<T[K]>>>
}> {
  const results = new Array(thunks.length)
  let next = 0

  async function worker(): Promise<void> {
    while (next < thunks.length) {
      const i = next++
      try {
        results[i] = { status: 'fulfilled', value: await thunks[i]() }
      } catch (reason) {
        results[i] = { status: 'rejected', reason }
      }
    }
  }

  const poolSize = Math.max(1, Math.min(limit, thunks.length))
  await Promise.all(Array.from({ length: poolSize }, () => worker()))

  return results as {
    -readonly [K in keyof T]: PromiseSettledResult<Awaited<ReturnType<T[K]>>>
  }
}
