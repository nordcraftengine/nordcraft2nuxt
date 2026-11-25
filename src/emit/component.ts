import type { DiagnosticBag } from '../diagnostics.js'
import {
  pageResponseHeaderName,
  apiDescriptorName,
  eventWorkflowFunctionName,
  formulaFunctionName,
  initialFormulaName,
  workflowFunctionName,
} from '../formula/naming.js'
import type { ComponentIR, ProjectIR } from '../ir/types.js'
import { safeIdentifier, stringLiteral, vuePropName } from '../util/names.js'
import type { TemplateResult } from './template.js'
import type { FormulaFileResult } from './formula-file.js'
import type { WorkflowFileResult } from './workflow-file.js'

export interface SfcOptions {
  component: ComponentIR
  ir: ProjectIR
  template: TemplateResult
  formulaFile: FormulaFileResult
  workflowFile: WorkflowFileResult
  diagnostics: DiagnosticBag
  isPage: boolean
  styles?: string
}

export function emitComponentSfc(options: SfcOptions): string {
  const { component, template, formulaFile, workflowFile, isPage, styles } = options
  const imports = new ImportBag()
  imports.add('vue', ['computed', 'inject', 'onMounted', 'onUnmounted', 'provide', 'reactive', 'watch', 'watchEffect'])
  imports.add('#imports', ['navigateTo', 'useHead', 'useRequestHeaders', 'useRoute', 'useRouter', 'useSeoMeta'])
  const hasVariables = Object.values(component.source.variables ?? {}).some(
    (variable) => variable?.initialValue,
  )
  if (hasVariables) {
    imports.add('vue', ['useId'])
    imports.add('#imports', ['useState'])
  }
  imports.add('~/composables/useNcTheme', ['useNcTheme'])
  if (isPage) imports.add('~/lib/nuxt/route', ['useNcRouteAttributes'])
  const hasResponseConfig = Boolean(component.route?.response)
  if (hasResponseConfig) {
    imports.add('#imports', ['useRequestEvent'])
    imports.add('h3', ['setResponseHeader', 'setResponseStatus'])
  }
  const hasApis = Object.values(component.source.apis ?? {}).some((api) => api != null)
  if (hasApis) imports.add('~/lib/nuxt/api', ['useNcApi'])
  const hasCustomActions =
    Object.keys(options.ir.projectActions ?? {}).length > 0 ||
    Object.values(options.ir.packages ?? {}).some(
      (pkg) => Object.keys(pkg?.actions ?? {}).length > 0,
    )
  if (hasCustomActions) {
    imports.add('~/lib/nordcraft/custom-actions', ['customActions'])
  }

  const runtimeNames = ['createNcData', 'createWorkflowContext']
  for (const helper of template.helpers) runtimeNames.push(helper)
  if (component.source.contexts && Object.keys(component.source.contexts).length) {
    runtimeNames.push('ncContextValues')
  }
  runtimeNames.push('ncParseCookieHeader')
  imports.add('~/lib/runtime', [...new Set(runtimeNames)])
  imports.addType('~/lib/runtime', ['NcApi', 'NcContext', 'NcFormulaData', 'NcWorkflow', 'NcWorkflowContext'])

  const formulaPath = isPage
    ? `~/components/nordcraft/${component.vueName}.formulas`
    : `./${component.vueName}.formulas`
  const workflowPath = isPage
    ? `~/components/nordcraft/${component.vueName}.workflows`
    : `./${component.vueName}.workflows`
  imports.addNamespace(formulaPath, 'F')
  imports.addNamespace(workflowPath, 'W')

  if (template.usesNcStyle) imports.addDefault('~/components/NcStyle', 'NcStyle')
  if (template.usesNcScript) imports.addDefault('~/components/NcScript', 'NcScript')

  for (const childKey of template.childComponentKeys) {
    if (childKey === component.key) continue
    const child = options.ir.componentByKey.get(childKey)
    if (!child) continue
    imports.addDefault(`~/components/nordcraft/${child.fileName}`, child.vueName)
  }

  const script: string[] = []
  script.push(`defineOptions({ name: ${stringLiteral(component.vueName)} })`)
  if (isPage) {
    script.push(`definePageMeta({ pageKey: ${stringLiteral(component.key)} })`)
  }

  const propsCode = buildProps(component)
  script.push(propsCode)
  const emitsCode = buildEmits(component)
  script.push(emitsCode)

  script.push(`const route = useRoute()`)
  script.push(`const router = useRouter()`)
  script.push(`const theme = useNcTheme()`)
  script.push(
    `const ncRequestCookies = ncParseCookieHeader(useRequestHeaders(['cookie']).cookie)`,
  )

  if (isPage) {
    script.push(`const pageAttributes = useNcRouteAttributes(route)`)
  }

  const contextsCode = buildContexts(component)
  script.push(contextsCode.declaration)

  script.push(`const vars = reactive<Record<string, unknown>>({})`)

  const formulaKeys = Object.keys(component.source.formulas ?? {}).filter(
    (key) => component.source.formulas?.[key],
  )
  if (formulaKeys.length) {
    script.push(
      `const ncFormulas: Record<string, (d: NcFormulaData, args?: Record<string, unknown>) => any> = {\n` +
        formulaKeys
          .map(
            (key) =>
              `  ${JSON.stringify(key)}: (d, args) => F.${formulaFunctionName(key)}(d, args),`,
          )
          .join('\n') +
        `\n}`,
    )
  } else {
    script.push(`const ncFormulas: Record<string, (d: NcFormulaData, args?: Record<string, unknown>) => any> = {}`)
  }

  const apisNames = Object.keys(component.source.apis ?? {}).filter(
    (key) => component.source.apis?.[key],
  )
  script.push(`const apis: Record<string, NcApi> = {}`)
  for (const name of apisNames) {
    script.push(
      `apis[${JSON.stringify(name)}] = reactive({ data: null, isLoading: false, error: null, response: null })`,
    )
  }

  const createDataOptions = [
    'vars',
    'props',
    `apis`,
    `contexts: ${contextsCode.valuesName}`,
    'route',
    `theme: () => theme.get()`,
    'formulas: ncFormulas',
    'cookies: ncRequestCookies',
    ...(isPage ? ['attributes: pageAttributes', `pageName: ${stringLiteral(component.key)}`] : []),
    ...(isPage && component.route
      ? [
          `queryDefaults: { ${Object.keys(component.route.query ?? {})
            .map((key) => `${JSON.stringify(key)}: null`)
            .join(', ')} }`,
        ]
      : []),
  ]
  script.push(`const data: NcFormulaData = createNcData({ ${createDataOptions.join(', ')} })`)
  script.push(`const ncTemplateData = data`)

  const variables = Object.entries(component.source.variables ?? {}).filter(
    (entry): entry is [string, NonNullable<typeof entry[1]>] =>
      entry[1]?.initialValue != null,
  )
  if (variables.length) {
    script.push(`const ncVarsId = useId()`)
    script.push(`const ncInitialVars = () => {`)
    for (const [name] of variables) {
      script.push(`  vars[${JSON.stringify(name)}] = F.${initialFormulaName(name)}(data)`)
    }
    script.push(`  return { ...vars }`)
    script.push(`}`)
    script.push(
      `const ncVarsSnapshot = useState<Record<string, unknown>>(\`nc-vars-\${ncVarsId}\`, ncInitialVars)`,
    )
    script.push(`Object.assign(vars, ncVarsSnapshot.value)`)
    script.push(`onMounted(() => { Object.assign(vars, ncInitialVars()) })`)
  }

  const exposedFormulas = Object.entries(component.source.formulas ?? {}).filter(
    ([, formula]) => formula?.exposeInContext,
  )
  const exposedWorkflows = Object.entries(component.source.workflows ?? {}).filter(
    ([, workflow]) => workflow?.exposeInContext,
  )

  const workflowKeys = Object.keys(component.source.workflows ?? {}).filter(
    (key) => component.source.workflows?.[key],
  )
  if (workflowKeys.length) {
    script.push(
      `const ncWorkflows: Record<string, NcWorkflow> = {\n` +
        workflowKeys
          .map(
            (key) =>
              `  ${JSON.stringify(key)}: (ctx, event, params) => W.${workflowFunctionName(key)}(ctx, event, params),`,
          )
          .join('\n') +
        `\n}`,
    )
  } else {
    script.push(
      `const ncWorkflows: Record<string, NcWorkflow> = {}`,
    )
  }

  script.push(`const ncCleanups: Array<() => void> = []`)
  script.push(
    `const workflowContext = createWorkflowContext({\n` +
      `  data,\n` +
      `  emit: emit as (event: string, payload?: unknown) => void,\n` +
      `  router,\n` +
      `  route,\n` +
      `  theme: { get: theme.get, set: theme.set },\n` +
      `  apis,\n` +
      `  contexts: ${contextsCode.valuesName},\n` +
      `  workflows: ncWorkflows,\n` +
      `  customActions: ${hasCustomActions ? 'customActions' : '{}'},\n` +
      `  onCleanup: (fn) => ncCleanups.push(fn),\n` +
      `  triggerCallback: () => undefined,\n` +
      `  navigate: (url, options) => navigateTo(url, { replace: options?.replace }),\n` +
      `})`,
  )
  script.push(`onUnmounted(() => { for (const cleanup of ncCleanups) cleanup() })`)

  for (const name of apisNames) {
    const api = component.source.apis?.[name]
    if (!api) continue
    const options = ['data']
    if (api.client?.onCompleted?.actions.length) {
      options.push(
        `onCompleted: (event) => { void W.${eventWorkflowFunctionName(name, 'completed')}(workflowContext, event) }`,
      )
    }
    if (api.client?.onFailed?.actions.length) {
      options.push(
        `onFailed: (event) => { void W.${eventWorkflowFunctionName(name, 'failed')}(workflowContext, event) }`,
      )
    }
    if (api.client?.onMessage?.actions.length) {
      options.push(
        `onMessage: (event) => { void W.${eventWorkflowFunctionName(name, 'message')}(workflowContext, event) }`,
      )
    }
    script.push(
      `apis[${JSON.stringify(name)}].isLoading = Boolean(F.${apiDescriptorName(name)}.autoFetch(data))`,
    )
    script.push(
      `apis[${JSON.stringify(name)}] = useNcApi(F.${apiDescriptorName(name)}, { ${options.join(', ')} })`,
    )
  }

  if (exposedFormulas.length || exposedWorkflows.length) {
    const providerKey = component.key
    const formulaEntries = exposedFormulas.map(([key]) => {
      return `    ${JSON.stringify(key)}: computed(() => F.${formulaFunctionName(key)}(data)),`
    })
    const workflowEntries = exposedWorkflows.map(([key]) => {
      return `    ${JSON.stringify(key)}: (childCtx: NcWorkflowContext, event?: unknown, params?: Record<string, unknown>) => W.${workflowFunctionName(key)}(workflowContext, event, params),`
    })
    script.push(
      `provide(${stringLiteral(providerKey)}, {\n` +
        (formulaEntries.length ? `  formulas: {\n${formulaEntries.join('\n')}\n  },\n` : '') +
        (workflowEntries.length ? `  workflows: {\n${workflowEntries.join('\n')}\n  },\n` : '') +
        `})`,
    )
  }

  for (const item of template.computedText) {
    script.push(
      `const ${item.binding} = computed(() => F.${item.formula}(data))`,
    )
  }

  for (const formulaName of template.formulaFunctions) {
    script.push(
      `const f_${formulaName} = (d: NcFormulaData) => F.${formulaName}(d)`,
    )
  }

  for (const binding of template.eventBindings) {
    script.push(
      `function ${binding.handlerName}(\n` +
        `  event: unknown,\n` +
        `  data: NcFormulaData = ncTemplateData,\n` +
        `) {\n` +
        `  void W.${binding.workflowName}({ ...workflowContext, data }, event)\n` +
        `}`,
    )
  }

  if (component.source.onLoad?.actions.length) {
    imports.add('vue', ['nextTick'])
    script.push(
      `onMounted(async () => { await nextTick(); void W.event_onLoad(workflowContext) })`,
    )
  }

  if (component.source.onAttributeChange?.actions.length) {
    script.push(
      `watch(() => ({ ...props }), (next, previous) => {\n` +
        `  const nextRecord = next as Record<string, unknown>\n` +
        `  const previousRecord = previous as Record<string, unknown> | undefined\n` +
        `  const detail: Record<string, { current: unknown; new: unknown }> = {}\n` +
        `  for (const key of Object.keys(nextRecord)) {\n` +
        `    if (!Object.is(nextRecord[key], previousRecord?.[key])) detail[key] = { current: previousRecord?.[key], new: nextRecord[key] }\n` +
        `  }\n` +
        `  if (Object.keys(detail).length) {\n` +
        `    void W.event_onAttributeChange(workflowContext, new CustomEvent('attribute-change', { detail }))\n` +
        `  }\n` +
        `}, { flush: 'post' })`,
    )
  }

  if (isPage && component.route?.info) {
    const info = component.route.info
    if (info.title?.formula) {
      script.push(`useHead(() => ({ title: F.page_title(data) as string | undefined }))`)
    } else {
      script.push(`useHead({ title: ${stringLiteral(component.name)} })`)
    }
    if (info.description?.formula) {
      script.push(`useSeoMeta({ description: () => F.page_description(data) as string | undefined })`)
    }
    if (info.language?.formula) {
      script.push(
        `useHead(() => ({ htmlAttrs: { lang: (F.page_language(data) as string | undefined) ?? 'en' } }))`,
      )
    }
    if (info.theme?.formula) {
      script.push(
        `watchEffect(() => { const value = F.page_theme(data); if (typeof value === 'string') theme.set(value) })`,
      )
    }
  } else if (isPage) {
    script.push(`useHead({ title: ${stringLiteral(component.name)} })`)
  }

  if (isPage && component.route?.response) {
    const response = component.route.response
    script.push(`if (import.meta.server) {`)
    script.push(`  const event = useRequestEvent()`)
    script.push(`  if (event) {`)
    if (response.status) {
      script.push(`    const status = F.page_responseStatus(data)`)
      script.push(`    if (status !== null && status !== undefined) setResponseStatus(event, Number(status))`)
    }
    for (const key of Object.keys(response.headers ?? {})) {
      script.push(`    const header_${safeIdentifier(key, 'header')} = F.${pageResponseHeaderName(key)}(data)`)
      script.push(`    if (header_${safeIdentifier(key, 'header')} !== null && header_${safeIdentifier(key, 'header')} !== undefined) setResponseHeader(event, ${stringLiteral(key)}, String(header_${safeIdentifier(key, 'header')}))`)
    }
    script.push(`  }`)
    script.push(`}`)
  }

  // `formulaFile` and `workflowFile` are emitted separately; the references keep
  // the generated script and its sibling modules in sync.
  void formulaFile
  void workflowFile

  const templateBlock = template.template
    .split('\n')
    .map((line) => (line.trim() ? `  ${line}` : line))
    .join('\n')

  return [
    `<!-- Generated by nordcraft2nuxt from Nordcraft project JSON. Do not edit by hand. -->`,
    `<script setup lang="ts">`,
    imports.render(),
    '',
    ...script.flatMap((line) => line.split('\n')),
    `</script>`,
    '',
    `<template>`,
    templateBlock,
    `</template>`,
    ...(styles ? ['', '<style scoped module>', styles, '</style>'] : []),
    '',
  ].join('\n')
}

