/**
 * Types for the JSON project export produced by Nordcraft's "Download branch".
 *
 * These are deliberately our own types. The compiler does not import any
 * Nordcraft package, schema, or runtime.
 */

export interface ProjectJson {
  id?: string
  project: ProjectMetaJson
  commit?: string
  files: ProjectFilesJson
}

export interface ProjectMetaJson {
  id?: string
  name: string
  short_id?: string
  description?: string | null
  type?: string
  public?: boolean
  emoji?: string | null
  published_at?: string | null
  accounts?: { id?: string; name?: string }
}

export interface ProjectFilesJson {
  components?: Record<string, ComponentJson | null>
  themes?: Record<string, ThemeJson | null>
  formulas?: Record<string, ProjectFormulaJson | null>
  actions?: Record<string, ProjectActionJson | null>
  routes?: Record<string, RouteFileJson | null>
  packages?: Record<string, PackageJson | null>
  config?: ProjectConfigJson | null
}

export interface PackageJson {
  manifest?: {
    name?: string
    version?: string
    description?: string
    [key: string]: unknown
  }
  components?: Record<string, ComponentJson | null>
  formulas?: Record<string, ProjectFormulaJson | null>
  actions?: Record<string, ProjectActionJson | null>
}

export interface ProjectConfigJson {
  meta?: {
    robots?: unknown
    [key: string]: unknown
  } | null
  [key: string]: unknown
}

export interface ComponentJson {
  name: string
  route?: RouteJson | null
  attributes?: Record<string, ComponentAttributeJson | null> | null
  variables?: Record<string, ComponentVariableJson | null> | null
  formulas?: Record<string, ComponentFormulaJson | null> | null
  workflows?: Record<string, WorkflowJson | null> | null
  apis?: Record<string, ApiJson | null> | null
  nodes?: Record<string, NodeJson | null> | null
  events?: Array<ComponentEventJson | null> | null
  contexts?: Record<string, ComponentContextJson | null> | null
  onLoad?: LifecycleJson | null
  onAttributeChange?: LifecycleJson | null
  meta?: Record<string, unknown> | null
  customElement?: { enabled?: FormulaJson } | null
  customCode?: boolean | null
  exported?: boolean | null
}

export interface ComponentAttributeJson {
  name?: string
  testValue?: unknown
}

export interface ComponentVariableJson {
  initialValue: FormulaJson
}

export interface ComponentFormulaJson {
  name?: string
  formula: FormulaJson
  arguments?: Array<{ name: string; testValue?: unknown }> | null
  memoize?: boolean | null
  exposeInContext?: boolean | null
}

export interface WorkflowJson {
  name?: string
  parameters?: Array<{ name: string; testValue?: unknown }> | null
  actions: ActionJson[]
  callbacks?: Array<{ name: string; testValue?: unknown }> | null
  exposeInContext?: boolean | null
}

export interface ComponentEventJson {
  name: string
  dummyEvent?: unknown
}

export interface ComponentContextJson {
  formulas: string[]
  workflows: string[]
  componentName?: string | null
  package?: string | null
}

export interface LifecycleJson {
  trigger: 'Load' | 'Attribute change'
  actions: ActionJson[]
}

export interface ProjectFormulaJson {
  name?: string
  formula?: FormulaJson
  arguments?: Array<{ name: string; testValue?: unknown }> | null
  memoize?: boolean | null
  exposeInContext?: boolean | null
  handler?: string
  version?: 2
}

export interface ProjectActionJson {
  name?: string
  handler?: string
  arguments?: Array<{ name: string; formula?: FormulaJson }> | null
  events?: Record<string, { actions: ActionJson[] }> | null
  version?: 2
}

// ---------------------------------------------------------------------------
// Formulas
// ---------------------------------------------------------------------------

export interface FormulaArgumentJson {
  name?: string
  formula: FormulaJson
  isFunction?: boolean
}

