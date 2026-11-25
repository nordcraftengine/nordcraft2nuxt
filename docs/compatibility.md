# Compatibility and limitations

Status levels:

- ✅ implemented and covered by tests or a real export
- 🟡 implemented, with known gaps or edge cases
- ❌ not implemented

The compiler has been exercised against the public Nordcraft website export
(755 components, 58 pages). That export is not bundled in this repository.
Feature coverage still depends on which Nordcraft features a project uses.

## Input and project model

| Feature | Status | Notes |
| --- | --- | --- |
| JSON `Download branch` export | ✅ | Requires `{ project, commit, files }`. |
| `.nc` agent format | ❌ | Explicitly rejected. |
| Local components and pages | ✅ | File-based Nuxt routes. |
| Package components | ✅ | Resolved package-relatively before project-level names. |
| Packages that are present but unused | 🟡 | Still compiled; no dead-package pruning yet. |
| Unknown/extra JSON fields | 🟡 | Ingestion is permissive and ignores unknown fields. |

## Components and reactivity

| Feature | Status | Notes |
| --- | --- | --- |
| Elements, text, slots, component instances | ✅ | |
| Props, emits, `onLoad`, `onAttributeChange` | ✅ | Reserved Vue props are mapped to `nc-key`, `nc-ref`, `nc-is`. |
| Variables and SSR snapshots | ✅ | `useState` snapshot plus client re-init. |
| Conditions, repeats, repeat keys | ✅ | Arrays and objects, nested `ListItem.Parent`, duplicate keys. |
| Named/default slots and fallback content | ✅ | Slot-context edge cases are not exhaustively validated. |
| Contexts (provide/inject) | ✅ | Package-relative provider keys are supported. |
| Component-instance class/style overrides | ✅ | Scoped CSS Modules; instance styles win over child root styles. |
| Recursive component graphs | 🟡 | Normal parent/child cycles work; pathological cycles are untested. |
| Client-only widgets | 🟡 | May produce hydration warnings if they depend on time, viewport, or random IDs. |

## Formulas

| Feature | Status | Notes |
| --- | --- | --- |
| All formula AST operations | ✅ | `value`, `path`, `array`, `object`, `record`, `and`, `or`, `switch`, `function`, `apply`. |
| 98 standard-library helpers | ✅ | Self-contained TypeScript runtime. |
| Truthiness/path semantics | ✅ | Nordcraft rules (`0` and `""` are truthy). |
| Higher-order formulas | ✅ | `Args` and `Args['@toddle.parent']` scopes. |
| Project/package formulas | ✅ | Package-relative resolution. |
| Custom-code formula modules | ✅ | Copied into `ts-nocheck` wrappers; bundled handlers receive positional arguments. |
| Unknown formula names | 🟡 | Compiles to `ncUnsupportedFormula`, which logs and returns `null` at runtime. |
| Full static type inference | ❌ | Formula values are mostly `any`/`unknown` at Vue boundaries. |
| Differential oracle tests for every helper | ❌ | Planned. |

## Workflows and actions

| Feature | Status | Notes |
| --- | --- | --- |
| `SetVariable`, `TriggerEvent`, `Switch` | ✅ | |
| `SetURLParameter(s)` | ✅ | Path/query semantics handled at runtime. |
| `TriggerWorkflow`, `TriggerWorkflowCallback` | ✅ | Context-provider workflows included. |
| `Fetch`, `AbortFetch` | ✅ | API descriptors and callbacks are executed. |
| Custom actions | ✅ | Project/package handlers, `toddle.registerAction`, package-relative names. |
| Built-in actions | ✅ | Storage, clipboard, focus, navigation, theme, cookies, share, sleep, interval, preventDefault/stopPropagation, URL updates. |
| Built-in action callbacks | ✅ | `sleep.tick`, cookie `Success`/`Error`; parent params preserved. |
| Unknown action types | 🟡 | Emitted as a no-op with a warning. |
| Every Nordcraft built-in action edge case | 🟡 | Less common actions/options may be missing; see runtime warnings. |

## APIs and data

| Feature | Status | Notes |
| --- | --- | --- |
| API v1/v2 descriptors | ✅ | URL/path/query/header/body/input formulas. |
| `useNcApi` on `useAsyncData` | ✅ | Auto-fetch, SSR flag, debounce, credentials, abort. |
| Parser modes | ✅ | JSON, text, blob, SSE, JSON stream. |
| API lifecycle callbacks | ✅ | `onCompleted`, `onFailed`, `onMessage`. |
| Server proxy | ✅ | Compile-time allowlist for literal API origins. |
| Dynamic proxy base URLs | 🟡 | Called directly, not proxied; warning emitted. |
| Streaming through the proxy | ❌ | Streaming APIs are called directly. |
| WebSocket APIs | 🟡 | Basic open/send/receive; deeper send/close/reconnect semantics are incomplete. |
| Http-only cookie set action | ✅ | Generated Nitro route. |
| Client-side HttpOnly cookie reads | ❌ | Not possible by browser design. |
| Supabase auth flows | 🟡 | Generic HTTP APIs work; provider-specific auth is not implemented. |

