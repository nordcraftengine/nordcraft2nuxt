#!/usr/bin/env node
import { resolve } from 'node:path'
import { compileProject, writeEmittedFiles } from './compiler.js'
import { loadProjectFile } from './ingest/load.js'

interface CliOptions {
  input: string
  out: string
  format: boolean
  force: boolean
  strict: boolean
  downloadFonts: boolean
  assetOrigin?: string
}

function parseArgs(argv: string[]): CliOptions {
  let input = ''
  let out = 'nordcraft-app'
  let format = true
  let force = false
  let strict = false
  let downloadFonts = false
  let assetOrigin: string | undefined

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    switch (arg) {
      case '--out':
      case '-o':
        out = argv[++i] ?? out
        break
      case '--no-format':
        format = false
        break
      case '--force':
        force = true
        break
      case '--strict':
        strict = true
        break
      case '--download-fonts':
        downloadFonts = true
        break
      case '--asset-origin':
        assetOrigin = argv[++i]
        break
      case '--help':
      case '-h':
        printHelp()
        process.exit(0)
        break
      default:
        if (arg.startsWith('-')) {
          throw new Error(`Unknown option: ${arg}`)
        }
        input = arg
    }
  }

  if (!input) {
    printHelp()
    throw new Error('Missing project JSON path')
  }
  return { input, out, format, force, strict, downloadFonts, assetOrigin }
}

function printHelp(): void {
  console.log(`nordcraft2nuxt — compile Nordcraft project JSON to a Nuxt 4 + Vue 3 TypeScript app

Usage:
  nordcraft2nuxt <project.json> [options]

Options:
  -o, --out <dir>      Output directory (default: nordcraft-app)
      --no-format      Skip Prettier formatting of generated files
      --force          Overwrite a non-empty output directory
      --strict         Treat compiler warnings as errors
      --download-fonts Download theme fonts into public/fonts
      --asset-origin <url> Proxy root-relative asset URLs (for example /cdn-cgi/...)
  -h, --help           Show this help

Input must be the JSON "Download branch" export, not the .nc agent format.
`)
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const project = await loadProjectFile(resolve(options.input))
  const result = await compileProject(project, {
    format: options.format,
    downloadFonts: options.downloadFonts,
    assetOrigin: options.assetOrigin,
  })

  for (const diagnostic of result.diagnostics.diagnostics) {
    const location = [
      diagnostic.component ? `component=${diagnostic.component}` : '',
      diagnostic.node ? `node=${diagnostic.node}` : '',
    ].filter(Boolean).join(' ')
    const prefix =
      diagnostic.severity === 'error' ? 'error' : diagnostic.severity === 'warning' ? 'warn' : 'info'
    console.log(`${prefix} [${diagnostic.code}] ${diagnostic.message}${location ? ` (${location})` : ''}`)
  }

  if (result.diagnostics.hasErrors() || (options.strict && result.diagnostics.warnings.length)) {
    console.error('\nCompilation failed.')
    process.exitCode = 1
    return
  }

  await writeEmittedFiles(resolve(options.out), result.files, { force: options.force })
  console.log(
    `\nCompiled ${result.ir.components.length} component(s) and ${result.ir.pages.length} page(s) to ${resolve(options.out)}.`,
  )
  console.log(`Wrote ${result.files.length} file(s).`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
