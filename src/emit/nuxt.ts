import { readFile, readdir } from 'node:fs/promises'
import { format as prettierFormat } from 'prettier'
import type { DiagnosticBag } from '../diagnostics.js'
import type { ProjectIR } from '../ir/types.js'
import { compileStylesheet } from '../css/compile.js'
import {
  packageFormulaFunctionName,
  projectFormulaFunctionName,
} from '../formula/naming.js'
import { emitComponentSfc } from './component.js'
import { emitFormulaFile } from './formula-file.js'
import { emitTemplate } from './template.js'
import { emitWorkflowFile } from './workflow-file.js'
import { emitProjectFormulas } from './project-formulas.js'
import { emitCustomActions } from './custom-actions.js'
import { emitClientRouteMiddleware, emitRouteMiddleware } from './routes.js'
import { apiProxyBase, apiProxyEnabled } from './api-utils.js'

export interface EmitOptions {
  format?: boolean
  downloadFonts?: boolean
  /** Origin used to proxy root-relative Nordcraft asset URLs such as `/cdn-cgi/...`. */
  assetOrigin?: string
}

export interface EmittedFile {
  path: string
  content: string | Uint8Array
}

export async function emitNuxtProject(
  ir: ProjectIR,
  diagnostics: DiagnosticBag,
  options: EmitOptions = {},
): Promise<EmittedFile[]> {
  const files: EmittedFile[] = []
  const fontAssets = options.downloadFonts
    ? await downloadThemeFonts(ir, diagnostics)
    : { files: [], urlMap: new Map<string, string>() }
  const cssModel = compileStylesheet(ir, diagnostics, {
    fontUrlMap: fontAssets.urlMap,
  })
  const projectFormulaFile = emitProjectFormulas(ir, diagnostics)
  const customActionFile = emitCustomActions(ir, diagnostics)
  const routeMiddleware = emitRouteMiddleware(ir, diagnostics)
  const clientRouteMiddleware = emitClientRouteMiddleware(ir, diagnostics)
  const projectFormulaResolver = (
    name: string,
    packageName?: string,
    fromPackage?: string,
  ) => {
    const resolvedPackage =
      packageName ??
      (fromPackage && ir.packages[fromPackage]?.formulas?.[name]
        ? fromPackage
        : undefined)
    if (resolvedPackage) {
      if (!ir.packages[resolvedPackage]?.formulas?.[name]) return undefined
      return `PKG.${packageFormulaFunctionName(resolvedPackage, name)}`
    }
    if (!ir.projectFormulas[name]) return undefined
    return `PF.${projectFormulaFunctionName(name)}`
  }
  const pageByKey = new Map(ir.pages.map((page) => [page.key, page]))

  for (const component of ir.components) {
    const page = pageByKey.get(component.key)
    const isPage = page != null
    const formulaFile = emitFormulaFile(component, diagnostics, projectFormulaResolver)
    const customActionResolver = (name: string, packageName?: string) => {
      const resolvedPackage =
        packageName ??
        (component.packageName &&
        ir.packages[component.packageName]?.actions?.[name]
          ? component.packageName
          : undefined)
      return resolvedPackage ? `${resolvedPackage}/${name}` : name
    }
    const workflowFile = emitWorkflowFile(
      component,
      diagnostics,
      projectFormulaResolver,
      customActionResolver,
    )
    const template = emitTemplate({
      component,
      ir,
      css: cssModel,
      diagnostics,
    })
    const sfc = emitComponentSfc({
      component,
      ir,
      template,
      formulaFile,
      workflowFile,
      diagnostics,
      isPage,
      styles: cssModel.componentCss.get(component.key),
    })

    const artifactsBase = `app/components/nordcraft/${component.vueName}`
    files.push({ path: `${artifactsBase}.formulas.ts`, content: formulaFile.content })
    files.push({ path: `${artifactsBase}.workflows.ts`, content: workflowFile.content })
    if (isPage && page) {
      files.push({ path: `app/pages/${page.pagePath}`, content: sfc })
      if (component.name === '404' || component.key === '404') {
        files.push({
          path: `app/components/nordcraft/${component.fileName}`,
          content: emitComponentSfc({
            component,
            ir,
            template,
            formulaFile,
            workflowFile,
            diagnostics,
            isPage: false,
            styles: cssModel.componentCss.get(component.key),
          }),
        })
      }
    } else {
      files.push({ path: `app/components/nordcraft/${component.fileName}`, content: sfc })
    }
  }

  files.push(...fontAssets.files)
  if (projectFormulaFile) {
    files.push({
      path: 'app/lib/nordcraft/project-formulas.ts',
      content: projectFormulaFile.content,
    })
  }
  if (customActionFile) {
    files.push({
      path: 'app/lib/nordcraft/custom-actions.ts',
      content: customActionFile.content,
    })
  }
  if (routeMiddleware) {
    files.push({
      path: 'server/middleware/nordcraft-routes.ts',
      content: routeMiddleware.content,
    })
  }
  if (clientRouteMiddleware) {
    files.push({
      path: 'app/middleware/nordcraft-routes.client.ts',
      content: clientRouteMiddleware.content,
    })
  }
  files.push(...(await runtimeFiles()))
  files.push(...staticFiles(ir, diagnostics, cssModel.globalCss))
  if (options.assetOrigin) {
    const origin = options.assetOrigin.replace(/\/$/, '')
    files.push({
      path: 'server/middleware/nordcraft-assets.ts',
      content: `const assetOrigin = ${JSON.stringify(origin)}

export default defineEventHandler((event) => {
  if (!event.path.startsWith('/cdn-cgi/')) return
  return proxyRequest(event, assetOrigin + event.path)
})
`,
    })
  }
  files.push(...proxyFiles(ir, diagnostics))

  const formatted = options.format === false
    ? files
    : await formatFiles(files, diagnostics)
  return formatted.sort((a, b) => a.path.localeCompare(b.path))
}

