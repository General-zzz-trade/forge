/**
 * Utilities for managing shell configuration files (like .bashrc, .zshrc)
 * Used for managing CLI aliases and PATH entries
 */

import { mkdir, open, readFile, stat } from 'fs/promises'
import { delimiter, dirname, join, resolve } from 'path'
import { homedir as osHomedir } from 'os'
import { isFsInaccessible } from './errors.js'
import { getLocalClaudePath, getLocalForgePath } from './localInstaller.js'

const INSTALLER_ALIAS_NAMES = new Set(['forge', 'claude'])
export const CLI_ALIAS_REGEX = /^\s*alias\s+(?:forge|claude)\s*=/
export const MANAGED_PATH_BLOCK_START = '# >>> forge managed path >>>'
export const MANAGED_PATH_BLOCK_END = '# <<< forge managed path <<<'

type EnvLike = Record<string, string | undefined>

type ShellConfigOptions = {
  env?: EnvLike
  homedir?: string
}

/**
 * Get the paths to shell configuration files
 * Respects ZDOTDIR for zsh users
 * @param options Optional overrides for testing (env, homedir)
 */
export function getShellConfigPaths(
  options?: ShellConfigOptions,
): Record<string, string> {
  const home = options?.homedir ?? osHomedir()
  const env = options?.env ?? process.env
  const zshConfigDir = env.ZDOTDIR || home
  return {
    zsh: join(zshConfigDir, '.zshrc'),
    bash: join(home, '.bashrc'),
    fish: join(home, '.config/fish/config.fish'),
  }
}

export function isDirectoryInPath(
  directory: string,
  pathValue: string | undefined = process.env.PATH,
): boolean {
  const resolvedDirectory = resolve(directory)

  return (pathValue || '').split(delimiter).some(entry => {
    try {
      return resolve(entry) === resolvedDirectory
    } catch {
      return false
    }
  })
}

function getShellPathBlock(shell: string, directory: string): string {
  const displayDir = directory.replace(osHomedir(), '~')
  if (shell === 'fish') {
    return [
      MANAGED_PATH_BLOCK_START,
      `fish_add_path -m ${displayDir}`,
      MANAGED_PATH_BLOCK_END,
    ].join('\n')
  }

  return [
    MANAGED_PATH_BLOCK_START,
    `export PATH="${displayDir}:$PATH"`,
    MANAGED_PATH_BLOCK_END,
  ].join('\n')
}

export async function ensureDirectoryInShellPath(
  shell: string,
  directory: string,
  options?: ShellConfigOptions,
): Promise<{ updated: boolean; configPath: string | null }> {
  const configs = getShellConfigPaths(options)
  const configPath = configs[shell]
  if (!configPath) {
    return { updated: false, configPath: null }
  }

  let content = ''
  try {
    content = await readFile(configPath, { encoding: 'utf8' })
  } catch (e: unknown) {
    if (!isFsInaccessible(e)) throw e
  }

  const displayDir = directory.replace(osHomedir(), '~')
  if (
    isDirectoryInPath(directory, options?.env?.PATH) ||
    content.includes(MANAGED_PATH_BLOCK_START) ||
    content.includes(displayDir) ||
    content.includes(directory)
  ) {
    return { updated: false, configPath }
  }

  await mkdir(dirname(configPath), { recursive: true })
  const nextContent = `${content.trimEnd()}\n\n${getShellPathBlock(shell, directory)}\n`
  const fh = await open(configPath, 'w')
  try {
    await fh.writeFile(nextContent, { encoding: 'utf8' })
    await fh.datasync()
  } finally {
    await fh.close()
  }

  return { updated: true, configPath }
}

/**
 * Filter out installer-created CLI aliases from an array of lines.
 * Only removes aliases pointing to the managed local launcher wrappers.
 * Preserves custom user aliases that point to other locations
 * Returns the filtered lines and whether an installer-managed alias was found.
 */
export function filterClaudeAliases(lines: string[]): {
  filtered: string[]
  hadAlias: boolean
} {
  const managedTargets = new Set([getLocalForgePath(), getLocalClaudePath()])
  let hadAlias = false
  const filtered = lines.filter(line => {
    // Check if this is a managed CLI alias.
    if (CLI_ALIAS_REGEX.test(line)) {
      // Extract the alias target - handle spaces, quotes, and various formats
      // First try with quotes
      let match = line.match(
        /alias\s+(forge|claude)\s*=\s*["']([^"']+)["']/,
      )
      if (!match) {
        // Try without quotes (capturing until end of line or comment)
        match = line.match(/alias\s+(forge|claude)\s*=\s*([^#\n]+)/)
      }

      if (match && match[1] && match[2]) {
        const aliasName = match[1]
        const target = match[2].trim()
        // Only remove if it points to the installer location
        // The installer always creates aliases with the full expanded path.
        if (INSTALLER_ALIAS_NAMES.has(aliasName) && managedTargets.has(target)) {
          hadAlias = true
          return false // Remove this line
        }
      }
      // Keep custom aliases that don't point to the installer location.
    }
    return true
  })
  return { filtered, hadAlias }
}

/**
 * Read a file and split it into lines
 * Returns null if file doesn't exist or can't be read
 */
export async function readFileLines(
  filePath: string,
): Promise<string[] | null> {
  try {
    const content = await readFile(filePath, { encoding: 'utf8' })
    return content.split('\n')
  } catch (e: unknown) {
    if (isFsInaccessible(e)) return null
    throw e
  }
}

/**
 * Write lines back to a file
 */
export async function writeFileLines(
  filePath: string,
  lines: string[],
): Promise<void> {
  const fh = await open(filePath, 'w')
  try {
    await fh.writeFile(lines.join('\n'), { encoding: 'utf8' })
    await fh.datasync()
  } finally {
    await fh.close()
  }
}

/**
 * Check if a managed CLI alias exists in any shell config file.
 * Returns the alias target if found, null otherwise.
 * @param options Optional overrides for testing (env, homedir)
 */
export async function findClaudeAlias(
  options?: ShellConfigOptions,
): Promise<string | null> {
  const configs = getShellConfigPaths(options)

  for (const configPath of Object.values(configs)) {
    const lines = await readFileLines(configPath)
    if (!lines) continue

    for (const line of lines) {
      if (CLI_ALIAS_REGEX.test(line)) {
        // Extract the alias target
        const match = line.match(/alias\s+(forge|claude)\s*=\s*["']?([^"'\s]+)/)
        if (match && match[1] && match[2]) {
          return match[2]
        }
      }
    }
  }

  return null
}

/**
 * Check if a managed CLI alias exists and points to a valid executable.
 * Returns the alias target if valid, null otherwise
 * @param options Optional overrides for testing (env, homedir)
 */
export async function findValidClaudeAlias(
  options?: ShellConfigOptions,
): Promise<string | null> {
  const aliasTarget = await findClaudeAlias(options)
  if (!aliasTarget) return null

  const home = options?.homedir ?? osHomedir()

  // Expand ~ to home directory
  const expandedPath = aliasTarget.startsWith('~')
    ? aliasTarget.replace('~', home)
    : aliasTarget

  // Check if the target exists and is executable
  try {
    const stats = await stat(expandedPath)
    // Check if it's a file (could be executable or symlink)
    if (stats.isFile() || stats.isSymbolicLink()) {
      return aliasTarget
    }
  } catch {
    // Target doesn't exist or can't be accessed
  }

  return null
}
