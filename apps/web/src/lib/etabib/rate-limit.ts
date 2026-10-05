/** Small in-memory fixed-window rate limiter (single web container). */
const buckets = new Map<string, { count: number; reset: number }>()

export function rateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const b = buckets.get(key)
  if (!b || b.reset <= now) {
    buckets.set(key, { count: 1, reset: now + windowMs })
    if (buckets.size > 10_000) for (const [k, v] of buckets) if (v.reset <= now) buckets.delete(k)
    return false
  }
  b.count += 1
  return b.count > limit
}