class ImportBag {
  private readonly imports = new Map<string, Set<string>>()
  private readonly typeImports = new Map<string, Set<string>>()
  private readonly namespaces = new Map<string, string>()
  private readonly defaults = new Map<string, string>()

  add(from: string, names: string[]): void {
    const set = this.imports.get(from) ?? new Set<string>()
    for (const name of names) set.add(name)
    this.imports.set(from, set)
  }

  addType(from: string, names: string[]): void {
    const set = this.typeImports.get(from) ?? new Set<string>()
    for (const name of names) set.add(name)
    this.typeImports.set(from, set)
  }

  addNamespace(from: string, name: string): void {
    this.namespaces.set(name, from)
  }

  addDefault(from: string, name: string): void {
    this.defaults.set(name, from)
  }

  render(): string {
    const lines: string[] = []
    for (const [name, from] of [...this.defaults].sort(([a], [b]) => a.localeCompare(b))) {
      lines.push(`import ${name} from '${from}'`)
    }
    for (const [from, names] of [...this.imports].sort(([a], [b]) => a.localeCompare(b))) {
      lines.push(`import { ${[...names].sort().join(', ')} } from '${from}'`)
    }
    for (const [from, names] of [...this.typeImports].sort(([a], [b]) => a.localeCompare(b))) {
      lines.push(`import type { ${[...names].sort().join(', ')} } from '${from}'`)
    }
    for (const [name, from] of [...this.namespaces].sort(([a], [b]) => a.localeCompare(b))) {
      lines.push(`import * as ${name} from '${from}'`)
    }
    return lines.join('\n')
  }
}

