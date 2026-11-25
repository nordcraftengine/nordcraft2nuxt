import type { NcWorkflow } from './workflow.js'

export interface NcProviderContext {
  formulas?: Record<string, unknown>
  workflows?: Record<string, unknown>
}

function unwrapRef(value: unknown): unknown {
  return value && typeof value === 'object' && 'value' in (value as Record<string, unknown>)
    ? (value as { value: unknown }).value
    : value
}

/**
 * Converts a provider context into the object shape consumers see under
 * `Contexts.<provider>`. Formula refs are unwrapped lazily so reactivity is
 * preserved; workflows are passed through.
 */
export function ncContextValues(
  context: NcProviderContext | null | undefined,
): Record<string, unknown> {
  if (!context) return {}
  const values: Record<string, unknown> = {
    workflows: context.workflows ?? {},
  }
  for (const key of Object.keys(context.formulas ?? {})) {
    Object.defineProperty(values, key, {
      get: () => unwrapRef(context.formulas?.[key]),
      enumerable: true,
      configurable: true,
    })
  }
  Object.defineProperty(values, 'formulas', {
    get: () => context.formulas ?? {},
    enumerable: true,
    configurable: true,
  })
  return values
}
