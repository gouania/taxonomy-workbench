/**
 * Validates that an external URL uses an explicit http:// or https:// scheme.
 * Rejects javascript:, data:, vbscript:, file:, or malformed URLs so untrusted
 * model or grounding metadata cannot inject executable href attributes.
 */
export function getSafeExternalUrl(raw?: string | null): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.href;
    }
    return null;
  } catch {
    return null;
  }
}
