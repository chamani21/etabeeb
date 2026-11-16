/**
 * Redact and truncate free-text error data from integrations before storing or
 * logging it. Removes things that commonly leak PHI or secrets: phone-like
 * digit runs, e-mail addresses, bearer/API tokens, long opaque strings and URL
 * query strings.
 */
export function sanitizeErrorText(input: unknown, maxLength = 500): string | null {
  if (input === null || input === undefined) return null
  let text = typeof input === 'string' ? input : String(input)
  text = text
    .replace(
      /(authorization|bearer|token|api[-_]?key|secret|password|x-etabib-key)\s*[:=]?\s*(?:bearer\s+)?\S+/gi,
      '$1=[REDACTED]',
    )
    .replace(/https?:\/\/[^\s?#]+\?[^\s]*/gi, (url) => `${url.split('?')[0]}?[REDACTED]`)
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[EMAIL]')
    .replace(/[A-Za-z0-9_\-]{32,}/g, '[OPAQUE]')
    .replace(/\+?\d[\d\s-]{6,}\d/g, '[NUMBER]')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text
}
