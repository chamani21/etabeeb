'use client'

/** Minimal JSON client for the staff UI. Errors carry the backend's safe message/code. */
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: Record<string, string[]>) {
    super(message)
  }
}

export async function api<T = any>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(path, {
    method: init?.method ?? (init?.body !== undefined ? 'POST' : 'GET'),
    headers: init?.body !== undefined ? { 'content-type': 'application/json' } : {},
    body: init?.body !== undefined ? JSON.stringify(init.body) : null,
    cache: 'no-store',
    credentials: 'same-origin',
  })
  let json: any = null
  try {
    json = await res.json()
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    if (res.status === 403 && json?.code === 'password_change_required') window.location.href = '/account/password'
    if (res.status === 401) window.location.href = '/login'
    const details = json?.details as Record<string, string[]> | undefined
    const detailText = details ? Object.entries(details).map(([k, v]) => `${k}: ${v.join(', ')}`).join('; ') : ''
    throw new ApiError(res.status, json?.code ?? 'error', [json?.error ?? `Request failed (${res.status})`, detailText].filter(Boolean).join(' — '), details)
  }
  return json as T
}
