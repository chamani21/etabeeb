/**
 * Post-login redirect target. Only same-site staff paths (optionally
 * locale-prefixed) are accepted — never absolute, protocol-relative or
 * backslash URLs — so a crafted ?callbackUrl= cannot send users off-site.
 */
export function safeStaffCallback(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return null
  return /^\/(?:(?:ps|fa|ur|en)\/)?(?:admin|doctor)(?:\/[A-Za-z0-9\-/]*)?(?:\?[^#]*)?$/.test(raw) ? raw : null
}
