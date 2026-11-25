import type { DiagnosticBag } from '../diagnostics.js'
import { FormulaCompiler } from '../formula/compile.js'
import {
  apiDescriptorName,
  customPropertyFunctionName,
  styleVariableFunctionName,
  formulaFunctionName,
  initialFormulaName,
  nodeFunctionName,
  pageFormulaName,
  variantCustomPropertyFunctionName,
  pageResponseHeaderName,
} from '../formula/naming.js'
import type { ApiJson, FormulaJson, NodeJson } from '../ingest/types.js'
import type { ComponentIR } from '../ir/types.js'
import { safeIdentifier } from '../util/names.js'
import { apiLiteralUrl, apiProxyEnabled } from './api-utils.js'

export interface FormulaFileResult {
  content: string
  helpers: Set<string>
  usesNcArgs: boolean
  usesApply: boolean
}

export function emitFormulaFile(
  component: ComponentIR,
  diagnostics: DiagnosticBag,
  projectFormulaResolver?: (
    name: string,
    packageName?: string,
    fromPackage?: string,
  ) => string | undefined,
): FormulaFileResult {
  const compiler = new FormulaCompiler({
    diagnostics,
    componentKey: component.key,
    packageName: component.packageName,
    applyResolver: formulaFunctionName,
    projectFormulaResolver,
  })
  const defs: string[] = []

  const add = (
    name: string,
    formula: FormulaJson | null | undefined,
    options: { bindArgs: boolean; unit?: string | null } = { bindArgs: false },
  ) => {
    if (!formula) {
      diagnostics.warn(
        'missing-formula',
        `Formula function "${name}" skipped because its formula is missing.`,
        { component: component.key },
      )
      return
    }
    if (options.bindArgs) {
      compiler.helpers.add('withArgs')
    }
    const compiled = compiler.compile(formula, {
      dataVar: options.bindArgs ? 'dArgs' : 'd',
      componentKey: component.key,
    })
    const expression = options.unit
      ? (compiler.helpers.add('ncWithUnit'),
        `ncWithUnit([${compiled.expression}, ${JSON.stringify(options.unit)}])`)
      : compiled.expression
    const lines = [
      `export function ${name}(d: NcFormulaData, args: NcArgs = {}): any {`,
    ]
    if (options.bindArgs) lines.push('  const dArgs = withArgs(d, args)')
    lines.push(`  return ${expression}`)
    lines.push('}')
    defs.push(lines.join('\n'))
  }

  for (const [key, formula] of Object.entries(component.source.formulas ?? {})) {
    if (!formula) continue
    add(formulaFunctionName(key), formula.formula, {
      bindArgs: (formula.arguments?.length ?? 0) > 0,
    })
  }

  for (const [name, variable] of Object.entries(component.source.variables ?? {})) {
    if (!variable?.initialValue) continue
    add(initialFormulaName(name), variable.initialValue)
  }

  for (const [nodeId, node] of Object.entries(component.source.nodes ?? {})) {
    if (!node) continue
    addNodeFormulas(nodeId, node, add)
  }

  for (const [apiName, api] of Object.entries(component.source.apis ?? {})) {
    if (!api) continue
    if (apiProxyEnabled(api) && !apiLiteralUrl(api)) {
      diagnostics.warn(
        'api-proxy-dynamic-url',
        `API "${apiName}" uses server proxying with a dynamic base URL. The proxy allowlist cannot be generated, so this API will be called directly.`,
        { component: component.key },
      )
    }
    if (
      apiProxyEnabled(api) &&
      (api.type === 'ws' ||
        api.client?.parserMode === 'event-stream' ||
        api.client?.parserMode === 'json-stream')
    ) {
      diagnostics.warn(
        'api-proxy-streaming-unsupported',
        `API "${apiName}" uses streaming/WebSocket with server proxying. Streaming requests are sent directly because the proxy route does not stream responses yet.`,
        { component: component.key },
      )
    }
    compiler.helpers.add('withApiInputs')
    addApiDescriptor(apiName, api, compiler, defs, component.key)
  }

  if (component.route?.info) {
    const info = component.route.info
    if (info.title?.formula) add(pageFormulaName('title'), info.title.formula)
    if (info.description?.formula) {
      add(pageFormulaName('description'), info.description.formula)
    }
    if (info.language?.formula) add(pageFormulaName('language'), info.language.formula)
    if (info.theme?.formula) add(pageFormulaName('theme'), info.theme.formula)
    if (info.icon?.formula) add(pageFormulaName('icon'), info.icon.formula)
  }

  if (component.route?.response) {
    if (component.route.response.status) {
      add(pageFormulaName('responseStatus'), component.route.response.status)
    }
    for (const [key, value] of Object.entries(component.route.response.headers ?? {})) {
      add(
        pageResponseHeaderName(key),
        typeof value === 'string' ? { type: 'value', value } : value,
      )
    }
  }

  const helpers = [...compiler.helpers].sort()
  const imports: string[] = [
    `import type { NcArgs, NcFormulaData } from '~/lib/runtime'`,
  ]
  if (helpers.length) {
    imports.push(`import { ${helpers.join(', ')} } from '~/lib/runtime'`)
  }
  if (Object.values(component.source.apis ?? {}).some((api) => api != null)) {
    imports.push(`import type { NcApiDescriptor } from '~/lib/runtime'`)
  }
  const projectCalls = [...compiler.projectFormulasUsed]
  if (projectCalls.some((call) => call.startsWith('PF.'))) {
    imports.push(`import * as PF from '~/lib/nordcraft/project-formulas'`)
  }
  if (projectCalls.some((call) => call.startsWith('PKG.'))) {
    imports.push(`import * as PKG from '~/lib/nordcraft/project-formulas'`)
  }
  const content =
    `/* Generated by nordcraft2nuxt from Nordcraft project JSON. Do not edit by hand. */\n` +
    imports.join('\n') +
    '\n\n' +
    (defs.length ? defs.join('\n\n') : 'export {}\n')

  return {
    content,
    helpers: compiler.helpers,
    usesNcArgs: true,
    usesApply: compiler.usesApply,
  }
}

