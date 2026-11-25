import type { ApiJson } from '../ingest/types.js'

export function apiProxyEnabled(api: ApiJson): boolean {
  const formula = api.server?.proxy?.enabled?.formula
  if (!formula) return false
  if (formula.type !== 'value') return false
  return formula.value !== false && formula.value !== null && formula.value !== undefined
}

export function apiLiteralUrl(api: ApiJson): string | undefined {
  if (typeof api.url === 'string') return api.url
  if (api.url?.type === 'value' && typeof api.url.value === 'string') {
    return api.url.value
  }
  return undefined
}

export function apiProxyBase(api: ApiJson): string | undefined {
  const url = apiLiteralUrl(api)
  if (!url) return undefined
  try {
    const parsed = new URL(url, 'http://localhost')
    return `${parsed.origin}${parsed.pathname.replace(/\/$/, '')}`
  } catch {
    return undefined
  }
}
