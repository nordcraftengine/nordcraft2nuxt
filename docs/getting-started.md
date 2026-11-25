# Getting started

`nordcraft2nuxt` compiles a Nordcraft project JSON export into a standalone Nuxt 4 +
Vue 3 TypeScript application. The compiler and the generated app do not depend
on any `@nordcraft/*` package.

## Requirements

- Node.js 20 or newer
- Bun 1.3 or newer for development
- npm, pnpm, or Bun for installing generated apps
- Google Chrome only when running the Playwright E2E suite

## Input format

Use the **Download branch** JSON export from Nordcraft. It has this shape:

```json
{
  "project": { "name": "My project", "short_id": "my-project" },
  "commit": "…",
  "files": {
    "components": {},
    "actions": {},
    "formulas": {},
    "config": {},
    "packages": {},
    "themes": {},
    "routes": {},
    "services": {}
  }
}
```

The compiler does **not** accept the `.nc` agent/script format.

## Build and run the compiler

```bash
git clone https://github.com/nordcraftengine/nordcraft2nuxt.git
cd nordcraft2nuxt
bun install
bun run build
```

Compile the small counter fixture:

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

For a real export that uses site-root asset URLs such as `/cdn-cgi/...`, pass
the origin that serves those URLs:

```bash
node dist/cli.js path/to/export.json \
  --out my-app \
  --force \
  --asset-origin https://example.com
```

Without `--asset-origin`, root-relative assets remain root-relative and will
404 on a local server. Absolute URLs (`https://…`) are left untouched.

## CLI options

```text
Usage:
  nordcraft2nuxt <project.json> [options]

Options:
  -o, --out <dir>       Output directory (default: nordcraft-app)
      --no-format       Skip Prettier formatting of generated files
      --force           Overwrite a non-empty output directory
      --strict          Treat compiler warnings as errors
      --download-fonts  Download theme fonts into public/fonts
      --asset-origin <url>
                        Proxy root-relative asset URLs (for example /cdn-cgi/...)
  -h, --help            Show help
```

Compilation writes diagnostics to stdout. With `--strict`, any warning makes
the command exit non-zero. Without it, only errors stop output.

## Generated app commands

```bash
cd my-app
npm install
npm run dev        # development server
npm run build      # production build
npm run typecheck  # vue-tsc strict typecheck
npm run preview    # preview a production build
```

The generated `package.json` depends only on `nuxt` and `vue`.

## What you should see

A successful compile prints the component/page counts and the number of files
written. The output contains:

```text
nuxt.config.ts
package.json
app/app.vue
app/pages/**
app/components/nordcraft/*.vue
app/components/nordcraft/*.formulas.ts
app/components/nordcraft/*.workflows.ts
app/lib/runtime/**
app/lib/nordcraft/project-formulas.ts
app/lib/nordcraft/custom-actions.ts
server/middleware/**
server/routes/**
```

See [generated-app.md](./generated-app.md) for the structure and styling rules.

## Common diagnostics

| Code | Meaning |
| --- | --- |
| `missing-component` | A component reference was not found in the project or package. The output contains a comment/no-op and the compiler reports an error. |
| `unsupported-formula` | No runtime implementation exists for a formula name. Generated code calls `ncUnsupportedFormula` and logs at runtime. |
| `unsupported-action` | A workflow action type is not compiled. The output contains a no-op comment. |
| `api-proxy-dynamic-url` | An API uses server proxying with a computed base URL. It cannot be allowlisted and is called directly. |
| `format-failed` | Prettier could not format a generated file, usually because source HTML nesting is invalid. The file is still written. |
| `custom-element` | Source markup uses a custom element that is emitted as-is. Its script/runtime is external. |

Warnings usually indicate partial fidelity. Run with `--strict` in CI if you
want to treat them as failures.

## Troubleshooting

**Images or videos 404 locally.** Pass `--asset-origin <site origin>` to proxy
root-relative paths.

**A package component renders but does not interact.** Some packages embed
Nordcraft custom elements loaded from external scripts. They run their own
runtime and may depend on network access or host attributes. See
[compatibility.md](./compatibility.md).

**A generated app has strict TypeScript errors.** The generated code is
TypeScript, but package-heavy exports can still produce unknown template values
and strict prop-assignment errors. The production build does not typecheck by
default. See the known limitations in [compatibility.md](./compatibility.md).
