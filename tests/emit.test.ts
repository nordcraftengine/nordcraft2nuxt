import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { compileProject } from '../src/compiler.js'
import { parseProject } from '../src/ingest/load.js'
import { buildProjectIR } from '../src/ir/build.js'

async function loadFixture(name: string) {
  const text = await readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')
  return parseProject(JSON.parse(text))
}

describe('project ingest + IR', () => {
  it('reads the JSON project export, not .nc', async () => {
    const project = await loadFixture('counter.project.json')
    const ir = buildProjectIR(project)
    expect(ir.name).toBe('Counter Demo')
    expect(ir.pages).toHaveLength(2)
    expect(ir.pages.some((page) => page.pagePath === 'index.vue')).toBe(true)
    expect(ir.componentByKey.get('Counter')?.vueName).toBe('NcCounter')
    expect(ir.componentByKey.get('HomePage')?.isPage).toBe(true)
  })

  it('rejects an .nc-style or non-project document', () => {
    expect(() => parseProject({ components: {} })).toThrow(/files/)
    expect(() => parseProject('@ nodes\nroot = {}')).toThrow()
  })
})

describe('Nuxt emission', () => {
  it('emits a standalone Nuxt app with no Nordcraft dependencies', async () => {
    const project = await loadFixture('counter.project.json')
    const result = await compileProject(project, { format: false })
    expect(result.diagnostics.hasErrors()).toBe(false)

    const paths = new Set(result.files.map((file) => file.path))
    expect(paths.has('nuxt.config.ts')).toBe(true)
    expect(paths.has('app/pages/index.vue')).toBe(true)
    expect(paths.has('app/components/nordcraft/NcCounter.vue')).toBe(true)
    expect(paths.has('app/components/nordcraft/NcCounter.formulas.ts')).toBe(true)
    expect(paths.has('app/components/nordcraft/NcCounter.workflows.ts')).toBe(true)
    expect(paths.has('app/lib/runtime/index.ts')).toBe(true)
    expect(paths.has('app/assets/css/nordcraft.css')).toBe(false)

    for (const file of result.files) {
      expect(file.content).not.toContain('@nordcraft/')
      if (typeof file.content === 'string') {
        expect(file.content).not.toContain('data-nc')
        expect(file.content).not.toContain('data-node-id')
      }
    }

    const counter = result.files.find(
      (file) => file.path === 'app/components/nordcraft/NcCounter.vue',
    )!
    expect(counter.content).toMatch(/\{\{ text_countValue_[A-Za-z0-9]+ \}\}/)
    expect(counter.content).toContain('v-on=')
    expect(counter.content).toContain('createNcData')
    expect(counter.content).toContain('<style scoped module>')
    expect(counter.content).toContain('class="nc-node root"')
    expect(counter.content).toContain('.increment:hover')
    expect(counter.content).toContain('.increment:focus-visible')
    expect(counter.content).toContain('--rotation: var(--nc-rotation-0)')
    expect(counter.content).toContain("$style['root']")

    const workflows = result.files.find(
      (file) => file.path === 'app/components/nordcraft/NcCounter.workflows.ts',
    )!
    expect(workflows.content).toContain('export async function wf_increment')
    expect(workflows.content).toContain('ncSetVariable')

    const middleware = result.files.find(
      (file) => file.path === 'server/middleware/nordcraft-routes.ts',
    )
    expect(middleware?.content).toContain('sendRedirect')
    expect(middleware?.content).toContain('matchRoute')

    const app = result.files.find((file) => file.path === 'app/app.vue')!
    expect(app.content).toContain('--accent')
    expect(app.content).toContain('box-sizing')
    expect(app.content).toContain('.nc-node')
    expect(app.content).toContain('flex-direction: column')
    expect(app.content).toContain('<style>')
  })

  it('compiles conditions, repeats, repeat keys, and scoped text', async () => {
    const project = await loadFixture('list.project.json')
    const result = await compileProject(project, { format: false })
    const todo = result.files.find(
      (file) => file.path === 'app/components/nordcraft/NcTodoList.vue',
    )!
    expect(todo.content).toContain('ncRepeat(')
    expect(todo.content).toContain('withListItem(')
    expect(todo.content).toContain('ncTruthy(')
    expect(todo.content).toContain('v-if=')
    expect(todo.content).toContain('v-for=')

    const formulas = result.files.find(
      (file) => file.path === 'app/components/nordcraft/NcTodoList.formulas.ts',
    )!
    expect(formulas.content).toContain('node_listItem_')
    expect(formulas.content).toContain('_repeatKey')
    expect(formulas.content).toContain('["ListItem","Item","id"]')
  })

  it('ingests and compiles a real Nordcraft backend sample export', async () => {
    const project = await loadFixture('real-sample.project.json')
    const ir = buildProjectIR(project)
    expect(ir.pages.length).toBeGreaterThan(0)
    expect(ir.componentByKey.has('best_like_button/best-like-button')).toBe(true)
    const result = await compileProject(project, { format: false })
    expect(result.diagnostics.hasErrors()).toBe(false)
    expect(
      result.diagnostics.warnings.filter((warning) => warning.code === 'unsupported-formula'),
    ).toHaveLength(0)
    expect(result.files.some((file) => file.path === 'app/lib/runtime/stdlib.ts')).toBe(true)
    const projectFormulas = result.files.find(
      (file) => file.path === 'app/lib/nordcraft/project-formulas.ts',
    )
    expect(projectFormulas?.content).toContain('projectFormula_standardFormula')
    expect(projectFormulas?.content).toContain('projectFormula_myFormula')
  })

  it('emits default and named slots with fallback content', async () => {
    const project = await loadFixture('slot.project.json')
    const result = await compileProject(project, { format: false })
    const card = result.files.find(
      (file) => file.path === 'app/components/nordcraft/NcCard.vue',
    )!
    expect(card.content).toContain('<slot name="header"')
    expect(card.content).toContain('text_headerFallback')
    expect(card.content).toContain('<slot')
    expect(card.content).toContain('<NcStyle')
    expect(card.content).toContain('<NcScript')
    expect(card.content).toContain(':attrs=')
    const page = result.files.find((file) => file.path === 'app/pages/index.vue')!
    expect(page.content).toContain('<template #header>')
    expect(page.content).toContain('text_bodyText')
  })

  it('compiles package formulas and package custom actions', async () => {
    const project = await loadFixture('package.project.json')
    const result = await compileProject(project, { format: false })
    const formulas = result.files.find(
      (file) => file.path === 'app/lib/nordcraft/project-formulas.ts',
    )
    expect(formulas?.content).toContain('packageFormula_demo_pkg_')
    const actions = result.files.find(
      (file) => file.path === 'app/lib/nordcraft/custom-actions.ts',
    )
    expect(actions?.content).toContain('demo_pkg/notify')
    const componentFormulas = result.files.find(
      (file) => file.path === 'app/components/nordcraft/NcPackageDemo.formulas.ts',
    )
    expect(componentFormulas?.content).toContain('PKG.packageFormula_demo_pkg_')
  })

  it('emits the http-only cookie server route and SSR cookie plugin', async () => {
    const project = await loadFixture('cookie.project.json')
    const result = await compileProject(project, { format: false })
    const route = result.files.find(
      (file) => file.path === 'server/api/nc/cookies/set.post.ts',
    )
    expect(route?.content).toContain('httpOnly: true')
    expect(route?.content).toContain('setCookie')
    const component = result.files.find(
      (file) => file.path === 'app/components/nordcraft/NcCookieDemo.vue',
    )
    expect(component?.content).toContain('ncParseCookieHeader')
    expect(component?.content).toContain('cookies: ncRequestCookies')
  })

  it('compiles project custom actions and passes their event callbacks', async () => {
    const project = await loadFixture('custom.project.json')
    const result = await compileProject(project, { format: false })
    const actions = result.files.find(
      (file) => file.path === 'app/lib/nordcraft/custom-actions.ts',
    )
    expect(actions?.content).toContain('incrementViaAction')
    expect(actions?.content).toContain('triggerActionEvent')
    const component = result.files.find(
      (file) => file.path === 'app/components/nordcraft/NcCustomDemo.vue',
    )!
    expect(component.content).toContain('customActions')
    const workflows = result.files.find(
      (file) => file.path === 'app/components/nordcraft/NcCustomDemo.workflows.ts',
    )!
    expect(workflows.content).toContain('"done"')
    expect(workflows.content).toContain('async (data: unknown) =>')
    expect(workflows.content).toContain('ncSetVariable')
  })

  it('emits API descriptors and uses the Nuxt API composable', async () => {
    const project = await loadFixture('api.project.json')
    const result = await compileProject(project, { format: false })
    const formulas = result.files.find(
      (file) => file.path === 'app/components/nordcraft/NcApiDemo.formulas.ts',
    )!
    expect(formulas.content).toContain('export const api_greeting')
    expect(formulas.content).toContain('autoFetch')
    expect(formulas.content).toContain('withApiInputs')
    const component = result.files.find(
      (file) => file.path === 'app/components/nordcraft/NcApiDemo.vue',
    )!
    expect(component.content).toContain('useNcApi(')
    expect(component.content).toContain('F.api_greeting')
    const proxy = result.files.find(
      (file) => file.path === 'server/api/nc/proxy.post.ts',
    )
    expect(proxy?.content).toContain('allowedPrefixes')
    expect(proxy?.content).toContain('Blocked proxy target')
  })

  it('does not include a formula AST interpreter in the app runtime', async () => {
    const project = await loadFixture('counter.project.json')
    const result = await compileProject(project, { format: false })
    const runtime = result.files.find((file) => file.path === 'app/lib/runtime/index.ts')!
    expect(runtime.content).not.toContain('applyFormula')
    expect(runtime.content).not.toContain('formula JSON')
    const counter = result.files.find(
      (file) => file.path === 'app/components/nordcraft/NcCounter.vue',
    )!
    expect(counter.content).not.toContain('type: "function"')
  })
})