async function runtimeFiles(): Promise<EmittedFile[]> {
  const dir = new URL('../runtime/', import.meta.url)
  const entries = await readdir(dir, { withFileTypes: true })
  const files: EmittedFile[] = []
  for (const entry of entries) {
    if (
      !entry.isFile() ||
      !entry.name.endsWith('.ts') ||
      entry.name.endsWith('.d.ts') ||
      entry.name.endsWith('.test.ts')
    ) {
      continue
    }
    const content = await readFile(new URL(entry.name, dir), 'utf8')
    files.push({
      path: `app/lib/runtime/${entry.name}`,
      content:
        `/* Generated by nordcraft2nuxt. Self-contained runtime; no Nordcraft packages. */\n` +
        rewriteRuntimeImports(content),
    })
  }
  return files
}

function rewriteRuntimeImports(content: string): string {
  return content.replace(
    /(from\s+['"])(\.\/[^'"]+)\.js(['"])/g,
    '$1$2$3',
  )
}

function staticFiles(
  ir: ProjectIR,
  diagnostics: DiagnosticBag,
  globalCss: string,
): EmittedFile[] {
  const name = ir.name
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'nordcraft-app'
  return [
    {
      path: 'nuxt.config.ts',
      content: nuxtConfigContent(),
    },
    {
      path: 'package.json',
      content: JSON.stringify(
        {
          name: slug,
          private: true,
          type: 'module',
          scripts: {
            dev: 'nuxt dev',
            build: 'nuxt build',
            generate: 'nuxt generate',
            preview: 'nuxt preview',
            typecheck: 'nuxt typecheck',
          },
          dependencies: {
            nuxt: '^4.6.4',
            vue: '^3.5.0',
          },
          devDependencies: {
            typescript: '^5.9.0',
            'vue-tsc': '^3.0.0',
          },
        },
        null,
        2,
      ) + '\n',
    },
    {
      path: 'tsconfig.json',
      content: `{
  "extends": "./.nuxt/tsconfig.json"
}
`,
    },
    {
      path: 'app/app.vue',
      content: `<template>
  <NuxtPage />
</template>

<style>
${globalCss}
</style>
`,
    },
    {
      path: 'app/error.vue',
      content: errorPageContent(ir),
    },
    {
      path: 'app/components/NcStyle.ts',
      content: `import { defineComponent, h, type PropType } from 'vue'

export default defineComponent({
  name: 'NcStyle',
  props: {
    css: {
      type: String as PropType<string>,
      required: true,
    },
    name: {
      type: String,
      default: undefined,
    },
  },
  setup(props) {
    return () =>
      h('style', {
        innerHTML: props.css,
      })
  },
})
`,
    },
    {
      path: 'app/composables/useNcTheme.ts',
      content: `import { useCookie, useHead, useState } from '#imports'

export interface NcTheme {
  get: () => string | null
  set: (value: string | null) => void
}

export function useNcTheme(): NcTheme {
  const cookie = useCookie<string | null>('nc-theme', { default: () => null })
  const theme = useState<string | null>('nc-theme', () => cookie.value ?? null)

  useHead(() => ({
    htmlAttrs: {
      'data-theme': theme.value ?? undefined,
    },
  }))

  return {
    get: () => theme.value,
    set: (value: string | null) => {
      theme.value = value
      cookie.value = value
    },
  }
}
`,
    },
    {
      path: 'app/lib/nuxt/route.ts',
      content: `import { reactive, watchEffect } from 'vue'

interface RouteLike {
  params: Record<string, unknown>
  query: Record<string, unknown>
}

export function useNcRouteAttributes(route: RouteLike): Record<string, unknown> {
  const attributes = reactive<Record<string, unknown>>({})
  watchEffect(() => {
    for (const key of Object.keys(attributes)) delete attributes[key]
    Object.assign(attributes, route.query, route.params)
  })
  return attributes
}
`,
    },
    {
      path: 'app/lib/nuxt/api.ts',
      content: `import { computed, reactive, ref, watch } from 'vue'
import { $fetch, useAsyncData, useId, useRequestHeaders, useRequestURL } from '#imports'
import type { NcApiDescriptor, NcApiRequest, NcFormulaData } from '~/lib/runtime'

export interface NcApiCallbacks {
  onSuccess?: () => unknown
  onError?: () => unknown
  onMessage?: (message: unknown) => unknown
}

export function useNcApi(
  descriptor: NcApiDescriptor,
  options: {
    data: NcFormulaData
    onCompleted?: (event: unknown) => unknown
    onFailed?: (event: unknown) => unknown
    onMessage?: (event: unknown) => unknown
  },
) {
  const origin = useRequestURL().origin
  const key = \`nc-api-\${useId()}\`
  const overrideInputs = ref<Record<string, unknown> | undefined>(undefined)
  const currentInputs = computed(() => ({
    ...descriptor.defaults(options.data),
    ...(overrideInputs.value ?? {}),
  }))
  const autoFetch = descriptor.autoFetch(options.data)
  const sampleRequest = descriptor.build(options.data, descriptor.defaults(options.data))
  const streamLike =
    sampleRequest.type === 'ws' ||
    sampleRequest.parserMode === 'event-stream' ||
    sampleRequest.parserMode === 'json-stream'
  const ssr = streamLike ? false : descriptor.ssr(options.data)
  const abortController = ref<AbortController | null>(null)
  const callbacks = ref<NcApiCallbacks>({})

  const asyncData = useAsyncData(
    key,
    async () => {
      try {
      const request = descriptor.build(options.data, currentInputs.value)
      const url = ncBuildApiUrl(request, origin)
      const headers: Record<string, string> = {}
      for (const header of request.headers ?? []) {
        if (header.enabled !== false && header.value != null) {
          headers[header.name] = String(header.value)
        }
      }
      const controller = new AbortController()
      abortController.value = controller
      const proxy = descriptor.proxy?.(options.data) ?? false
      const streamLike =
        request.type === 'ws' ||
        request.parserMode === 'event-stream' ||
        request.parserMode === 'json-stream'
      const responseType =
        request.parserMode === 'text'
          ? 'text'
          : request.parserMode === 'blob'
            ? 'blob'
            : request.parserMode === 'json'
              ? 'json'
              : undefined

      if (streamLike) {
        if (request.type === 'ws') {
          const data = await ncConsumeWebSocket(
            url,
            request,
            controller,
            options.onMessage,
          )
          return { data, response: { status: 101, headers: {} } }
        }
        const response = await fetch(url, {
          method: request.method ?? 'GET',
          headers,
          body:
            request.body === null || request.body === undefined
              ? undefined
              : typeof request.body === 'string'
                ? request.body
                : JSON.stringify(request.body),
          credentials: request.credentials,
          signal: controller.signal,
        })
        if (!response.ok) {
          throw new Error(\`API request failed with status \${response.status}\`)
        }
        const data =
          request.parserMode === 'event-stream'
            ? await ncConsumeEventStream(response, options.onMessage)
            : await ncConsumeJsonStream(response, options.onMessage)
        return {
          data,
          response: {
            status: response.status,
            headers: Object.fromEntries(response.headers.entries()),
          },
        }
      }

      let raw
      if (proxy) {
        const proxyUrl = import.meta.server ? \`\${origin}/api/nc/proxy\` : '/api/nc/proxy'
        const proxyHeaders: Record<string, string> = import.meta.server
          ? { ...useRequestHeaders(['cookie']) }
          : {}
        raw = await $fetch.raw(proxyUrl, {
          method: 'POST',
          headers: proxyHeaders,
          body: {
            url,
            method: request.method ?? 'GET',
            headers,
            body: request.body,
          },
          credentials: 'include',
          signal: controller.signal,
        })
      } else {
        if (import.meta.server) {
          Object.assign(headers, useRequestHeaders(['cookie', 'authorization']))
        }
        raw = await $fetch.raw(url, {
          method: (request.method ?? 'GET') as any,
          headers,
          body: request.body as any,
          credentials: request.credentials,
          signal: controller.signal,
          ...(responseType ? { responseType } : {}),
        })
      }
      const result = {
        data: raw._data as unknown,
        response: {
          status: raw.status,
          headers: Object.fromEntries(raw.headers.entries()),
        },
      }
      try {
        await options.onCompleted?.(result)
      } catch (error) {
        console.warn('[nordcraft2nuxt] API onCompleted callback failed', error)
      }
      return result
      } catch (error) {
        try {
          await options.onFailed?.(error)
        } catch (callbackError) {
          console.warn('[nordcraft2nuxt] API onFailed callback failed', callbackError)
        }
        throw error
      }
    },
    {
      immediate: autoFetch,
      server: ssr,
      lazy: !ssr,
    },
  )

  if (import.meta.client) {
    let timer: ReturnType<typeof setTimeout> | undefined
    watch(
      currentInputs,
      () => {
        if (!autoFetch) return
        if (timer) clearTimeout(timer)
        const delay = descriptor.debounce?.(options.data) ?? 0
        timer = setTimeout(() => {
          void asyncData.refresh()
        }, delay)
      },
      { deep: true },
    )
  }

  async function execute(
    inputs?: Record<string, unknown>,
    _event?: unknown,
    cb?: NcApiCallbacks,
  ) {
    if (inputs) overrideInputs.value = inputs
    callbacks.value = cb ?? {}
    try {
      await asyncData.execute()
      if (asyncData.error.value) callbacks.value.onError?.()
      else callbacks.value.onSuccess?.()
    } catch {
      callbacks.value.onError?.()
    } finally {
      overrideInputs.value = undefined
      abortController.value = null
    }
  }

  function abort() {
    abortController.value?.abort()
  }

  return reactive({
    data: computed(() => asyncData.data.value?.data ?? null),
    isLoading: computed(() => {
      if (import.meta.server && !ssr && autoFetch) return true;
      return asyncData.pending.value;
    }),
    error: computed(() => asyncData.error.value ?? null),
    response: computed(() => asyncData.data.value?.response ?? null),
    execute,
    abort,
  })
}

async function ncConsumeEventStream(
  response: Response,
  onMessage?: (message: unknown) => unknown,
): Promise<unknown> {
  if (!response.body) return null
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let last: unknown = null
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const events = buffer.split('\\n\\n')
    buffer = events.pop() ?? ''
    for (const event of events) {
      for (const line of event.split('\\n')) {
        if (!line.startsWith('data:')) continue
        const raw = line.slice(5).trim()
        if (!raw) continue
        let parsed: unknown = raw
        try {
          parsed = JSON.parse(raw)
        } catch {
          // Keep text events as strings.
        }
        last = parsed
        await onMessage?.(parsed)
      }
    }
  }
  return last
}

async function ncConsumeJsonStream(
  response: Response,
  onMessage?: (message: unknown) => unknown,
): Promise<unknown> {
  if (!response.body) return null
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let last: unknown = null
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const raw = line.trim()
      if (!raw) continue
      try {
        const parsed = JSON.parse(raw)
        last = parsed
        await onMessage?.(parsed)
      } catch {
        // Ignore partial or non-JSON lines.
      }
    }
  }
  return last
}

function ncConsumeWebSocket(
  url: string,
  request: NcApiRequest,
  controller: AbortController,
  onMessage?: (message: unknown) => unknown,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const wsUrl = url.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:')
    const socket = new WebSocket(wsUrl)
    let last: unknown = null
    const close = () => {
      try {
        socket.close()
      } catch {
        // already closed
      }
    }
    controller.signal.addEventListener('abort', close)
    socket.onopen = () => {
      if (request.body !== null && request.body !== undefined) {
        socket.send(
          typeof request.body === 'string'
            ? request.body
            : JSON.stringify(request.body),
        )
      }
    }
    socket.onmessage = async (event) => {
      let parsed: unknown = event.data
      try {
        parsed = JSON.parse(event.data)
      } catch {
        // Keep text frames as strings.
      }
      last = parsed
      await onMessage?.(parsed)
    }
    socket.onerror = () => {
      controller.signal.removeEventListener('abort', close)
      reject(new Error('WebSocket error'))
    }
    socket.onclose = () => {
      controller.signal.removeEventListener('abort', close)
      resolve(last)
    }
  })
}

function ncBuildApiUrl(request: NcApiRequest, origin: string): string {
  const url = new URL(request.url || '/', origin)
  const path = [...(request.path ?? [])].sort((a, b) => a.index - b.index)
  for (const segment of path) {
    if (segment.value === null || segment.value === undefined || segment.value === '') {
      continue
    }
    url.pathname = \`\${url.pathname.replace(/\\/$/, '')}/\${encodeURIComponent(String(segment.value))}\`
  }
  for (const param of request.query ?? []) {
    if (param.enabled === false || param.value === null || param.value === undefined) {
      continue
    }
    url.searchParams.set(param.name, String(param.value))
  }
  return url.toString()
}
`,
    },
    {
      path: 'app/components/NcScript.ts',
      content: `import { defineComponent, h, type PropType } from 'vue'
import { useHead } from '#imports'

export default defineComponent({
  name: 'NcScript',
  props: {
    code: {
      type: String,
      default: '',
    },
    attrs: {
      type: Object as PropType<Record<string, unknown>>,
      default: () => ({}),
    },
  },
  setup(props) {
    useHead(() => ({
      script: [
        {
          ...props.attrs,
          ...(props.code ? { innerHTML: props.code } : {}),
          tagPosition: 'bodyClose',
        } as any,
      ],
    }))
    return () => null
  },
})
`,
    },
    {
      path: 'server/api/nc/cookies/set.post.ts',
      content: `import { createError, defineEventHandler, readBody, setCookie } from 'h3'

export default defineEventHandler(async (event) => {
  const body = (await readBody(event)) as {
    name?: string
    value?: string
    expiresIn?: number | string
    maxAge?: number | string
    sameSite?: string
    path?: string
  }
  const name = String(body?.name ?? '')
  if (!name) {
    throw createError({ statusCode: 400, statusMessage: 'Cookie name is required' })
  }
  const maxAge = body?.maxAge ?? body?.expiresIn
  const options: Record<string, unknown> = {
    httpOnly: true,
    secure: true,
    sameSite: (body?.sameSite ?? 'lax') as any,
    path: String(body?.path ?? '/'),
  }
  if (maxAge !== null && maxAge !== undefined && Number.isFinite(Number(maxAge))) {
    options.maxAge = Number(maxAge)
  }
  setCookie(event, name, String(body?.value ?? ''), options as any)
  return { ok: true }
})
`,
    },
    {
      path: 'app/types/nuxt.d.ts',
      content: `declare module '#app' {
  interface PageMeta {
    pageKey?: string
  }
}

export {}
`,
    },
    {
      path: 'nordcraft.lock.json',
      content: JSON.stringify(
        {
          project: {
            id: ir.id,
            name: ir.name,
            shortId: ir.shortId,
            commit: ir.commit,
          },
          compiler: {
            name: 'nordcraft2nuxt',
            version: '0.1.0',
          },
          target: {
            framework: 'nuxt',
            nuxt: '^4.6.4',
          },
        },
        null,
        2,
      ) + '\n',
    },
    {
      path: 'README.md',
      content: `# ${name}

Generated from the Nordcraft project JSON export by \`nordcraft2nuxt\`.

This is a standalone Nuxt 4 + Vue 3 TypeScript app. It does not depend on any
Nordcraft package. Formula ASTs and workflow ASTs are compiled to TypeScript at
generation time; the generated app only contains the resulting source.

## Run

\`\`\`bash
npm install
npm run dev
\`\`\`

## Build

\`\`\`bash
npm run build
npm run typecheck
\`\`\`

## Notes

- \`app/lib/runtime\` is a self-contained runtime for paths, formulas, actions,
  repeats, contexts, and workflow plumbing.
- \`app/components/nordcraft\` contains one Vue SFC plus its compiled formulas
  and workflows per Nordcraft component.
- Component node styles are emitted as \`<style scoped>\` blocks in each generated SFC.
- Theme variables, fonts, and resets live in the global \`<style>\` block in \`app.vue\`.
- Re-running \`nordcraft2nuxt\` overwrites generated files.
`,
    },
    {
      path: '.gitignore',
      content: `node_modules
.nuxt
.output
dist
.DS_Store
`,
    },
    {
      path: 'public/.gitkeep',
      content: '',
    },
  ]
}

