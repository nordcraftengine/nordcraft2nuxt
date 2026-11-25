import { DiagnosticBag } from '../diagnostics.js'
import type { ComponentJson, ProjectJson, RouteJson } from '../ingest/types.js'
import { pascalCase, safePathSegment, uniqueName } from '../util/names.js'
import type { ComponentIR, PageIR, ProjectIR, ThemeIR } from './types.js'

export interface BuildIROptions {
  diagnostics?: DiagnosticBag
}

export function buildProjectIR(
  project: ProjectJson,
  options: BuildIROptions = {},
): ProjectIR {
  const diagnostics = options.diagnostics ?? new DiagnosticBag()
  const files = project.files ?? {}
  const components: ComponentIR[] = []
  const pages: PageIR[] = []
  const usedVueNames = new Set<string>()
  const usedPagePaths = new Set<string>()

  const addComponent = (
    source: ComponentJson,
    packageName: string | undefined,
    isPage: boolean,
  ) => {
    const key = packageName ? `${packageName}/${source.name}` : source.name
    const vueName = uniqueName(
      pascalCase(
        `${packageName ? pascalCase(packageName) : ''}${source.name}`,
      ).startsWith('Nc')
        ? pascalCase(
            `${packageName ? pascalCase(packageName) : ''}${source.name}`,
          )
        : `Nc${pascalCase(
            `${packageName ? pascalCase(packageName) : ''}${source.name}`,
          )}`,
      usedVueNames,
    )
    const component: ComponentIR = {
      key,
      name: source.name,
      ...(packageName ? { packageName } : {}),
      source,
      isPage,
      ...(source.route ? { route: source.route } : {}),
      vueName,
      fileName: `${vueName}.vue`,
    }
    components.push(component)
    if (isPage && source.route) {
      const pagePath = uniquePagePath(source.route, usedPagePaths, diagnostics, key)
      pages.push({
        key,
        name: source.name,
        route: source.route,
        component,
        pagePath,
      })
    }
    return component
  }

  for (const [name, raw] of Object.entries(files.components ?? {})) {
    if (!raw) continue
    const source = { ...raw, name: raw.name || name }
    addComponent(source, undefined, source.route != null)
  }

  for (const [packageName, pkg] of Object.entries(files.packages ?? {})) {
    if (!pkg?.components) continue
    for (const [name, raw] of Object.entries(pkg.components)) {
      if (!raw) continue
      const source = { ...raw, name: raw.name || name }
      addComponent(source, packageName, source.route != null)
    }
  }

  // Resolve component references and report missing ones.
  const componentByKey = new Map(components.map((c) => [c.key, c]))
  for (const component of components) {
    for (const [nodeId, node] of Object.entries(component.source.nodes ?? {})) {
      if (!node || node.type !== 'component') continue
      if (!resolveComponent(componentByKey, component, node)) {
        const key = node.package ? `${node.package}/${node.name}` : node.name
        diagnostics.warn(
          'unresolved-component',
          `Component "${key}" is referenced by ${component.key} but was not found in the project.`,
          { component: component.key, node: nodeId },
        )
      }
    }
  }

  const themes: ThemeIR[] = Object.entries(files.themes ?? {})
    .filter((entry): entry is [string, NonNullable<typeof entry[1]>] => entry[1] != null)
    .map(([name, source]) => ({ name, source }))

  return {
    id: project.id ?? project.project.id ?? project.project.short_id ?? 'project',
    name: project.project.name,
    shortId: project.project.short_id ?? project.project.name,
    commit: project.commit ?? '',
    components,
    componentByKey,
    pages,
    themes,
    projectFormulas: nonNullRecord(files.formulas),
    projectActions: nonNullRecord(files.actions),
    routeFiles: nonNullRecord(files.routes),
    packages: nonNullRecord(files.packages),
    source: project,
  }
}

function uniquePagePath(
  route: RouteJson,
  used: Set<string>,
  diagnostics: DiagnosticBag,
  componentKey: string,
): string {
  const segments = route.path.map((segment) => {
    if (segment.type === 'param') {
      return (segment.optional ? `[[${segment.name}]]` : `[${segment.name}]`)
    }
    if (segment.optional) {
      diagnostics.warn(
        'optional-static-route-segment',
        `Optional static route segments are not representable with Nuxt file routing yet: /${segment.name}. The segment will be required.`,
        { component: componentKey },
      )
    }
    return safePathSegment(segment.name)
  })

  let pagePath =
    segments.length === 0
      ? 'index.vue'
      : `${segments.slice(0, -1).join('/')}${segments.length > 1 ? '/' : ''}${segments[segments.length - 1]!}.vue`

  if (used.has(pagePath)) {
    const base = pagePath.replace(/\.vue$/, '')
    let i = 2
    while (used.has(`${base}-${i}.vue`)) i++
    pagePath = `${base}-${i}.vue`
    diagnostics.warn(
      'route-collision',
      `Multiple pages resolve to the same Nuxt route file. Wrote the later page to ${pagePath}.`,
      { component: componentKey },
    )
  }
  used.add(pagePath)
  return pagePath
}

function nonNullRecord<T>(value: Record<string, T | null> | undefined): Record<string, T> {
  return Object.fromEntries(
    Object.entries(value ?? {}).filter((entry): entry is [string, T] => entry[1] != null),
  )
}

/**
 * Resolves a component node the way Nordcraft does: an explicit package wins,
 * otherwise a reference inside a package component resolves within that same
 * package before falling back to the project's own components.
 */
export function resolveComponent(
  componentByKey: Map<string, ComponentIR>,
  from: ComponentIR,
  node: { name: string; package?: string | null },
): ComponentIR | undefined {
  if (node.package) {
    return componentByKey.get(`${node.package}/${node.name}`)
  }
  if (from.packageName) {
    const local = componentByKey.get(`${from.packageName}/${node.name}`)
    if (local) return local
  }
  return componentByKey.get(node.name)
}
