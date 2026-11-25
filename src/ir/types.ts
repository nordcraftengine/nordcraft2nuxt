import type {
  ActionJson,
  ComponentJson,
  PackageJson,
  ProjectFormulaJson,
  ProjectJson,
  RouteFileJson,
  RouteJson,
  ThemeJson,
  ProjectActionJson,
} from '../ingest/types.js'

export interface ProjectIR {
  id: string
  name: string
  shortId: string
  commit: string
  components: ComponentIR[]
  componentByKey: Map<string, ComponentIR>
  pages: PageIR[]
  themes: ThemeIR[]
  projectFormulas: Record<string, ProjectFormulaJson>
  projectActions: Record<string, ProjectActionJson>
  routeFiles: Record<string, RouteFileJson>
  packages: Record<string, PackageJson>
  source: ProjectJson
}

export interface ComponentIR {
  /** Stable key: local component name, or `<package>/<name>`. */
  key: string
  name: string
  packageName?: string
  source: ComponentJson
  isPage: boolean
  route?: RouteJson
  /** Generated Vue component name, e.g. `NcCounter`. */
  vueName: string
  /** Generated file base, e.g. `NcCounter.vue`. */
  fileName: string
}

export interface PageIR {
  key: string
  name: string
  route: RouteJson
  component: ComponentIR
  /** Nuxt page path relative to `app/pages`, e.g. `blog/[slug].vue`. */
  pagePath: string
}

export interface ThemeIR {
  name: string
  source: ThemeJson
}

export interface ActionIR {
  key: string
  source: ActionJson
}

export function isPageComponent(component: ComponentJson): boolean {
  return component.route != null
}
