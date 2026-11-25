import type { DiagnosticBag } from '../diagnostics.js'
import { FormulaCompiler } from '../formula/compile.js'
import {
  packageFormulaFunctionName,
  projectFormulaFunctionName,
} from '../formula/naming.js'
import type { ProjectIR } from '../ir/types.js'
import { safeIdentifier } from '../util/names.js'
import { handlerFunctionName } from '../util/handler.js'

export interface ProjectFormulaFileResult {
  content: string
}

/**
 * Compiles project-level formulas (global formulas) to a standalone TypeScript
 * module. AST formulas are lowered; custom code handlers are copied into typed
 * (ts-nocheck) wrappers.
 */
export function emitProjectFormulas(
  ir: ProjectIR,
  diagnostics: DiagnosticBag,
): ProjectFormulaFileResult | null {
  const localFormulas = Object.entries(ir.projectFormulas).filter(
    (entry): entry is [string, NonNullable<typeof entry[1]>] => entry[1] != null,
  )
  const packageFormulas = Object.entries(ir.packages).flatMap(
    ([packageName, pkg]) =>
      Object.entries(pkg?.formulas ?? {})
        .filter((entry): entry is [string, NonNullable<typeof entry[1]>] => entry[1] != null)
        .map(([name, formula]) => ({ packageName, name, formula })),
  )
  if (localFormulas.length === 0 && packageFormulas.length === 0) return null

  const makeResolver =
    (fromPackage?: string) =>
    (name: string, packageName?: string): string | undefined => {
      const resolvedPackage =
        packageName ??
        (fromPackage && ir.packages[fromPackage]?.formulas?.[name]
          ? fromPackage
          : undefined)
      if (resolvedPackage) {
        if (!ir.packages[resolvedPackage]?.formulas?.[name]) return undefined
        return packageFormulaFunctionName(resolvedPackage, name)
      }
      if (!ir.projectFormulas[name]) return undefined
      return projectFormulaFunctionName(name)
    }
  const compiler = new FormulaCompiler({
    diagnostics,
    projectFormulaResolver: makeResolver(),
  })
  const helpers = new Set<string>()
  const defs: string[] = []
  let hasCode = false

  for (const [key, formula] of localFormulas) {
    const functionName = projectFormulaFunctionName(key)
    if (formula.formula) {
      compiler.helpers.add('withArgs')
      const compiled = compiler.compile(formula.formula, { dataVar: 'dArgs' })
      for (const helper of compiler.helpers) helpers.add(helper)
      defs.push(
        `export function ${functionName}(d: NcFormulaData, args: NcArgs = {}): any {
  const dArgs = withArgs(d, args)
  return ${compiled.expression}
}`,
      )
      continue
    }
    if (typeof formula.handler === 'string' && formula.handler.trim()) {
      hasCode = true
      const codeName = `code_${safeIdentifier(key, 'formula')}`
      defs.push(
        `// Custom code formula copied from the Nordcraft project export.
${customCodeWrapper(codeName, formula.handler, key)}
export function ${functionName}(d: NcFormulaData, args: NcArgs = {}): any {
  return ncRunCustomFormula(${codeName}, ${customFormulaCallArgs(formula.handler, formula.arguments)}, ncFormulaContext(d))
}`,
      )
      continue
    }
    diagnostics.warn(
      'empty-project-formula',
      `Project formula "${key}" has neither a formula AST nor a handler.`,
    )
  }

  for (const entry of packageFormulas) {
    const functionName = packageFormulaFunctionName(entry.packageName, entry.name)
    const compiler = new FormulaCompiler({
      diagnostics,
      packageName: entry.packageName,
      projectFormulaResolver: makeResolver(entry.packageName),
    })
    if (entry.formula.formula) {
      compiler.helpers.add('withArgs')
      const compiled = compiler.compile(entry.formula.formula, { dataVar: 'dArgs' })
      for (const helper of compiler.helpers) helpers.add(helper)
      defs.push(
        `export function ${functionName}(d: NcFormulaData, args: NcArgs = {}): any {\n  const dArgs = withArgs(d, args)\n  return ${compiled.expression}\n}`,
      )
      continue
    }
    if (typeof entry.formula.handler === 'string' && entry.formula.handler.trim()) {
      hasCode = true
      const codeName = `code_${safeIdentifier(entry.packageName, 'package')}_${safeIdentifier(entry.name, 'formula')}`
      defs.push(
        `// Package custom code formula copied from the project export.
${customCodeWrapper(codeName, entry.formula.handler, entry.name)}
export function ${functionName}(d: NcFormulaData, args: NcArgs = {}): any {
  return ncRunCustomFormula(${codeName}, ${customFormulaCallArgs(entry.formula.handler, entry.formula.arguments)}, ncFormulaContext(d))
}`,
      )
      continue
    }
    diagnostics.warn(
      'empty-package-formula',
      `Package formula "${entry.packageName}/${entry.name}" has neither a formula AST nor a handler.`,
    )
  }

  if (defs.length === 0) return null

  const sortedHelpers = [...helpers].sort()
  const imports = [
    `import type { NcArgs, NcFormulaData } from '~/lib/runtime'`,
    `import { ncFormulaContext${sortedHelpers.length ? `, ${sortedHelpers.join(', ')}` : ''} } from '~/lib/runtime'`,
  ]
  const usesToddleRegistration = /toddle\.registerFormula\s*\(/.test(
    [
      ...localFormulas.map(([, formula]) => formula.handler ?? ''),
      ...packageFormulas.map((entry) => entry.formula.handler ?? ''),
    ].join('\n'),
  )
  const lines = [
    hasCode ? '// @ts-nocheck -- custom code formulas copied from the project' : '',
    ...imports,
    '',
    ...(hasCode
      ? [
          'function ncRunCustomFormula(fn: any, args: any, ctx: any): any {',
          '  if (typeof fn !== \'function\') return undefined',
          '  if (typeof window === \'undefined\') {',
          '    try {',
          '      return fn(args, ctx)',
          '    } catch {',
          '      return undefined',
          '    }',
          '  }',
          '  return fn(args, ctx)',
          '}',
          '',
        ]
      : []),
    ...(usesToddleRegistration
      ? [
          'const ncFormulaRegistry: Record<string, (args: any, ctx: any) => any> = {}',
          'const toddle = { registerFormula(name: string, handler: (args: any, ctx: any) => any) { ncFormulaRegistry[name] = handler } }',
          '',
        ]
      : []),
    defs.join('\n\n'),
    '',
  ].filter(Boolean)
  return { content: lines.join('\n') }
}

/**
 * Wraps a Nordcraft custom-code formula handler. Handlers are module bodies
 * that either declare a function named like the formula or register it through
 * the Nordcraft `toddle.registerFormula` global. The wrapper scopes each
 * handler and returns the callable function.
 */
function customCodeWrapper(
  codeName: string,
  handler: string,
  key: string,
): string {
  const trimmed = handler.trim()
  const registration = trimmed.match(
    /toddle\.registerFormula\(\s*["']([^"']+)["']/,
  )
  if (registration) {
    return `const ${codeName} = (() => {
${trimmed}
  return ncFormulaRegistry[${JSON.stringify(registration[1])}]
})()`
  }
  const named = handlerFunctionName(trimmed, key)
  const reference = named
    ? named
    : `(function (args: any, ctx: any) {\n${trimmed}\n})`
  return `const ${codeName} = (() => {
${trimmed}
  return ${reference}
})()`
}

/** Bundled Nordcraft formula handlers receive positional arguments. */
function customFormulaCallArgs(
  handler: string,
  args: Array<{ name: string }> | null | undefined,
): string {
  if (!/toddle\.registerFormula\s*\(/.test(handler)) return 'args'
  return `[${(args ?? []).map((arg) => `args[${JSON.stringify(arg.name)}]`).join(', ')}]`
}
