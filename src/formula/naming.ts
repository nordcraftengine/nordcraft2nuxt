import { shortHash } from '../util/hash.js'
import { safeIdentifier } from '../util/names.js'

function h(value: string): string {
  return shortHash(value).slice(0, 5)
}

export function formulaFunctionName(name: string): string {
  return `formula_${safeIdentifier(name, 'formula')}_${h(name)}`
}

export function nodeFunctionName(
  nodeId: string,
  kind: string,
  extra?: string,
): string {
  const base = safeIdentifier(nodeId, 'node')
  const suffix = extra
    ? `_${safeIdentifier(extra, 'value')}_${h(extra)}`
    : ''
  return `node_${base}_${h(nodeId)}_${safeIdentifier(kind, 'value')}${suffix}`
}

export function workflowFunctionName(key: string): string {
  return `wf_${safeIdentifier(key, 'workflow')}_${h(key)}`
}

export function eventWorkflowFunctionName(
  nodeId: string,
  trigger: string,
): string {
  return `event_${safeIdentifier(nodeId, 'node')}_${h(nodeId)}_${safeIdentifier(trigger, 'event')}_${h(trigger)}`
}

export function initialFormulaName(variableName: string): string {
  return `initial_${safeIdentifier(variableName, 'variable')}_${h(variableName)}`
}

export function pageFormulaName(kind: string): string {
  return `page_${safeIdentifier(kind, 'value')}`
}

export function customPropertyFunctionName(
  nodeId: string,
  propertyName: string,
): string {
  return nodeFunctionName(nodeId, 'style', propertyName.replace(/^--/, ''))
}

export function styleVariableFunctionName(
  nodeId: string,
  propertyName: string,
): string {
  return nodeFunctionName(nodeId, 'styleVariable', propertyName)
}

export function eventHandlerName(nodeId: string, trigger: string): string {
  return `handle_${safeIdentifier(nodeId, 'node')}_${h(nodeId)}_${safeIdentifier(trigger, 'event')}_${h(trigger)}`
}

export function projectFormulaFunctionName(name: string): string {
  return `projectFormula_${safeIdentifier(name, 'formula')}_${h(name)}`
}

export function apiDescriptorName(name: string): string {
  return `api_${safeIdentifier(name, 'api')}_${h(name)}`
}

export function packageFormulaFunctionName(packageName: string, name: string): string {
  return `packageFormula_${safeIdentifier(packageName, 'package')}_${h(packageName)}_${safeIdentifier(name, 'formula')}_${h(name)}`
}

export function pageResponseHeaderName(name: string): string {
  return `page_responseHeader_${safeIdentifier(name, 'header')}_${h(name)}`
}

export function variantCustomPropertyFunctionName(
  nodeId: string,
  variantIndex: number,
  propertyName: string,
): string {
  return nodeFunctionName(
    nodeId,
    'variantStyle',
    `${variantIndex}_${propertyName.replace(/^--/, '')}`,
  )
}