type AddFormula = (
  name: string,
  formula: FormulaJson | null | undefined,
  options?: { bindArgs: boolean; unit?: string | null },
) => void

function addNodeFormulas(nodeId: string, node: NodeJson, add: AddFormula): void {
  if (isFormulaJson(node.condition)) {
    add(nodeFunctionName(nodeId, 'condition'), node.condition)
  }
  if (node.repeat) add(nodeFunctionName(nodeId, 'repeat'), node.repeat)
  if (node.repeatKey) add(nodeFunctionName(nodeId, 'repeatKey'), node.repeatKey)

  if (node.type === 'text') {
    add(nodeFunctionName(nodeId, 'text'), node.value)
    return
  }

  if (node.type === 'slot') {
    const name = node.attr?.name
    if (name && name.type !== 'value') {
      add(nodeFunctionName(nodeId, 'slotName'), name)
    }
    return
  }

  if (node.type === 'element') {
    for (const [attr, formula] of Object.entries(node.attrs ?? {})) {
      add(nodeFunctionName(nodeId, 'attr', attr), formula)
    }
    for (const [className, value] of Object.entries(node.classes ?? {})) {
      if (value?.formula) {
        add(nodeFunctionName(nodeId, 'class', className), value.formula)
      }
    }
    for (const styleVariable of node['style-variables'] ?? []) {
      add(
        styleVariableFunctionName(nodeId, styleVariable.name),
        styleVariable.formula,
        { bindArgs: false, unit: styleVariable.unit },
      )
    }
    for (const [propertyName, property] of Object.entries(node.customProperties ?? {})) {
      add(
        customPropertyFunctionName(nodeId, propertyName),
        property?.formula,
        { bindArgs: false, unit: property?.unit },
      )
    }
    for (let index = 0; index < (node.variants ?? []).length; index++) {
      const variant = node.variants![index]!
      for (const [propertyName, property] of Object.entries(
        variant.customProperties ?? {},
      )) {
        if (property?.formula && property.formula.type !== 'value') {
          add(
            variantCustomPropertyFunctionName(nodeId, index, propertyName),
            property.formula,
            { bindArgs: false, unit: property.unit },
          )
        }
      }
    }
    return
  }

  if (node.type === 'component') {
    for (const [attr, formula] of Object.entries(node.attrs ?? {})) {
      add(nodeFunctionName(nodeId, 'attr', attr), formula)
    }
    for (const [propertyName, property] of Object.entries(node.customProperties ?? {})) {
      add(
        customPropertyFunctionName(nodeId, propertyName),
        property?.formula,
        { bindArgs: false, unit: property?.unit },
      )
    }
    for (let index = 0; index < (node.variants ?? []).length; index++) {
      const variant = node.variants![index]!
      for (const [propertyName, property] of Object.entries(
        variant.customProperties ?? {},
      )) {
        if (property?.formula && property.formula.type !== 'value') {
          add(
            variantCustomPropertyFunctionName(nodeId, index, propertyName),
            property.formula,
            { bindArgs: false, unit: property.unit },
          )
        }
      }
    }
  }
}


