import type { DiagnosticBag } from '../diagnostics.js'
import { FormulaCompiler } from '../formula/compile.js'
import {
  packageFormulaFunctionName,
  projectFormulaFunctionName,
} from '../formula/naming.js'
import type { FormulaJson, RouteFileJson } from '../ingest/types.js'
import type { ProjectIR } from '../ir/types.js'
import { stringLiteral } from '../util/names.js'

export interface RouteMiddlewareResult {
  content: string
}

/**
 * Generates Nitro middleware for all Nordcraft `routes/` files. Static
 * destinations are handled here too, so redirect and rewrite behavior is
 * consistent for dynamic formulas and `currentURL`.
 */
export function emitRouteMiddleware(
  ir: ProjectIR,
  diagnostics: DiagnosticBag,
): RouteMiddlewareResult | null {
  const routes = Object.entries(ir.routeFiles).filter(
    (entry): entry is [string, RouteFileJson] => entry[1] != null,
  )
  if (routes.length === 0) return null

  const compiler = new FormulaCompiler({
    diagnostics,
    projectFormulaResolver: (name, packageName) =>
      packageName
        ? `PKG.${packageFormulaFunctionName(packageName, name)}`
        : `PF.${projectFormulaFunctionName(name)}`,
  })
  const definitions: string[] = []
  const entries: string[] = []

  for (const [index, [key, route]] of routes.entries()) {
    const enabled = route.enabled?.formula
    if (enabled?.type === 'value' && (enabled.value === false || enabled.value == null)) {
      continue
    }
    const enabledExpression = enabled
      ? compiler.compileCondition(enabled, { dataVar: 'd' }).expression
      : 'true'
    const destination = buildDestination(route, compiler)
    if (!destination) {
      diagnostics.warn(
        'route-destination-missing',
        `Route "${key}" has no destination and was skipped.`,
      )
      continue
    }
    definitions.push(
      `const route_${index}_enabled = (d: NcFormulaData): boolean => ${enabledExpression}`,
      `const route_${index}_destination = (d: NcFormulaData): string => {\n${destination}\n}`,
    )
    entries.push(`  {
    type: ${stringLiteral(route.type)},
    status: ${route.status ?? 302},
    source: ${JSON.stringify(route.source.path.map((segment) => ({
      type: segment.type,
      name: segment.name,
      optional: segment.optional === true,
    })))},
    enabled: route_${index}_enabled,
    destination: route_${index}_destination,
  }`)
  }

  if (entries.length === 0) return null

  const helpers = [...compiler.helpers].sort()
  const imports = [
    `import { defineEventHandler, getHeader, getRequestURL, proxyRequest, sendRedirect } from 'h3'`,
    `import type { NcFormulaData } from '~/lib/runtime'`,
    `import { createNcData, ncParseCookieHeader, ncSetCurrentRequestURL${helpers.length ? `, ${helpers.join(', ')}` : ''} } from '~/lib/runtime'`,
  ]
  const projectCalls = [...compiler.projectFormulasUsed]
  if (projectCalls.some((call) => call.startsWith('PF.'))) {
    imports.push(`import * as PF from '~/lib/nordcraft/project-formulas'`)
  }
  if (projectCalls.some((call) => call.startsWith('PKG.'))) {
    imports.push(`import * as PKG from '~/lib/nordcraft/project-formulas'`)
  }

  return {
    content: `${imports.join('\n')}

${definitions.join('\n\n')}

const routes = [
${entries.join(',\n')}
]

export default defineEventHandler(async (event) => {
  const requestUrl = getRequestURL(event)
  const query: Record<string, string> = {}
  for (const [key, value] of requestUrl.searchParams) query[key] = value

  for (const route of routes) {
    const params = matchRoute(route.source, requestUrl.pathname)
    if (!params) continue
    ncSetCurrentRequestURL(requestUrl.href)
    try {
      const data = createNcData({
        route: { path: requestUrl.pathname, params, query },
        pageName: null,
        cookies: ncParseCookieHeader(getHeader(event, 'cookie')),
      })
      if (!route.enabled(data)) continue
      const destination = route.destination(data)
      if (!destination) continue
      if (route.type === 'redirect') {
        return sendRedirect(event, destination, route.status)
      }
      if (!(destination.startsWith('http://') || destination.startsWith('https://'))) {
        console.warn('[nordcraft2nuxt] Rewrite destination is not absolute:', destination)
        continue
      }
      return await proxyRequest(event, destination)
    } finally {
      ncSetCurrentRequestURL(null)
    }
  }
})

interface RouteSourceSegment {
  type: 'static' | 'param'
  name: string
  optional: boolean
}

function matchRoute(
  source: RouteSourceSegment[],
  pathname: string,
): Record<string, string | null> | null {
  const parts = pathname.split('/').filter(Boolean)
  const params: Record<string, string | null> = {}
  let index = 0
  for (const segment of source) {
    if (segment.type === 'static') {
      if (parts[index] !== segment.name) {
        if (segment.optional) continue
        return null
      }
      index++
    } else {
      if (parts[index] === undefined) {
        if (segment.optional) {
          params[segment.name] = null
          continue
        }
        return null
      }
      params[segment.name] = parts[index]!
      index++
    }
  }
  return index < parts.length ? null : params
}
`,
  }
}

