import type { DiagnosticBag } from '../diagnostics.js'
import type {
  ComponentJson,
  CustomPropertyJson,
  ElementNodeJson,
  ComponentNodeJson,
  MediaQueryJson,
  StyleVariantJson,
  ThemeJson,
} from '../ingest/types.js'
import type { ProjectIR } from '../ir/types.js'
import { safeIdentifier } from '../util/names.js'
import { variantCustomPropertyFunctionName } from '../formula/naming.js'
import { stateClassName } from '../util/state-class.js'

const SIZE_PROPERTIES = new Set([
  'width',
  'min-width',
  'max-width',
  'height',
  'min-height',
  'max-height',
  'margin',
  'margin-top',
  'margin-left',
  'margin-bottom',
  'margin-right',
  'padding',
  'padding-top',
  'padding-left',
  'padding-bottom',
  'padding-right',
  'gap',
  'gap-x',
  'gap-y',
  'border-radius',
  'border-bottom-left-radius',
  'border-bottom-right-radius',
  'border-top-left-radius',
  'border-top-right-radius',
  'border-width',
  'border-top-width',
  'border-left-width',
  'border-bottom-width',
  'border-right-width',
  'font-size',
  'top',
  'right',
  'bottom',
  'left',
  'outline-width',
])

const BREAKPOINTS = { small: 576, medium: 960, large: 1440 } as const

export interface CssDynamicVariant {
  vars: Array<{
    selector: string
    property: string
    varName: string
    formulaName: string
    startingStyle?: boolean
    mediaQuery?: MediaQueryJson | null
    breakpoint?: 'small' | 'medium' | 'large' | null
  }>
}

export interface CssModel {
  /** Theme, fonts, reset, and other truly global CSS. */
  globalCss: string
  /** `componentKey` -> scoped CSS for that component. */
  componentCss: Map<string, string>
  /** `${componentKey}:${nodeId}` -> class name (the Nordcraft node id). */
  nodeClasses: Map<string, string>
  /** `${componentKey}:${nodeId}` -> dynamic variant custom properties. */
  dynamicVariants: Map<string, CssDynamicVariant>
}

type StyledNode = ElementNodeJson | ComponentNodeJson

export interface CssCompileOptions {
  fontUrlMap?: Map<string, string>
}

