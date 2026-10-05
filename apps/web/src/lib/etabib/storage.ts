/**
 * eTabib V1 — private file storage for prescription images/PDFs and voice notes.
 *
 * Files live on the container's private volume (never served statically). They
 * are only reachable through authenticated staff routes or short-lived signed
 * media links (see media-links.ts).
 *
 *   ETABIB_PRIVATE_STORAGE_DIR  default /app/private-uploads (the private Docker volume)
 */
import { mkdir, readFile, writeFile, stat } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'

const KEY_RE = /^[a-z0-9][a-z0-9/_.-]{0,200}$/

export function storageRoot(): string {
  const configured = process.env.ETABIB_PRIVATE_STORAGE_DIR?.trim()
  if (configured) return configured
  return process.env.NODE_ENV === 'production' ? '/app/private-uploads' : path.join(tmpdir(), 'etabib-private')
}

function resolveKey(key: string): string {
  if (!KEY_RE.test(key) || key.includes('..')) throw new Error('invalid_storage_key')
  return path.join(storageRoot(), 'etabib', key)
}

export async function putFile(key: string, data: Buffer): Promise<void> {
  const file = resolveKey(key)
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 })
  await writeFile(file, data, { mode: 0o600 })
}

export async function getFile(key: string): Promise<Buffer | null> {
  try {
    return await readFile(resolveKey(key))
  } catch {
    return null
  }
}

export async function fileExists(key: string): Promise<boolean> {
  try {
    return (await stat(resolveKey(key))).isFile()
  } catch {
    return false
  }
}

/** Absolute path for tools that need one (ffmpeg). */
export function storagePath(key: string): string {
  return resolveKey(key)
}
