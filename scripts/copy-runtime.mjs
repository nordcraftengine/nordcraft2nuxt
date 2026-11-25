import { cp, mkdir, readdir } from 'node:fs/promises'

await mkdir('dist/runtime', { recursive: true })
for (const file of await readdir('src/runtime')) {
  if (file.endsWith('.ts') && !file.endsWith('.d.ts')) {
    await cp(`src/runtime/${file}`, `dist/runtime/${file}`)
  }
}
