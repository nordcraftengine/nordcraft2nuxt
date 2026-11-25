export interface Diagnostic {
  severity: 'error' | 'warning' | 'info'
  code: string
  message: string
  file?: string
  component?: string
  node?: string
}

export class DiagnosticBag {
  readonly diagnostics: Diagnostic[] = []

  error(code: string, message: string, extra: Omit<Diagnostic, 'severity' | 'code' | 'message'> = {}) {
    this.diagnostics.push({ severity: 'error', code, message, ...extra })
  }

  warn(code: string, message: string, extra: Omit<Diagnostic, 'severity' | 'code' | 'message'> = {}) {
    this.diagnostics.push({ severity: 'warning', code, message, ...extra })
  }

  info(code: string, message: string, extra: Omit<Diagnostic, 'severity' | 'code' | 'message'> = {}) {
    this.diagnostics.push({ severity: 'info', code, message, ...extra })
  }

  get errors(): Diagnostic[] {
    return this.diagnostics.filter((d) => d.severity === 'error')
  }

  get warnings(): Diagnostic[] {
    return this.diagnostics.filter((d) => d.severity === 'warning')
  }

  hasErrors(): boolean {
    return this.diagnostics.some((d) => d.severity === 'error')
  }
}
