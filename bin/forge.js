#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Re-spawn inside a PTY only when explicitly requested.
// Auto-promoting a non-TTY launch into an interactive PTY can leave Forge
// waiting forever in wrappers, CI, IDE launchers, or other piped contexts.
// Use FORGE_FORCE_PTY=1 to opt in when the caller knows interactive TUI
// behavior is desired and stdin is a real terminal.
if (
  process.env.FORGE_FORCE_PTY === '1' &&
  process.stdin.isTTY &&
  !process.stdout.isTTY &&
  !process.env.FORGE_IN_PTY &&
  process.platform !== 'win32'
) {
  const args = process.argv.slice(2)
  const nonInteractiveFlags = ['-p', '--print', '--version', '-v', '-V', 'mcp', '--init-only']
  const isNonInteractive = args.some(a => nonInteractiveFlags.includes(a))

  if (!isNonInteractive) {
    // Build the command to re-run this script
    const selfCmd = [process.execPath, process.argv[1], ...args]
      .map(a => `'${a.replace(/'/g, "'\\''")}'`)
      .join(' ')

    // Try `script` first (util-linux, Linux)
    const scriptProbe = spawnSync('script', ['--version'], { stdio: 'ignore' })
    if (scriptProbe.status === 0) {
      const result = spawnSync(
        'script',
        ['-q', '-e', '-c', selfCmd, '/dev/null'],
        {
          stdio: 'inherit',
          env: {
            ...process.env,
            FORGE_IN_PTY: '1',
            FORCE_INTERACTIVE: '1',
          },
        },
      )
      process.exit(result.status ?? 1)
    }

    // Fallback: socat
    const socatProbe = spawnSync('socat', ['-V'], { stdio: 'ignore' })
    if (socatProbe.status === 0) {
      const result = spawnSync(
        'socat',
        ['-,raw,echo=0', `EXEC:${selfCmd},pty,setsid,ctty`],
        {
          stdio: 'inherit',
          env: {
            ...process.env,
            FORGE_IN_PTY: '1',
            FORCE_INTERACTIVE: '1',
          },
        },
      )
      process.exit(result.status ?? 1)
    }
  }
}

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
