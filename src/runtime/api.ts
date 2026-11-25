import type { NcFormulaData } from './data.js'

export type NcApiParserMode =
  | 'auto'
  | 'text'
  | 'json'
  | 'event-stream'
  | 'json-stream'
  | 'blob'

export interface NcApiRequest {
  type?: 'http' | 'ws'
  url?: string
  method?: string
  path?: Array<{ name: string; value: unknown; index: number }>
  query?: Array<{ name: string; enabled?: boolean; value: unknown }>
  headers?: Array<{ name: string; enabled?: boolean; value: unknown }>
  body?: unknown
  credentials?: 'include' | 'same-origin' | 'omit'
  parserMode?: NcApiParserMode
}

export interface NcApiDescriptor {
  name: string
  autoFetch: (data: NcFormulaData) => boolean
  ssr: (data: NcFormulaData) => boolean
  defaults: (data: NcFormulaData) => Record<string, unknown>
  build: (data: NcFormulaData, inputs: Record<string, unknown>) => NcApiRequest
  debounce?: (data: NcFormulaData) => number
  proxy?: (data: NcFormulaData) => boolean
}
