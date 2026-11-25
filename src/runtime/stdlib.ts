/* eslint-disable @typescript-eslint/no-explicit-any */
import { ncTruthy, type NcFormulaData } from './data.js'

/**
 * Self-contained TypeScript implementations of Nordcraft's standard formulas.
 * These are compiled/read by generated apps; no Nordcraft package is imported.
 */

export function ncUnsupportedFormula(name: string, args: unknown[]): null {
  if (typeof console !== 'undefined') {
    console.warn(`[nordcraft2nuxt] Unsupported formula: ${name}`, args)
  }
  return null
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !Number.isNaN(value)
}

function numberOrNull(value: unknown): number | null {
  const n = Number(value)
  return Number.isNaN(n) ? null : n
}

export function ncDeepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    return false
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false
    }
    for (let i = 0; i < a.length; i++) {
      if (!ncDeepEqual(a[i], b[i])) return false
    }
    return true
  }
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false
    if (!ncDeepEqual((a as any)[key], (b as any)[key])) return false
  }
  return true
}

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

export function ncAbsolute([value]: unknown[]): number | null {
  return typeof value === 'number' ? Math.abs(value) : null
}

export function ncAdd(numbers: unknown[]): number | null {
  if (!Array.isArray(numbers) || numbers.some((n) => n === null || typeof n !== 'number')) {
    return null
  }
  return (numbers as number[]).reduce((sum, n) => sum + n, 0)
}

export function ncSum([list]: unknown[]): number | null {
  if (!Array.isArray(list)) return null
  let sum = 0
  for (const n of list) {
    if (typeof n !== 'number' || Number.isNaN(n)) return null
    sum += n
  }
  return sum
}

export function ncMinus([a, b]: unknown[]): number | null {
  const first = numberOrNull(a)
  const second = numberOrNull(b)
  return first === null || second === null ? null : first - second
}

export function ncMultiply(numbers: unknown[]): number | null {
  if (numbers.some((n) => Number.isNaN(Number(n)))) return null
  return numbers.reduce<number>((product, n) => product * Number(n), 1)
}

export function ncDivide([a, b]: unknown[]): number | null {
  const first = numberOrNull(a)
  const second = numberOrNull(b)
  return first === null || second === null ? null : first / second
}

export function ncModulo([a, b]: unknown[]): number | null {
  const first = numberOrNull(a)
  const second = numberOrNull(b)
  return first === null || second === null ? null : first % second
}

export function ncPower([a, b]: unknown[]): number | null {
  const first = numberOrNull(a)
  const second = numberOrNull(b)
  return first === null || second === null ? null : first ** second
}

export function ncSquareRoot([value]: unknown[]): number | null {
  return typeof value === 'number' ? Math.sqrt(value) : null
}

export function ncLogarithm([value]: unknown[]): number | null {
  return typeof value === 'number' && !Number.isNaN(value) && value >= 0 ? Math.log(value) : null
}

export function ncClamp([value, min, max]: unknown[]): number | null {
  return isNumber(value) && isNumber(min) && isNumber(max)
    ? Math.min(Math.max(value, min), max)
    : null
}

export function ncMax(args: unknown[]): number {
  return Math.max(...args.map(Number))
}

export function ncMin(args: unknown[]): number {
  return Math.min(...args.map(Number))
}

export function ncRound([input, decimals]: unknown[]): number | null {
  if (typeof input !== 'number' || typeof decimals !== 'number') return null
  const multiplier = Math.max(1, 10 ** decimals)
  return Math.round(input * multiplier) / multiplier
}

export function ncRoundDown([input, decimals]: unknown[]): number | null {
  if (typeof input !== 'number' || typeof decimals !== 'number') return null
  const multiplier = Math.max(1, 10 ** decimals)
  return Math.floor(input * multiplier) / multiplier
}

export function ncRoundUp([input, decimals]: unknown[]): number | null {
  if (typeof input !== 'number' || typeof decimals !== 'number') return null
  const multiplier = Math.max(1, 10 ** decimals)
  return Math.ceil(input * multiplier) / multiplier
}

export function ncRandomNumber(): number {
  return Math.random()
}

export function ncRange([min, max]: unknown[]): number[] {
  const start = Number(min)
  const end = Number(max)
  if (Number.isNaN(start) || Number.isNaN(end)) return []
  const step = start <= end ? 1 : -1
  const result: number[] = []
  for (let value = start; step > 0 ? value <= end : value >= end; value += step) {
    result.push(value)
  }
  return result
}

