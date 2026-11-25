import { describe, expect, it } from 'vitest'
import { FormulaCompiler } from '../src/formula/compile.js'
import { FORMULA_META } from '../src/formula/stdlib.js'
import type { FormulaJson } from '../src/ingest/types.js'
import * as runtime from '../src/runtime/index.js'

function evaluate(formula: FormulaJson, data: Record<string, unknown> = {}): unknown {
  const compiler = new FormulaCompiler()
  const compiled = compiler.compile(formula, { dataVar: 'd' })
  const names = [...compiler.helpers]
  const values = names.map((name) => (runtime as Record<string, unknown>)[name])
  const expression = compiled.expression.replace(/: NcArgs/g, '')
  const fn = new Function('d', ...names, `return (${expression})`) as (
    data: Record<string, unknown>,
    ...helpers: unknown[]
  ) => unknown
  return fn(data, ...values)
}

function f(value: unknown): FormulaJson {
  return { type: 'value', value }
}

function path(...segments: string[]): FormulaJson {
  return { type: 'path', path: segments }
}

function fn(name: string, args: Array<{ name?: string; formula: FormulaJson; isFunction?: boolean }> = []): FormulaJson {
  return { type: 'function', name, arguments: args }
}

describe('FormulaCompiler', () => {
  it('has a runtime implementation for every registered stdlib formula', () => {
    const missing = Object.values(FORMULA_META)
      .map((meta) => meta.helper)
      .filter((helper) => typeof (runtime as Record<string, unknown>)[helper] !== 'function')
    expect(missing).toEqual([])
  })

  it('compiles literals and paths', () => {
    expect(evaluate(f('hello'))).toBe('hello')
    expect(evaluate(f(42))).toBe(42)
    expect(evaluate(path('Variables', 'count'), { Variables: { count: 7 } })).toBe(7)
  })

  it('returns null for a missing path like Nordcraft', () => {
    expect(evaluate(path('Variables', 'missing', 'deeper'), { Variables: {} })).toBeNull()
    expect(evaluate(path('Variables', 'x'), { Variables: null })).toBeNull()
  })

  it('compiles operations with Nordcraft truthiness', () => {
    const and = evaluate({
      type: 'and',
      arguments: [{ formula: f(0) }, { formula: f('') }],
    })
    expect(and).toBe(true)

    const or = evaluate({
      type: 'or',
      arguments: [{ formula: f(false) }, { formula: f(null) }],
    })
    expect(or).toBe(false)

    const compiler = new FormulaCompiler()
    const condition = compiler.compileCondition(f(0), { dataVar: 'd' })
    expect(condition.expression).toBe('ncTruthy(0)')
  })

  it('compiles switch expressions', () => {
    const formula: FormulaJson = {
      type: 'switch',
      cases: [
        {
          condition: fn('@toddle/greaterThan', [
            { name: '0', formula: path('Variables', 'count') },
            { name: '1', formula: f(0) },
          ]),
          formula: f('positive'),
        },
      ],
      default: f('zero'),
    }
    expect(evaluate(formula, { Variables: { count: 2 } })).toBe('positive')
    expect(evaluate(formula, { Variables: { count: 0 } })).toBe('zero')
  })

  it('compiles stdlib functions', () => {
    expect(
      evaluate(
        fn('@toddle/add', [
          { name: '0', formula: f(2) },
          { name: '1', formula: f(3) },
        ]),
      ),
    ).toBe(5)

    expect(
      evaluate(
        fn('@toddle/concatenate', [
          { name: '0', formula: f('a') },
          { name: '1', formula: f('b') },
          { name: '2', formula: f('c') },
        ]),
      ),
    ).toBe('abc')

    expect(
      evaluate(
        fn('@toddle/round', [
          { name: 'Input', formula: f(3.14159) },
          { name: 'Decimals', formula: f(2) },
        ]),
      ),
    ).toBe(3.14)
  })

  it('compiles higher-order function arguments with Args scope', () => {
    const mapFormula = fn('@toddle/map', [
      {
        name: 'Array',
        formula: {
          type: 'array',
          arguments: [{ formula: f(1) }, { formula: f(2) }, { formula: f(3) }],
        },
      },
      {
        name: 'Formula',
        isFunction: true,
        formula: fn('@toddle/multiply', [
          { name: '0', formula: path('Args', 'item') },
          { name: '1', formula: f(10) },
        ]),
      },
    ])
    expect(evaluate(mapFormula)).toEqual([10, 20, 30])

    const filterFormula = fn('@toddle/filter', [
      {
        name: 'Array',
        formula: {
          type: 'array',
          arguments: [{ formula: f(1) }, { formula: f(2) }, { formula: f(3) }],
        },
      },
      {
        name: 'Formula',
        isFunction: true,
        formula: fn('@toddle/greaterThan', [
          { name: '0', formula: path('Args', 'item') },
          { name: '1', formula: f(1) },
        ]),
      },
    ])
    expect(evaluate(filterFormula)).toEqual([2, 3])
  })

  it('compiles object and array literals', () => {
    const formula: FormulaJson = {
      type: 'object',
      arguments: [
        { name: 'name', formula: f('Ada') },
        { name: 'tags', formula: { type: 'array', arguments: [{ formula: f('math') }] } },
      ],
    }
    expect(evaluate(formula)).toEqual({ name: 'Ada', tags: ['math'] })
  })

  it('does not special-case JavaScript falsiness for 0 or empty string', () => {
    const and = evaluate({
      type: 'and',
      arguments: [{ formula: f(0) }, { formula: f('') }],
    })
    expect(and).toBe(true)
  })
})
