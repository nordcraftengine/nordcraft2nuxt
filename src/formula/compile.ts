import { DiagnosticBag } from '../diagnostics.js'
import type {
  FormulaArgumentJson,
  FormulaJson,
} from '../ingest/types.js'
import { propertyKey, stringLiteral } from '../util/names.js'
import { formulaFunctionName } from './naming.js'
import { formulaMeta, type FormulaTypeHint } from './stdlib.js'

export interface CompiledFormula {
  expression: string
  type: FormulaTypeHint
}

export interface FormulaCompileContext {
  /** Name of the variable holding \`NcFormulaData\`. */
  dataVar: string
  /** Component key, used in diagnostics. */
  componentKey?: string
  /** Maps an \`apply\` operation name to a generated function name. */
  applyResolver?: (name: string) => string
  /** Package containing the component being compiled, if any. */
  packageName?: string
}

interface CompileState {
  dataVar: string
  argsStack: string[]
}

/**
 * Compiles a Nordcraft formula AST into a TypeScript expression over
 * \`NcFormulaData\`. The output uses the small, self-contained runtime in
 * \`src/runtime\`; it never evaluates Nordcraft formula JSON at runtime.
 */
export class FormulaCompiler {
  readonly helpers = new Set<string>()
  needsNcArgsType = false
  usesApply = false
  readonly projectFormulasUsed = new Set<string>()
  private counter = 0
  private readonly diagnostics: DiagnosticBag
  private readonly applyResolver: (name: string) => string
  private readonly projectFormulaResolver?: (
    name: string,
    packageName?: string,
    fromPackage?: string,
  ) => string | undefined
  private readonly componentKey?: string
  private readonly packageName?: string

  constructor(options: {
    diagnostics?: DiagnosticBag
    applyResolver?: (name: string) => string
    projectFormulaResolver?: (
      name: string,
      packageName?: string,
      fromPackage?: string,
    ) => string | undefined
    componentKey?: string
    packageName?: string
  } = {}) {
    this.diagnostics = options.diagnostics ?? new DiagnosticBag()
    this.applyResolver = options.applyResolver ?? formulaFunctionName
    this.projectFormulaResolver = options.projectFormulaResolver
    this.componentKey = options.componentKey
    this.packageName = options.packageName
  }

  compile(
    formula: FormulaJson | null | undefined,
    ctx: FormulaCompileContext,
  ): CompiledFormula {
    if (!formula) return { expression: 'undefined', type: 'unknown' }
    const state: CompileState = {
      dataVar: ctx.dataVar,
      argsStack: [],
    }
    if (formula.type === 'apply') {
      return this.compileApply(formula, state)
    }
    return this.compileNode(formula, state)
  }

  compileCondition(
    formula: FormulaJson | null | undefined,
    ctx: FormulaCompileContext,
  ): CompiledFormula {
    const compiled = this.compile(formula, ctx)
    this.helpers.add('ncTruthy')
    return { expression: `ncTruthy(${compiled.expression})`, type: 'boolean' }
  }

  private compileNode(
    formula: FormulaJson | null | undefined,
    state: CompileState,
  ): CompiledFormula {
    if (!formula) return { expression: 'undefined', type: 'unknown' }
    switch (formula.type) {
      case 'value':
        return { expression: literal(formula.value), type: typeOfValue(formula.value) }
      case 'path':
        this.helpers.add('ncPath')
        return {
          expression: `ncPath(${state.dataVar}, ${JSON.stringify(formula.path)})`,
          type: 'unknown',
        }
      case 'array':
        return {
          expression: `[${(formula.arguments ?? [])
            .map((arg) => this.compileNode(arg.formula, state).expression)
            .join(', ')}]`,
          type: 'array',
        }
      case 'object':
        return this.compileObject(formula.arguments ?? [], state)
      case 'record':
        return this.compileObject(formula.entries ?? [], state)
      case 'and':
        this.helpers.add('ncAnd')
        return {
          expression: `ncAnd([${(formula.arguments ?? [])
            .map((arg) => this.compileNode(arg.formula, state).expression)
            .join(', ')}])`,
          type: 'boolean',
        }
      case 'or':
        this.helpers.add('ncOr')
        return {
          expression: `ncOr([${(formula.arguments ?? [])
            .map((arg) => this.compileNode(arg.formula, state).expression)
            .join(', ')}])`,
          type: 'boolean',
        }
      case 'switch':
        return this.compileSwitch(formula, state)
      case 'function':
        return this.compileFunction(
          formula.name,
          formula.arguments ?? [],
          state,
          formula.variableArguments ?? false,
          formula.package ?? undefined,
        )
      case 'apply':
        return this.compileApply(formula, state)
      default: {
        const never = formula as never
        this.diagnostics.error(
          'unknown-formula-operation',
          `Unsupported formula operation: ${JSON.stringify((never as { type?: string }).type ?? never)}`,
          this.componentKey ? { component: this.componentKey } : {},
        )
        return { expression: 'null', type: 'null' }
      }
    }
  }