function buildProps(component: ComponentIR): string {
  const attributes = Object.entries(component.source.attributes ?? {}).filter(
    (entry): entry is [string, NonNullable<typeof entry[1]>] => entry[1] != null,
  )
  if (attributes.length === 0) {
    return `const props: Record<string, unknown> = {}`
  }
  const fields = attributes
    .map(
      ([name, attribute]) =>
        `  ${JSON.stringify(vuePropName(name))}?: ${propType(attribute.testValue)}`,
    )
    .join('\n')
  return `const props = defineProps<{\n${fields}\n}>()`
}

function propType(value: unknown): string {
  if (value === null || value === undefined) return 'unknown'
  switch (typeof value) {
    case 'string':
      return 'string'
    case 'number':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'object':
      return Array.isArray(value) ? 'unknown[]' : 'Record<string, unknown>'
    default:
      return 'unknown'
  }
}

function buildEmits(component: ComponentIR): string {
  const events = (component.source.events ?? []).filter(
    (event): event is NonNullable<typeof event> => event != null,
  )
  if (events.length === 0) {
    return `const emit = (event: string, payload?: unknown) => { void event; void payload }`
  }
  return `const emit = defineEmits<{\n${events
    .map((event) => `  (e: ${stringLiteral(event.name)}, payload: unknown): void`)
    .join('\n')}\n}>()`
}