export function compileStylesheet(
  ir: ProjectIR,
  diagnostics: DiagnosticBag,
  options: CssCompileOptions = {},
): CssModel {
  const globalCss = buildThemeCss(
    ir.themes.map((theme) => theme.source),
    options.fontUrlMap,
  )
  const componentCss = new Map<string, string>()
  const nodeClasses = new Map<string, string>()
  const dynamicVariants = new Map<string, CssDynamicVariant>()

  for (const component of ir.components) {
    const chunks: string[] = []
    const nodeIds = new Set(Object.keys(component.source.nodes ?? {}))
    const emittedAnimations = new Set<string>()
    for (const [nodeId, node] of Object.entries(component.source.nodes ?? {})) {
      if (!node) continue
      if (node.type !== 'element' && node.type !== 'component') continue
      const model = styleModel(node)
      const dynamic = buildDynamicVariants(nodeId, node, nodeIds)
      const hasStatic = Boolean(model.base) || model.variants.length > 0
      if (!hasStatic && !dynamic) continue
      if (/[\s"']/.test(nodeId)) {
        diagnostics.warn(
          'invalid-node-class',
          `Node id ${JSON.stringify(nodeId)} contains whitespace or quotes and cannot be used as a CSS class.`,
          { component: component.key, node: nodeId },
        )
        continue
      }
      nodeClasses.set(`${component.key}:${nodeId}`, nodeId)
      const selector = escapeIdentifier(nodeId)
      if (hasStatic) {
        chunks.push(
          renderNodeCss(selector, model, node, emittedAnimations, nodeIds),
        )
      }
      if (dynamic) {
        dynamicVariants.set(`${component.key}:${nodeId}`, dynamic)
        for (const variable of dynamic.vars) {
          chunks.push(renderDynamicVariantRule(selector, variable, nodeIds))
        }
      }
    }
    if (chunks.length) {
      componentCss.set(
        component.key,
        chunks.filter(Boolean).join('\n\n').trim() + '\n',
      )
    }
  }

  return {
    globalCss,
    componentCss,
    nodeClasses,
    dynamicVariants,
  }
}

function escapeIdentifier(value: string): string {
  let result = ''
  for (let index = 0; index < value.length; index++) {
    const char = value[index]!
    const code = char.codePointAt(0)!
    if (code === 0) {
      result += '\uFFFD'
    } else if (
      (code >= 1 && code <= 0x1f) ||
      code === 0x7f ||
      (index === 0 && code >= 0x30 && code <= 0x39) ||
      (index === 1 && code >= 0x30 && code <= 0x39 && value.startsWith('-'))
    ) {
      result += `\\${code.toString(16)} `
    } else if (
      code >= 0x80 ||
      char === '-' ||
      char === '_' ||
      /[a-zA-Z0-9]/.test(char)
    ) {
      result += char
    } else {
      result += `\\${char}`
    }
  }
  return result || '\\0 '
}

function buildDynamicVariants(
  nodeId: string,
  node: ElementNodeJson | ComponentNodeJson,
  nodeIds: Set<string>,
): CssDynamicVariant | null {
  const vars: CssDynamicVariant['vars'] = []
  for (let index = 0; index < (node.variants ?? []).length; index++) {
    const variant = node.variants![index]!
    for (const [property, customProperty] of Object.entries(
      variant.customProperties ?? {},
    )) {
      if (!customProperty || customProperty.formula?.type === 'value') continue
      vars.push({
        selector: variantSelector(variant, nodeIds),
        property,
        varName: `--nc-${safeIdentifier(property.replace(/^--/, ''), 'value')}-${index}`,
        formulaName: variantCustomPropertyFunctionName(nodeId, index, property),
        startingStyle: variant.startingStyle === true,
        mediaQuery: variant.mediaQuery,
        breakpoint: variant.breakpoint,
      })
    }
  }
  if (vars.length === 0) return null
  return { vars }
}

function renderDynamicVariantRule(
  selectorClass: string,
  variable: CssDynamicVariant['vars'][number],
  nodeIds: Set<string>,
): string {
  const selector = `.${selectorClass}${variable.selector}`
  let rule = `${selector} {\n  ${variable.property}: var(${variable.varName});\n}`
  if (variable.startingStyle) rule = `@starting-style {\n${indentBlock(rule)}\n}`
  if (variable.mediaQuery && Object.keys(variable.mediaQuery).length) {
    const query = Object.entries(variable.mediaQuery)
      .filter(([, value]) => value !== null && value !== undefined)
      .map(([key, value]) => `${key}: ${value}`)
      .join(') and (')
    rule = `@media (${query}) {\n${indentBlock(rule)}\n}`
  } else if (variable.breakpoint) {
    rule = `@media (min-width: ${BREAKPOINTS[variable.breakpoint]}px) {\n${indentBlock(rule)}\n}`
  }
  return rule
}

interface StyleModel {
  base: Record<string, string | number> | undefined
  variants: StyleVariantJson[]
}

function styleModel(node: StyledNode): StyleModel {
  const variants = [...(node.variants ?? [])]
  const base = mergeStaticStyle(
    node.style,
    node.customProperties,
    node.type === 'element' ? legacyStyleVariables(node) : undefined,
  )
  const mapped = variants.map((variant) => ({
    ...variant,
    style: mergeStaticStyle(
      variant.style,
      variant.customProperties,
      undefined,
    ),
  }))
  return { base, variants: mapped }
}

interface LegacyStyleVariable {
  name?: string
  formula: CustomPropertyJson['formula']
  unit?: string | null
}

function legacyStyleVariables(node: ElementNodeJson): LegacyStyleVariable[] | undefined {
  const vars = node['style-variables'] ?? []
  if (!vars.length) return undefined
  return vars.map((v) => ({ name: v.name, formula: v.formula, unit: v.unit ?? undefined }))
}

function mergeStaticStyle(
  style: Record<string, string | number | null | undefined> | null | undefined,
  customProperties: Record<string, CustomPropertyJson> | null | undefined,
  legacy: LegacyStyleVariable[] | undefined,
): Record<string, string | number> | undefined {
  const result: Record<string, string | number> = {}
  for (const property of legacy ?? []) {
    if (property?.formula?.type === 'value') {
      result[getLegacyPropertyName(property)] = withUnit(property.formula.value, property.unit)
    }
  }
  for (const [name, property] of Object.entries(customProperties ?? {})) {
    if (property?.formula?.type === 'value') {
      result[name] = withUnit(property.formula.value, property.unit)
    }
  }
  for (const [key, value] of Object.entries(style ?? {})) {
    if (value !== null && value !== undefined) result[key] = value
  }
  return Object.keys(result).length ? result : undefined
}

function getLegacyPropertyName(property: LegacyStyleVariable): string {
  const name = property.name
  return name ? (name.startsWith('--') ? name : `--${name}`) : '--value'
}

function withUnit(value: unknown, unit: string | null | undefined): string | number {
  if (typeof value === 'number' && unit) return `${value}${unit}`
  return typeof value === 'number' || typeof value === 'string' ? value : String(value)
}

function renderNodeCss(
  selectorClass: string,
  model: StyleModel,
  node: StyledNode,
  emittedAnimations: Set<string>,
  nodeIds: Set<string>,
): string {
  const chunks: string[] = []
  // Component-instance styles must beat the child component's own root styles.
  // The instance class is forwarded to the child root, so repeating it raises
  // specificity without changing which element matches.
  const baseSelector =
    node.type === 'component'
      ? `.${selectorClass}.${selectorClass}`
      : `.${selectorClass}`
  if (model.base && Object.keys(model.base).length) {
    chunks.push(`${baseSelector} {\n${declarations(model.base, 1)}\n}`)
  }
  for (const variant of model.variants) {
    if (!variant.style || Object.keys(variant.style).length === 0) continue
    const selector = `${baseSelector}${variantSelector(variant, nodeIds)}`
    let rule = `${selector} {\n${declarations(variant.style as Record<string, string | number>, 1)}\n}`
    if (variant.startingStyle) {
      rule = `@starting-style {\n${indentBlock(rule)}\n}`
    }
    if (variant.mediaQuery && Object.keys(variant.mediaQuery).length) {
      const query = Object.entries(variant.mediaQuery)
        .filter(([, value]) => value !== null && value !== undefined)
        .map(([key, value]) => `${key}: ${value}`)
        .join(') and (')
      rule = `@media (${query}) {\n${indentBlock(rule)}\n}`
    } else if (variant.breakpoint) {
      rule = `@media (min-width: ${BREAKPOINTS[variant.breakpoint]}px) {\n${indentBlock(rule)}\n}`
    }
    chunks.push(rule)
  }
  for (const [name, keyframes] of Object.entries(node.animations ?? {})) {
    if (emittedAnimations.has(name)) continue
    emittedAnimations.add(name)
    chunks.push(renderKeyframes(name, keyframes))
  }
  return chunks.join('\n\n')
}

function renderKeyframes(
  name: string,
  keyframes: Record<string, { position: number; key: string; value: string }>,
): string {
  const frames = Object.values(keyframes)
    .sort((a, b) => a.position - b.position)
    .map(
      (frame) =>
        `  ${frame.position * 100}% {\n    ${kebabCase(frame.key)}: ${frame.value};\n  }`,
    )
    .join('\n')
  return `@keyframes ${name} {\n${frames}\n}`
}

function declarations(style: Record<string, string | number>, level: number): string {
  const pad = '  '.repeat(level)
  return Object.entries(style)
    .filter(
      ([property, value]) =>
        property.trim() !== '' &&
        value !== null &&
        value !== undefined &&
        String(value).trim() !== '',
    )
    .map(([property, value]) => {
      const name = property.startsWith('--') ? property : kebabCase(property)
      const finalValue =
        typeof value === 'number' && SIZE_PROPERTIES.has(name) ? `${value * 4}px` : String(value)
      return `${pad}${name}: ${finalValue};`
    })
    .join('\n')
}

function indentBlock(value: string): string {
  return value
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n')
}

function variantSelector(
  variant: StyleVariantJson,
  nodeIds: Set<string>,
): string {
  const className = variant.className ?? variant.class
  return [
    className && `:global(.${escapeIdentifier(stateClassName(nodeIds, className))})`,
    (variant.evenChild ?? variant.nthChildEven ?? variant['nth-child(even)']) &&
      ':nth-child(even)',
    variant.firstChild && ':first-child',
    variant.lastChild && ':last-child',
    variant.focusWithin && ':focus-within',
    variant['focus-within'] && ':focus-within',
    (variant.focusVisible ?? variant['focus-visible']) && ':focus-visible',
    (variant.firstOfType ?? variant['first-of-type']) && ':first-of-type',
    (variant.lastOfType ?? variant['last-of-type']) && ':last-of-type',
    (variant.popoverOpen ?? variant['popover-open']) && ':popover-open',
    variant.active && ':active',
    variant.autofill && ':is(:-webkit-autofill, :autofill)',
    variant.checked && ':checked',
    variant.disabled && ':disabled',
    variant.empty && ':empty',
    variant.focus && ':focus',
    variant.hover && ':hover',
    variant.invalid && ':invalid',
    variant.link && ':link',
    variant.visited && ':visited',
    variant.pseudoElement && `::${variant.pseudoElement}`,
  ]
    .filter(Boolean)
    .join('')
}

function kebabCase(value: string): string {
  if (value.startsWith('--')) return value
  return value.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)
}

