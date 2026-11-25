const RESERVED = new Set([
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'function',
  'if',
  'implements',
  'import',
  'in',
  'instanceof',
  'interface',
  'let',
  'new',
  'null',
  'package',
  'private',
  'protected',
  'public',
  'return',
  'static',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'typeof',
  'undefined',
  'var',
  'void',
  'while',
  'with',
  'yield',
])

export function words(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^a-zA-Z0-9_$]+/)
    .filter(Boolean)
}

export function pascalCase(value: string): string {
  const parts = words(value)
  const result = parts
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
  return result || 'Component'
}

export function camelCase(value: string): string {
  const p = pascalCase(value)
  return p.charAt(0).toLowerCase() + p.slice(1)
}

export function safeIdentifier(value: string, fallback = 'value'): string {
  const base = camelCase(value).replace(/[^a-zA-Z0-9_$]/g, '_')
  const withStart = /^[a-zA-Z_$]/.test(base) ? base : `_${base}`
  return RESERVED.has(withStart) ? `${withStart}_` : withStart || fallback
}

export function safeKey(value: string): string {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(value) ? value : JSON.stringify(value)
}

export function safePathSegment(value: string): string {
  const decoded = (() => {
    try {
      return decodeURIComponent(value)
    } catch {
      return value
    }
  })()
  const cleaned = decoded
    .trim()
    .replace(/[/\\]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._~-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return cleaned || 'page'
}

export function uniqueName(base: string, used: Set<string>): string {
  if (!used.has(base)) {
    used.add(base)
    return base
  }
  let i = 2
  while (used.has(`${base}${i}`)) i++
  const name = `${base}${i}`
  used.add(name)
  return name
}

export function stringLiteral(value: string): string {
  return JSON.stringify(value)
}

export function propertyKey(value: string): string {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(value) ? value : JSON.stringify(value)
}

/**
 * Vue treats a few prop names as special vnode properties. Nordcraft projects
 * can still have props with these names, so they are exposed under an `nc`
 * prefix at the component boundary.
 */
const VUE_RESERVED_PROP_NAMES = new Set(['key', 'ref', 'is'])

export function vuePropName(name: string): string {
  return VUE_RESERVED_PROP_NAMES.has(name)
    ? `nc${name[0]!.toUpperCase()}${name.slice(1)}`
    : name
}

export function vueAttributeName(name: string): string {
  return VUE_RESERVED_PROP_NAMES.has(name) ? `nc-${name}` : name
}
