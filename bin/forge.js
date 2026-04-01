#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

function readPackageVersion() {
  try {
    return JSON.parse(
      readFileSync(path.join(rootDir, 'package.json'), 'utf8'),
    ).version
  } catch {
    return '0.0.0'
  }
}

function resolveBunBinary() {
  const localCandidates = [
    path.join(
      rootDir,
      'node_modules',
      '.bin',
      process.platform === 'win32' ? 'bun.cmd' : 'bun',
    ),
    path.join(
      rootDir,
      'node_modules',
      '.bin',
      process.platform === 'win32' ? 'bun.exe' : 'bun',
    ),
  ]
  for (const candidate of localCandidates) {
    if (candidate && existsSync(candidate)) {
      return candidate
    }
  }

  const explicit = process.env.BUN_BIN?.trim()
  if (explicit && existsSync(explicit)) {
    return explicit
  }

  const candidates = ['bun', path.join(process.env.HOME || '', '.bun/bin/bun')]
  for (const candidate of candidates) {
    if (!candidate) continue
    const probe = spawnSync(candidate, ['--version'], {
      stdio: 'ignore',
      shell: false,
    })
    if (probe.status === 0) {
      return candidate
    }
  }

  return null
}

const bun = resolveBunBinary()
if (!bun) {
  console.error(
    'Forge could not find a Bun runtime. Reinstall the npm package or install Bun manually from https://bun.sh.',
  )
  process.exit(1)
}

const version = process.env.FORGE_VERSION || readPackageVersion()
const buildTime = process.env.FORGE_BUILD_TIME || new Date().toISOString()
const macro = JSON.stringify({
  VERSION: version,
  BUILD_TIME: buildTime,
  VERSION_CHANGELOG: '',
})

const result = spawnSync(
  bun,
  [
    'run',
    '--cwd',
    rootDir,
    '--install=fallback',
    '--define',
    `MACRO=${macro}`,
    'src/entrypoints/cli.tsx',
    ...process.argv.slice(2),
  ],
  {
    stdio: 'inherit',
    env: process.env,
  },
)

if (result.error) {
  console.error(result.error.message)
  process.exit(1)
}

if (typeof result.status === 'number') {
  process.exit(result.status)
}

process.exit(1)
