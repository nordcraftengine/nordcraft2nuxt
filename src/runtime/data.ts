/**
 * The data shape Nordcraft formulas are written against.
 *
 * This mirrors the Nordcraft runtime's ComponentData keys so compiled formulas
 * can be read almost directly from the JSON AST, but it is our own code and has
 * no dependency on any Nordcraft package.
 */

export type NcArgs = Record<string, unknown>

export interface NcListItem {
  Item: unknown
  Index: number
  Key?: string | number
  Parent?: NcListItem
}

export interface NcLocation {
  page?: string | null
  path: string
  params: Record<string, string | null>
  query: Record<string, string | null>
  hash: string
}

export interface NcRouteParameters {
  path: Record<string, string | null>
  query: Record<string, string | null>
}

export interface NcFormulaData {
  Variables?: Record<string, unknown>
  Attributes?: Record<string, unknown>
  Apis?: Record<string, unknown>
  Contexts?: Record<string, unknown>
  Formulas?: Record<string, unknown>
  Location?: NcLocation
  'URL parameters'?: Record<string, string | null>
  'Route parameters'?: NcRouteParameters
  Page?: { Theme: string | null }
  Cookies?: Record<string, string>
  ListItem?: NcListItem
  Event?: unknown
  Args?: NcArgs
  ApiInputs?: Record<string, unknown>
  Parameters?: Record<string, unknown>
  [key: string]: unknown
}

export interface NcRouteLike {
  name?: string | symbol | null
  path: string
  params?: Record<string, unknown>
  query?: Record<string, unknown>
  hash?: string
}

export interface CreateNcDataOptions {
  vars?: Record<string, unknown>
  props?: Record<string, unknown>
  attributes?: Record<string, unknown>
  apis?: Record<string, unknown>
  contexts?: Record<string, unknown>
  formulas?: Record<string, (data: NcFormulaData, args?: NcArgs) => unknown>
  route?: NcRouteLike
  pageName?: string | null
  theme?: string | null | (() => string | null)
  cookies?: Record<string, string>
  /** Defaults for declared query parameters, including nulls. */
  queryDefaults?: Record<string, string | null>
}

/**
 * Exact Nordcraft path semantics:
 * - traverse objects/arrays by key
 * - return null when a value in the path is not an object
 */
export function ncPath(input: unknown, path: Array<string | number>): unknown {
  let current: any = input
  for (let i = 0; i < path.length; i++) {
    if (current !== null && typeof current === 'object') {
      current = current[path[i] as string | number]
    } else {
      return null
    }
  }
  return current
}

/**
 * Nordcraft truthiness is deliberately not JavaScript truthiness:
 * only false, null and undefined are falsy. 0 and "" are truthy.
 */
export function ncTruthy(value: unknown): boolean {
  return value !== false && value !== undefined && value !== null
}

export function ncAnd(values: unknown[]): boolean {
  for (const value of values) if (!ncTruthy(value)) return false
  return true
}

export function ncOr(values: unknown[]): boolean {
  for (const value of values) if (ncTruthy(value)) return true
  return false
}

/** Nordcraft attributes keep their kebab-case names, while Vue normalizes
 * declared props to camelCase. Expose both spellings from the same live object. */
function createAttributeView(
  source: Record<string, unknown>,
): Record<string, unknown> {
  const camelize = (value: string) =>
    value.replace(/-([a-z0-9])/g, (_match, char: string) => char.toUpperCase())
  const kebabCase = (value: string) =>
    value.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)
  const reservedProp = (key: string) =>
    key === 'key' || key === 'ref' || key === 'is'
      ? `nc${key[0]!.toUpperCase()}${key.slice(1)}`
      : null
  return new Proxy(source, {
    get(target, key, receiver) {
      if (typeof key !== 'string') return Reflect.get(target, key, receiver)
      if (Reflect.has(target, key)) return Reflect.get(target, key, receiver)
      const camel = camelize(key)
      if (Reflect.has(target, camel)) return Reflect.get(target, camel, receiver)
      const kebab = kebabCase(key)
      if (Reflect.has(target, kebab)) return Reflect.get(target, kebab, receiver)
      const reserved = reservedProp(key)
      if (reserved && Reflect.has(target, reserved)) {
        return Reflect.get(target, reserved, receiver)
      }
      return undefined
    },
    has(target, key) {
      if (typeof key !== 'string') return Reflect.has(target, key)
      const reserved = reservedProp(key)
      return (
        Reflect.has(target, key) ||
        Reflect.has(target, camelize(key)) ||
        Reflect.has(target, kebabCase(key)) ||
        (reserved != null && Reflect.has(target, reserved))
      )
    },
    getOwnPropertyDescriptor(target, key) {
      return (
        Reflect.getOwnPropertyDescriptor(target, key) ??
        Reflect.getOwnPropertyDescriptor(target, camelize(String(key)))
      )
    },
  })
}

function defineScope<T extends object>(parent: T, values: Record<string, unknown>): T {
  const descriptors: PropertyDescriptorMap = {}
  for (const [key, value] of Object.entries(values)) {
    descriptors[key] = {
      value,
      enumerable: true,
      configurable: true,
      writable: false,
    }
  }
  return Object.create(parent, descriptors) as T
}

export function withListItem(
  data: NcFormulaData,
  listItem: NcListItem,
): NcFormulaData {
  return defineScope(data, { ListItem: listItem })
}

