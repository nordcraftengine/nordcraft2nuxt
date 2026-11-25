import type { NcWorkflowContext } from './workflow.js'

/**
 * Typed implementations of Nordcraft's built-in actions.
 *
 * The workflow compiler emits calls to this dispatcher. This is not an action
 * AST interpreter: the workflow structure is compiled to TypeScript, and only
 * these leaf primitives are looked up by name.
 */
export async function ncBuiltinAction(
  ctx: NcWorkflowContext,
  name: string,
  args: Record<string, unknown>,
  event?: unknown,
  callbacks?: Record<string, (data?: unknown) => unknown | Promise<unknown>>,
): Promise<unknown> {
  const arg = (...names: string[]) => ncArg(args, ...names)
  switch (name) {
    case '@toddle/preventDefault': {
      ;(event as Event | undefined)?.preventDefault?.()
      return undefined
    }
    case '@toddle/stopPropagation': {
      ;(event as Event | undefined)?.stopPropagation?.()
      return undefined
    }
    case '@toddle/sleep': {
      const delay = Number(arg('delay', 'delayinmilliseconds', 'milliseconds') ?? 0)
      await new Promise((resolve) => setTimeout(resolve, Number.isFinite(delay) ? delay : 0))
      await callbacks?.tick?.(undefined)
      return undefined
    }
    case '@toddle/logToConsole': {
      const label = arg('label')
      const data = arg('data')
      if (label !== undefined && data !== undefined) console.log(String(label), data)
      else if (data !== undefined) console.log(data)
      else console.log(label)
      return undefined
    }
    case '@toddle/copyToClipboard': {
      const value = String(arg('value', 'text') ?? '')
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(value)
      }
      return undefined
    }
    case '@toddle/focus': {
      const element = arg('element', 'selector')
      const target =
        typeof element === 'string'
          ? typeof document !== 'undefined'
            ? document.querySelector(element)
            : null
          : element && typeof element === 'object' && 'focus' in element
            ? (element as HTMLElement)
            : null
      ;(target as HTMLElement | null)?.focus?.()
      return undefined
    }
    case '@toddle/gotToURL': {
      const url = String(arg('url') ?? '')
      if (!url) return undefined
      if (ctx.navigate) return await ctx.navigate(url)
      if (typeof window !== 'undefined') window.location.assign(url)
      return undefined
    }
    case '@toddle/saveToLocalStorage':
    case '@toddle/saveToSessionStorage': {
      const storage = name.includes('Session') ? safeSessionStorage() : safeLocalStorage()
      if (!storage) return undefined
      const key = String(arg('key') ?? '')
      if (!key) return undefined
      storage.setItem(key, JSON.stringify(arg('value')))
      return undefined
    }
    case '@toddle/deleteFromLocalStorage':
    case '@toddle/deleteFromSessionStorage': {
      const storage = name.includes('Session') ? safeSessionStorage() : safeLocalStorage()
      if (!storage) return undefined
      const key = String(arg('key') ?? '')
      if (key) storage.removeItem(key)
      return undefined
    }
    case '@toddle/clearLocalStorage':
    case '@toddle/clearSessionStorage': {
      const storage = name.includes('Session') ? safeSessionStorage() : safeLocalStorage()
      storage?.clear()
      return undefined
    }
    case '@toddle/setTheme': {
      const theme = arg('theme', 'value')
      ctx.theme?.set(theme == null ? null : String(theme))
      return undefined
    }
    case '@toddle/setCookie': {
      try {
        const cookieName = String(arg('name', 'key') ?? '')
        if (!cookieName) return undefined
        const value = String(arg('value') ?? '')
        const expires = Number(arg('expiresin', 'expires') ?? 0)
        const sameSite = String(arg('samesite') ?? 'lax')
        const path = String(arg('path') ?? '/')
        const parts = [
          `${encodeURIComponent(cookieName)}=${encodeURIComponent(value)}`,
          `Path=${path}`,
          `SameSite=${sameSite}`,
          'Secure',
        ]
        if (Number.isFinite(expires) && expires > 0) {
          parts.push(`Max-Age=${Math.floor(expires)}`)
        }
        if (typeof document !== 'undefined') {
          document.cookie = parts.join('; ')
        }
        await (callbacks?.Success ?? callbacks?.success)?.(undefined)
      } catch (error) {
        await (callbacks?.Error ?? callbacks?.error)?.(error)
      }
      return undefined
    }
    case '@toddle/setHttpOnlyCookie':
    case '@toddle/setSessionCookies': {
      const cookieName = String(arg('name', 'key') ?? '')
      if (!cookieName) return undefined
      const payload = {
        name: cookieName,
        value: String(arg('value') ?? ''),
        expiresIn: arg('expiresin', 'expires'),
        sameSite: arg('samesite'),
        path: arg('path'),
        includeSubdomains: arg('includesubdomains'),
      }
      if (typeof window !== 'undefined') {
        try {
          const response = await fetch('/api/nc/cookies/set', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
            credentials: 'include',
          })
          if (response.ok) {
            await (callbacks?.Success ?? callbacks?.success)?.(undefined)
          } else {
            await (callbacks?.Error ?? callbacks?.error)?.(response)
          }
        } catch (error) {
          if (typeof console !== 'undefined') {
            console.warn('[nordcraft2nuxt] Could not set http-only cookie', error)
          }
          await (callbacks?.Error ?? callbacks?.error)?.(error)
        }
      }
      return undefined
    }
    case '@toddle/share': {
      const data = arg('data', 'sharedata')
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share((data && typeof data === 'object' ? data : {}) as ShareData)
      }
      return undefined
    }
    case '@toddle/interval': {
      const delay = Number(arg('delay', 'interval', 'milliseconds') ?? 0)
      const callback = arg('callback', 'oninterval', 'actions')
      if (typeof callback === 'function') {
        const id = setInterval(() => (callback as () => void)(), Number.isFinite(delay) ? delay : 0)
        const cleanup = () => clearInterval(id)
        ctx.onCleanup(cleanup)
        return cleanup
      }
      return undefined
    }
    default: {
      if (typeof console !== 'undefined') {
        console.warn(`[nordcraft2nuxt] Unsupported built-in action: ${name}`)
      }
      return null
    }
  }
}

function ncArg(args: Record<string, unknown>, ...names: string[]): unknown {
  const normalized = new Map<string, unknown>()
  for (const [key, value] of Object.entries(args)) {
    normalized.set(key.toLowerCase().replace(/[^a-z0-9]/g, ''), value)
  }
  for (const name of names) {
    const key = name.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (normalized.has(key)) return normalized.get(key)
  }
  return undefined
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch {
    return null
  }
}

function safeSessionStorage(): Storage | null {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null
  } catch {
    return null
  }
}
