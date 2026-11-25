import type { DiagnosticBag } from '../diagnostics.js'
import type { ProjectIR } from '../ir/types.js'
import { safeIdentifier } from '../util/names.js'
import { handlerFunctionName } from '../util/handler.js'

export interface CustomActionFileResult {
  content: string
}

/**
 * Compiles project-level custom actions (`files.actions`) into a typed module.
 * Handlers are copied verbatim and receive a compatibility context with
 * `triggerActionEvent`, `env`, and `root`.
 */
export function emitCustomActions(
  ir: ProjectIR,
  diagnostics: DiagnosticBag,
): CustomActionFileResult | null {
  const actions = [
    ...Object.entries(ir.projectActions).map(([key, action]) => ({ key, action })),
    ...Object.entries(ir.packages).flatMap(([packageName, pkg]) =>
      Object.entries(pkg?.actions ?? {}).map(([name, action]) => ({
        key: `${packageName}/${name}`,
        action,
      })),
    ),
  ].filter(
    (entry): entry is { key: string; action: NonNullable<typeof entry.action> } =>
      entry.action != null,
  )
  if (actions.length === 0) return null

  const defs: string[] = []
  const entries: string[] = []
  let hasCode = false

  for (const { key, action } of actions) {
    if (typeof action.handler !== 'string' || !action.handler.trim()) {
      diagnostics.warn(
        'empty-custom-action',
        `Custom action "${key}" has no handler and was skipped.`,
      )
      continue
    }
    hasCode = true
    const codeName = `code_${safeIdentifier(key, 'action')}`
    const handler = action.handler.trim()
    const registration = handler.match(
      /toddle\.registerAction\(\s*["']([^"']+)["']/,
    )
    const reference = registration
      ? `ncActionRegistry[${JSON.stringify(registration[1])}]`
      : handlerFunctionName(handler, key)
    defs.push(`function ${codeName}(args: any, ctx: any, event?: any) {
${handler}
  return ${reference ?? 'undefined'}(args, ctx, event)
}`)
    const positional = Boolean(registration)
    const argumentNames = (action.arguments ?? []).map((arg) => arg.name)
    const input = positional
      ? `[${argumentNames.map((name) => `args[${JSON.stringify(name)}]`).join(', ')}]`
      : 'args'
    entries.push(`  ${JSON.stringify(key)}: async (
    args: Record<string, unknown>,
    ctx: any,
    event?: unknown,
    callbacks?: Record<string, (data: unknown) => void>,
  ) => {
    const actionCtx = {
      ...ctx,
      triggerActionEvent: (name: string, data: unknown) => callbacks?.[name]?.(data),
      env: { isServer: typeof window === 'undefined' },
      root: typeof document !== 'undefined' ? document : null,
    }
    try {
      return await ${codeName}(${input}, actionCtx, event)
    } catch (error) {
      if (typeof window === 'undefined') return undefined
      throw error
    }
  },`)
  }

  if (entries.length === 0) return null

  return {
    content: `${hasCode ? '// @ts-nocheck -- custom action handlers copied from the project\n' : ''}${
      actions.some(({ action }) =>
        /toddle\.registerAction\s*\(/.test(action.handler ?? ''),
      )
        ? 'const ncActionRegistry: Record<string, (...args: any[]) => any> = {}\nconst toddle = { registerAction(name: string, handler: (...args: any[]) => any) { ncActionRegistry[name] = handler } }\n\n'
        : ''
    }${defs.join('\n\n')}

export const customActions: Record<
  string,
  (
    args: Record<string, unknown>,
    ctx: any,
    event?: unknown,
    callbacks?: Record<string, (data: unknown) => void>,
  ) => unknown
> = {
${entries.join('\n')}
}
`,
  }
}
