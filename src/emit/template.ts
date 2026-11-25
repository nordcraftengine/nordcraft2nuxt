import type { DiagnosticBag } from '../diagnostics.js'
import {
  customPropertyFunctionName,
  styleVariableFunctionName,
  eventHandlerName,
  eventWorkflowFunctionName,
  nodeFunctionName,
} from '../formula/naming.js'
import type {
  ComponentNodeJson,
  ElementNodeJson,
  FormulaJson,
  NodeJson,
  SlotNodeJson,
  TextNodeJson,
} from '../ingest/types.js'
import { resolveComponent } from '../ir/build.js'
import type { ComponentIR, ProjectIR } from '../ir/types.js'
import type { CssModel } from '../css/compile.js'
import { shortHash } from '../util/hash.js'
import { safeIdentifier, vueAttributeName } from '../util/names.js'
import { stateClassName } from '../util/state-class.js'

const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
])

export interface EventBinding {
  nodeId: string
  trigger: string
  handlerName: string
  workflowName: string
}

export interface TemplateResult {
  template: string
  helpers: Set<string>
  usesNcStyle: boolean
  usesNcScript: boolean
  eventBindings: EventBinding[]
  childComponentKeys: Set<string>
  formulaFunctions: Set<string>
  computedText: Array<{ binding: string; formula: string }>
}

export function emitTemplate(options: {
  component: ComponentIR
  ir: ProjectIR
  css: CssModel
  diagnostics: DiagnosticBag
}): TemplateResult {
  return new TemplateEmitter(options).emit()
}

class TemplateEmitter {
  private readonly component: ComponentIR
  private readonly ir: ProjectIR
  private readonly css: CssModel
  private readonly diagnostics: DiagnosticBag
  private readonly helpers = new Set<string>()
  private readonly eventBindings: EventBinding[] = []
  private readonly childComponentKeys = new Set<string>()
  private readonly formulaFunctions = new Set<string>()
  private readonly computedText: Array<{ binding: string; formula: string }> = []
  private usesNcStyle = false
  private usesNcScript = false
  private repeatCounter = 0
  private readonly nodeIds: Set<string>

  constructor(options: {
    component: ComponentIR
    ir: ProjectIR
    css: CssModel
    diagnostics: DiagnosticBag
    }) {
    this.component = options.component
    this.ir = options.ir
    this.css = options.css
    this.diagnostics = options.diagnostics
    this.nodeIds = new Set(Object.keys(this.component.source.nodes ?? {}))
  }

  emit(): TemplateResult {
    const root = this.component.source.nodes?.root
    const template = root
      ? this.renderNode('root', 'ncTemplateData', 0)
      : '  <!-- This component has no root node. -->'
    return {
      template,
      helpers: this.helpers,
      usesNcStyle: this.usesNcStyle,
      usesNcScript: this.usesNcScript,
      eventBindings: this.eventBindings,
      childComponentKeys: this.childComponentKeys,
      formulaFunctions: this.formulaFunctions,
      computedText: this.computedText,
    }
  }

  private renderNode(nodeId: string, scope: string, level: number): string {
    const node = this.component.source.nodes?.[nodeId]
    if (!node) {
      this.diagnostics.warn(
        'missing-node',
        `Node "${nodeId}" was referenced but is missing.`,
        { component: this.component.key, node: nodeId },
      )
      return `${indent(level)}<!-- missing node ${nodeId} -->`
    }
    if (node.repeat) {
      return this.renderRepeat(node, nodeId, scope, level)
    }
    return this.renderNodeBody(node, nodeId, scope, level)
  }

  private renderRepeat(
    node: NodeJson,
    nodeId: string,
    scope: string,
    level: number,
  ): string {
    const entry = `entry${++this.repeatCounter}`
    const repeatFn = nodeFunctionName(nodeId, 'repeat')
    const repeatKeyFn = node.repeatKey
      ? nodeFunctionName(nodeId, 'repeatKey')
      : undefined
    this.helpers.add('ncRepeat')
    let repeatExpr = `ncRepeat(${this.formulaRef(repeatFn)}(${scope})`
    if (repeatKeyFn) {
      this.helpers.add('withListItem')
      repeatExpr += `, (${entry}) => ${this.formulaRef(repeatKeyFn)}(withListItem(${scope}, ${entry}.listItem))`
    }
    repeatExpr += ')'
    this.helpers.add('withListItem')
    const innerScope = `withListItem(${scope}, ${entry}.listItem)`
    const body = this.renderNodeBody(node, nodeId, innerScope, level + 1)
    return [
      `${indent(level)}<template v-for="${entry} in ${repeatExpr}" :key="${entry}.key">`,
      body,
      `${indent(level)}</template>`,
    ].join('\n')
  }

