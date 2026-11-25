import { DiagnosticBag } from '../diagnostics.js'
import type {
  ActionJson,
  FormulaJson,
  WorkflowJson,
} from '../ingest/types.js'
import type { FormulaCompiler } from '../formula/compile.js'
import {
  eventWorkflowFunctionName,
  workflowFunctionName,
} from '../formula/naming.js'
import { propertyKey, stringLiteral } from '../util/names.js'
import type { NcApiCallbacks } from '../runtime/workflow.js'

export interface WorkflowCompilerOptions {
  componentKey: string
  diagnostics: DiagnosticBag
  formulaCompiler: FormulaCompiler
  /** Resolves a custom action name relative to the component's package. */
  customActionResolver?: (name: string, packageName?: string) => string
}

/**
 * Compiles Nordcraft workflows and event action lists into typed TypeScript
 * functions. Workflow structure becomes real control flow; only leaf built-in
 * actions use a small typed dispatcher.
 */
export class WorkflowCompiler {
  readonly helpers = new Set<string>()
  private readonly componentKey: string
  private readonly diagnostics: DiagnosticBag
  private readonly formulas: FormulaCompiler
  private readonly customActionResolver?: (
    name: string,
    packageName?: string,
  ) => string
  private statementCounter = 0
  private paramsExpression = 'undefined'

  constructor(options: WorkflowCompilerOptions) {
    this.componentKey = options.componentKey
    this.diagnostics = options.diagnostics
    this.formulas = options.formulaCompiler
    this.customActionResolver = options.customActionResolver
  }

  compileWorkflow(key: string, workflow: WorkflowJson): string {
    return this.compileFunction({
      name: workflowFunctionName(key),
      params: [
        `ctx: NcWorkflowContext`,
        `event?: unknown`,
        `params: Record<string, unknown> = {}`,
      ],
      actions: workflow.actions,
      useParams: true,
      useEvent: true,
    })
  }

  compileEvent(
    nodeId: string,
    trigger: string,
    actions: ActionJson[],
  ): string {
    return this.compileFunction({
      name: eventWorkflowFunctionName(nodeId, trigger),
      params: ['ctx: NcWorkflowContext', 'event?: unknown'],
      actions,
      useParams: false,
      useEvent: true,
    })
  }

  compileLifecycle(
    name: 'onLoad' | 'onAttributeChange',
    actions: ActionJson[],
  ): string {
    return this.compileFunction({
      name: `event_${name}`,
      params:
        name === 'onLoad'
          ? ['ctx: NcWorkflowContext']
          : ['ctx: NcWorkflowContext', 'event?: unknown'],
      actions,
      useParams: false,
      useEvent: name === 'onAttributeChange',
    })
  }

  private compileFunction(options: {
    name: string
    params: string[]
    actions: ActionJson[]
    useParams: boolean
    useEvent: boolean
  }): string {
    this.helpers.add('ncWorkflowData')
    const dataArg = options.useParams ? 'params' : 'undefined'
    const eventArg = options.useEvent ? 'event' : 'undefined'
    this.paramsExpression = dataArg
    const body = this.compileActions(options.actions, 1)
    return `export async function ${options.name}(${options.params.join(', ')}): Promise<void> {
  const d = ncWorkflowData(ctx.data, ${dataArg}, ${eventArg})
${body.join('\n')}
}
`
  }

  private compileActions(actions: ActionJson[], level: number): string[] {
    const lines: string[] = []
    for (const action of actions) {
      if (!action) continue
      lines.push(...this.compileAction(action, level))
    }
    return lines
  }