export type FormulaJson =
  | ValueFormulaJson
  | PathFormulaJson
  | ArrayFormulaJson
  | ObjectFormulaJson
  | RecordFormulaJson
  | AndFormulaJson
  | OrFormulaJson
  | SwitchFormulaJson
  | FunctionFormulaJson
  | ApplyFormulaJson

export interface ValueFormulaJson {
  type: 'value'
  value: unknown
}

export interface PathFormulaJson {
  type: 'path'
  path: Array<string | number>
}

export interface ArrayFormulaJson {
  type: 'array'
  arguments?: Array<{ formula: FormulaJson }> | null
}

export interface ObjectFormulaJson {
  type: 'object'
  arguments?: FormulaArgumentJson[] | null
}

/** Legacy alias of `object`. */
export interface RecordFormulaJson {
  type: 'record'
  entries?: FormulaArgumentJson[] | null
}

export interface AndFormulaJson {
  type: 'and'
  arguments?: Array<{ formula: FormulaJson }> | null
}

export interface OrFormulaJson {
  type: 'or'
  arguments?: Array<{ formula: FormulaJson }> | null
}

export interface SwitchFormulaJson {
  type: 'switch'
  cases?: Array<{ condition: FormulaJson; formula: FormulaJson }> | null
  default: FormulaJson
}

export interface FunctionFormulaJson {
  type: 'function'
  name: string
  arguments?: FormulaArgumentJson[] | null
  package?: string | null
  display_name?: string | null
  variableArguments?: boolean | null
}

export interface ApplyFormulaJson {
  type: 'apply'
  name: string
  arguments?: FormulaArgumentJson[] | null
}

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------

export interface BaseNodeJson {
  id?: string
  condition?: FormulaJson | null
  repeat?: FormulaJson | null
  repeatKey?: FormulaJson | null
  slot?: string | null
}

export interface ElementNodeJson extends BaseNodeJson {
  type: 'element'
  tag: string
  attrs?: Record<string, FormulaJson> | null
  style?: Record<string, string | number | null | undefined> | null
  variants?: StyleVariantJson[] | null
  animations?: Record<string, Record<string, AnimationKeyframeJson>> | null
  children?: string[] | null
  events?: Record<string, EventJson | null> | null
  classes?: Record<string, { formula?: FormulaJson | null }> | null
  'style-variables'?: StyleVariableJson[] | null
  customProperties?: Record<`--${string}`, CustomPropertyJson> | null
}

export interface TextNodeJson extends BaseNodeJson {
  type: 'text'
  value: FormulaJson
  children?: never
}

export interface SlotNodeJson extends BaseNodeJson {
  type: 'slot'
  name?: string | null
  children?: string[] | null
  attr?: Record<string, FormulaJson> | null
  repeat?: never
  repeatKey?: never
}

export interface ComponentNodeJson extends BaseNodeJson {
  type: 'component'
  name: string
  package?: string | null
  path?: string | null
  attrs?: Record<string, FormulaJson> | null
  style?: Record<string, string | number | null | undefined> | null
  variants?: StyleVariantJson[] | null
  animations?: Record<string, Record<string, AnimationKeyframeJson>> | null
  children?: string[] | null
  events?: Record<string, EventJson | null> | null
  customProperties?: Record<`--${string}`, CustomPropertyJson> | null
}

export type NodeJson =
  | ElementNodeJson
  | TextNodeJson
  | SlotNodeJson
  | ComponentNodeJson

export interface StyleVariableJson {
  category: string
  name: string
  formula: FormulaJson
  unit?: string | null
}

export interface CustomPropertyJson {
  formula: FormulaJson
  unit?: string | null
  syntax?: unknown
}