type DestinationPart =
  | FormulaJson
  | { index?: number; formula?: FormulaJson | null }

function destinationParts(
  record: Record<string, DestinationPart | null | undefined> | null | undefined,
): Array<{ key: string; formula: FormulaJson }> {
  return Object.entries(record ?? {})
    .flatMap(([key, entry], position) => {
      if (!entry) return []
      const indexed =
        typeof entry === 'object' && 'formula' in entry && entry.formula
          ? entry.formula
          : (entry as FormulaJson)
      return [{ key, formula: indexed, index: (entry as { index?: number }).index ?? position }]
    })
    .sort((a, b) => a.index - b.index)
    .map(({ key, formula }) => ({ key, formula }))
}

function buildDestination(
  route: RouteFileJson,
  compiler: FormulaCompiler,
): string | null {
  const destination = route.destination
  const pathEntries = Object.keys(destination.path ?? {}).length
  const queryEntries = Object.keys(destination.queryParams ?? {}).length
  if (!destination.url && pathEntries === 0 && queryEntries === 0) return null
  const url = destination.url
    ? compiler.compile(destination.url, { dataVar: 'd' }).expression
    : "''"
  const pathLines = destinationParts(destination.path).map(({ formula }) => {
    const value = compiler.compile(formula, { dataVar: 'd' }).expression
    return `url = \`\${url.replace(/\\/$/, '')}/\${encodeURIComponent(String(${value}))}\``
  })
  const queryLines = destinationParts(destination.queryParams).map(
    ({ key, formula }) => {
      const value = compiler.compile(formula, { dataVar: 'd' }).expression
      return `if (${value} !== null && ${value} !== undefined) params.set(${JSON.stringify(key)}, String(${value}))`
    },
  )
  const lines = [
    `  const rawUrl: unknown = ${url}`,
    `  let url = rawUrl == null ? '' : String(rawUrl)`,
    ...pathLines.map((line) => `  ${line}`),
  ]
  if (queryLines.length) {
    lines.push('  const params = new URLSearchParams()')
    lines.push(...queryLines.map((line) => `  ${line}`))
    lines.push(
      "  const search = params.toString()",
      "  if (search) url += `${url.includes('?') ? '&' : '?'}${search}`",
    )
  }
  lines.push('  return url')
  return lines.join('\n')
}