function addApiDescriptor(
  name: string,
  api: ApiJson,
  compiler: FormulaCompiler,
  defs: string[],
  componentKey: string,
): void {
  const functionName = apiDescriptorName(name)
  const autoFetch =
    api.autoFetch == null
      ? 'false'
      : typeof api.autoFetch === 'boolean'
        ? String(api.autoFetch)
        : compiler.compile(api.autoFetch, { dataVar: 'd', componentKey }).expression
  const ssrFormula = api.server?.ssr?.enabled?.formula
  const ssr = ssrFormula
    ? compiler.compileCondition(ssrFormula, { dataVar: 'd', componentKey }).expression
    : 'false'
  const proxy = apiProxyEnabled(api) && apiLiteralUrl(api) ? 'true' : undefined

  const defaults = Object.entries(api.inputs ?? {})
    .filter((entry): entry is [string, NonNullable<typeof entry[1]>] => entry[1] != null)
    .map(([key, input]) => {
      const expression = input.formula
        ? compiler.compile(input.formula, { dataVar: 'd', componentKey }).expression
        : 'undefined'
      return `${JSON.stringify(key)}: ${expression}`
    })
    .join(', ')

  const url =
    typeof api.url === 'string'
      ? JSON.stringify(api.url)
      : api.url
        ? compiler.compile(api.url, { dataVar: 'di', componentKey }).expression
        : "''"

  const path = Object.entries(api.path ?? {})
    .filter((entry): entry is [string, NonNullable<typeof entry[1]>] => entry[1] != null)
    .map(([key, segment]) => {
      const value = compiler.compile(segment.formula, { dataVar: 'di', componentKey }).expression
      return `{ name: ${JSON.stringify(key)}, value: ${value}, index: ${segment.index ?? 0} }`
    })

  const query = Object.entries(api.queryParams ?? {})
    .filter((entry): entry is [string, NonNullable<typeof entry[1]>] => entry[1] != null)
    .map(([key, param]) => {
      const value = compiler.compile(param.formula, { dataVar: 'di', componentKey }).expression
      const enabled = param.enabled
        ? compiler.compileCondition(param.enabled, { dataVar: 'di', componentKey }).expression
        : 'true'
      return `{ name: ${JSON.stringify(key)}, value: ${value}, enabled: ${enabled} }`
    })

  const headers = Object.entries(api.headers ?? {})
    .filter((entry): entry is [string, NonNullable<typeof entry[1]>] => entry[1] != null)
    .map(([key, header]) => {
      const value = compiler.compile(header.formula, { dataVar: 'di', componentKey }).expression
      const enabled = header.enabled
        ? compiler.compileCondition(header.enabled, { dataVar: 'di', componentKey }).expression
        : 'true'
      return `{ name: ${JSON.stringify(key)}, value: ${value}, enabled: ${enabled} }`
    })

  const body = api.body
    ? compiler.compile(api.body, { dataVar: 'di', componentKey }).expression
    : undefined
  const method = typeof api.method === 'string' ? api.method : 'GET'
  const credentials = api.client?.credentials
  const parserMode = api.client?.parserMode
  const debounceFormula = api.client?.debounce?.formula
  const debounce = debounceFormula
    ? compiler.compile(debounceFormula, { dataVar: 'd', componentKey }).expression
    : undefined

  const requestFields = [
    `type: ${JSON.stringify(api.type ?? 'http')}`,
    `url: ${url}`,
    `method: ${JSON.stringify(method)}`,
    path.length ? `path: [${path.join(', ')}]` : '',
    query.length ? `query: [${query.join(', ')}]` : '',
    headers.length ? `headers: [${headers.join(', ')}]` : '',
    body ? `body: ${body}` : '',
    credentials ? `credentials: ${JSON.stringify(credentials)}` : '',
    parserMode ? `parserMode: ${JSON.stringify(parserMode)}` : '',
  ].filter(Boolean).join(',\n            ')

  defs.push(`export const ${functionName}: NcApiDescriptor = {
  name: ${JSON.stringify(name)},
  autoFetch: (d) => ${autoFetch},
  ssr: (d) => ${ssr},${proxy ? `\n  proxy: (d) => ${proxy},` : ''}
  defaults: (d) => ({ ${defaults} }),
  build: (d, inputs) => {
    const di = withApiInputs(d, inputs)
    return {
            ${requestFields}
    }
  },${debounce ? `\n  debounce: (d) => ${debounce},` : ''}
}`)
}

function isFormulaJson(value: unknown): value is FormulaJson {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string'
  )
}
