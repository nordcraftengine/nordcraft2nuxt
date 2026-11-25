# Contributing

Thanks for helping improve `nordcraft2nuxt`.

## Development setup

Requirements:

- Node.js 20 or newer
- [Bun](https://bun.sh/) 1.3 or newer
- Google Chrome (only for the Playwright end-to-end tests)

```bash
git clone https://github.com/nordcraftengine/nordcraft2nuxt.git
cd nordcraft2nuxt
bun install
bun run typecheck
bun run test
```

Build the CLI:

```bash
bun run build
node dist/cli.js tests/fixtures/counter.project.json --out /tmp/nc-counter --force
```

## Project layout

```text
src/ingest/     permissive Nordcraft JSON types and loading
src/ir/         framework-agnostic intermediate representation
src/formula/    formula AST -> TypeScript
src/workflow/   workflow AST -> TypeScript
src/css/        styles, variants, themes, fonts, reset
src/emit/       Nuxt/Vue SFC, runtime, API, route, and server emitters
src/runtime/    self-contained runtime copied into generated apps
tests/          unit, runtime, golden, and E2E fixtures
scripts/        build helpers and Playwright E2E harness
docs/           user and architecture documentation
```

## Testing

```bash
bun run typecheck   # compiler and tests
bun run test        # unit, runtime, and golden tests
bun run test:e2e    # generates, installs, builds, and tests nine apps
```

`test:e2e` uses the locally installed Google Chrome through `playwright-core`.
It is intentionally not part of the default CI job because it builds multiple
Nuxt apps and needs network access.

When fixing a bug, add the smallest fixture or unit test that reproduces it.
Please keep generated output deterministic.

## Generated output rules

These are compatibility requirements, not preferences:

- The compiler and generated apps must not depend on `@nordcraft/*` packages.
- Generated Vue/Nuxt code must be TypeScript.
- Node ids are plain CSS classes (`.root`), scoped with CSS Modules.
- Do not add `data-node-id`, `data-nc-*`, or similar debug attributes.
- Component/package names must resolve package-relatively before project-level
  names.
- Never evaluate Nordcraft formula or workflow JSON at runtime; compile the AST.

## Pull requests

- Keep changes focused and explain the Nordcraft feature or bug being addressed.
- Include the commands you ran (`typecheck`, `test`, `test:e2e`).
- Do not commit local Nordcraft exports (`examples/*.json`) or generated apps.
- Update `README.md`, `docs/`, `ROADMAP.md`, or `CHANGELOG.md` when behavior
  changes.
- New files must be compatible with the MIT license.

## Release checklist

1. Update the version in `package.json` and `CHANGELOG.md`.
2. Run `bun run typecheck`, `bun run test`, and `bun run test:e2e`.
3. Run `bun run build`.
4. Confirm CI is green.
5. Create a signed tag (`git tag -s vX.Y.Z`) and push it.
6. Publish to npm with `npm publish` if a release is intended.

## Code of conduct

Participation is governed by [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).