## Routing, pages, and SEO

| Feature | Status | Notes |
| --- | --- | --- |
| File-based pages | ✅ | Static, dynamic, and optional parameters. |
| Optional **static** route segments | 🟡 | Nuxt file routing cannot represent them; emitted as required with a warning. |
| Redirect/rewrite route files | ✅ | Nitro middleware, dynamic destinations, `currentURL`. |
| Client-side redirect middleware | ✅ | |
| Redirect/rewrite query matching | ❌ | Query conditions are not matched yet. |
| Page title/description/language/icon | ✅ | |
| Theme cookie | ✅ | |
| Response headers/status | ✅ | Server-evaluated. |
| 404 page mapping | ✅ | Mapped to `error.vue`. |
| `robots.txt`, sitemap, manifest | ❌ | Not generated. |
| Deployment presets | ❌ | Generated app uses Nuxt's default Node server preset. |

## CSS, themes, and animation

| Feature | Status | Notes |
| --- | --- | --- |
| Style objects and numeric size scaling | ✅ | Nordcraft's ×4 px convention. |
| Variants, media queries, breakpoints | ✅ | Hover, focus, active, child, pseudo-elements, starting-style, etc. |
| Keyframes and CSS animations | ✅ | Emitted in component scopes. |
| Dynamic custom properties/variants | ✅ | Units are preserved (`3` → `3s`). |
| Node reset | ✅ | Nordcraft-compatible reset via `.nc-node`; no `data-node-id`. |
| Per-component CSS | ✅ | `<style scoped module>`; node ids remain plain selectors (`.root`). |
| Conditional state classes | ✅ | Names kept unless they collide with a node id, then `nc-state-*`. |
| Theme colors, fonts, legacy tokens | ✅ | |
| `@property` definitions | ✅ | Empty initial values fall back safely. |
| `--download-fonts` | ✅ | Copies fonts to `public/fonts`. |
| Global project `<style>` nodes | ✅ | Injected at runtime. |
| Arbitrary invalid source CSS | 🟡 | Emitted as-is; generated Nuxt config disables CSS minification so strict minifiers do not reject it. |
| Media downloading / local URL rewriting | ❌ | External images/videos remain external. `--asset-origin` only proxies root-relative paths. |
| Visual regression baselines | ❌ | Not in the repository. |

## Packages, custom code, and custom elements

| Feature | Status | Notes |
| --- | --- | --- |
| Package components/formulas/actions | ✅ | Package-relative resolution. |
| Package contexts | ✅ | |
| Bundled custom formulas/actions | ✅ | `toddle.registerFormula` / `toddle.registerAction`; SSR guards. |
| Copied custom-code modules | ✅ | `ts-nocheck`; function selection matches action/formula names. |
| `<script>` nodes | ✅ | Injected with Nuxt `useHead`. |
| Custom elements / third-party editors | 🟡 | Emitted as custom elements and loaded from their scripts. They run their own runtime and may need network/CDNs. |
| Custom JS embedded in node/event attributes | ❌ | Only `<script>` nodes and custom action/formula handlers are supported. |
| Custom-element export mode | ❌ | Output is Vue SFCs, not Nordcraft custom elements. |

## SSR, hydration, and assets

| Feature | Status | Notes |
| --- | --- | --- |
| SSR render | ✅ | |
| Hydration-safe variables | ✅ | Snapshot + client re-init. |
| No hydration warnings on large dynamic pages | 🟡 | Time-based/canvas/widget components can still differ between server and client. |
| Browser-only custom code | ✅ | Server execution is guarded; may return `undefined`. |
| Absolute asset URLs | ✅ | Left untouched. |
| Root-relative assets | 🟡 | Optional `--asset-origin` proxy; no bundling/download. |
| Offline rendering | ❌ | Depends on fonts, images, videos, and custom-element scripts. |

## TypeScript and tooling

| Feature | Status | Notes |
| --- | --- | --- |
| Generated app is TypeScript | ✅ | Vue SFCs use `<script setup lang="ts">`. |
| `nuxt build` | ✅ | Covered by E2E fixtures and a real export. |
| `nuxt typecheck` on small fixtures | ✅ | |
| `nuxt typecheck` on very large package-heavy exports | 🟡 | Strict template/prop errors can remain even when builds and runtime work. |
| Compiler typecheck | ✅ | `bun run typecheck`. |
| Unit/golden tests | ✅ | |
| Playwright E2E fixtures | ✅ | Nine fixtures; requires local Chrome. |
| Incremental compilation | ❌ | Every run regenerates the output. |
| Large-project performance | 🟡 | Thousands of files may take tens of seconds to compile/build. |

## Security notes

- Project exports can contain arbitrary custom code, URLs, and API definitions.
  Treat untrusted exports as untrusted code.
- The API proxy only forwards requests to compile-time-allowlisted literal
  origins. Dynamic base URLs are not proxied.
- Generated apps may load third-party scripts and assets from the source
  project's CDNs.
