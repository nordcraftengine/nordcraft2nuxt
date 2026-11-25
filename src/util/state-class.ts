/**
 * Nordcraft allows a conditional class to have the same name as a node id.
 * The node id is always present on the element, so the state class needs a
 * distinct name to avoid matching the node style unconditionally.
 */
export function stateClassName(nodeIds: Set<string>, name: string): string {
  return nodeIds.has(name) ? `nc-state-${name}` : name
}