export function withEvent(
  data: NcFormulaData,
  event: unknown,
): NcFormulaData {
  return defineScope(data, { Event: event })
}

export function withArgs(data: NcFormulaData, args: NcArgs): NcFormulaData {
  const values: Record<string, unknown> = { Args: args }
  // Nordcraft exports sometimes address higher-order arguments directly
  // (`item.name`) and sometimes through `Args.item`.
  for (const key of [
    'item',
    'index',
    'i',
    'key',
    'value',
    'result',
    'accumulator',
  ]) {
    if (args && Object.prototype.hasOwnProperty.call(args, key)) {
      values[key] = args[key]
    }
  }
  return defineScope(data, values)
}

export function withApiInputs(
  data: NcFormulaData,
  apiInputs: Record<string, unknown>,
): NcFormulaData {
  return defineScope(data, { ApiInputs: apiInputs })
}

export function withParameters(
  data: NcFormulaData,
  parameters: Record<string, unknown>,
): NcFormulaData {
  return defineScope(data, { Parameters: parameters })
}

export function ncSetVariable(
  data: NcFormulaData,
  name: string,
  value: unknown,
): void {
  const variables = data.Variables
  if (variables) variables[name] = value
}

function normalizeParam(value: unknown): string | null {
  if (Array.isArray(value)) return value[0] == null ? null : String(value[0])
  return value == null ? null : String(value)
}

function buildLocation(
  route: NcRouteLike | undefined,
  pageName: string | null | undefined,
): NcLocation {
  if (!route) {
    return { page: pageName ?? null, path: '/', params: {}, query: {}, hash: '' }
  }
  const pathParams: Record<string, string | null> = {}
  for (const [key, value] of Object.entries(route.params ?? {})) {
    pathParams[key] = normalizeParam(value)
  }
  const query: Record<string, string | null> = {}
  for (const [key, value] of Object.entries(route.query ?? {})) {
    query[key] = normalizeParam(value)
  }
  return {
    page: pageName ?? (typeof route.name === 'string' ? route.name : null),
    path: route.path,
    params: { ...query, ...pathParams },
    query,
    hash: (route.hash ?? '').replace(/^#/, ''),
  }
}

function buildRouteParameters(
  route: NcRouteLike | undefined,
  queryDefaults: Record<string, string | null> | undefined,
): NcRouteParameters {
  const path: Record<string, string | null> = {}
  for (const [key, value] of Object.entries(route?.params ?? {})) {
    path[key] = normalizeParam(value)
  }
  const query: Record<string, string | null> = { ...(queryDefaults ?? {}) }
  for (const [key, value] of Object.entries(route?.query ?? {})) {
    query[key] = normalizeParam(value)
  }
  return { path, query }
}

function buildUrlParameters(
  route: NcRouteLike | undefined,
  queryDefaults: Record<string, string | null> | undefined,
): Record<string, string | null> {
  const routeParams = buildRouteParameters(route, queryDefaults)
  return { ...routeParams.query, ...routeParams.path }
}

/**
 * Creates a reactive-view-friendly data object. Callers pass live objects
 * (reactive vars, props, API states, contexts) and getters preserve reactivity.
 */
export function createNcData(options: CreateNcDataOptions): NcFormulaData {
  const data = {} as NcFormulaData
  const getFormulas = () => {
    const map = options.formulas ?? {}
    return new Proxy(
      {},
      {
        get(_target, key) {
          if (typeof key !== 'string') return undefined
          const fn = map[key]
          return fn ? fn(data) : undefined
        },
        has(_target, key) {
          return typeof key === 'string' && key in map
        },
        ownKeys() {
          return Object.keys(map)
        },
        getOwnPropertyDescriptor() {
          return { enumerable: true, configurable: true }
        },
      },
    )
  }

  const attributeSource = options.attributes ?? options.props ?? {}
  const attributes = createAttributeView(attributeSource)

  Object.defineProperties(data, {
    Variables: { get: () => options.vars ?? {}, enumerable: true },
    Attributes: {
      get: () => attributes,
      enumerable: true,
    },
    Apis: { get: () => options.apis ?? {}, enumerable: true },
    Contexts: { get: () => options.contexts ?? {}, enumerable: true },
    Formulas: { get: getFormulas, enumerable: true },
    Location: {
      get: () => buildLocation(options.route, options.pageName),
      enumerable: true,
    },
    'URL parameters': {
      get: () => buildUrlParameters(options.route, options.queryDefaults),
      enumerable: true,
    },
    'Route parameters': {
      get: () => buildRouteParameters(options.route, options.queryDefaults),
      enumerable: true,
    },
    Cookies: { get: () => options.cookies ?? {}, enumerable: true },
    Page: {
      get: () => ({
        Theme:
          typeof options.theme === 'function'
            ? options.theme()
            : options.theme ?? null,
      }),
      enumerable: true,
    },
  })
  return data
}

/** A minimal Nordcraft-compatible context for custom code formulas. */
export function ncFormulaContext(_data: NcFormulaData): {
  root: Document | null
  env: {
    isServer: boolean
    branchName: string
    logErrors: boolean
  }
} {
  return {
    root: typeof document !== 'undefined' ? document : null,
    env: {
      isServer: typeof window === 'undefined',
      branchName: 'main',
      logErrors: false,
    },
  }
}