async function formatFiles(
  files: EmittedFile[],
  diagnostics: DiagnosticBag,
): Promise<EmittedFile[]> {
  const formatted: EmittedFile[] = []
  for (const file of files) {
    if (typeof file.content !== 'string') {
      formatted.push(file)
      continue
    }
    const parser = parserFor(file.path)
    if (!parser) {
      formatted.push(file)
      continue
    }
    try {
      formatted.push({
        path: file.path,
        content: await prettierFormat(file.content, { parser }),
      })
    } catch (error) {
      diagnostics.warn(
        'format-failed',
        `Prettier could not format ${file.path}: ${(error as Error).message}`,
      )
      formatted.push(file)
    }
  }
  return formatted
}

function parserFor(path: string): string | undefined {
  if (path.endsWith('.vue')) return 'vue'
  if (path.endsWith('.ts')) return 'typescript'
  if (path.endsWith('.css')) return 'css'
  if (path.endsWith('.json')) return 'json'
  if (path.endsWith('.md')) return 'markdown'
  return undefined
}


function nuxtConfigContent(): string {
  return `export default defineNuxtConfig({
  compatibilityDate: '2026-11-24',
  ssr: true,
  telemetry: false,
  devtools: { enabled: false },
  typescript: {
    strict: true,
  },
  app: {
    head: {
      charset: 'utf-8',
      viewport: 'width=device-width, initial-scale=1',
    },
  },
  vue: {
    compilerOptions: {
      isCustomElement: (tag: string) => tag.includes('-') && !tag.startsWith('Nc'),
    },
  },
  vite: {
    build: {
      // User-authored Nordcraft CSS can contain declarations minifiers reject.
      cssMinify: false,
    },
    vue: {
      template: {
        // Nordcraft assets use absolute, CDN-hosted URLs. Let the runtime resolve
        // them instead of turning them into build-time module imports.
        transformAssetUrls: false,
      },
    },
  },
})
`
}