  private renderNodeBody(
    node: NodeJson,
    nodeId: string,
    scope: string,
    level: number,
  ): string {
    const condition = isFormulaJson(node.condition)
      ? this.conditionExpr(node.condition, nodeId, scope)
      : undefined
    switch (node.type) {
      case 'text':
        return this.renderText(node, nodeId, scope, level, condition)
      case 'slot':
        return this.renderSlot(node, nodeId, scope, level, condition)
      case 'element':
        return this.renderElement(node, nodeId, scope, level, condition)
      case 'component':
        return this.renderComponent(node, nodeId, scope, level, condition)
      default:
        return `${indent(level)}<!-- unsupported node -->`
    }
  }

  private renderText(
    node: TextNodeJson,
    nodeId: string,
    scope: string,
    level: number,
    condition: string | undefined,
  ): string {
    let expression: string
    if (scope === 'ncTemplateData') {
      const binding = `text_${safeIdentifier(nodeId, 'node')}_${shortHash(nodeId).slice(0, 5)}`
      this.computedText.push({ binding, formula: nodeFunctionName(nodeId, 'text') })
      expression = binding
    } else {
      expression = `${this.formulaRef(nodeFunctionName(nodeId, 'text'))}(${scope})`
    }
    if (condition) {
      return [
        `${indent(level)}<template v-if="${escapeAttr(condition)}">`,
        `${indent(level + 1)}{{ ${expression} }}`,
        `${indent(level)}</template>`,
      ].join('\n')
    }
    return `${indent(level)}{{ ${expression} }}`
  }

  private renderSlot(
    node: SlotNodeJson,
    nodeId: string,
    scope: string,
    level: number,
    condition: string | undefined,
  ): string {
    let nameAttr = ''
    if (node.name) {
      nameAttr = ` name="${escapeAttr(node.name)}"`
    } else if (node.attr?.name) {
      if (node.attr.name.type === 'value') {
        if (node.attr.name.value != null && node.attr.name.value !== '') {
          nameAttr = ` name="${escapeAttr(String(node.attr.name.value))}"`
        }
      } else {
        nameAttr = ` :name="${this.formulaRef(nodeFunctionName(nodeId, 'slotName'))}(${scope})"`
      }
    }
    const attrs = [
      nameAttr,
      condition ? ` v-if="${escapeAttr(condition)}"` : '',
    ].filter(Boolean).join('')
    const children = node.children ?? []
    if (children.length === 0) {
      return `${indent(level)}<slot${attrs} />`
    }
    const fallback = children
      .map((childId) => this.renderNode(childId, scope, level + 1))
      .join('\n')
    return [
      `${indent(level)}<slot${attrs}>`,
      fallback,
      `${indent(level)}</slot>`,
    ].join('\n')
  }

  private renderElement(
    node: ElementNodeJson,
    nodeId: string,
    scope: string,
    level: number,
    condition: string | undefined,
  ): string {
    const tag = node.tag
    const useNuxtLink = tag === 'a' && node.attrs?.href != null
    if (tag === 'style') {
      return this.renderStyleElement(node, nodeId, scope, level, condition)
    }
    if (tag === 'script') {
      return this.renderScriptElement(node, nodeId, scope, level, condition)
    }
    if (tag === 'template') {
      this.diagnostics.warn(
        'template-node-flattened',
        'A Nordcraft <template> element was flattened into its children.',
        { component: this.component.key, node: nodeId },
      )
      return (node.children ?? [])
        .map((childId) => this.renderNode(childId, scope, level))
        .join('\n')
    }
    if (tag.includes('-')) {
      this.diagnostics.info(
        'custom-element',
        `<${tag}> is rendered as a custom element. Vue compiler customElement handling is configured in nuxt.config.ts.`,
        { component: this.component.key, node: nodeId },
      )
    }

    const attrs = this.renderAttributes(
      node,
      nodeId,
      scope,
      condition,
      undefined,
      useNuxtLink,
    )
    const attrText = attrs.length ? ` ${attrs.join(' ')}` : ''
    // `<textarea>` child whitespace becomes part of its value and causes
    // hydration mismatches; the Nordcraft source always binds `value`.
    const children =
      tag.toLowerCase() === 'textarea' ? [] : (node.children ?? [])
    const renderedTag = useNuxtLink ? 'NuxtLink' : tag
    if (VOID_ELEMENTS.has(tag.toLowerCase())) {
      if (children.length) {
        this.diagnostics.warn(
          'void-element-children',
          `Void element <${tag}> has children; the children were ignored.`,
          { component: this.component.key, node: nodeId },
        )
      }
      return `${indent(level)}<${renderedTag}${attrText} />`
    }
    if (children.length === 0) {
      return `${indent(level)}<${renderedTag}${attrText}></${renderedTag}>`
    }
    const inner = children
      .map((childId) => this.renderNode(childId, scope, level + 1))
      .join('\n')
    return [
      `${indent(level)}<${renderedTag}${attrText}>`,
      inner,
      `${indent(level)}</${renderedTag}>`,
    ].join('\n')
  }

