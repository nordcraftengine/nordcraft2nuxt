import { describe, expect, it, vi } from 'vitest'
import {
  createNcData,
  ncGetCookie,
  ncGetHttpOnlyCookie,
  ncAdd,
  ncBuiltinAction,
  ncMap,
  ncPath,
  ncRepeat,
  ncSetUrlParameters,
  ncSetVariable,
  ncTruthy,
} from '../src/runtime/index.js'

describe('runtime data', () => {
  it('implements Nordcraft path semantics', () => {
    expect(ncPath({ a: { b: 1 } }, ['a', 'b'])).toBe(1)
    expect(ncPath({ a: null }, ['a', 'b'])).toBeNull()
    expect(ncPath(null, ['a'])).toBeNull()
    expect(ncPath({ a: [{ b: 2 }] }, ['a', 0, 'b'])).toBe(2)
  })

  it('implements Nordcraft truthiness', () => {
    expect(ncTruthy(false)).toBe(false)
    expect(ncTruthy(null)).toBe(false)
    expect(ncTruthy(undefined)).toBe(false)
    expect(ncTruthy(0)).toBe(true)
    expect(ncTruthy('')).toBe(true)
  })

  it('creates a live data view', () => {
    const vars: Record<string, unknown> = { count: 1 }
    const data = createNcData({
      vars,
      props: { title: 'Hello' },
      attributes: { id: '42' },
      route: { path: '/list', params: { id: '42' }, query: { q: 'x' } },
      theme: () => 'dark',
    })
    expect(ncPath(data, ['Variables', 'count'])).toBe(1)
    expect(ncPath(data, ['Attributes', 'id'])).toBe('42')
    expect(ncPath(data, ['Location', 'path'])).toBe('/list')
    expect(ncPath(data, ['Page', 'Theme'])).toBe('dark')

    vars.count = 2
    expect(ncPath(data, ['Variables', 'count'])).toBe(2)
  })

  it('mutates variables through ncSetVariable', () => {
    const vars: Record<string, unknown> = { count: 0 }
    const data = createNcData({ vars })
    ncSetVariable(data, 'count', 5)
    expect(vars.count).toBe(5)
  })

  it('supports object repeat and parent list items', () => {
    const entries = ncRepeat({ a: { id: 1 }, b: { id: 2 } })
    expect(entries.map((entry) => entry.key)).toEqual(['a', 'b'])
    expect(entries[0]!.listItem.Item).toEqual({ id: 1 })

    const nested = ncRepeat([1, 2], undefined, entries[0]!.listItem)
    expect(nested[0]!.listItem.Parent).toBe(entries[0]!.listItem)
  })

  it('applies repeat keys and falls back for duplicates', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const entries = ncRepeat(
      [{ id: 'same' }, { id: 'same' }, { id: 'other' }],
      (entry) => ncPath(entry.item, ['id']),
    )
    expect(entries.map((entry) => entry.key)).toEqual(['same', 1, 'other'])
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('runtime stdlib', () => {
  it('adds numbers and rejects invalid input', () => {
    expect(ncAdd([1, 2, 3])).toBe(6)
    expect(ncAdd([1, '2'])).toBeNull()
  })

  it('maps arrays and objects', () => {
    expect(ncMap([[1, 2], (args: unknown) => {
      const item = (args as { item: number }).item
      return item * 2
    }])).toEqual([2, 4])

    expect(ncMap([{ a: 1 }, (args: unknown) => {
      const { key, value } = args as { key: string; value: number }
      return { key, value: value * 2 }
    }])).toEqual({ a: 2 })
  })
})

describe('runtime workflows', () => {
  it('updates path params and query params like Nordcraft', async () => {
    const vars: Record<string, unknown> = {}
    const data = createNcData({ vars })
    const push = vi.fn()
    const replace = vi.fn()
    const ctx = {
      data,
      emit: () => undefined,
      router: { push, replace },
      route: {
        name: 'page',
        path: '/page/1',
        params: { id: '1' },
        query: { q: 'a' },
      },
      apis: {},
      contexts: {},
      workflows: {},
      customActions: {},
      onCleanup: () => undefined,
      triggerCallback: () => undefined,
    }
    await ncSetUrlParameters(ctx, { id: '2', q: 'b', extra: 'c' })
    expect(push).toHaveBeenCalledWith({
      name: 'page',
      params: { id: '2' },
      query: { q: 'b', extra: 'c' },
    })
    expect(replace).not.toHaveBeenCalled()

    await ncSetUrlParameters(ctx, { q: 'z' })
    expect(replace).toHaveBeenCalledWith({
      path: '/page/1',
      query: { q: 'z' },
    })
  })

  it('calls preventDefault on the event', async () => {
    const ctx = {
      data: createNcData({}),
      emit: () => undefined,
      apis: {},
      contexts: {},
      workflows: {},
      customActions: {},
      onCleanup: () => undefined,
      triggerCallback: () => undefined,
    }
    const event = { preventDefault: vi.fn() }
    await ncBuiltinAction(ctx, '@toddle/preventDefault', {}, event)
    expect(event.preventDefault).toHaveBeenCalled()
  })
})

describe('runtime cookies', () => {
  it('reads request cookies from formula data and exposes http-only values', () => {
    const data = createNcData({ cookies: { session: 'secret', theme: 'dark' } })
    expect(ncGetCookie(['session'], data)).toBe('secret')
    expect(ncGetHttpOnlyCookie(['session'], data)).toBe('secret')
    expect(ncGetHttpOnlyCookie(['missing'], data)).toBeNull()
  })
})