export function emitClientRouteMiddleware(
  ir: ProjectIR,
  diagnostics: DiagnosticBag,
): RouteMiddlewareResult | null {
  const routes = Object.entries(ir.routeFiles).filter(
    (entry): entry is [string, RouteFileJson] =>
      entry[1] != null && entry[1].type === 'redirect',
  )
  if (routes.length === 0) return null
  const compiler = new FormulaCompiler({
    diagnostics,
    projectFormulaResolver: (name, packageName) =>
      packageName
        ? `PKG.${packageFormulaFunctionName(packageName, name)}`
        : `PF.${projectFormulaFunctionName(name)}`,
  })
  const definitions: string[] = []
  const entries: string[] = []
  for (const [index, [key, route]] of routes.entries()) {
    const enabled = route.enabled?.formula
    if (enabled?.type === 'value' && (enabled.value === false || enabled.value == null)) {
      continue
    }
    const enabledExpression = enabled
      ? compiler.compileCondition(enabled, { dataVar: 'd' }).expression
      : 'true'
    const destination = buildDestination(route, compiler)
    if (!destination) {
      diagnostics.warn(
        'route-destination-missing',
        `Route "${key}" has no destination and was skipped.`,
      )
      continue
    }
    definitions.push(
      `const route_${index}_enabled = (d: NcFormulaData): boolean => ${enabledExpression}`,
      `const route_${index}_destination = (d: NcFormulaData): string => {\n${destination}\n}`,
    )
    entries.push(`  {
    status: ${route.status ?? 302},
    source: ${JSON.stringify(route.source.path.map((segment) => ({
      type: segment.type,
      name: segment.name,
      optional: segment.optional === true,
    })))} as RouteSourceSegment[],
    enabled: route_${index}_enabled,
    destination: route_${index}_destination,
  }`)
  }
  if (entries.length === 0) return null
  const helpers = [...new Set(['createNcData', 'ncTruthy', ...compiler.helpers])].sort()
  const imports = [
    `import { defineNuxtRouteMiddleware, navigateTo } from '#imports'`,
    `import type { NcFormulaData } from '~/lib/runtime'`,
    `import { ${helpers.join(', ')} } from '~/lib/runtime'`,
  ]
  const projectCalls = [...compiler.projectFormulasUsed]
  if (projectCalls.some((call) => call.startsWith('PF.'))) {
    imports.push(`import * as PF from '~/lib/nordcraft/project-formulas'`)
  }
  if (projectCalls.some((call) => call.startsWith('PKG.'))) {
    imports.push(`import * as PKG from '~/lib/nordcraft/project-formulas'`)
  }
  return {
    content: `${imports.join('\n')}

${definitions.join('\n\n')}

const routes = [
${entries.join(',\n')}
]

interface RouteSourceSegment {
  type: 'static' | 'param'
  name: string
  optional: boolean
}

export default defineNuxtRouteMiddleware((to) => {
  const query: Record<string, string> = {}
  for (const [key, value] of Object.entries(to.query)) {
    if (value === null || value === undefined) continue
    query[key] = Array.isArray(value) ? String(value[0]) : String(value)
  }
  for (const route of routes) {
    const params = matchRoute(route.source, to.path)
    if (!params) continue
    const data = createNcData({
      route: { path: to.path, params, query },
      pageName: null,
    })
    if (!route.enabled(data)) continue
    const destination = route.destination(data)
    if (!destination) continue
    return navigateTo(destination, { redirectCode: route.status, replace: true })
  }
})

function matchRoute(
  source: RouteSourceSegment[],
  pathname: string,
): Record<string, string | null> | null {
  const parts = pathname.split('/').filter(Boolean)
  const params: Record<string, string | null> = {}
  let index = 0
  for (const segment of source) {
    if (segment.type === 'static') {
      if (parts[index] !== segment.name) {
        if (segment.optional) continue
        return null
      }
      index++
    } else {
      if (parts[index] === undefined) {
        if (segment.optional) {
          params[segment.name] = null
          continue
        }
        return null
      }
      params[segment.name] = parts[index]!
      index++
    }
  }
  return index < parts.length ? null : params
}
`,
  }
}