  private renderStyleElement(
    node: ElementNodeJson,
    nodeId: string,
    scope: string,
    level: number,
    condition: string | undefined,
  ): string {
    const textChildren = (node.children ?? [])
      .map((childId) => ({
        id: childId,
        node: this.component.source.nodes?.[childId],
      }))
      .filter(
        (entry): entry is { id: string; node: TextNodeJson } =>
          entry.node?.type === 'text',
      )
    if (textChildren.length === 0) {
      this.diagnostics.warn(
        'empty-style-node',
        'A <style> node without text children was omitted.',
        { component: this.component.key, node: nodeId },
      )
      return `${indent(level)}<!-- empty <style> node -->`
    }
    const exprs = textChildren.map(
      (child) => `${this.formulaRef(nodeFunctionName(child.id, 'text'))}(${scope})`,
    )
    const cssExpr = exprs.length === 1 ? exprs[0]! : `[${exprs.join(', ')}].join('')`
    this.usesNcStyle = true
    const attrs = [
      `:css="${escapeAttr(cssExpr)}"`,
      `name="${escapeAttr(nodeId)}"`,
      condition ? `v-if="${escapeAttr(condition)}"` : '',
    ].filter(Boolean).join(' ')
    return `${indent(level)}<NcStyle ${attrs} />`
  }

  private renderScriptElement(
    node: ElementNodeJson,
    nodeId: string,
    scope: string,
    level: number,
    condition: string | undefined,
  ): string {
    const textChildren = (node.children ?? [])
      .map((childId) => ({
        id: childId,
        node: this.component.source.nodes?.[childId],
      }))
      .filter(
        (entry): entry is { id: string; node: TextNodeJson } =>
          entry.node?.type === 'text',
      )
    const exprs = textChildren.map(
      (child) => `${this.formulaRef(nodeFunctionName(child.id, 'text'))}(${scope})`,
    )
    const codeExpr = exprs.length === 0
      ? "''"
      : exprs.length === 1
        ? exprs[0]!
        : `[${exprs.join(', ')}].join('')`
    const attrEntries: string[] = []
    for (const [attr, formula] of Object.entries(node.attrs ?? {})) {
      if (attr === 'data-node-id' || attr.startsWith('data-nc')) continue
      if (!formula) continue
      if (formula.type === 'value') {
        if (formula.value !== null && formula.value !== undefined) {
          attrEntries.push(`${JSON.stringify(attr)}: ${JSON.stringify(formula.value)}`)
        }
      } else {
        attrEntries.push(
          `${JSON.stringify(attr)}: ${this.formulaRef(nodeFunctionName(nodeId, 'attr', attr))}(${scope})`,
        )
      }
    }
    this.usesNcScript = true
    const attrsExpression = `{ ${attrEntries.join(', ')} }`
    const attrs = [
      `:code="${escapeAttr(codeExpr)}"`,
      attrEntries.length ? `:attrs="${escapeAttr(attrsExpression)}"` : '',
      condition ? `v-if="${escapeAttr(condition)}"` : '',
    ].filter(Boolean).join(' ')
    return `${indent(level)}<NcScript ${attrs} />`
  }

