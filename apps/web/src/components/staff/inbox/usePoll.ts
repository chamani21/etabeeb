'use client'

import { useCallback, useEffect, useRef } from 'react'

/**
 * Lightweight incremental polling for the inbox: runs only while the page is
 * visible and the browser is online, refreshes immediately when the tab comes
 * back, and backs off on errors (up to 60 s). No websocket/broker needed for
 * this small pilot.
 */
export function usePoll(fn: () => Promise<void>, intervalMs: number, enabled = true): () => void {
  const fnRef = useRef(fn)
  fnRef.current = fn
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const failures = useRef(0)
  const running = useRef(false)

  const schedule = useCallback(
    (delay: number) => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => void tick(), delay)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const tick = useCallback(async (force = false) => {
    if (!enabled) return
    // The first load always runs; later refreshes pause while hidden/offline (resume on visibilitychange/online)
    if (!force && (document.hidden || !navigator.onLine)) return
    if (running.current) return
    running.current = true
    try {
      await fnRef.current()
      failures.current = 0
    } catch {
      failures.current += 1
    } finally {
      running.current = false
      if (!document.hidden && navigator.onLine) schedule(Math.min(60_000, intervalMs * 2 ** failures.current))
    }
  }, [enabled, intervalMs, schedule])

  useEffect(() => {
    if (!enabled) return
    void tick(true)
    const wake = () => {
      if (!document.hidden && navigator.onLine) void tick()
    }
    document.addEventListener('visibilitychange', wake)
    window.addEventListener('online', wake)
    return () => {
      document.removeEventListener('visibilitychange', wake)
      window.removeEventListener('online', wake)
      if (timer.current) clearTimeout(timer.current)
    }
  }, [enabled, tick])

  return useCallback(() => void tick(true), [tick])
}

/** Opaque per-draft key: a retried send after a network error reuses it (server-side idempotency). */
export function newRequestKey(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}