export interface StyleVariantJson {
  style?: Record<string, string | number | null | undefined> | null
  id?: string | null
  className?: string | null
  class?: string | null
  hover?: boolean | null
  active?: boolean | null
  focus?: boolean | null
  focusWithin?: boolean | null
  'focus-within'?: boolean | null
  focusVisible?: boolean | null
  'focus-visible'?: boolean | null
  disabled?: boolean | null
  empty?: boolean | null
  firstChild?: boolean | null
  'first-child'?: boolean | null
  firstOfType?: boolean | null
  'first-of-type'?: boolean | null
  lastOfType?: boolean | null
  'last-of-type'?: boolean | null
  popoverOpen?: boolean | null
  'popover-open'?: boolean | null
  nthChildEven?: boolean | null
  'nth-child(even)'?: boolean | null
  lastChild?: boolean | null
  'last-child'?: boolean | null
  evenChild?: boolean | null
  startingStyle?: boolean | null
  checked?: boolean | null
  invalid?: boolean | null
  link?: boolean | null
  visited?: boolean | null
  autofill?: boolean | null
  pseudoElement?: string | null
  mediaQuery?: MediaQueryJson | null
  breakpoint?: 'small' | 'medium' | 'large' | null
  customProperties?: Record<`--${string}`, CustomPropertyJson> | null
}

export interface MediaQueryJson {
  'min-width'?: string | null
  'max-width'?: string | null
  'min-height'?: string | null
  'max-height'?: string | null
  'prefers-reduced-motion'?: 'reduce' | 'no-preference' | null
}

export interface AnimationKeyframeJson {
  position: number
  key: string
  value: string
}

