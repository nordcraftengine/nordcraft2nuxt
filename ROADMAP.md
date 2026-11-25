# Roadmap

Status: ✅ done · 🟡 partial · ⬜ not started

Current release: **0.1.0 (alpha)**. The compiler is usable on real exports, but
feature coverage depends on the Nordcraft features a project uses. See
[compatibility](./docs/compatibility.md) for the detailed matrix.

## M0 — Foundation ✅

- [x] TypeScript project, CLI, JSON ingest
- [x] Own project types (no `.nc` parsing, no Nordcraft packages)
- [x] IR, component/page resolution, deterministic generated names
- [x] Nuxt 4 app scaffold emitter
- [x] Unit/golden test harness
- [x] Compiler typecheck and build
- [x] MIT license, documentation, community files, CI

## M1 — Formula compiler ✅

- [x] All formula AST operations
- [x] Scope model (`Variables`, `Attributes`, `Apis`, `Contexts`, `Formulas`,
      `Location`, `ListItem`, `Event`, `Args`, `ApiInputs`, `Parameters`)
- [x] Path semantics and Nordcraft truthiness
- [x] 98 standard-library helper names
- [x] Higher-order formulas and `Args['@toddle.parent']`
- [x] Project/package/custom-code formulas
- [x] Package-relative and positional bundled formula handlers
- [ ] Full static type inference (currently `any`/`unknown` at boundaries)
- [ ] Differential snapshots for every helper

## M2 — Workflow compiler ✅ (core)

- [x] `SetVariable`, `TriggerEvent`, `Switch`, `SetURLParameter(s)`
- [x] `Fetch`, `AbortFetch`
- [x] `TriggerWorkflow`, `TriggerWorkflowCallback`, context workflows
- [x] Custom actions and cleanup registration
- [x] Built-in action dispatcher
- [x] Built-in callbacks (`sleep.tick`, cookie `Success`/`Error`) with params
- [x] Package-relative custom action resolution
- [ ] Remaining built-in action options/edge cases
- [ ] Full per-invocation callback edge-case coverage

## M3 — CSS/theme compiler ✅

- [x] Static styles and numeric size ×4 px
- [x] Variants, media queries, breakpoints, pseudo-elements, starting-style
- [x] Keyframes and animations
- [x] Style variables and custom properties (static/dynamic, units)
- [x] Per-component `<style scoped module>` output
- [x] Plain node-id selectors with CSS Modules
- [x] Collision-safe conditional state classes
- [x] Nordcraft-compatible reset via `.nc-node`, no `data-node-id`
- [x] Low-specificity `:where(...)` reset for style-node overrides
- [x] Theme fonts, `@property`, theme values, legacy tokens
- [x] `--download-fonts`
- [x] Optional `--asset-origin` proxy for root-relative assets
- [ ] Media asset downloading and local URL rewriting
- [ ] Visual regression baselines

## M4 — Nuxt emitter ✅ (core)

- [x] Typed Vue SFCs
- [x] File-based routing, dynamic/optional params
- [x] SEO metadata, theme cookie, response headers/status
- [x] Hydration-safe variables
- [x] `<style>`/`<script>` nodes
- [x] 404 mapping
- [x] Redirect/rewrite middleware
- [x] Kebab/camel prop bridging and reserved prop names
- [x] Package-relative component/formula/action/context resolution
- [x] Custom-code modules with SSR guards and correct handler selection
- [ ] Deployment presets
- [ ] Strict typecheck parity on very large package-heavy exports

## M5 — Components and reactivity ✅ (core)

- [x] Variables, conditions, repeats, nested parent scopes
- [x] Props, emits, slots, contexts
- [x] `onLoad` after `nextTick`, `onAttributeChange` post-DOM
- [x] Component-instance styles
- [x] Package components
- [ ] Slot-content provider-context parity validation
- [ ] Recursive/mutually recursive component edge cases
- [ ] Hydration parity for time-based/client-only widgets on large pages

## M6 — APIs and data ✅ (core)

- [x] `useNcApi` on `useAsyncData`
- [x] API v1/v2 models, inputs, path/query/header/body formulas
- [x] Auto-fetch, reactivity, debounce, credentials, SSR forwarding
- [x] JSON/text/blob/SSE/JSON-stream parser modes
- [x] `Fetch`/`AbortFetch` actions
- [x] API lifecycle/client callbacks
- [x] Allowlisted API proxy and HttpOnly cookie writes
- [x] SSR `getCookie`/`getHttpOnlyCookie`
- [ ] Server-side streaming through the proxy
- [ ] Full WebSocket send/close/reconnect semantics
- [ ] Supabase/provider-specific auth flows
- [ ] Client-side HttpOnly cookie reads (not possible by design)

## M7 — Project features

- [x] Redirect/rewrite route files via Nitro middleware
- [x] Client-side redirect middleware
- [x] Response headers/status
- [x] 404 mapping
- [x] SEO title/description/language/icon
- [ ] Query-aware redirect/rewrite matching
- [ ] Optional static route segments
- [ ] Media downloader and local URL rewriting
- [ ] `robots.txt`, sitemap, manifest
- [ ] Error handling parity
- [ ] Deployment presets

## M8 — Hardening

- [x] SSE and JSON-stream APIs
- [x] Basic WebSocket APIs
- [x] Custom JS project/package formulas/actions with guards
- [x] Deterministic generated names
- [x] Real-world export exercise (755 components, 58 pages)
- [ ] Streaming proxy support
- [ ] Custom JS inside node/event attributes
- [ ] Custom-element wrapper semantics/export mode
- [ ] Large-project performance and unused-package pruning
- [ ] Differential oracle fixtures
- [ ] Visual regression and accessibility baselines

## M9 — Open-source release ✅

- [x] README, getting started, compatibility matrix, architecture and
      generated-app docs
- [x] MIT license and third-party notice
- [x] Contributing guide, code of conduct, security policy
- [x] Changelog and roadmap
- [x] CI workflow (typecheck, unit/golden tests, build)
- [x] Issue and pull-request templates
- [ ] npm release
- [ ] Hosted demo / example gallery
- [ ] 1.0 compatibility commitment

## Known gaps

The short list:

- formula type inference
- strict typechecking on very large exports
- media downloading/rewriting
- streaming proxy and full WebSocket semantics
- query-aware routing and optional static segments
- sitemap/robots/manifest/deployment presets
- custom JS embedded in node/event attributes
- custom-element export mode
- visual/differential regression coverage
- incremental builds and unused-package pruning

Third-party custom elements and CDN assets remain external and may require
network access.