  private compileObject(
    args: FormulaArgumentJson[],
    state: CompileState,
  ): CompiledFormula {
    const entries = args.map((arg) => {
      const compiled = this.compileNode(arg.formula, state)
      return `${propertyKey(arg.name ?? '')}: ${compiled.expression}`
    })
    return {
      expression: `{ ${entries.join(', ')} }`,
      type: 'object',
    }
  }

  private compileSwitch(
    formula: Extract<FormulaJson, { type: 'switch' }>,
    state: CompileState,
  ): CompiledFormula {
    const cases = (formula.cases ?? []).filter(Boolean)
    const fallback = this.compileNode(formula.default, state)
    if (cases.length === 0) return fallback

    this.helpers.add('ncTruthy')
    let expression = fallback.expression
    for (let i = cases.length - 1; i >= 0; i--) {
      const current = cases[i]!
      const condition = this.compileNode(current.condition, state)
      const value = this.compileNode(current.formula, state)
      expression = `(ncTruthy(${condition.expression}) ? ${value.expression} : ${expression})`
    }
    return { expression, type: mergeTypes(cases.map((c) => this.typeOf(c.formula)).concat(fallback.type)) }
  }

  private compileFunction(
    name: string,
    args: FormulaArgumentJson[],
    state: CompileState,
    variableArguments: boolean,
    packageName?: string,
  ): CompiledFormula {
    const meta = formulaMeta(name)
    if (!meta) {
      const custom = this.projectFormulaResolver?.(
        name,
        packageName,
        this.packageName,
      )
      if (custom) {
        this.projectFormulasUsed.add(custom)
        const compiledArgs = args.map((arg) => {
          const compiled = this.compileArgument(arg, state)
          return `${propertyKey(arg.name ?? '')}: ${compiled.expression}`
        })
        return {
          expression: `${custom}(${state.dataVar}, { ${compiledArgs.join(', ')} })`,
          type: 'unknown',
        }
      }
      this.diagnostics.warn(
        'unsupported-formula',
        `No TypeScript implementation is registered for formula "${name}". The generated code calls ncUnsupportedFormula.`,
        this.componentKey ? { component: this.componentKey } : {},
      )
      this.helpers.add('ncUnsupportedFormula')
      return {
        expression: `ncUnsupportedFormula(${stringLiteral(name)}, [${args
          .map((arg) => this.compileArgument(arg, state).expression)
          .join(', ')}])`,
        type: 'null',
      }
    }

    const ordered = orderArguments(args, meta.params, meta.variadic || variableArguments)
    this.helpers.add(meta.helper)
    const compiledArgs = ordered.map((arg) => this.compileArgument(arg, state).expression)
    const needsData =
      name === '@toddle/getCookie' || name === '@toddle/getHttpOnlyCookie'
    const call = compiledArgs.length
      ? `${meta.helper}([${compiledArgs.join(', ')}]${needsData ? `, ${state.dataVar}` : ''})`
      : `${meta.helper}()`
    return {
      expression: call,
      type: meta.returnType ?? 'unknown',
    }
  }

