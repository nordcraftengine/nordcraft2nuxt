# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-11-25

Initial public alpha.

### Added

- Nordcraft `Download branch` JSON ingest and framework-agnostic IR.
- Formula AST to TypeScript compiler with a self-contained runtime.
- Workflow AST to TypeScript compiler with built-in action callbacks.
- CSS/theme compiler with per-component CSS Modules, variants, keyframes,
  custom properties, theme fonts, `@property` definitions, and a
  Nordcraft-compatible node reset.
- Nuxt 4 + Vue 3 TypeScript emitter with pages, components, props, emits,
  slots, contexts, repeats, conditions, SSR-safe variables, and 404 mapping.
- API runtime with auto-fetch, SSR, parser modes, SSE/JSON streaming, basic
  WebSocket support, and an allowlisted server proxy.
- Project and package formulas, custom actions, custom elements via `<script>`
  nodes, redirects/rewrites, response headers/status, and SEO metadata.
- Optional `--download-fonts` and `--asset-origin` asset helpers.
- Unit/golden tests and nine Playwright end-to-end fixtures.
- MIT license and open-source project documentation.
