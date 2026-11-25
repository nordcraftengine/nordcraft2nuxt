import type { NcListItem } from './data.js'

export interface NcRepeatEntry {
  item: unknown
  index: number
  key: string | number
  listItem: NcListItem
}

/**
 * Normalizes Nordcraft's array/object repeat semantics and applies the
 * repeat-key formula, falling back to the index when keys are missing or
 * duplicated (matching Nordcraft's runtime behavior).
 */
export function ncRepeat(
  value: unknown,
  keyFn?: (entry: NcRepeatEntry) => unknown,
  parentListItem?: NcListItem,
): NcRepeatEntry[] {
  const entries: NcRepeatEntry[] = []
  const push = (item: unknown, index: number, key: string | number) => {
    const listItem: NcListItem = parentListItem
      ? { Item: item, Index: index, Key: key, Parent: parentListItem }
      : { Item: item, Index: index, Key: key }
    const entry: NcRepeatEntry = { item, index, key, listItem }
    if (keyFn) {
      const custom = keyFn(entry)
      if (custom !== null && custom !== undefined) {
        entry.key = typeof custom === 'number' ? custom : String(custom)
        entry.listItem = { ...listItem, Key: entry.key }
      }
    }
    entries.push(entry)
  }

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) push(value[index], index, index)
  } else if (value !== null && typeof value === 'object') {
    const objectEntries = Object.entries(value as Record<string, unknown>)
    for (let index = 0; index < objectEntries.length; index++) {
      const [key, item] = objectEntries[index]!
      push(item, index, key)
    }
  }

  const seen = new Set<string | number>()
  for (const entry of entries) {
    if (seen.has(entry.key)) {
      if (typeof console !== 'undefined') {
        console.warn(`[nordcraft2nuxt] Duplicate repeat key "${entry.key}"; falling back to index.`)
      }
      entry.key = entry.index
      entry.listItem = { ...entry.listItem, Key: entry.index }
    }
    seen.add(entry.key)
  }
  return entries
}