  private renderComponent(
    node: ComponentNodeJson,
    nodeId: string,
    scope: string,
    level: number,
    condition: string | undefined,
  ): string {
    const child = resolveComponent(
      this.ir.componentByKey,
      this.component,
      node,
    )
    if (!child) {
      const key = node.package ? `${node.package}/${node.name}` : node.name
      this.diagnostics.error(
        'missing-component',
        `Component "${key}" is referenced by ${this.component.key} but is not in the project.`,
        { component: this.component.key, node: nodeId },
      )
      return `${indent(level)}<!-- missing component ${key} -->`
    }
    const key = child.key
    this.childComponentKeys.add(key)
    const tag = child.vueName
    const attrs = this.renderAttributes(node, nodeId, scope, condition, child)
    const attrText = attrs.length ? ` ${attrs.join(' ')}` : ''
    const children = node.children ?? []

    if (children.length === 0) {
      return `${indent(level)}<${tag}${attrText} />`
    }

    const groups = new Map<string, string[]>()
    for (const childId of children) {
      const childNode = this.component.source.nodes?.[childId]
      const slotName = childNode?.slot ?? 'default'
      const group = groups.get(slotName) ?? []
      group.push(childId)
      groups.set(slotName, group)
    }

    const inner: string[] = []
    const defaultGroup = groups.get('default') ?? []
    for (const childId of defaultGroup) {
      inner.push(this.renderNode(childId, scope, level + 1))
    }
    for (const [slotName, childIds] of groups) {
      if (slotName === 'default') continue
      inner.push(`${indent(level + 1)}<template #${safeSlotName(slotName)}>`)
      for (const childId of childIds) {
        inner.push(this.renderNode(childId, scope, level + 2))
      }
      inner.push(`${indent(level + 1)}</template>`)
    }

    return [
      `${indent(level)}<${tag}${attrText}>`,
      ...inner,
      `${indent(level)}</${tag}>`,
    ].join('\n')
  }