export interface EventJson {
  trigger: string
  actions: ActionJson[]
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export interface SetVariableActionJson {
  type: 'SetVariable'
  variable: string
  data: FormulaJson
}

export interface TriggerEventActionJson {
  type: 'TriggerEvent'
  event: string
  data: FormulaJson
}

export interface SwitchActionJson {
  type: 'Switch'
  cases?: Array<{ condition: FormulaJson; actions: ActionJson[] }> | null
  default?: { actions: ActionJson[] } | null
}

export interface FetchActionJson {
  type: 'Fetch'
  api: string
  inputs?: Record<string, { formula?: FormulaJson | null }> | null
  onSuccess?: { actions: ActionJson[] } | null
  onError?: { actions: ActionJson[] } | null
  onMessage?: { actions: ActionJson[] } | null
}

export interface AbortFetchActionJson {
  type: 'AbortFetch'
  api: string
}

export interface CustomActionJson {
  type?: 'Custom'
  name: string
  package?: string | null
  arguments?: Array<{ name: string; formula: FormulaJson }> | null
  events?: Record<string, { actions: ActionJson[] }> | null
  version?: 2
  label?: string
}

export interface SetURLParameterActionJson {
  type: 'SetURLParameter'
  parameter: string
  data: FormulaJson
  historyMode?: 'replace' | 'push' | null
}

export interface SetURLParametersActionJson {
  type: 'SetURLParameters'
  parameters: Record<string, FormulaJson>
  historyMode?: 'replace' | 'push' | null
}

export interface TriggerWorkflowActionJson {
  type: 'TriggerWorkflow'
  workflow: string
  parameters?: Record<string, { formula: FormulaJson }> | null
  contextProvider?: string | null
  callbacks?: unknown
}

export interface TriggerWorkflowCallbackActionJson {
  type: 'TriggerWorkflowCallback'
  event: string
  data: FormulaJson
}

/** Built-in `@toddle/*` actions have no explicit `type` in some exports. */
export interface BuiltInActionJson {
  name: `@toddle/${string}`
  package?: string | null
  arguments?: Array<{ name: string; formula: FormulaJson }> | null
  events?: Record<string, { actions: ActionJson[] }> | null
  label?: string
}

export type ActionJson =
  | SetVariableActionJson
  | TriggerEventActionJson
  | SwitchActionJson
  | FetchActionJson
  | AbortFetchActionJson
  | CustomActionJson
  | SetURLParameterActionJson
  | SetURLParametersActionJson
  | TriggerWorkflowActionJson
  | TriggerWorkflowCallbackActionJson
  | BuiltInActionJson

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export interface RouteJson {
  path: Array<RouteSegmentJson>
  query: Record<string, { name: string; testValue?: unknown }>
  info?: RouteInfoJson | null
  response?: {
    headers?: Record<string, FormulaJson | string> | null
    status?: FormulaJson | null
  } | null
}

export type RouteSegmentJson =
  | { type: 'static'; name: string; optional?: boolean | null; testValue?: never }
  | { type: 'param'; name: string; testValue?: string; optional?: boolean | null }

export interface RouteInfoJson {
  title?: { formula: FormulaJson } | null
  description?: { formula: FormulaJson } | null
  icon?: { formula: FormulaJson } | null
  language?: { formula: FormulaJson } | null
  charset?: { formula: FormulaJson } | null
  theme?: { formula: FormulaJson } | null
  meta?: Record<
    string,
    {
      tag: string
      attrs?: Record<string, FormulaJson | null> | null
      content?: FormulaJson | null
      index?: number | null
      enabled?: FormulaJson | null
    }
  > | null
}

export type RouteFileJson =
  | {
      type: 'redirect'
      source: RouteJson
      destination: {
        url?: FormulaJson
        path?: Record<string, { index?: number; formula: FormulaJson } | FormulaJson>
        queryParams?: Record<string, { index?: number; formula: FormulaJson } | FormulaJson>
      }
      status?: number
      enabled?: { formula: FormulaJson }
    }
  | {
      type: 'rewrite'
      source: RouteJson
      destination: {
        url?: FormulaJson
        path?: Record<string, { index?: number; formula: FormulaJson } | FormulaJson>
        queryParams?: Record<string, { index?: number; formula: FormulaJson } | FormulaJson>
      }
      status?: number
      enabled?: { formula: FormulaJson }
    }

// ---------------------------------------------------------------------------
// APIs (kept permissive; compiled in a later milestone)
// ---------------------------------------------------------------------------

export interface ApiJson {
  version?: 2
  name?: string
  type?: 'http' | 'ws'
  method?: string
  url?: FormulaJson | string
  inputs?: Record<string, { formula?: FormulaJson | null }> | null
  path?: Record<string, { formula: FormulaJson; index?: number }> | null
  queryParams?: Record<
    string,
    { formula: FormulaJson; enabled?: FormulaJson | null }
  > | null
  headers?: Record<
    string,
    { formula: FormulaJson; enabled?: FormulaJson | null }
  > | null
  body?: FormulaJson | null
  autoFetch?: FormulaJson | boolean | null
  client?: {
    parserMode?: 'auto' | 'text' | 'json' | 'event-stream' | 'json-stream' | 'blob' | null
    credentials?: 'include' | 'same-origin' | 'omit' | null
    debounce?: { formula: FormulaJson } | null
    onCompleted?: EventJson | null
    onFailed?: EventJson | null
    onMessage?: EventJson | null
  } | null
  server?: {
    proxy?: { enabled?: { formula: FormulaJson } | null; useTemplatesInBody?: { formula: FormulaJson } | null } | null
    ssr?: { enabled?: { formula: FormulaJson } | null } | null
  } | null
  [key: string]: unknown
}

// ---------------------------------------------------------------------------
// Themes
// ---------------------------------------------------------------------------

export interface ThemeJson {
  default?: string
  defaultDark?: string
  defaultLight?: string
  themes?: Record<string, { order?: number }>
  fonts?: Array<{
    name: string
    family: string
    provider?: string
    type?: string
    variants?: Array<{
      name?: string
      weight?: string
      italic?: boolean
      url: string
    }>
  }>
  propertyDefinitions?: Record<
    string,
    {
      syntax?: unknown
      inherits?: boolean | null
      initialValue?: string | null
      description?: string | null
      values?: Record<string, string | null> | null
    }
  > | null
  // Legacy theme token groups
  color?: StyleTokenGroupJson[]
  'font-size'?: StyleTokenGroupJson[]
  'font-weight'?: StyleTokenGroupJson[]
  spacing?: StyleTokenGroupJson[]
  'border-radius'?: StyleTokenGroupJson[]
  shadow?: StyleTokenGroupJson[]
  'z-index'?: StyleTokenGroupJson[]
  [key: string]: unknown
}

export interface StyleTokenGroupJson {
  name: string
  tokens: Array<{ name: string; type?: 'value' | 'variable'; value: string }>
}
