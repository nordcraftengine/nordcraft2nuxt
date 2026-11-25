import type { NcArgs, NcFormulaData } from './data.js'
import { withEvent, withParameters } from './data.js'

export interface NcApiCallbacks {
  onSuccess?: () => unknown
  onError?: () => unknown
  onMessage?: (message: unknown) => unknown
}

export interface NcApi {
  execute?: (
    inputs?: Record<string, unknown>,
    event?: unknown,
    callbacks?: NcApiCallbacks,
  ) => unknown
  abort?: () => void
  [key: string]: unknown
}

export interface NcContext {
  formulas?: Record<string, unknown>
  workflows?: Record<string, NcWorkflow>
  [key: string]: unknown
}

export interface NcThemeController {
  get: () => string | null
  set: (value: string | null) => void
}

export type NcWorkflow = (
  ctx: NcWorkflowContext,
  event?: unknown,
  params?: Record<string, unknown>,
) => Promise<void> | void

export type NcActionHandler = (
  args: Record<string, unknown>,
  ctx: NcWorkflowContext,
  event?: unknown,
  callbacks?: Record<string, (data: unknown) => void>,
) => unknown

export interface NcRouterLike {
  push: (to: any) => unknown
  replace: (to: any) => unknown
}

export interface NcRouteLike {
  name?: string | symbol | null
  path: string
  params?: Record<string, unknown>
  query?: Record<string, unknown>
  hash?: string
}

export interface NcWorkflowContext {
  data: NcFormulaData
  emit: (event: string, payload?: unknown) => void
  navigate?: (url: string, options?: { replace?: boolean; external?: boolean }) => unknown
  router?: NcRouterLike
  route?: NcRouteLike
  theme?: NcThemeController
  apis: Record<string, NcApi>
  contexts: Record<string, NcContext>
  workflows: Record<string, NcWorkflow>
  customActions: Record<string, NcActionHandler>
  onCleanup: (fn: () => void) => void
  triggerCallback: (event: string, data: unknown) => void
  event?: unknown
}

export interface CreateWorkflowContextOptions {
  data: NcFormulaData
  emit?: (event: string, payload?: unknown) => void
  navigate?: (url: string, options?: { replace?: boolean; external?: boolean }) => unknown
  router?: NcRouterLike
  route?: NcRouteLike
  theme?: NcThemeController
  apis?: Record<string, NcApi>
  contexts?: Record<string, NcContext>
  workflows?: Record<string, NcWorkflow>
  customActions?: Record<string, NcActionHandler>
  onCleanup?: (fn: () => void) => void
  triggerCallback?: (event: string, data: unknown) => void
  event?: unknown
}

export function createWorkflowContext(
  options: CreateWorkflowContextOptions,
): NcWorkflowContext {
  return {
    data: options.data,
    emit: options.emit ?? (() => {}),
    ...(options.navigate ? { navigate: options.navigate } : {}),
    ...(options.router ? { router: options.router } : {}),
    ...(options.route ? { route: options.route } : {}),
    ...(options.theme ? { theme: options.theme } : {}),
    apis: options.apis ?? {},
    contexts: options.contexts ?? {},
    workflows: options.workflows ?? {},
    customActions: options.customActions ?? {},
    onCleanup: options.onCleanup ?? (() => {}),
    triggerCallback: options.triggerCallback ?? (() => {}),
    ...(options.event !== undefined ? { event: options.event } : {}),
  }
}

export function ncWorkflowData(
  data: NcFormulaData,
  params?: Record<string, unknown>,
  event?: unknown,
): NcFormulaData {
  return withParameters(withEvent(data, event), params ?? {})
}

function normalizeParam(value: unknown): string | null {
  if (Array.isArray(value)) return value[0] == null ? null : String(value[0])
  return value == null ? null : String(value)
}

/**
 * Nordcraft's SetURLParameters semantics: parameters that match a path parameter
 * update the path; everything else updates the query string. Path changes use
 * push by default; query-only changes use replace by default.
 */
export async function ncSetUrlParameters(
  ctx: NcWorkflowContext,
  values: Record<string, unknown>,
  historyMode?: 'push' | 'replace' | null,
): Promise<void> {
  if (!ctx.router || !ctx.route) return
  const pathParams: Record<string, string> = {}
  for (const [key, value] of Object.entries(ctx.route.params ?? {})) {
    pathParams[key] = normalizeParam(value) ?? ''
  }
  const query: Record<string, string> = {}
  for (const [key, value] of Object.entries(ctx.route.query ?? {})) {
    const normalized = normalizeParam(value)
    if (normalized !== null) query[key] = normalized
  }

  let pathChanged = false
  for (const [key, value] of Object.entries(values)) {
    const normalized = value === null || value === undefined ? null : String(value)
    if (Object.prototype.hasOwnProperty.call(pathParams, key)) {
      if (normalized === null) {
        pathParams[key] = ''
      } else {
        pathParams[key] = normalized
      }
      pathChanged = true
    } else if (normalized === null) {
      delete query[key]
    } else {
      query[key] = normalized
    }
  }

  const mode = historyMode ?? (pathChanged ? 'push' : 'replace')
  const target = pathChanged && ctx.route.name
    ? { name: ctx.route.name, params: pathParams, query }
    : { path: ctx.route.path, query }

  if (mode === 'replace') {
    ctx.router.replace(target)
  } else {
    ctx.router.push(target)
  }
}

export type NcArgsRecord = NcArgs
