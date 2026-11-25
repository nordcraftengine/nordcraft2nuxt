export type FormulaTypeHint =
  | 'unknown'
  | 'any'
  | 'null'
  | 'string'
  | 'number'
  | 'boolean'
  | 'array'
  | 'object'
  | 'date'

export interface FormulaMeta {
  /** Name of the helper emitted by the compiler. */
  helper: string
  /** Canonical argument order, when the export is known to be unreliable. */
  params?: string[]
  variadic?: boolean
  returnType?: FormulaTypeHint
}

const NAMES = [
  'Id',
  'absolute',
  'add',
  'append',
  'boolean',
  'branchName',
  'canShare',
  'capitalize',
  'clamp',
  'concatenate',
  'currentURL',
  'dateFromString',
  'dateFromTimestamp',
  'decodeBase64',
  'decodeURIComponent',
  'defaultTo',
  'deleteKey',
  'divide',
  'drop',
  'dropLast',
  'encodeBase64',
  'encodeJSON',
  'encodeURIComponent',
  'entries',
  'equals',
  'every',
  'filter',
  'find',
  'findIndex',
  'findLast',
  'first',
  'flatten',
  'formatDate',
  'formatNumber',
  'fromEntries',
  'get',
  'getCookie',
  'getElementById',
  'getFromLocalStorage',
  'getFromSessionStorage',
  'getHttpOnlyCookie',
  'greaterOrEqueal',
  'greaterThan',
  'groupBy',
  'includes',
  'indexOf',
  'isServer',
  'join',
  'json',
  'keyBy',
  'languages',
  'last',
  'lastIndexOf',
  'lessOrEqual',
  'lessThan',
  'logarithm',
  'lowercase',
  'map',
  'matches',
  'max',
  'min',
  'minus',
  'modulo',
  'multiply',
  'not',
  'notEqual',
  'now',
  'number',
  'parseJSON',
  'parseURL',
  'power',
  'prepend',
  'randomNumber',
  'range',
  'reduce',
  'replaceAll',
  'reverse',
  'round',
  'roundDown',
  'roundUp',
  'set',
  'shuffle',
  'size',
  'some',
  'sort_by',
  'split',
  'squareRoot',
  'startsWith',
  'string',
  'sum',
  'take',
  'takeLast',
  'timestamp',
  'trim',
  'typeOf',
  'unique',
  'uppercase',
  'userAgent',
] as const

function defaultHelper(name: string): string {
  const parts = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
  return `nc${parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('')}`
}