function buildContexts(component: ComponentIR): {
  declaration: string
  valuesName: string
} {
  const contexts = Object.entries(component.source.contexts ?? {}).filter(
    (entry): entry is [string, NonNullable<typeof entry[1]>] => entry[1] != null,
  )
  if (contexts.length === 0) {
    return { declaration: `const contexts: Record<string, NcContext> = {}`, valuesName: 'contexts' }
  }
  const lines: string[] = []
  const entries: string[] = []
  for (const [key, context] of contexts) {
    const variable = `ncProvider_${safeIdentifier(key, 'context')}`
    const providerKey = contextProviderKey(component, key, context)
    lines.push(
      `const ${variable} = inject<{ formulas?: Record<string, unknown>; workflows?: Record<string, unknown> } | null>(${stringLiteral(providerKey)}, null)`,
    )
    entries.push(
      `  get ${JSON.stringify(key)}() {\n    return ${variable} ? (ncContextValues(${variable}) as NcContext) : undefined\n  },`,
    )
  }
  lines.push(`const contexts: Record<string, NcContext> = {\n${entries.join('\n')}\n}`)
  return { declaration: lines.join('\n'), valuesName: 'contexts' }
}

function contextProviderKey(
  component: ComponentIR,
  contextName: string,
  context: { componentName?: string | null; package?: string | null },
): string {
  const packageName = context.package ?? component.packageName
  const name = context.componentName ?? contextName
  if (!packageName) return contextName.startsWith(`${name}`) ? contextName : name
  if (contextName.startsWith(`${packageName}/`)) return contextName
  return `${packageName}/${name}`
}
