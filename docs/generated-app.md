# Generated app

A compile produces a complete Nuxt 4 application. It depends only on `nuxt` and
`vue`; all Nordcraft-compatible runtime code is copied into the app.

## Structure

```text
my-app/
  nuxt.config.ts
  package.json
  tsconfig.json
  app/
    app.vue                     # global theme/font/reset <style>
    pages/                      # file-based routes
    components/
      NcStyle.ts
      NcScript.ts
      nordcraft/
        NcFoo.vue
        NcFoo.formulas.ts
        NcFoo.workflows.ts
        …
    lib/
      runtime/                  # self-contained TypeScript runtime
      nordcraft/
        project-formulas.ts
        custom-actions.ts
      nuxt/
        route.ts
        api.ts
      composables/useNcTheme.ts
  server/
    middleware/                 # redirects/rewrites, optional asset proxy
    routes/                     # optional API proxy/cookie routes
```

## Styling

- Each component/page uses a scoped CSS Modules block:
  `<style scoped module>`.
- Source selectors use plain node ids (`.root`).
- DOM elements keep the node id class and the module class:
  `class="nc-node root _root_1a2b3_2"`.
- A conditional state class keeps its source name unless it collides with a node
  id; collisions use `nc-state-*`.
- The reset is applied to `.nc-node` using low-specificity `:where(...)`
  selectors. It resets margins/padding/display/typography/links/lists/forms to
  match Nordcraft's runtime reset.
- Theme variables, `@font-face`, legacy tokens, `@property` definitions, and the
  body reset live in `app/app.vue`.
- Project `<style>` nodes are rendered by `NcStyle` as real `<style>` elements.
- Generated `nuxt.config.ts` disables Vue asset-URL transforms and CSS
  minification so absolute CDN paths and project-authored CSS survive the build.

## Formulas and workflows

Formula and workflow modules export ordinary TypeScript functions. They are
generated from the AST; no JSON is interpreted at runtime.

```ts
export function node_title_ab12_attr_text_cd34(
  d: NcFormulaData,
  args: NcArgs = {},
): any {
  return ncPath(d, ["Attributes", "title"]);
}
```

Name suffixes are deterministic hashes. Custom code is copied into `ts-nocheck`
wrappers and receives a typed `NcFormulaData`/context.

## Data and SSR

`createNcData` builds the Nordcraft data shape (`Variables`, `Attributes`,
`Apis`, `Contexts`, `Formulas`, `Location`, `ListItem`, `Event`, `Args`,
`Parameters`, …). Variables use Nuxt `useState` snapshots for SSR and re-init on
mount.

`onLoad` runs after `nextTick`; `onAttributeChange` uses a post-DOM watcher.
This makes element-id lookups reliable for observers, timelines, and custom
actions.

## Component props

Vue-reserved prop names are mapped at the component boundary:

| Nordcraft prop | Vue prop | Parent attribute |
| --- | --- | --- |
| `key` | `ncKey` | `nc-key` |
| `ref` | `ncRef` | `nc-ref` |
| `is` | `ncIs` | `nc-is` |

Formulas still read `Attributes['key']`; the runtime attribute view aliases the
reserved name to the mapped prop.

## APIs

API descriptors compile to `useNcApi` calls. Literal API origins are collected
into a compile-time allowlist for `/api/nc/proxy`. Dynamic origins are called
directly. Http-only cookie writes use a generated server route.

Streaming APIs are consumed directly in the browser. Server-side streaming
through the proxy is not implemented; those APIs receive a warning.

## Custom elements and scripts

`<script>` nodes are emitted through `NcScript`/Nuxt `useHead`. They execute in
the browser at runtime. Custom elements such as third-party Nordcraft editors
are rendered as-is; their script and runtime remain external.

The compiler does not import or bundle external custom-element scripts.

## Assets

- Absolute URLs are left untouched.
- Root-relative paths (for example `/cdn-cgi/...`) can be proxied with
  `--asset-origin https://origin`.
- There is no media downloader or local rewrite yet.
- `--download-fonts` copies theme font files into `public/fonts`.

## Nuxt config

The generated config intentionally sets:

```ts
vite: {
  build: { cssMinify: false },
  vue: { template: { transformAssetUrls: false } },
}
```

Project CSS can contain declarations that strict minifiers reject, and
Nordcraft projects commonly use absolute CDN assets. These settings keep the
build working without rewriting source content.

## Regeneration

Running the compiler overwrites generated files. Do not hand-edit the generated
app unless you are experimenting; changes will be lost on the next compile.
Put project fixes in the Nordcraft export or in the compiler.