// ---------------------------------------------------------------------------
// Themes
// ---------------------------------------------------------------------------

export function buildThemeCss(
  themes: ThemeJson[],
  fontUrlMap?: Map<string, string>,
): string {
  if (themes.length === 0) return ''
  const chunks: string[] = []
  for (const theme of themes) {
    chunks.push(renderFontFaces(theme, fontUrlMap))
    chunks.push(renderPropertyDefinitions(theme))
    chunks.push(renderThemeValues(theme))
    chunks.push(renderLegacyTokens(theme))
  }
  chunks.push(`@layer reset {
  html, body, #__nuxt { height: 100%; }
  body {
    margin: 0;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
  #__nuxt { display: flex; flex-direction: column; }
  :where(.nc-node) {
    display: flex;
    flex-direction: column;
    flex-grow: 0;
    flex-shrink: 0;
    position: relative;
    box-sizing: border-box;
    padding: 0;
    margin: 0;
    font-size: var(--text-base, 1rem);
    font-family: var(--font-sans);
    font-weight: var(--font-weight-normal);
    background: transparent;
    color: inherit;
    border: none;
    box-shadow: none;
  }
  :where(.nc-node:is(p, h1, h2, h3, h4, h5, h6, label, span, strong, b, i, address, caption, code, cite, dt, dd, em, figcaption, legend, blockquote, abbr, pre, bdo, bdi)) {
    display: inline-block;
    overflow-wrap: break-word;
    color: inherit;
  }
  :where(.nc-node:is(input, button, textarea, select)) { outline: none; }
  :where(.nc-node:is(a)) { color: inherit; text-decoration: none; }
  :where(.nc-node:is(ul, ol, li)) { list-style: none; }
}
*, *::before, *::after { box-sizing: border-box; }
a { color: inherit; text-decoration: none; }
img, svg, video, canvas { display: block; max-width: 100%; }`)
  return chunks.filter(Boolean).join('\n\n')
}

