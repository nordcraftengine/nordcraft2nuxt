import { execFileSync, spawn } from 'node:child_process'
import http from 'node:http'
import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright-core'

const root = resolve(new URL('..', import.meta.url).pathname)
const compiler = resolve(root, 'dist/cli.js')

const apps = [
  {
    name: 'counter',
    fixture: 'tests/fixtures/counter.project.json',
    out: 'examples/e2e-counter',
    port: 4121,
    async checkServer(baseUrl) {
      const home = await fetch(baseUrl)
      assert(home.headers.get('x-nc-demo') === 'ok', 'page response header is set')
      const response = await fetch(`${baseUrl}old`, { redirect: 'manual' })
      assert(response.status === 301, 'static route rule redirects /old')
      assert(response.headers.get('location') === '/', 'route rule redirect target')
      const dynamic = await fetch(`${baseUrl}item/123`, { redirect: 'manual' })
      assert(dynamic.status === 302, 'dynamic route redirects')
      assert(dynamic.headers.get('location') === '/items/123', 'dynamic route interpolates path params')
      const notFound = await fetch(`${baseUrl}does-not-exist`)
      assert(notFound.status === 404, 'unknown routes return 404')
      assert((await notFound.text()).includes('Page not found'), 'Nordcraft 404 page renders for unknown routes')
    },
    async run(page) {
      const count = () => page.locator('p').first().textContent()
      const border = await page.locator('section').first().evaluate((el) => getComputedStyle(el).borderTopColor)
      assert(border === 'rgb(255, 0, 0)', 'component instance styles survive scoped CSS')
      assert((await count()) === '0', 'counter starts at 0')
      await page.getByRole('button', { name: '+' }).click()
      await page.waitForTimeout(50)
      assert((await count()) === '1', 'counter increments')
      await page.getByRole('button', { name: '−' }).click()
      await page.waitForTimeout(50)
      assert((await count()) === '0', 'counter decrements')
      await page.getByRole('link', { name: 'Old home (client redirect)' }).click()
      await page.waitForTimeout(150)
      assert(new URL(page.url()).pathname === '/', 'client-side redirect middleware handles /old')
      assert((await page.locator('h1').first().textContent()) === 'Counter Demo', 'client redirect keeps the app mounted')
    },
  },
  {
    name: 'list',
    fixture: 'tests/fixtures/list.project.json',
    out: 'examples/e2e-list',
    port: 4122,
    async run(page) {
      const items = () => page.locator('li').allTextContents()
      assert(JSON.stringify(await items()) === JSON.stringify(['First item', 'Second item']), 'list starts with two items')
      await page.getByRole('button', { name: 'Add' }).click()
      await page.waitForTimeout(50)
      assert((await items()).length === 3, 'add appends an item')
      await page.getByRole('button', { name: 'Remove first' }).click()
      await page.waitForTimeout(50)
      assert(JSON.stringify(await items()) === JSON.stringify(['Second item', 'New item']), 'remove drops the first item')
      await page.getByRole('button', { name: 'Remove first' }).click()
      await page.waitForTimeout(50)
      await page.getByRole('button', { name: 'Remove first' }).click()
      await page.waitForTimeout(50)
      assert(await page.getByText('Nothing to do.').isVisible(), 'empty state appears')
    },
  },
  {
    name: 'context',
    fixture: 'tests/fixtures/context.project.json',
    out: 'examples/e2e-context',
    port: 4123,
    async run(page) {
      const section = page.getByRole('button', { name: 'Increase via context' }).locator('..')
      assert((await section.textContent())?.includes('0'), 'context value starts at 0')
      await page.getByRole('button', { name: 'Increase via context' }).click()
      await page.waitForTimeout(50)
      assert((await section.textContent())?.includes('1'), 'context workflow increments the value')
    },
  },
  {
    name: 'slot',
    fixture: 'tests/fixtures/slot.project.json',
    out: 'examples/e2e-slot',
    port: 4125,
    async run(page) {
      const section = page.locator('section')
      const text = await section.textContent()
      assert(text?.includes('Slot header'), 'named slot content renders')
      assert(text?.includes('Slot body'), 'default slot content renders')
      assert(!text?.includes('Fallback'), 'fallback content is replaced')
      const color = await section.evaluate((element) => getComputedStyle(element).color)
      assert(color === 'rgb(1, 2, 3)', 'style nodes are injected into the document')
      const scriptRan = await page.evaluate(() => window.__ncScript)
      assert(scriptRan === 'ok', 'script nodes execute in the generated app')
    },
  },
  {
    name: 'custom',
    fixture: 'tests/fixtures/custom.project.json',
    out: 'examples/e2e-custom',
    port: 4126,
    async run(page) {
      const section = page.locator('section')
      assert((await section.textContent())?.includes('0'), 'custom action value starts at 0')
      await page.getByRole('button', { name: 'Run custom action' }).click()
      await page.waitForTimeout(50)
      assert((await section.textContent())?.includes('1'), 'custom action callback updates state')
    },
  },
  {
    name: 'cookie',
    fixture: 'tests/fixtures/cookie.project.json',
    out: 'examples/e2e-cookie',
    port: 4127,
    async run(page) {
      await page.getByRole('button', { name: 'Set http-only cookie' }).click()
      await page.waitForTimeout(250)
      const cookies = await page.context().cookies()
      const session = cookies.find((cookie) => cookie.name === 'session')
      assert(session?.value === 'secret', 'http-only cookie value')
      assert(session?.httpOnly === true, 'http-only cookie is HttpOnly')
      assert(session?.secure === true, 'http-only cookie is Secure')
    },
  },
  {
    name: 'package',
    fixture: 'tests/fixtures/package.project.json',
    out: 'examples/e2e-package',
    port: 4128,
    async run(page) {
      const section = page.locator('section')
      assert((await section.textContent())?.includes('12'), 'package formula renders from component state')
      await page.getByRole('button', { name: 'Run package action' }).click()
      await page.waitForTimeout(50)
      assert((await section.textContent())?.includes('1122'), 'package action callback updates component state')
    },
  },
  {
    name: 'stream',
    fixture: 'tests/fixtures/stream.project.json',
    out: 'examples/e2e-stream',
    port: 4129,
    mockApiPort: 4210,
    async run(page) {
      const section = page.locator('section')
      await page.waitForTimeout(250)
      assert((await section.textContent())?.includes('second'), 'API onMessage updates state from an SSE stream')
    },
  },
  {
    name: 'api',
    fixture: 'tests/fixtures/api.project.json',
    out: 'examples/e2e-api',
    port: 4124,
    mockApiPort: 4210,
    async run(page) {
      const section = page.locator('section')
      assert((await section.textContent())?.includes('Hello API'), 'API autoFetch data renders')
      assert((await section.textContent())?.includes('done'), 'API onCompleted event runs')
      const errors = []
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text())
      })
      await page.getByRole('button', { name: 'Refetch' }).click()
      await page.waitForTimeout(250)
      assert(errors.length === 0, 'API refetch has no console errors')
    },
  },
]

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`)
}

async function waitForServer(url) {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // Not up yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  throw new Error(`Server did not start: ${url}`)
}

async function runApp(app) {
  const out = resolve(root, app.out)
  console.log(`\n[${app.name}] generating ${app.out}`)
  await rm(out, { recursive: true, force: true })
  execFileSync(process.execPath, [compiler, resolve(root, app.fixture), '--out', out, '--force'], {
    stdio: 'inherit',
  })
  console.log(`[${app.name}] installing dependencies`)
  execFileSync('bun', ['install'], { cwd: out, stdio: 'ignore' })
  console.log(`[${app.name}] building`)
  execFileSync('bun', ['run', 'build'], { cwd: out, stdio: 'ignore' })

  const mockServer = app.mockApiPort
    ? http.createServer((request, response) => {
        if (request.url === '/stream') {
          response.writeHead(200, {
            'content-type': 'text/event-stream',
            'cache-control': 'no-cache',
            'access-control-allow-origin': '*',
          })
          response.write('data: {"message":"first"}\n\n')
          setTimeout(() => {
            response.write('data: {"message":"second"}\n\n')
            response.end()
          }, 50)
          return
        }
        response.writeHead(200, {
          'content-type': 'application/json',
          'access-control-allow-origin': '*',
        })
        response.end(JSON.stringify({ message: 'Hello API' }))
      })
    : null
  if (mockServer && app.mockApiPort) {
    await new Promise((resolve, reject) => {
      mockServer.once('error', reject)
      mockServer.listen(app.mockApiPort, resolve)
    })
  }

  const server = spawn(process.execPath, ['.output/server/index.mjs'], {
    cwd: out,
    env: { ...process.env, PORT: String(app.port) },
    stdio: 'ignore',
  })

  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    await waitForServer(`http://localhost:${app.port}/`)
    const page = await browser.newPage()
    const errors = []
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    page.on('pageerror', (error) => errors.push(String(error)))
    const baseUrl = `http://localhost:${app.port}/`
    await app.checkServer?.(baseUrl)
    await page.goto(baseUrl, { waitUntil: 'networkidle' })
    await app.run(page)
    assert(errors.length === 0, `no console errors: ${errors.join('\n')}`)
    console.log(`[${app.name}] ok`)
  } finally {
    await browser.close()
    server.kill('SIGTERM')
    if (mockServer) mockServer.close()
  }
}

for (const app of apps) {
  await runApp(app)
}
console.log('\nAll E2E fixtures passed.')
