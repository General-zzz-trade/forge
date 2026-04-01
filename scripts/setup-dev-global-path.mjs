#!/usr/bin/env node

import { chmod, lstat, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')

const homeDir = os.homedir()
const localBinDir = path.join(homeDir, '.local', 'bin')
const wrapperPath = path.join(localBinDir, 'forge')
const targetPath = path.join(repoRoot, 'bin', 'forge.js')
const managedWrapperPrefix = '# Managed by Forge'
const wrapperMarker = '# Managed by Forge source checkout'
const pathBlockStart = '# >>> forge source checkout path >>>'
const pathBlockEnd = '# <<< forge source checkout path <<<'

function isSourceCheckoutInstall() {
  if (process.env.npm_config_global === 'true') {
    return false
  }

  return true
}

function getShellConfigPath() {
  const shellPath = process.env.SHELL || ''
  if (shellPath.includes('zsh')) {
    return path.join(process.env.ZDOTDIR || homeDir, '.zshrc')
  }
  if (shellPath.includes('fish')) {
    return path.join(homeDir, '.config', 'fish', 'config.fish')
  }
  return path.join(homeDir, '.bashrc')
}

function getPathBlock(configPath) {
  if (configPath.endsWith('config.fish')) {
    return [
      pathBlockStart,
      'fish_add_path -m ~/.local/bin',
      pathBlockEnd,
    ].join('\n')
  }

  return [
    pathBlockStart,
    'export PATH="$HOME/.local/bin:$PATH"',
    pathBlockEnd,
  ].join('\n')
}

async function ensureWrapper() {
  await mkdir(localBinDir, { recursive: true })

  try {
    const stat = await lstat(wrapperPath)

    if (stat.isFile() || stat.isSymbolicLink()) {
      const existing = await readFile(wrapperPath, 'utf8').catch(() => null)
      if (existing?.includes(wrapperMarker) && existing.includes(targetPath)) {
        return 'already_configured'
      }
      if (existing?.includes(managedWrapperPrefix)) {
        // Managed wrapper from another Forge install path. Replace it atomically.
      } else {
        console.warn(
          `[forge setup:path] Skip updating ${wrapperPath} because it already exists and is not managed by this checkout.`,
        )
        return 'conflict'
      }
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error
    }
  }

  const wrapper = [
    '#!/usr/bin/env bash',
    wrapperMarker,
    `exec "${targetPath}" "$@"`,
    '',
  ].join('\n')

  const tempWrapperPath = `${wrapperPath}.tmp-${process.pid}`
  await writeFile(tempWrapperPath, wrapper, { encoding: 'utf8', mode: 0o755 })
  await chmod(tempWrapperPath, 0o755)
  await rename(tempWrapperPath, wrapperPath)
  return 'created'
}

async function ensurePathConfig() {
  const configPath = getShellConfigPath()
  const configDir = path.dirname(configPath)
  await mkdir(configDir, { recursive: true })

  let content = ''
  try {
    content = await readFile(configPath, 'utf8')
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error
    }
  }

  const hasPathInEnv = (process.env.PATH || '')
    .split(path.delimiter)
    .some(entry => {
      try {
        return path.resolve(entry) === localBinDir
      } catch {
        return false
      }
    })

  const alreadyConfigured =
    content.includes(pathBlockStart) || content.includes('.local/bin')

  if (hasPathInEnv || alreadyConfigured) {
    return 'already_configured'
  }

  const nextContent = `${content.trimEnd()}\n\n${getPathBlock(configPath)}\n`
  await writeFile(configPath, nextContent, 'utf8')
  return configPath
}

async function main() {
  if (!isSourceCheckoutInstall()) {
    return
  }

  const wrapperResult = await ensureWrapper()
  const pathResult = await ensurePathConfig()

  if (wrapperResult === 'created') {
    console.log(`[forge setup:path] Installed launcher: ${wrapperPath}`)
  }

  if (typeof pathResult === 'string' && pathResult !== 'already_configured') {
    console.log(
      `[forge setup:path] Updated shell PATH config: ${pathResult}. Open a new terminal to reload it.`,
    )
  }
}

main().catch(error => {
  console.warn(`[forge setup:path] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 0
})
