/** Selects the callable function from a copied Nordcraft custom-code handler. */
export function handlerFunctionName(
  handler: string,
  key: string,
): string | null {
  const names = [
    ...handler.matchAll(/(?:async\s+)?function\s+([A-Za-z0-9_$]+)/g),
  ].map((match) => match[1]!)
  if (names.length === 0) return null
  const normalize = (value: string) =>
    value.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
  const wanted = normalize(key.split('/').pop() ?? key)
  return (
    names.find((name) => normalize(name) === wanted) ??
    names[names.length - 1]!
  )
}
