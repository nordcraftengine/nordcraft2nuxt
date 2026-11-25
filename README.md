# nordcraft2nuxt

Compile a **Nordcraft project JSON export** into a standalone **Nuxt 4 + Vue 3
TypeScript app**.

[![CI](https://github.com/nordcraftengine/nordcraft2nuxt/actions/workflows/ci.yml/badge.svg)](https://github.com/nordcraftengine/nordcraft2nuxt/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

There are **no `@nordcraft/*` dependencies** in the compiler or the generated
app. Formula and workflow ASTs are compiled to TypeScript at generation time;
the output contains Nuxt/Vue source and a small self-contained runtime, not an
AST interpreter.

> **Status: alpha (0.1.0).** The compiler builds and runs real projects, but
> Nordcraft feature coverage is uneven. See [compatibility](./docs/compatibility.md)
> before using it for production.

> **Input:** the JSON **Download branch** export (`{ project, commit, files }`).
> This compiler does not accept the `.nc` agent format.

## Quick start

Requirements: Node.js 20+ and Bun 1.3+ for development.

```bash
git clone https://github.com/nordcraftengine/nordcraft2nuxt.git
cd nordcraft2nuxt
bun install
bun run build
```

Compile the counter fixture:

```bash
node dist/cli.js tests/fixtures/counter.project.json \
  --out /tmp/nc-counter \
  --force
```

Run the generated app:

```bash
cd /tmp/nc-counter
npm install
npm run dev
```

Compile a real export:

```bash
node dist/cli.js path/to/export.json \
  --out my-app \
  --asset-origin https://example.com \
  --force
```

`--asset-origin` proxies site-root asset paths such as `/cdn-cgi/...`; without
it those assets will 404 locally. Absolute URLs are left untouched.

## What works

- JSON ingest and a framework-agnostic IR.
- Components, pages, props, emits, slots, contexts, repeats, conditions, and
  SSR-safe variables.
- Formula ASTs → TypeScript with all 98 standard-library helpers, higher-order
  formulas, and project/package/custom-code formulas.
- Workflow ASTs → TypeScript, including built-in action callbacks and custom
  actions.
- API compiler/runtime: auto-fetch, SSR, JSON/text/blob/SSE/JSON-stream, basic
  WebSocket, allowlisted server proxy, and HttpOnly cookie writes.
- CSS/theme compiler: per-component CSS Modules, variants, keyframes, dynamic
  custom properties, theme fonts, `@property`, legacy tokens, and a
  Nordcraft-compatible reset.
- Nuxt emitter: file-based routing, redirects/rewrites, 404 mapping, SEO,
  response headers/status, `<style>`/`<script>` nodes, and static asset origin
  proxying.
- Package-relative resolution for components, formulas, actions, and contexts.
- Unit, golden, runtime, and nine Playwright E2E fixtures.

## What is not working yet

- Full static formula type inference; generated formula values are mostly
  `any`/`unknown` at Vue boundaries.
- Strict `nuxt typecheck` on very large package-heavy exports can still report
  template/prop errors even when `nuxt build` and the running app work.
- Media downloading/local rewriting; only `--asset-origin` proxying exists.
- Server-side streaming through the API proxy and full WebSocket send semantics.
- Query-aware redirect/rewrite matching and optional static route segments.
- `robots.txt`, sitemap, manifest generation, and deployment presets.
- Custom JS embedded directly in node/event attributes (only `<script>` nodes,
  custom formulas, and custom actions are supported).
- Custom-element export mode; output components are Vue SFCs.
- Visual regression baselines, differential oracle fixtures, incremental builds,
  and automatic pruning of unused packages.

Third-party Nordcraft custom elements embedded through `<script>` nodes run
their external runtime and may depend on network access/CDNs. Hydration warnings
can still appear for time-based or client-only widgets on large pages.

See [docs/compatibility.md](./docs/compatibility.md) for the full matrix.

## CLI

```text
Usage:
  nordcraft2nuxt <project.json> [options]

Options:
  -o, --out <dir>       Output directory (default: nordcraft-app)
      --no-format       Skip Prettier formatting
      --force           Overwrite a non-empty output directory
      --strict          Treat compiler warnings as errors
      --download-fonts  Download theme fonts into public/fonts
      --asset-origin <url>
                        Proxy root-relative assets (for example /cdn-cgi/...)
  -h, --help            Show help
```

The compiler prints diagnostics as `error [code]`, `warn [code]`, or
`info [code]`.

## Generated app

```text
my-app/
  app/pages/**                     file-based Nuxt routes
  app/components/nordcraft/*.vue   pages/components
  app/components/nordcraft/*.formulas.ts
  app/components/nordcraft/*.workflows.ts
  app/lib/runtime/**               self-contained runtime
  app/app.vue                      global theme/font/reset styles
  server/**                        redirects, rewrites, optional proxy/cookie routes
```

Styles are emitted as per-component `<style scoped module>` blocks. Source
selectors use plain node ids (`.root`); the DOM keeps the node id class plus the
CSS-module class. Theme/fonts/reset live in the global `app.vue` style block.
No `data-node-id`/`data-nc-*` debug attributes are emitted.

See [docs/generated-app.md](./docs/generated-app.md).

## Programmatic API

```ts
import { compileProject, loadProjectFile, writeEmittedFiles } from 'nordcraft2nuxt'

const project = await loadProjectFile('project.json')
const result = await compileProject(project, { format: true })
await writeEmittedFiles('my-app', result.files, { force: true })
```

## Documentation

- [Getting started](./docs/getting-started.md)
- [Compatibility and limitations](./docs/compatibility.md)
- [Architecture](./docs/architecture.md)
- [Generated app](./docs/generated-app.md)
- [Development](./docs/development.md)
- [Roadmap](./ROADMAP.md)
- [Changelog](./CHANGELOG.md)

## Development

```bash
bun run typecheck
bun run test        # unit, runtime, golden
bun run test:e2e    # generate/install/build/test nine apps (needs Chrome)
bun run build
```

Contributions are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) and
[CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

## License and trademarks

MIT. See [LICENSE](./LICENSE).

`nordcraft2nuxt` is maintained in the Nordcraft GitHub organization. Nordcraft is a
trademark of its respective owners. Some compatibility
behavior was implemented with reference to the open-source Nordcraft engine
(Apache-2.0). See [NOTICE.md](./NOTICE.md).
