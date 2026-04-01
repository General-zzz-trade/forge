import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { generateSettingsJSONSchema } from '../src/utils/settings/schemaOutput.js'

const root = process.cwd()
const outDir = path.join(root, 'generated')
const outFile = path.join(outDir, 'settings.schema.json')

await mkdir(outDir, { recursive: true })
await writeFile(outFile, `${generateSettingsJSONSchema()}\n`)

console.log(`wrote ${path.relative(root, outFile)}`)
