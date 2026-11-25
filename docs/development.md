# Development

## Setup

```bash
bun install
bun run typecheck
bun run test
```

Build the compiler and run a fixture:

```bash
bun run build
node dist/cli.js tests/fixtures/counter.project.json --out /tmp/nc-counter --force
```

For the E2E suite, install Google Chrome. The harness uses `playwright-core`
with `channel: 'chrome'`.

```bash
bun run test:e2e
```

## Test layers

| Layer | Location | What it covers |
| --- | --- | --- |
| Formula unit tests | `tests/formula.test.ts` | AST lowering, stdlib helpers, scopes |
| Workflow tests | `tests/workflow.test.ts` | actions, switches, callbacks, custom actions |
| Runtime tests | `tests/runtime.test.ts` | paths, truthiness, repeats, contexts, URL params, cookies |
| Golden/emission tests | `tests/emit.test.ts` | standalone output, no Nordcraft imports, CSS/SFC/template rules |
| E2E fixtures | `tests/fixtures`, `scripts/e2e.mjs` | generate, install, build, serve, Playwright interactions |

The E2E fixtures cover counter, list/repeat, context, slots, custom actions,
cookies, packages, streaming, and APIs.

## Adding a standard-library formula

1. Add the implementation to `src/runtime/stdlib.ts`.
2. Export it from `src/runtime/index.ts`.
3. Register its metadata (params, helper, return type) in
   `src/formula/stdlib.ts`.
4. Add a formula and runtime test.
5. If the helper has nontrivial Nordcraft semantics, add a note to
   `docs/compatibility.md`.

The formula compiler uses helper names, not runtime reflection. Missing
registrations intentionally fall back to `ncUnsupportedFormula`.

## Adding a built-in action

1. Add the case to `ncBuiltinAction` in `src/runtime/actions.ts`.
2. Preserve the callback protocol when the action accepts events.
3. Keep browser-only work guarded by `typeof window` checks where SSR can call
   it.
4. Add a workflow/runtime test.
5. Update the action table in `docs/compatibility.md`.

## Emitter conventions

These are invariants:

- never emit `@nordcraft/*` imports or runtime AST evaluation
- use TypeScript in generated SFCs
- use plain node ids as CSS selectors and CSS Modules for scoping
- never emit `data-node-id`, `data-nc-*`, or debug-only data attributes
- preserve package-relative resolution for components, formulas, actions, and
  contexts
- keep generated names deterministic (hashes, not random suffixes)
- keep browser-only custom code SSR-safe

When adding a new emitted file, update `docs/generated-app.md` and the golden
tests.

## Diagnostics

`DiagnosticBag` collects errors, warnings, and infos. The CLI prints all of them
and exits non-zero on errors, or on any warning with `--strict`.

Use `diagnostics.error` when output would be broken, and `diagnostics.warn`
when output is best-effort.

## Formatting

Generated files are formatted with Prettier by default. `--no-format` skips it
for performance or debugging. Prettier failures are warnings; the file is still
written unformatted.

## Release checklist

1. Update `package.json` and `CHANGELOG.md`.
2. Run `bun run typecheck`, `bun run test`, `bun run test:e2e`, and
   `bun run build`.
3. Verify the CI workflow is green.
4. Commit, tag (`git tag -s vX.Y.Z`), and push the tag.
5. Publish with `npm publish` when appropriate.

## Repository hygiene

Local Nordcraft exports (`examples/*.json`) and generated example apps
(`examples/*-app/`) are intentionally ignored. Do not commit them; use
`tests/fixtures` for minimal reproducible inputs.
