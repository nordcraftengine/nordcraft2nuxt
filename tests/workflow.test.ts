import { readFile } from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'
import { FormulaCompiler } from '../src/formula/compile.js'
import { parseProject } from '../src/ingest/load.js'
import { buildProjectIR } from '../src/ir/build.js'
import { WorkflowCompiler } from '../src/workflow/compile.js'
import * as runtime from '../src/runtime/index.js'
import type { NcWorkflowContext } from '../src/runtime/workflow.js'

async function loadProject() {
  const text = await readFile(
    new URL('./fixtures/counter.project.json', import.meta.url),
    'utf8',
  )
  return parseProject(JSON.parse(text))
}

function evaluateWorkflow(source: string) {
  const match = source.match(/\): Promise<void> \{([\s\S]*)\}\s*$/)
  if (!match) throw new Error(`Could not extract workflow body:\n${source}`)
  const body = match[1]!
  return (ctx: NcWorkflowContext, event?: unknown, params: Record<string, unknown> = {}) => {
    const helperNames = [
      'ncWorkflowData',
      'ncSetVariable',
      'ncTruthy',
      'ncGreaterThan',
      'ncMinus',
      'ncPath',
      'ncAdd',
      'ncBuiltinAction',
      'ncSetUrlParameters',
    ] as const
    const helperValues = helperNames.map(
      (name) => (runtime as Record<string, unknown>)[name],
    )
    const factory = new Function(
      'ctx',
      'event',
      'params',
      ...helperNames,
      `return (async () => {${body}})()`,
    ) as (...args: unknown[]) => Promise<void>
    return factory(ctx, event, params, ...helperValues)
  }
}

function mockContext(vars: Record<string, unknown>) {
  const data = runtime.createNcData({ vars })
  const emitted: Array<{ event: string; payload: unknown }> = []
  const ctx: NcWorkflowContext = {
    data,
    emit: (event, payload) => emitted.push({ event, payload }),
    apis: {},
    contexts: {},
    workflows: {},
    customActions: {},
    onCleanup: () => undefined,
    triggerCallback: () => undefined,
  }
  return { ctx, vars, emitted }
}

describe('WorkflowCompiler', () => {
  it('compiles SetVariable with a stdlib formula', async () => {
    const project = await loadProject()
    const ir = buildProjectIR(project)
    const counter = ir.componentByKey.get('Counter')!
    const formulaCompiler = new FormulaCompiler()
    const compiler = new WorkflowCompiler({
      componentKey: counter.key,
      diagnostics: { warn: vi.fn(), error: vi.fn() } as never,
      formulaCompiler,
    })
    const increment = compiler.compileWorkflow('increment', counter.source.workflows!.increment!)
    const run = evaluateWorkflow(increment)
    const { ctx, vars } = mockContext({ count: 0 })
    await run(ctx)
    expect(vars.count).toBe(1)
    await run(ctx)
    expect(vars.count).toBe(2)
  })

  it('compiles Switch and prevents the counter going below zero', async () => {
    const project = await loadProject()
    const ir = buildProjectIR(project)
    const counter = ir.componentByKey.get('Counter')!
    const formulaCompiler = new FormulaCompiler()
    const compiler = new WorkflowCompiler({
      componentKey: counter.key,
      diagnostics: { warn: vi.fn(), error: vi.fn() } as never,
      formulaCompiler,
    })
    const decrement = compiler.compileWorkflow('decrement', counter.source.workflows!.decrement!)
    const run = evaluateWorkflow(decrement)

    const zero = mockContext({ count: 0 })
    await run(zero.ctx)
    expect(zero.vars.count).toBe(0)

    const two = mockContext({ count: 2 })
    await run(two.ctx)
    expect(two.vars.count).toBe(1)
  })

  it('compiles event workflows that call TriggerWorkflow', async () => {
    const project = await loadProject()
    const ir = buildProjectIR(project)
    const counter = ir.componentByKey.get('Counter')!
    const formulaCompiler = new FormulaCompiler()
    const compiler = new WorkflowCompiler({
      componentKey: counter.key,
      diagnostics: { warn: vi.fn(), error: vi.fn() } as never,
      formulaCompiler,
    })
    const increment = compiler.compileWorkflow('increment', counter.source.workflows!.increment!)
    const event = compiler.compileEvent('increment', 'click', [
      { type: 'TriggerWorkflow', workflow: 'increment', parameters: null },
    ])
    const runEvent = evaluateWorkflow(event)
    const runIncrement = evaluateWorkflow(increment)
    const { ctx, vars } = mockContext({ count: 0 })
    ctx.workflows = { increment: runIncrement }
    await runEvent(ctx, { type: 'click' })
    expect(vars.count).toBe(1)
  })

  it('emits no formula JSON in the workflow output', async () => {
    const project = await loadProject()
    const ir = buildProjectIR(project)
    const counter = ir.componentByKey.get('Counter')!
    const formulaCompiler = new FormulaCompiler()
    const compiler = new WorkflowCompiler({
      componentKey: counter.key,
      diagnostics: { warn: vi.fn(), error: vi.fn() } as never,
      formulaCompiler,
    })
    const output = compiler.compileWorkflow('increment', counter.source.workflows!.increment!)
    expect(output).toContain('ncAdd(')
    expect(output).not.toContain('"type": "function"')
  })
})