// ---------------------------------------------------------------------------
// Strings
// ---------------------------------------------------------------------------

export function ncConcatenate(values: unknown[]): unknown {
  if (values.length > 0 && values.every(Array.isArray)) {
    return values.flatMap((value) => value as unknown[])
  }
  if (values.length > 0 && values.every(isObject)) {
    return Object.assign({}, ...(values as Record<string, unknown>[]))
  }
  return values.join('')
}

export function ncAppend([list, value]: unknown[]): unknown[] | null {
  return Array.isArray(list) ? [...list, value] : null
}

export function ncPrepend([list, value]: unknown[]): unknown[] | null {
  return Array.isArray(list) ? [value, ...list] : null
}

export function ncCapitalize([input]: unknown[]): string | null {
  if (typeof input !== 'string') return null
  if (input.length === 0) return input
  return input.charAt(0).toLocaleUpperCase() + input.slice(1).toLocaleLowerCase()
}

export function ncLowercase([input]: unknown[]): string | null {
  return typeof input === 'string' ? input.toLocaleLowerCase() : null
}

export function ncUppercase([input]: unknown[]): string | null {
  return typeof input === 'string' ? input.toLocaleUpperCase() : null
}

export function ncTrim([input]: unknown[]): string | null {
  return typeof input === 'string' ? input.trim() : null
}

export function ncIncludes([collection, item]: unknown[]): boolean | null {
  if (typeof collection === 'string' && typeof item === 'string') {
    return collection.includes(item)
  }
  if (Array.isArray(collection)) {
    return collection.some((value) => ncDeepEqual(value, item))
  }
  return null
}

export function ncIndexOf([collection, item]: unknown[]): number | null {
  if (typeof collection === 'string') return collection.indexOf(String(item))
  if (Array.isArray(collection)) {
    const fast = collection.indexOf(item)
    if (fast !== -1) return fast
    return collection.findIndex((value) => ncDeepEqual(value, item))
  }
  return null
}

export function ncLastIndexOf([collection, item]: unknown[]): number | null {
  if (typeof collection === 'string') return collection.lastIndexOf(String(item))
  if (Array.isArray(collection)) {
    const fast = collection.lastIndexOf(item)
    if (fast !== -1) return fast
    return collection.findLastIndex((value) => ncDeepEqual(value, item))
  }
  return null
}

export function ncStartsWith([input, prefix]: unknown[]): boolean | null {
  return typeof input === 'string' && typeof prefix === 'string'
    ? input.startsWith(prefix)
    : null
}

export function ncReplaceAll([input, search, replacement]: unknown[]): string | null {
  return typeof input === 'string' && typeof search === 'string'
    ? input.replaceAll(search, String(replacement))
    : null
}

export function ncSplit([input, delimiter]: unknown[]): string[] | null {
  return typeof input === 'string' && typeof delimiter === 'string'
    ? input.split(delimiter)
    : null
}

export function ncJoin([list, separator]: unknown[]): string | null {
  return Array.isArray(list) ? list.join(String(separator)) : null
}

export function ncMatches([
  input,
  regex,
  globalFlag,
  ignoreCaseFlag,
  multiLineFlag,
]: unknown[]): string[] {
  if (typeof input !== 'string' || typeof regex !== 'string') return []
  const flags = [
    ncTruthy(globalFlag) ? 'g' : '',
    ncTruthy(ignoreCaseFlag) ? 'i' : '',
    ncTruthy(multiLineFlag) ? 'm' : '',
  ].join('')
  return input.match(new RegExp(regex, flags)) ?? []
}

export function ncSize([collection]: unknown[]): number | null {
  if (typeof collection === 'string' || Array.isArray(collection)) {
    return collection.length
  }
  if (isObject(collection)) return Object.keys(collection).length
  return null
}

// ---------------------------------------------------------------------------
// Types / logic
// ---------------------------------------------------------------------------

export function ncBoolean([value]: unknown[]): boolean {
  return ncTruthy(value)
}

export function ncNot([value]: unknown[]): boolean {
  return !ncTruthy(value)
}

export function ncEquals([a, b]: unknown[]): boolean {
  return ncDeepEqual(a, b)
}

export function ncNotEqual([a, b]: unknown[]): boolean {
  return !ncDeepEqual(a, b)
}