  private compileAction(action: ActionJson, level: number): string[] {
    const pad = indent(level)
    const type = actionType(action)
    switch (type) {
      case 'SetVariable': {
        const a = action as Extract<ActionJson, { type: 'SetVariable' }>
        this.helpers.add('ncSetVariable')
        return [
          `${pad}ncSetVariable(ctx.data, ${stringLiteral(a.variable)}, ${this.expr(a.data)})`,
        ]
      }
      case 'TriggerEvent': {
        const a = action as Extract<ActionJson, { type: 'TriggerEvent' }>
        return [`${pad}ctx.emit(${stringLiteral(a.event)}, ${this.expr(a.data)})`]
      }
      case 'Switch': {
        const a = action as Extract<ActionJson, { type: 'Switch' }>
        const lines: string[] = []
        const cases = a.cases ?? []
        for (let i = 0; i < cases.length; i++) {
          const c = cases[i]!
          const condition = this.condition(c.condition)
          lines.push(`${pad}${i === 0 ? 'if' : 'else if'} (${condition}) {`)
          lines.push(...this.compileActions(c.actions, level + 1))
          lines.push(`${pad}}`)
        }
        if (a.default?.actions.length) {
          lines.push(`${pad}${cases.length ? 'else {' : 'if (true) {'}`)
          lines.push(...this.compileActions(a.default.actions, level + 1))
          lines.push(`${pad}}`)
        }
        return lines
      }
      case 'Fetch': {
        const a = action as Extract<ActionJson, { type: 'Fetch' }>
        const inputs = Object.entries(a.inputs ?? {}).map(
          ([key, value]) =>
            `${propertyKey(key)}: ${value.formula ? this.expr(value.formula) : 'undefined'}`,
        )
        const callbacks = this.apiCallbacks(a, level + 1)
        const callbackArg = callbacks.length
          ? `, {\n${callbacks.join(',\n')}\n${pad}}`
          : ''
        return [
          `${pad}await ctx.apis[${stringLiteral(a.api)}]?.execute?.({ ${inputs.join(', ')} }, event${callbackArg})`,
        ]
      }
      case 'AbortFetch': {
        const a = action as Extract<ActionJson, { type: 'AbortFetch' }>
        return [`${pad}ctx.apis[${stringLiteral(a.api)}]?.abort?.()`]
      }
      case 'SetURLParameter': {
        const a = action as Extract<ActionJson, { type: 'SetURLParameter' }>
        this.helpers.add('ncSetUrlParameters')
        return [
          `${pad}await ncSetUrlParameters(ctx, { ${propertyKey(a.parameter)}: ${this.expr(a.data)} }, ${a.historyMode ? stringLiteral(a.historyMode) : 'undefined'})`,
        ]
      }
      case 'SetURLParameters': {
        const a = action as Extract<ActionJson, { type: 'SetURLParameters' }>
        this.helpers.add('ncSetUrlParameters')
        const values = Object.entries(a.parameters).map(
          ([key, formula]) => `${propertyKey(key)}: ${this.expr(formula)}`,
        )
        return [
          `${pad}await ncSetUrlParameters(ctx, { ${values.join(', ')} }, ${a.historyMode ? stringLiteral(a.historyMode) : 'undefined'})`,
        ]
      }
      case 'TriggerWorkflow': {
        const a = action as Extract<ActionJson, { type: 'TriggerWorkflow' }>
        const params = Object.entries(a.parameters ?? {}).map(
          ([key, value]) => `${propertyKey(key)}: ${this.expr(value.formula)}`,
        )
        if (a.contextProvider) {
          return [
            `${pad}await ctx.contexts[${stringLiteral(a.contextProvider)}]?.workflows?.[${stringLiteral(a.workflow)}]?.(ctx, undefined, { ${params.join(', ')} })`,
          ]
        }
        return [
          `${pad}await ctx.workflows[${stringLiteral(a.workflow)}]?.(ctx, undefined, { ${params.join(', ')} })`,
        ]
      }
      case 'TriggerWorkflowCallback': {
        const a = action as Extract<ActionJson, { type: 'TriggerWorkflowCallback' }>
        return [`${pad}ctx.triggerCallback(${stringLiteral(a.event)}, ${this.expr(a.data)})`]
      }
      case 'Builtin': {
        const a = action as {
          name: string
          arguments?: Array<{ name: string; formula: FormulaJson }> | null
          events?: Record<string, { actions: ActionJson[] }> | null
        }
        this.helpers.add('ncBuiltinAction')
        const args = (a.arguments ?? []).map(
          (arg) => `${propertyKey(arg.name)}: ${this.expr(arg.formula)}`,
        )
        const callbacks = this.compileCustomCallbacks(a.events, level + 1)
        const callbackArg = callbacks.length
          ? `, {\n${callbacks.join(',\n')}\n${pad}}`
          : ''
        return [
          `${pad}await ncBuiltinAction(ctx, ${stringLiteral(a.name)}, { ${args.join(', ')} }, event${callbackArg})`,
        ]
      }
      case 'Custom': {
        const a = action as Extract<ActionJson, { type?: 'Custom'; name: string; package?: string | null; arguments?: Array<{ name: string; formula: FormulaJson }> | null; events?: Record<string, { actions: ActionJson[] }> | null }>
        const key =
          this.customActionResolver?.(a.name, a.package ?? undefined) ??
          (a.package ? `${a.package}/${a.name}` : a.name)
        const args = (a.arguments ?? []).map(
          (arg) => `${propertyKey(arg.name)}: ${this.expr(arg.formula)}`,
        )
        const callbacks = this.compileCustomCallbacks(a.events, level + 1)
        const callbackArg = callbacks.length
          ? `, {\n${callbacks.join(',\n')}\n${pad}}`
          : ''
        const resultName = `result_${sanitizeStatementId(key)}_${++this.statementCounter}`
        return [
          `${pad}const ${resultName} = await ctx.customActions[${stringLiteral(key)}]?.({ ${args.join(', ')} }, ctx, event${callbackArg})`,
          `${pad}if (typeof ${resultName} === 'function') ctx.onCleanup(${resultName} as () => void)`,
        ]
      }
      default: {
        this.diagnostics.warn(
          'unsupported-action',
          `Unsupported action type "${type}" in ${this.componentKey}. The generated workflow contains a no-op.`,
          { component: this.componentKey },
        )
        return [`${pad}/* unsupported action: ${type} */`]
      }
    }
  }