function renderFontFaces(theme: ThemeJson, fontUrlMap?: Map<string, string>): string {
  const chunks: string[] = []
  for (const font of theme.fonts ?? []) {
    for (const variant of font.variants ?? []) {
      chunks.push(`@font-face {
  font-family: ${JSON.stringify(font.family)};
  font-style: ${variant.italic ? 'italic' : 'normal'};
  font-weight: ${variant.weight ?? '400'};
  font-display: swap;
  src: url(${JSON.stringify(fontUrlMap?.get(variant.url) ?? variant.url)}) format("woff2");
}`)
    }
    const cssName = font.name.replace(/[^a-zA-Z0-9_-]+/g, '-')
    const fallback = ['serif', 'sans-serif', 'monospace', 'cursive'].includes(
      font.type ?? '',
    )
      ? font.type
      : 'sans-serif'
    chunks.push(`:root { --font-${cssName}: ${JSON.stringify(font.family)}, ${fallback}; }`)
  }
  return chunks.join('\n')
}

function renderPropertyDefinitions(theme: ThemeJson): string {
  const chunks: string[] = []
  for (const [name, definition] of Object.entries(theme.propertyDefinitions ?? {})) {
    if (!definition?.syntax) continue
    const syntax = syntaxName(definition.syntax)
    if (!syntax) continue
    const declaredInitial =
      definition?.initialValue == null ? null : String(definition.initialValue).trim()
    const initial =
      declaredInitial && declaredInitial !== ''
        ? declaredInitial
        : fallbackForSyntax(definition?.syntax)
    if (initial == null) continue
    chunks.push(`@property ${name} {
  syntax: "${syntax}";
  inherits: ${definition?.inherits ? 'true' : 'false'};
  initial-value: ${initial};
}`)
  }
  return chunks.join('\n')
}