export function ncGreaterThan([a, b]: unknown[]): boolean | null {
  const first = numberOrNull(a)
  const second = numberOrNull(b)
  return first === null || second === null ? null : first > second
}

export function ncGreaterOrEqual([a, b]: unknown[]): boolean | null {
  const first = numberOrNull(a)
  const second = numberOrNull(b)
  return first === null || second === null ? null : first >= second
}

export function ncLessThan([a, b]: unknown[]): boolean | null {
  const first = numberOrNull(a)
  const second = numberOrNull(b)
  return first === null || second === null ? null : first < second
}

export function ncLessOrEqual([a, b]: unknown[]): boolean | null {
  const first = numberOrNull(a)
  const second = numberOrNull(b)
  return first === null || second === null ? null : first <= second
}

export function ncDefaultTo(values: unknown[]): unknown {
  for (const value of values) {
    if (ncTruthy(value)) return value
  }
  return null
}

export function ncTypeOf([value]: unknown[]): string | null {
  switch (typeof value) {
    case 'number':
      return Number.isNaN(value) ? null : 'Number'
    case 'string':
      return 'String'
    case 'boolean':
      return 'Boolean'
    case 'object':
      return Array.isArray(value) ? 'Array' : value === null ? 'Null' : 'Object'
    case 'undefined':
      return 'Null'
    default:
      return null
  }
}

export function ncNumber([value]: unknown[]): number | null {
  const n = Number(value)
  return Number.isNaN(n) ? null : n
}

export function ncWithUnit([value, unit]: unknown[]): unknown {
  if (typeof value === 'number' && typeof unit === 'string' && unit) {
    return `${value}${unit}`
  }
  return value
}

export function ncString([value]: unknown[]): string | null {
  if (value === null || value === undefined) return null
  return String(value)
}

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

export function ncFirst([list]: unknown[]): unknown {
  if (Array.isArray(list) || typeof list === 'string') return list[0] ?? null
  return null
}

export function ncLast([list]: unknown[]): unknown {
  if (Array.isArray(list) || typeof list === 'string') return list[list.length - 1] ?? null
  return null
}

export function ncTake([list, count]: unknown[]): unknown {
  if (typeof count !== 'number') return null
  if (Array.isArray(list)) return list.slice(0, count)
  if (typeof list === 'string') return list.slice(0, count)
  return null
}

export function ncTakeLast([list, count]: unknown[]): unknown {
  if (typeof count !== 'number') return null
  if (Array.isArray(list)) return list.slice(list.length - count)
  if (typeof list === 'string') return list.slice(list.length - count)
  return null
}

export function ncDrop([list, count]: unknown[]): unknown {
  if (typeof count !== 'number' || Number.isNaN(count)) return null
  if (Array.isArray(list)) return list.slice(count)
  if (typeof list === 'string') return list.slice(count)
  return null
}

export function ncDropLast([list, count]: unknown[]): unknown {
  if (typeof count !== 'number' || Number.isNaN(count)) return null
  if (Array.isArray(list)) return list.slice(0, list.length - count)
  if (typeof list === 'string') return list.slice(0, list.length - count)
  return null
}

export function ncFlatten([list]: unknown[]): unknown[] | null {
  return Array.isArray(list) ? list.flat() : null
}