const SPECIAL: Record<string, Partial<FormulaMeta>> = {
  Id: { returnType: 'string' },
  absolute: { returnType: 'number' },
  add: { variadic: true, returnType: 'number' },
  append: { params: ['Array', 'Item'], returnType: 'array' },
  boolean: { params: ['Input'], returnType: 'boolean' },
  branchName: { returnType: 'string' },
  canShare: { returnType: 'boolean' },
  capitalize: { returnType: 'string' },
  clamp: { returnType: 'number' },
  concatenate: { variadic: true, returnType: 'string' },
  currentURL: { returnType: 'string' },
  dateFromString: { returnType: 'date' },
  dateFromTimestamp: { returnType: 'date' },
  decodeBase64: { returnType: 'string' },
  decodeURIComponent: { returnType: 'string' },
  defaultTo: { variadic: true, returnType: 'any' },
  deleteKey: { params: ['Object', 'Path'], returnType: 'object' },
  divide: { returnType: 'number' },
  drop: { params: ['Array', 'Count'], returnType: 'array' },
  dropLast: { params: ['Array', 'Count'], returnType: 'array' },
  encodeBase64: { returnType: 'string' },
  encodeJSON: { returnType: 'string' },
  encodeURIComponent: { returnType: 'string' },
  entries: { returnType: 'array' },
  equals: { returnType: 'boolean' },
  every: { returnType: 'boolean' },
  filter: { returnType: 'array' },
  find: { params: ['Array', 'Formula'], returnType: 'any' },
  findIndex: { returnType: 'number' },
  findLast: { returnType: 'any' },
  first: { returnType: 'any' },
  flatten: { params: ['Array'], returnType: 'array' },
  formatDate: { returnType: 'string' },
  formatNumber: { returnType: 'string' },
  fromEntries: { returnType: 'object' },
  get: { params: ['Object', 'Path'], returnType: 'any' },
  getCookie: { params: ['Cookie name'], returnType: 'string' },
  getElementById: { params: ['ID'], returnType: 'any' },
  getFromLocalStorage: { params: ['Key'], returnType: 'any' },
  getFromSessionStorage: { params: ['Key'], returnType: 'any' },
  getHttpOnlyCookie: { params: ['Cookie name'], returnType: 'string' },
  greaterOrEqueal: { helper: 'ncGreaterOrEqual', returnType: 'boolean' },
  greaterThan: { returnType: 'boolean' },
  groupBy: { returnType: 'object' },
  includes: { returnType: 'boolean' },
  indexOf: { returnType: 'number' },
  isServer: { returnType: 'boolean' },
  join: { returnType: 'string' },
  json: { returnType: 'any' },
  keyBy: { returnType: 'object' },
  languages: { returnType: 'array' },
  last: { returnType: 'any' },
  lastIndexOf: { returnType: 'number' },
  lessOrEqual: { returnType: 'boolean' },
  lessThan: { returnType: 'boolean' },
  logarithm: { returnType: 'number' },
  lowercase: { returnType: 'string' },
  map: { returnType: 'array' },
  matches: { returnType: 'array' },
  max: { variadic: true, returnType: 'number' },
  min: { variadic: true, returnType: 'number' },
  minus: { returnType: 'number' },
  modulo: { returnType: 'number' },
  multiply: { returnType: 'number' },
  not: { returnType: 'boolean' },
  notEqual: { returnType: 'boolean' },
  now: { returnType: 'date' },
  number: { returnType: 'number' },
  parseJSON: { returnType: 'any' },
  parseURL: { returnType: 'object' },
  power: { returnType: 'number' },
  prepend: { params: ['Array', 'Item'], returnType: 'array' },
  randomNumber: { returnType: 'number' },
  range: { params: ['Min', 'Max'], returnType: 'array' },
  reduce: { returnType: 'any' },
  replaceAll: { returnType: 'string' },
  reverse: { returnType: 'array' },
  round: { params: ['Input', 'Decimals'], returnType: 'number' },
  roundDown: { params: ['Input', 'Decimals'], returnType: 'number' },
  roundUp: { params: ['Input', 'Decimals'], returnType: 'number' },
  set: { params: ['Object', 'Path', 'Value'], returnType: 'object' },
  shuffle: { returnType: 'array' },
  size: { returnType: 'number' },
  some: { returnType: 'boolean' },
  sort_by: { helper: 'ncSortBy', returnType: 'array' },
  split: { returnType: 'array' },
  squareRoot: { returnType: 'number' },
  startsWith: { returnType: 'boolean' },
  string: { returnType: 'string' },
  sum: { variadic: true, returnType: 'number' },
  take: { params: ['Array', 'Count'], returnType: 'array' },
  takeLast: { params: ['Array', 'Count'], returnType: 'array' },
  timestamp: { returnType: 'number' },
  trim: { returnType: 'string' },
  typeOf: { returnType: 'string' },
  unique: { returnType: 'array' },
  uppercase: { returnType: 'string' },
  userAgent: { returnType: 'string' },
}

export const FORMULA_META: Record<string, FormulaMeta> = Object.fromEntries(
  NAMES.map((name) => {
    const special = SPECIAL[name] ?? {}
    return [name, { helper: defaultHelper(name), ...special }]
  }),
)

export const BUILTIN_FORMULA_NAMES = new Set(
  Object.keys(FORMULA_META).map((name) => `@toddle/${name}`),
)

export function formulaMeta(name: string): FormulaMeta | undefined {
  if (!name.startsWith('@toddle/')) return undefined
  return FORMULA_META[name.slice('@toddle/'.length)]
}

export function formulaHelper(name: string): string | undefined {
  return formulaMeta(name)?.helper
}
