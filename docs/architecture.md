# Architecture

`nordcraft2nuxt` is a source-to-source compiler. It reads Nordcraft formula and
workflow JSON at build time and emits TypeScript. The generated app contains no
Nordcraft runtime and does not evaluate Nordcraft ASTs in the browser.

## Pipeline

```text
project.json
  │
  ├─ ingest + permissive validation       src/ingest
  │    ProjectJson, ComponentJson, FormulaJson, WorkflowJson, …
  │
  ├─ framework-agnostic IR                src/ir
  │    components, pages, themes, packages, route files
  │
  ├─ formula AST → TypeScript             src/formula
  ├─ workflow AST → TypeScript            src/workflow
  ├─ styles/themes → CSS Modules          src/css
  │
  ├─ Nuxt/Vue emitter                     src/emit
  │    SFCs, formula modules, workflow modules,
  │    API descriptors, proxy/server routes, runtime copy
  │
  └─ Prettier + diagnostics + files       src/compiler.ts
```

### Ingest

`parseProject` checks only the envelope (`project`, `files`) and otherwise stays
permissive. Unknown fields are ignored. Missing or unsupported features produce
diagnostics rather than a hard schema failure so that large real-world exports
can still be compiled.

### IR

The IR assigns stable keys and Vue-safe names to every component page, maps
components package-relatively, and exposes typed structures for the emitters.
Generated names use deterministic hashes to avoid collisions across repeated
node/formula/event names.

### Formula compiler

Each formula AST node becomes a TypeScript expression over `NcFormulaData`:

```ts
ncConcatenate([
  ncPath(d, ["Variables", "name"]),
  " — ",
  ncPath(d, ["Attributes", "role"]),
])
```

Higher-order formulas compile to inline callbacks with `withArgs` scopes.
Project and package formulas become imported functions. Custom-code formulas
are copied into typed modules marked `@ts-nocheck`.

### Workflow compiler

Workflow control flow becomes real TypeScript (`if`/`else`, loops where
relevant, `await`, callbacks). Only leaf built-in actions use a typed dispatcher:

```ts
await ncBuiltinAction(ctx, "@toddle/sleep", { delay: 300 }, event, {
  tick: async () => { /* compiled tick actions */ },
})
```

Workflow params are preserved inside callbacks so checks such as
`Parameters.run === Variables.run` still work.

### CSS compiler

Style objects are rendered into per-component `<style scoped module>` blocks.
Node ids remain plain source selectors:

```css
.root {
  display: flex;
}
```

CSS Modules provide per-component scoping while the DOM keeps the raw node id
(`class="nc-node root _root_hash"`). A conditional state class keeps its source
name unless it collides with a node id; collisions use `nc-state-*`.

The global reset is applied through `.nc-node` (not `data-node-id`) and is
wrapped in `:where(...)` so project `<style>` nodes can override it.

Theme variables, fonts, legacy tokens, `@property` definitions, and the body
reset live in the global `<style>` block in `app.vue`.

### Nuxt emitter

The emitter writes a complete Nuxt app:

- pages in `app/pages`
- project/package components under `app/components/nordcraft`
- formula/workflow modules next to components
- `app/lib/runtime` copied from `src/runtime`
- global project/package formulas and custom actions
- API proxy, cookie, and route middleware/server handlers
- generated `nuxt.config.ts`, `package.json`, and `tsconfig.json`

Static files and server files can be emitted conditionally based on project
features.

## Runtime

The generated `app/lib/runtime` is our own TypeScript:

| Module | Responsibility |
| --- | --- |
| `data.ts` | `NcFormulaData`, path/truthiness semantics, scoped views, attribute aliasing |
| `stdlib.ts` | 98 formula helpers |
| `workflow.ts` | workflow context, URL updates, scoped workflow data |
| `actions.ts` | built-in action dispatcher |
| `api.ts` | API descriptor and `useNcApi` behavior |
| `repeat.ts` | repeat normalization and key handling |
| `context.ts` | provider context value views |

## Design decisions

**No Nordcraft dependency.** The compiler and generated apps never import
Nordcraft packages. The runtime is a compatibility implementation.

**No AST interpretation at runtime.** Formula/workflow JSON is lowered to
TypeScript at generation time. This keeps generated code debuggable and avoids
shipping a general evaluator.

**No debug node attributes.** Node identity is expressed as classes
(`nc-node root`), not `data-node-id`/`data-nc-*`. Third-party custom elements
may still add their own attributes internally.

**Package-relative resolution.** A package component resolves components,
formulas, actions, and contexts inside its own package before falling back to
project-level names.

**SSR-first.** Variables are serialized with Nuxt `useState`, then re-initialized
on mount. Browser-only custom code is guarded on the server. DOM lookups in
`onLoad` wait a tick and `onAttributeChange` runs post-DOM.

## Programmatic API

```ts
import { compileProject, loadProjectFile, writeEmittedFiles } from 'nordcraft2nuxt'

const project = await loadProjectFile('project.json')
const result = await compileProject(project, {
  format: true,
  downloadFonts: false,
  assetOrigin: 'https://example.com',
})

for (const diagnostic of result.diagnostics.diagnostics) {
  console.log(diagnostic.severity, diagnostic.code, diagnostic.message)
}

await writeEmittedFiles('my-app', result.files, { force: true })
```