export function ncUnique([list]: unknown[]): unknown[] | null {
  if (!Array.isArray(list)) return null
  const seen = new Set<unknown>()
  return list.filter((item) => {
    const key = typeof item === 'object' && item !== null ? JSON.stringify(item) : item
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function ncReverse([list]: unknown[]): unknown[] | string | null {
  if (Array.isArray(list)) return [...list].reverse()
  if (typeof list === 'string') return [...list].reverse().join('')
  return null
}

export function ncShuffle([list]: unknown[]): unknown[] | string | null {
  const shuffle = (items: unknown[]) => {
    const result = [...items]
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[result[i], result[j]] = [result[j]!, result[i]!]
    }
    return result
  }
  if (Array.isArray(list)) return shuffle(list)
  if (typeof list === 'string') return shuffle([...list]).join('')
  return null
}

export function ncMap([items, fx]: unknown[]): unknown {
  if (typeof fx !== 'function') return null
  if (Array.isArray(items)) {
    return items.map((item, index) => (fx as (args: unknown) => unknown)({ item, index }))
  }
  if (isObject(items)) {
    return Object.fromEntries(
      Object.entries(items).map(([key, value]) => {
        const result = (fx as (args: unknown) => any)({ key, value })
        return result && typeof result === 'object' && 'key' in result && 'value' in result
          ? [result.key, result.value]
          : null
      }).filter(Boolean) as Array<[string, unknown]>,
    )
  }
  return null
}

export function ncFilter([items, fx]: unknown[]): unknown {
  if (typeof fx !== 'function' || !Array.isArray(items)) return null
  return items.filter((item, index) =>
    ncTruthy((fx as (args: unknown) => unknown)({ item, index })),
  )
}

export function ncFind([items, fx]: unknown[]): unknown {
  if (typeof fx !== 'function') return null
  if (Array.isArray(items)) {
    return items.find((item, index) => ncTruthy((fx as (args: unknown) => unknown)({ item, index }))) ?? null
  }
  if (isObject(items)) {
    const found = Object.entries(items).find(([key, value]) =>
      ncTruthy((fx as (args: unknown) => unknown)({ key, value })),
    )
    return found ? found[1] : null
  }
  return null
}

export function ncFindIndex([items, fx]: unknown[]): number | null {
  if (typeof fx !== 'function') return null
  if (Array.isArray(items)) {
    return items.findIndex((item, index) => ncTruthy((fx as (args: unknown) => unknown)({ item, index })))
  }
  if (isObject(items)) {
    return Object.entries(items).findIndex(([key, value]) =>
      ncTruthy((fx as (args: unknown) => unknown)({ key, value })),
    )
  }
  return null
}

export function ncFindLast([items, fx]: unknown[]): unknown {
  if (typeof fx !== 'function' || !Array.isArray(items)) return null
  return (
    items.findLast((item, index) =>
      ncTruthy((fx as (args: unknown) => unknown)({ item, index })),
    ) ?? null
  )
}

export function ncEvery([items, fx]: unknown[]): boolean | null {
  if (typeof fx !== 'function') return null
  if (Array.isArray(items)) {
    return items.every((item, index) => ncTruthy((fx as (args: unknown) => unknown)({ item, index })))
  }
  if (isObject(items)) {
    return Object.entries(items).every(([key, value]) =>
      ncTruthy((fx as (args: unknown) => unknown)({ key, value })),
    )
  }
  return null
}

export function ncSome([items, fx]: unknown[]): boolean | null {
  if (typeof fx !== 'function') return null
  if (Array.isArray(items)) {
    return items.some((item, index) => ncTruthy((fx as (args: unknown) => unknown)({ item, index })))
  }
  if (isObject(items)) {
    return Object.entries(items).some(([key, value]) =>
      ncTruthy((fx as (args: unknown) => unknown)({ key, value })),
    )
  }
  return null
}

export function ncReduce([items, fx, initial]: unknown[]): unknown {
  if (typeof fx !== 'function') return null
  if (Array.isArray(items)) {
    return items.reduce(
      (result, item, index) => (fx as (args: unknown) => unknown)({ result, item, index }),
      initial,
    )
  }
  if (isObject(items)) {
    return Object.entries(items).reduce(
      (result, [key, value]) => (fx as (args: unknown) => unknown)({ result, key, value }),
      initial,
    )
  }
  return null
}

export function ncGroupBy([items, fx]: unknown[]): Record<string, unknown[]> | null {
  if (typeof fx !== 'function' || !Array.isArray(items)) return null
  const result: Record<string, unknown[]> = {}
  for (let index = 0; index < items.length; index++) {
    const item = items[index]
    const key = String((fx as (args: unknown) => unknown)({ item, index }))
    ;(result[key] ??= []).push(item)
  }
  return result
}

export function ncKeyBy([items, fx]: unknown[]): Record<string, unknown> | null {
  if (typeof fx !== 'function' || !items || typeof items !== 'object') return null
  const list = Array.isArray(items) ? items : Object.entries(items)
  const result: Record<string, unknown> = {}
  for (let i = 0; i < list.length; i++) {
    const item = list[i]
    const key = String((fx as (args: unknown) => unknown)({ item, i }))
    result[key] = item
  }
  return result
}

export function ncEntries([value]: unknown[]): Array<{ key: string; value: unknown }> | null {
  return value !== null && typeof value === 'object'
    ? Object.entries(value).map(([key, item]) => ({ key, value: item }))
    : null
}

export function ncFromEntries([list]: unknown[]): Record<string, unknown> | null {
  if (!Array.isArray(list)) return null
  const result: Record<string, unknown> = {}
  for (const entry of list) {
    if (entry && typeof entry === 'object' && 'key' in entry) {
      result[String((entry as { key: unknown }).key)] = (entry as { value?: unknown }).value
    }
  }
  return result
}

export function ncSortBy([array, fx, ascending]: unknown[]): unknown[] | null {
  if (!Array.isArray(array)) return null
  if (typeof fx !== 'function') return null
  if (typeof ascending !== 'boolean') return null
  if (array.length <= 1) return [...array]
  const modifier = ascending ? 1 : -1
  const keyed = array.map((item) => [item, (fx as (args: unknown) => any)({ item })] as const)
  keyed.sort(([, a], [, b]) => {
    if (Array.isArray(a) && Array.isArray(b)) {
      for (let i = 0; i < a.length; i++) {
        if (a[i] === b[i]) continue
        return (a[i]! > b[i]! ? 1 : -1) * modifier
      }
      return 0
    }
    if (a === b) return 0
    return (a > b ? 1 : -1) * modifier
  })
  return keyed.map(([item]) => item)
}

// ---------------------------------------------------------------------------
// Objects / paths
// ---------------------------------------------------------------------------

function toPath(path: unknown): Array<string | number> | null {
  if (Array.isArray(path)) return path as Array<string | number>
  if (typeof path === 'string' || typeof path === 'number') return [path]
  return null
}

export function ncGet([object, path]: unknown[]): unknown {
  const parts = toPath(path)
  if (!parts) return null
  let current: any = object
  for (const part of parts) {
    if (current === null || typeof current !== 'object') return null
    current = current[part]
  }
  return current ?? null
}

export function ncSet([object, path, value]: unknown[]): unknown {
  const parts = toPath(path)
  if (!parts) return null
  const clone = (input: any): any => {
    if (Array.isArray(input)) return [...input]
    if (input !== null && typeof input === 'object') return { ...input }
    return {}
  }
  const root = clone(object)
  let current = root
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!
    current[key] = clone(current[key])
    current = current[key]
  }
  current[parts.at(-1)!] = value
  return root
}

export function ncDeleteKey([object, path]: unknown[]): unknown {
  const parts = toPath(path)
  if (!parts) return null
  const clone = (input: any): any => {
    if (Array.isArray(input)) return [...input]
    if (input !== null && typeof input === 'object') return { ...input }
    return {}
  }
  const root = clone(object)
  let current = root
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!
    if (current[key] === undefined) return root
    current[key] = clone(current[key])
    current = current[key]
  }
  delete current[parts.at(-1)!]
  return root
}