  private compileArgument(
    arg: FormulaArgumentJson | null | undefined,
    state: CompileState,
  ): CompiledFormula {
    if (!arg) return { expression: 'undefined', type: 'unknown' }
    if (!arg.isFunction) {
      return this.compileNode(arg.formula, state)
    }

    const index = ++this.counter
    const argsVar = `Args${index}`
    const innerDataVar = `${state.dataVar}${index}`
    const parentArgs = state.argsStack.at(-1)
    this.helpers.add('withArgs')
    this.needsNcArgsType = true

    state.argsStack.push(argsVar)
    const inner = this.compileNode(arg.formula, {
      dataVar: innerDataVar,
      argsStack: state.argsStack,
    })
    state.argsStack.pop()

    const argsExpression = parentArgs
      ? `{ ...${argsVar}, '@toddle.parent': ${parentArgs} }`
      : argsVar

    return {
      expression: `((${argsVar}: NcArgs) => {
  const ${innerDataVar} = withArgs(${state.dataVar}, ${argsExpression})
  return ${inner.expression}
})`,
      type: inner.type,
    }
  }

  private compileApply(
    formula: Extract<FormulaJson, { type: 'apply' }>,
    state: CompileState,
  ): CompiledFormula {
    this.usesApply = true
    const fn = this.applyResolver(formula.name)
    const args = (formula.arguments ?? []).map((arg) => {
      const compiled = this.compileArgument(arg, state)
      return `${propertyKey(arg.name ?? '')}: ${compiled.expression}`
    })
    return {
      expression: `${fn}(${state.dataVar}, { ${args.join(', ')} })`,
      type: 'unknown',
    }
  }

  private typeOf(formula: FormulaJson): FormulaTypeHint {
    switch (formula.type) {
      case 'value':
        return typeOfValue(formula.value)
      case 'array':
        return 'array'
      case 'object':
      case 'record':
        return 'object'
      case 'and':
      case 'or':
        return 'boolean'
      case 'switch': {
        const cases = formula.cases ?? []
        return cases.length
          ? mergeTypes(cases.map((c) => this.typeOf(c.formula)).concat(this.typeOf(formula.default)))
          : this.typeOf(formula.default)
      }
      case 'function':
        return formulaMeta(formula.name)?.returnType ?? 'unknown'
      default:
        return 'unknown'
    }
  }
}

function orderArguments(
  args: FormulaArgumentJson[],
  params: string[] | undefined,
  variadic: boolean,
): FormulaArgumentJson[] {
  if (variadic && args.every((arg) => arg.name != null && /^\d+$/.test(arg.name))) {
    return [...args].sort((a, b) => Number(a.name) - Number(b.name))
  }
  if (!params || params.length === 0) return args
  const byName = new Map<string, FormulaArgumentJson>()
  for (const arg of args) {
    if (arg.name) byName.set(normalizeName(arg.name), arg)
  }
  const ordered: FormulaArgumentJson[] = []
  for (const name of params) {
    const arg = byName.get(normalizeName(name))
    if (arg) {
      ordered.push(arg)
      byName.delete(normalizeName(name))
    }
  }
  // If the export used a different naming scheme, preserve the original order.
  if (ordered.length !== args.length && ordered.length === 0) return args
  for (const arg of args) {
    if (!ordered.includes(arg)) ordered.push(arg)
  }
  return ordered
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function literal(value: unknown): string {
  if (value === undefined) return 'undefined'
  if (value instanceof Date) return `new Date(${stringLiteral(value.toISOString())})`
  const json = JSON.stringify(value)
  return json === undefined ? 'undefined' : json
}

function typeOfValue(value: unknown): FormulaTypeHint {
  if (value === null) return 'null'
  switch (typeof value) {
    case 'string':
      return 'string'
    case 'number':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'object':
      return Array.isArray(value) ? 'array' : 'object'
    default:
      return 'unknown'
  }
}

function mergeTypes(types: FormulaTypeHint[]): FormulaTypeHint {
  const unique = [...new Set(types)]
  return unique.length === 1 ? unique[0]! : 'unknown'
}