  private compileCustomCallbacks(
    events: Record<string, { actions: ActionJson[] }> | null | undefined,
    level: number,
  ): string[] {
    if (!events) return []
    const pad = indent(level)
    const callbacks: string[] = []
    for (const [name, event] of Object.entries(events)) {
      if (!event?.actions?.length) continue
      const body = [
        `${indent(level + 1)}const d = ncWorkflowData(ctx.data, ${this.paramsExpression}, data)`,
        ...this.compileActions(event.actions, level + 1),
      ]
      callbacks.push(
        `${pad}${JSON.stringify(name)}: async (data: unknown) => {\n${body.join('\n')}\n${pad}}`,
      )
    }
    return callbacks
  }

  private apiCallbacks(
    action: Extract<ActionJson, { type: 'Fetch' }>,
    level: number,
  ): string[] {
    const pad = indent(level)
    const callbacks: string[] = []
    const add = (name: keyof NcApiCallbacks, actions: ActionJson[] | null | undefined) => {
      if (!actions?.length) return
      const body = this.compileActions(actions, level + 1)
      callbacks.push(
        `${pad}${name}: async () => {\n${body.join('\n')}\n${pad}}`,
      )
    }
    add('onSuccess', action.onSuccess?.actions)
    add('onError', action.onError?.actions)
    if (action.onMessage?.actions?.length) {
      const body = this.compileActions(action.onMessage.actions, level + 1)
      callbacks.push(
        `${pad}onMessage: async (message: unknown) => {\n${body.join('\n')}\n${pad}}`,
      )
    }
    return callbacks
  }

  private expr(formula: FormulaJson | null | undefined): string {
    return this.formulas.compile(formula, {
      dataVar: 'd',
      componentKey: this.componentKey,
    }).expression
  }

  private condition(formula: FormulaJson | null | undefined): string {
    return this.formulas.compileCondition(formula, {
      dataVar: 'd',
      componentKey: this.componentKey,
    }).expression
  }
}

function indent(level: number): string {
  return '  '.repeat(level)
}

function sanitizeStatementId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_]/g, '_')
}

function actionType(action: ActionJson): string {
  if ('type' in action && typeof action.type === 'string') {
    if (action.type === 'Custom' && action.name?.startsWith('@toddle/')) {
      return 'Builtin'
    }
    return action.type
  }
  if ('name' in action && action.name?.startsWith('@toddle/')) {
    return 'Builtin'
  }
  return 'Custom'
}