  private renderAttributes(
    node: ElementNodeJson | ComponentNodeJson,
    nodeId: string,
    scope: string,
    condition: string | undefined,
    child?: ComponentIR,
    mapHrefToTo = false,
  ): string[] {
    const attrs: string[] = []
    if (condition) attrs.push(`v-if="${escapeAttr(condition)}"`)

    const staticClasses: string[] = []
    if (node.type === 'element') staticClasses.push('nc-node')
    const dynamicClasses: string[] = []
    const dynamicClassObject: string[] = []
    const staticStyleParts: string[] = []
    const dynamicStyleParts: string[] = []

    const cssClass = this.css.nodeClasses.get(`${this.component.key}:${nodeId}`)
    if (cssClass) {
      staticClasses.push(nodeId)
      dynamicClasses.push(`$style[${singleQuote(nodeId)}]`)
    }
    const dynamicVariants = this.css.dynamicVariants.get(`${this.component.key}:${nodeId}`)
    if (dynamicVariants) {
      for (const variable of dynamicVariants.vars) {
        dynamicStyleParts.push(
          `{ '${variable.varName}': ${this.formulaRef(variable.formulaName)}(${scope}) }`,
        )
      }
    }

    const classAttr = node.attrs?.class
    if (classAttr) {
      if (classAttr.type === 'value') {
        if (classAttr.value != null && classAttr.value !== '') {
          staticClasses.push(String(classAttr.value))
        }
      } else {
        dynamicClasses.push(`${this.formulaRef(nodeFunctionName(nodeId, 'attr', 'class'))}(${scope})`)
      }
    }
    const styleAttr = node.attrs?.style
    if (styleAttr) {
      if (styleAttr.type === 'value') {
        if (styleAttr.value != null && styleAttr.value !== '') {
          staticStyleParts.push(String(styleAttr.value))
        }
      } else {
        dynamicStyleParts.push(`${this.formulaRef(nodeFunctionName(nodeId, 'attr', 'style'))}(${scope})`)
      }
    }

    for (const [attrName, formula] of Object.entries(node.attrs ?? {})) {
      if (attrName === 'class' || attrName === 'style') continue
      if (attrName === 'data-node-id' || attrName.startsWith('data-nc')) {
        continue
      }
      const renderedName =
        mapHrefToTo && attrName === 'href'
          ? 'to'
          : node.type === 'component'
            ? vueAttributeName(attrName)
            : attrName
      if (!isValidAttributeName(attrName)) {
        this.diagnostics.warn(
          'invalid-attribute-name',
          `Attribute name ${JSON.stringify(attrName)} is not a valid Vue template attribute.`,
          { component: this.component.key, node: nodeId },
        )
        continue
      }
      if (!formula) continue
      if (formula.type === 'value') {
        const value = formula.value
        if (value === null || value === undefined) continue
        if (typeof value === 'string') {
          attrs.push(`${renderedName}="${escapeAttr(value)}"`)
          continue
        }
        if (node.type === 'element' && value === true) {
          attrs.push(renderedName)
          continue
        }
        if (node.type === 'element' && value === false) {
          continue
        }
        attrs.push(`:${renderedName}="${JSON.stringify(value)}"`)
      } else {
        const fn = nodeFunctionName(nodeId, 'attr', attrName)
        attrs.push(`:${renderedName}="${this.formulaRef(fn)}(${scope})"`)
      }
    }

    if (node.type === 'element') {
      for (const [className, value] of Object.entries(node.classes ?? {})) {
        // A state class that shares a name with a node id would otherwise
        // match the node style even when the state is inactive.
        const stateClass = stateClassName(this.nodeIds, className)
        if (!value?.formula) {
          staticClasses.push(stateClass)
          dynamicClasses.push(`$style[${singleQuote(stateClass)}]`)
        } else {
          this.helpers.add('ncTruthy')
          const fn = nodeFunctionName(nodeId, 'class', className)
          const condition = `ncTruthy(${this.formulaRef(fn)}(${scope}))`
          dynamicClassObject.push(`${singleQuote(stateClass)}: ${condition}`)
          dynamicClasses.push(
            `${condition} ? $style[${singleQuote(stateClass)}] : undefined`,
          )
        }
      }
    }

    for (const [propertyName, property] of Object.entries(node.customProperties ?? {})) {
      if (!property) continue
      if (property.formula?.type === 'value') continue
      const fn = customPropertyFunctionName(nodeId, propertyName)
      dynamicStyleParts.push(`{ '${escapeAttr(propertyName)}': ${this.formulaRef(fn)}(${scope}) }`)
    }
    if (node.type === 'element') {
      for (const styleVariable of node['style-variables'] ?? []) {
        if (!styleVariable?.formula) continue
        if (styleVariable.formula.type === 'value') continue
        const fn = styleVariableFunctionName(nodeId, styleVariable.name)
        dynamicStyleParts.push(
          `{ '--${escapeAttr(styleVariable.name)}': ${this.formulaRef(fn)}(${scope}) }`,
        )
      }
    }

    if (staticClasses.length) {
      attrs.push(`class="${escapeAttr(staticClasses.join(' '))}"`)
    }
    if (dynamicClassObject.length) {
      dynamicClasses.push(`{ ${dynamicClassObject.join(', ')} }`)
    }
    if (dynamicClasses.length === 1) {
      attrs.push(`:class="${escapeAttr(dynamicClasses[0]!)}"`)
    } else if (dynamicClasses.length > 1) {
      attrs.push(`:class="[${dynamicClasses.map((value) => value).join(', ')}]"`)
    }

    if (dynamicStyleParts.length) {
      const parts = [
        ...staticStyleParts.map((value) => JSON.stringify(value)),
        ...dynamicStyleParts,
      ]
      const styleExpr = parts.length === 1 ? parts[0]! : `[${parts.join(', ')}]`
      attrs.push(`:style="${escapeAttr(styleExpr)}"`)
    } else if (staticStyleParts.length) {
      attrs.push(`style="${escapeAttr(staticStyleParts.join('; '))}"`)
    }

    if (node.events) {
      const bindings: string[] = []
      for (const [trigger, event] of Object.entries(node.events)) {
        if (!event?.actions.length) continue
        const handlerName = eventHandlerName(nodeId, trigger)
        const workflowName = eventWorkflowFunctionName(nodeId, trigger)
        this.eventBindings.push({
          nodeId,
          trigger,
          handlerName,
          workflowName,
        })
        bindings.push(
          `${singleQuote(trigger)}: ($event: any) => ${handlerName}($event, ${scope})`,
        )
      }
      if (bindings.length) attrs.push(`v-on="{ ${bindings.join(', ')} }"`)
    }

    return attrs
  }

  private formulaRef(name: string): string {
    this.formulaFunctions.add(name)
    return `f_${name}`
  }

  private conditionExpr(formula: FormulaJson, nodeId: string, scope: string): string {
    this.helpers.add('ncTruthy')
    const fn = nodeFunctionName(nodeId, 'condition')
    return `ncTruthy(${this.formulaRef(fn)}(${scope}))`
  }
}

function indent(level: number): string {
  return '  '.repeat(level)
}

function singleQuote(value: string): string {
  return "'" + value.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'"
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function isValidAttributeName(name: string): boolean {
  return /^[a-zA-Z_:@#][a-zA-Z0-9_.:@#-]*$/.test(name)
}

function safeSlotName(name: string): string {
  return /^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(name)
    ? name
    : name.replace(/[^a-zA-Z0-9_-]/g, '-')
}

function isFormulaJson(value: unknown): value is FormulaJson {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string'
  )
}