function proxyFiles(ir: ProjectIR, diagnostics: DiagnosticBag): EmittedFile[] {
  const allowlist = new Set<string>()
  for (const component of ir.components) {
    for (const [apiName, api] of Object.entries(component.source.apis ?? {})) {
      if (!api || !apiProxyEnabled(api)) continue
      const base = apiProxyBase(api)
      if (!base) {
        diagnostics.warn(
          'api-proxy-dynamic-url',
          `API "${apiName}" uses proxying with a dynamic base URL; it cannot be added to the proxy allowlist.`,
          { component: component.key },
        )
        continue
      }
      allowlist.add(base)
    }
  }
  if (allowlist.size === 0) return []
  return [
    {
      path: 'server/api/nc/proxy.post.ts',
      content: `import { $fetch } from 'ofetch'
import {
  createError,
  defineEventHandler,
  getHeader,
  readBody,
  setResponseHeader,
  setResponseStatus,
} from 'h3'

const allowedPrefixes = ${JSON.stringify([...allowlist], null, 2)}

export default defineEventHandler(async (event) => {
  const body = (await readBody(event)) as {
    url?: string
    method?: string
    headers?: Record<string, unknown>
    body?: unknown
  }
  const url = String(body?.url ?? '')
  const allowed = allowedPrefixes.some(
    (prefix) =>
      url === prefix ||
      url.startsWith(prefix + '/') ||
      url.startsWith(prefix + '?'),
  )
  if (!(url.startsWith('http://') || url.startsWith('https://')) || !allowed) {
    throw createError({ statusCode: 400, statusMessage: 'Blocked proxy target' })
  }
  const headers: Record<string, string> = {}
  for (const [key, value] of Object.entries(body?.headers ?? {})) {
    if (value !== null && value !== undefined) headers[key] = String(value)
  }
  const cookie = getHeader(event, 'cookie')
  if (cookie) headers.cookie = cookie

  let response
  try {
    response = await $fetch.raw(url, {
      method: (body?.method ?? 'GET') as any,
      headers,
      body: body?.body as any,
      redirect: 'manual',
    })
  } catch (error) {
    const failed = (error as { response?: typeof response }).response
    if (!failed) throw error
    response = failed
  }
  setResponseStatus(event, response.status)
  for (const [key, value] of response.headers.entries()) {
    if (
      key === 'content-length' ||
      key === 'content-encoding' ||
      key === 'transfer-encoding'
    ) {
      continue
    }
    setResponseHeader(event, key, value)
  }
  return response._data
})
`,
    },
  ]
}


