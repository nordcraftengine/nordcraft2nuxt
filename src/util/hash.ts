/** Deterministic, style/content hashing used for generated CSS class names. */
export function hashString(input: string): number {
  // FNV-1a, 32-bit. Stable across platforms and runs.
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'

export function encodeHash(hash: number): string {
  let value = hash
  let out = ''
  do {
    out = ALPHABET[value % ALPHABET.length] + out
    value = Math.floor(value / ALPHABET.length)
  } while (value > 0)
  return out
}

export function shortHash(input: string): string {
  return encodeHash(hashString(input)).slice(0, 7)
}

export function classNameForStyle(styleKey: string): string {
  return `nc-${shortHash(styleKey)}`
}
