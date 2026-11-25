import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { DiagnosticBag } from './diagnostics.js'
import { emitNuxtProject, type EmittedFile, type EmitOptions } from './emit/nuxt.js'
import { buildProjectIR } from './ir/build.js'
import type { ProjectIR } from './ir/types.js'
import type { ProjectJson } from './ingest/types.js'

export interface CompileResult {
  ir: ProjectIR
  diagnostics: DiagnosticBag
  files: EmittedFile[]
}

export async function compileProject(
  project: ProjectJson,
  options: EmitOptions = {},
): Promise<CompileResult> {
  const diagnostics = new DiagnosticBag()
  const ir = buildProjectIR(project, { diagnostics })
  const files = await emitNuxtProject(ir, diagnostics, options)
  return { ir, diagnostics, files }
}

export async function writeEmittedFiles(
  outDir: string,
  files: EmittedFile[],
  options: { force?: boolean } = {},
): Promise<void> {
  await mkdir(outDir, { recursive: true })
  if (!options.force) {
    const entries = await readdir(outDir)
    if (entries.length > 0) {
      throw new Error(
        `Output directory ${outDir} is not empty. Pass --force to overwrite generated files.`,
      )
    }
  }
  for (const file of files) {
    const target = join(outDir, file.path)
    await mkdir(dirname(target), { recursive: true })
    if (typeof file.content === 'string') {
      await writeFile(target, file.content, 'utf8')
    } else {
      await writeFile(target, file.content)
    }
  }
}