function errorPageContent(ir: ProjectIR): string {
  const notFound = ir.components.find(
    (component) =>
      component.isPage && (component.name === '404' || component.key === '404'),
  )
  if (notFound) {
    return `<script setup lang="ts">
import type { NuxtError } from '#app'
import ${notFound.vueName} from '~/components/nordcraft/${notFound.fileName}'

const props = defineProps<{ error: NuxtError }>()
void props
</script>

<template>
  <${notFound.vueName} />
</template>
`
  }
  return `<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()
</script>

<template>
  <main class="nc-error">
    <h1>{{ props.error.statusCode }}</h1>
    <p>{{ props.error.message }}</p>
    <button type="button" @click="clearError({ redirect: '/' })">Back to home</button>
  </main>
</template>
`
}


async function downloadThemeFonts(
  ir: ProjectIR,
  diagnostics: DiagnosticBag,
): Promise<{ files: EmittedFile[]; urlMap: Map<string, string> }> {
  const files: EmittedFile[] = []
  const urlMap = new Map<string, string>()
  const seen = new Set<string>()
  for (const theme of ir.themes) {
    for (const font of theme.source.fonts ?? []) {
      for (const variant of font.variants ?? []) {
        if (!variant.url || urlMap.has(variant.url)) continue
        try {
          const response = await fetch(variant.url)
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          const bytes = new Uint8Array(await response.arrayBuffer())
          const extension = extensionForUrl(variant.url)
          const base = sanitizeFilePart(`${font.family}-${variant.weight ?? '400'}${variant.italic ? '-italic' : ''}`)
          let filename = `${base}.${extension}`
          let i = 2
          while (seen.has(filename)) filename = `${base}-${i++}.${extension}`
          seen.add(filename)
          files.push({ path: `public/fonts/${filename}`, content: bytes })
          urlMap.set(variant.url, `/fonts/${filename}`)
        } catch (error) {
          diagnostics.warn(
            'font-download-failed',
            `Could not download font ${variant.url}: ${(error as Error).message}`,
          )
        }
      }
    }
  }
  return { files, urlMap }
}

function extensionForUrl(url: string): string {
  const match = /\.(woff2|woff|ttf|otf)(?:[?#]|$)/i.exec(url)
  return match?.[1]?.toLowerCase() ?? 'woff2'
}

function sanitizeFilePart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'font'
}