function syntaxName(syntax: unknown): string | null {
  if (!syntax || typeof syntax !== 'object') return null
  const s = syntax as { type?: string; name?: string; keywords?: string[] }
  if (s.type === 'primitive' && s.name) return s.name === '*' ? '*' : `<${s.name}>`
  if (s.type === 'custom' && s.name === 'font-family') return '<custom-ident> | <string>'
  if (s.type === 'keyword' && s.keywords?.length) return s.keywords.join(' | ')
  return null
}

function fallbackForSyntax(syntax: unknown): string | null {
  const name = (syntax as { name?: string })?.name
  switch (name) {
    case 'color':
      return 'transparent'
    case 'length':
    case 'length-percentage':
      return '0px'
    case 'percentage':
      return '0%'
    case 'number':
    case 'integer':
      return '0'
    case 'angle':
      return '0deg'
    case 'time':
      return '0s'
    case 'image':
    case 'url':
      return 'none'
    case 'font-family':
      return 'sans-serif'
    default:
      return null
  }
}

function renderThemeValues(theme: ThemeJson): string {
  const chunks: string[] = []
  const themes = theme.themes ?? {}
  const defaultTheme = theme.default ?? Object.keys(themes)[0]
  const defaultValues = collectThemeValues(theme, defaultTheme)
  if (Object.keys(defaultValues).length) {
    chunks.push(`:root {\n${renderCustomProperties(defaultValues)}\n}`)
  }
  if (theme.defaultDark) {
    const dark = collectThemeValues(theme, theme.defaultDark)
    if (Object.keys(dark).length) {
      chunks.push(`@media (prefers-color-scheme: dark) {\n  :root {\n${indentBlock(renderCustomProperties(dark))}\n  }\n}`)
    }
  }
  if (theme.defaultLight) {
    const light = collectThemeValues(theme, theme.defaultLight)
    if (Object.keys(light).length) {
      chunks.push(`@media (prefers-color-scheme: light) {\n  :root {\n${indentBlock(renderCustomProperties(light))}\n  }\n}`)
    }
  }
  for (const name of Object.keys(themes)) {
    if (name === defaultTheme) continue
    const values = collectThemeValues(theme, name)
    if (Object.keys(values).length) {
      chunks.push(`[data-theme~=${JSON.stringify(name)}] {\n${renderCustomProperties(values)}\n}`)
    }
  }
  return chunks.join('\n\n')
}

function collectThemeValues(theme: ThemeJson, themeName: string | undefined): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [property, definition] of Object.entries(theme.propertyDefinitions ?? {})) {
    const value =
      (themeName ? definition?.values?.[themeName] : undefined) ??
      definition?.initialValue ??
      (definition ? fallbackForSyntax(definition.syntax) : null)
    if (value != null && value !== '') result[property] = value
  }
  return result
}

function renderCustomProperties(values: Record<string, string>): string {
  return Object.entries(values)
    .map(([name, value]) => `  ${name}: ${value};`)
    .join('\n')
}

function renderLegacyTokens(theme: ThemeJson): string {
  const chunks: string[] = []
  const groups: Array<[string, Array<{ name: string; type?: string; value: string }>]> = []
  for (const key of ['color', 'font-size', 'font-weight', 'spacing', 'border-radius', 'shadow', 'z-index'] as const) {
    const group = theme[key]
    if (Array.isArray(group)) {
      for (const g of group) groups.push([key, g.tokens ?? []])
    }
  }
  const values: Record<string, string> = {}
  for (const [, tokens] of groups) {
    for (const token of tokens) {
      values[`--${token.name}`] = token.type === 'variable' ? `var(--${token.value})` : token.value
    }
  }
  if (Object.keys(values).length) {
    chunks.push(`:root {\n${renderCustomProperties(values)}\n}`)
  }
  return chunks.join('\n\n')
}