// ---------------------------------------------------------------------------
// JSON / encoding / dates / URLs
// ---------------------------------------------------------------------------

export function ncJson([data, indentation]: unknown[]): string | undefined {
  const indent = Number.isNaN(Number(indentation)) ? 0 : Number(indentation)
  return JSON.stringify(data, null, indent)
}

export function ncEncodeJSON([data]: unknown[]): string | undefined {
  return JSON.stringify(data)
}

export function ncParseJSON([value]: unknown[]): unknown {
  if (typeof value !== 'string') return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

export function ncEncodeURIComponent([value]: unknown[]): string | null {
  return typeof value === 'string' ? encodeURIComponent(value) : null
}

export function ncDecodeURIComponent([value]: unknown[]): string | null {
  if (typeof value !== 'string') return null
  try {
    return decodeURIComponent(value)
  } catch {
    return null
  }
}

export function ncEncodeBase64([value]: unknown[]): string | null {
  if (typeof value !== 'string' || typeof btoa === 'undefined') return null
  try {
    const bytes = new TextEncoder().encode(value)
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    return btoa(binary)
  } catch {
    return null
  }
}

export function ncDecodeBase64([value]: unknown[]): string | null {
  if (typeof value !== 'string' || typeof atob === 'undefined') return null
  try {
    const binary = atob(value)
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  } catch {
    return null
  }
}

export function ncNow(): Date {
  return new Date()
}

export function ncTimestamp([date]: unknown[]): number | null {
  return date instanceof Date && !Number.isNaN(date.getTime()) ? date.getTime() : null
}

export function ncDateFromString([value]: unknown[]): Date | null {
  if (typeof value !== 'string') return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function ncDateFromTimestamp([value]: unknown[]): Date | null {
  if (typeof value !== 'number') return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function ncFormatDate([date, locales, options]: unknown[]): string | null {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null
  try {
    return new Intl.DateTimeFormat(
      locales as string | string[] | undefined,
      (options ?? undefined) as Intl.DateTimeFormatOptions | undefined,
    ).format(date)
  } catch {
    return null
  }
}

export function ncFormatNumber([value, locales, options]: unknown[]): string | null {
  if (typeof value !== 'number' || Number.isNaN(value)) return null
  try {
    return new Intl.NumberFormat(
      locales as string | string[] | undefined,
      (options ?? undefined) as Intl.NumberFormatOptions | undefined,
    ).format(value)
  } catch {
    return null
  }
}

class NcUrl {
  hostname: string
  searchParams: Record<string, string>
  path: string[]
  hash: string
  href: string
  protocol: string
  port: string
  origin: string

  constructor(url: URL) {
    this.hostname = url.hostname
    this.searchParams = Object.fromEntries(url.searchParams)
    this.path = url.pathname.split('/').filter((part, index) => index !== 0 || part !== '')
    this.hash = url.hash.replace('#', '')
    this.href = url.href
    this.protocol = url.protocol
    this.port = url.port
    this.origin = url.origin
  }

  toString() {
    return this.href
  }
}

export function ncParseURL([url, base]: unknown[]): NcUrl | null {
  if (typeof url !== 'string') return null
  try {
    return new NcUrl(new URL(url, typeof base === 'string' ? base : undefined))
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Browser / environment
// ---------------------------------------------------------------------------

let localIdCounter = 0

export function ncId(): string {
  return `_id_${localIdCounter++}_`
}

export function ncBranchName(): string {
  return 'main'
}

export function ncIsServer(): boolean {
  return typeof window === 'undefined'
}

let currentRequestURL: string | null = null

/** Set by server-side route middleware so formulas see the incoming URL. */
export function ncSetCurrentRequestURL(url: string | null): void {
  currentRequestURL = url
}

export function ncCurrentURL(): string | null {
  if (currentRequestURL !== null) return currentRequestURL
  return typeof window !== 'undefined' ? window.location.href : null
}

export function ncCanShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.canShare === 'function'
    ? navigator.canShare()
    : false
}

export function ncLanguages(): string[] {
  if (typeof navigator === 'undefined') return []
  return navigator.languages?.length ? [...navigator.languages] : [navigator.language]
}

export function ncUserAgent(): string | null {
  return typeof navigator !== 'undefined' ? navigator.userAgent : null
}

export function ncParseCookieHeader(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {}
  if (!header) return cookies
  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index === -1) continue
    const key = part.slice(0, index).trim()
    const value = part.slice(index + 1).trim()
    if (!key) continue
    try {
      cookies[decodeURIComponent(key)] = decodeURIComponent(value)
    } catch {
      cookies[key] = value
    }
  }
  return cookies
}

export function ncGetCookie([name]: unknown[], data?: NcFormulaData): string | null {
  if (typeof name !== 'string') return null
  const requestCookies = data?.Cookies
  if (requestCookies && Object.prototype.hasOwnProperty.call(requestCookies, name)) {
    return requestCookies[name] ?? null
  }
  if (typeof document === 'undefined') return null
  const prefix = `${encodeURIComponent(name)}=`
  for (const part of document.cookie.split(';')) {
    const trimmed = part.trim()
    if (trimmed.startsWith(prefix)) return decodeURIComponent(trimmed.slice(prefix.length))
  }
  return null
}

export function ncGetHttpOnlyCookie([name]: unknown[], data?: NcFormulaData): string | null {
  if (typeof name !== 'string') return null
  return data?.Cookies && Object.prototype.hasOwnProperty.call(data.Cookies, name)
    ? data.Cookies[name] ?? null
    : null
}

export function ncGetElementById([id]: unknown[]): unknown {
  return typeof document !== 'undefined' && typeof id === 'string'
    ? document.getElementById(id) ?? null
    : null
}

function readStorage(storage: Storage | undefined, key: unknown): unknown {
  if (!storage || typeof key !== 'string') return null
  const raw = storage.getItem(key)
  if (raw === null) return null
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

export function ncGetFromLocalStorage([key]: unknown[]): unknown {
  if (typeof localStorage === 'undefined') return null
  return readStorage(localStorage, key)
}

export function ncGetFromSessionStorage([key]: unknown[]): unknown {
  if (typeof sessionStorage === 'undefined') return null
  return readStorage(sessionStorage, key)
}
