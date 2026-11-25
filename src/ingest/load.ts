import { readFile } from 'node:fs/promises'
import type { ProjectJson } from './types.js'

export async function loadProjectFile(path: string): Promise<ProjectJson> {
  const text = await readFile(path, 'utf8')
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch (error) {
    throw new Error(`Could not parse ${path} as JSON: ${(error as Error).message}`)
  }
  return parseProject(json)
}

export function parseProject(input: unknown): ProjectJson {
  if (!input || typeof input !== 'object') {
    throw new Error('Project JSON must be an object')
  }
  const value = input as Record<string, unknown>
  if (!value.files || typeof value.files !== 'object') {
    throw new Error(
      'Project JSON is missing the "files" object. Use the "Download branch" JSON export, not the .nc agent format.',
    )
  }
  if (!value.project || typeof value.project !== 'object') {
    throw new Error('Project JSON is missing the "project" object')
  }
  const project = value.project as Record<string, unknown>
  if (typeof project.name !== 'string') {
    throw new Error('Project JSON is missing project.name')
  }
  if (typeof value.files !== 'object' || value.files === null) {
    throw new Error('Project JSON has an invalid "files" object')
  }
  return input as ProjectJson
}
