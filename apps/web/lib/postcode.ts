/**
 * UK postcode validation and normalisation.
 *
 * Accepts the standard formats: SW1A 1AA, M11AE, GIR 0AA, etc.
 * Whitespace is flexible — the regex tolerates 0, 1, or many spaces
 * between the outward and inward parts.
 *
 * Returns normalised form (uppercase, single space) or null if invalid.
 */

// Permissive UK postcode regex covering all current formats.
// Outward: 1-2 letters, optional 1-2 digits, optional final letter
// Inward: 1 digit + 2 letters
const POSTCODE_RE = /^([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})$/i;

export function normalisePostcode(input: string): string | null {
  const trimmed = input.trim().toUpperCase();
  const match = trimmed.match(POSTCODE_RE);
  if (!match) return null;
  return `${match[1]} ${match[2]}`;
}

export function isValidPostcode(input: string): boolean {
  return normalisePostcode(input) !== null;
}
