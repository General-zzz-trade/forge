/**
 * Utilities for handling local installation
 */

import { access, chmod, writeFile } from 'fs/promises'
import { join } from 'path'
import { type ReleaseChannel, saveGlobalConfig } from './config.js'
import {
  getClaudeConfigHomeDir,
  getLegacyClaudeConfigHomeDir,
} from './envUtils.js'
import { getErrnoCode } from './errors.js'
import { execFileNoThrowWithCwd } from './execFileNoThrow.js'
import { getFsImplementation } from './fsOperations.js'
import { logError } from './log.js'
import { jsonStringify } from './slowOperations.js'

// Lazy getters: getClaudeConfigHomeDir() is memoized and reads process.env.
// Evaluating at module scope would capture the value before entrypoints set a
// config-dir override env var in main(), and would also populate the memoize
// cache with that stale value for all 150+ other callers.
export function getLocalInstallDir(): string {
  return join(getClaudeConfigHomeDir(), 'local')
}
export function getLocalClaudePath(): string {
  return join(getLocalInstallDir(), 'claude')
}
export function getLocalForgePath(): string {
  return join(getLocalInstallDir(), 'forge')
}

/**
 * Check if we're running from our managed local installation
 */
export function isRunningFromLocalInstallation(): boolean {
  const execPath = (process.argv[1] || '').replaceAll('\\', '/')
  const localNodeModulesRoots = new Set(
    [getClaudeConfigHomeDir(), getLegacyClaudeConfigHomeDir()].map(dir =>
      join(dir, 'local', 'node_modules').replaceAll('\\', '/'),
    ),
  )
  return [...localNodeModulesRoots].some(root => execPath.includes(root))
}

/**
 * Write `content` to `path` only if the file does not already exist.
 * Uses O_EXCL ('wx') for atomic create-if-missing.
 */
async function writeIfMissing(
  path: string,
  content: string,
  mode?: number,
): Promise<boolean> {
  try {
    await writeFile(path, content, { encoding: 'utf8', flag: 'wx', mode })
    return true
  } catch (e) {
    if (getErrnoCode(e) === 'EEXIST') return false
    throw e
  }
}

async function ensureWrapperScript(
  wrapperPath: string,
  targetPath: string,
): Promise<void> {
  const created = await writeIfMissing(
    wrapperPath,
    `#!/bin/sh\nexec "${targetPath}" "$@"`,
    0o755,
  )
  if (created) {
    // Mode in writeFile is masked by umask; chmod to ensure executable bit.
    await chmod(wrapperPath, 0o755)
  }
}

/**
 * Ensure the local package environment is set up
 * Creates the directory, package.json, and wrapper script
 */
export async function ensureLocalPackageEnvironment(): Promise<boolean> {
  try {
    const localInstallDir = getLocalInstallDir()

    // Create installation directory (recursive, idempotent)
    await getFsImplementation().mkdir(localInstallDir)

    // Create package.json if it doesn't exist
    await writeIfMissing(
      join(localInstallDir, 'package.json'),
      jsonStringify(
        { name: 'forge-local', version: '0.0.1', private: true },
        null,
        2,
      ),
    )

    // Create both wrapper scripts so the local install can be invoked via
    // either the legacy `claude` name or the renamed `forge` launcher.
    const cliEntryPoint = `${localInstallDir}/node_modules/.bin/claude`
    await ensureWrapperScript(join(localInstallDir, 'claude'), cliEntryPoint)
    await ensureWrapperScript(join(localInstallDir, 'forge'), cliEntryPoint)

    return true
  } catch (error) {
    logError(error)
    return false
  }
}

/**
 * Install or update Claude CLI package in the local directory
 * @param channel - Release channel to use (latest or stable)
 * @param specificVersion - Optional specific version to install (overrides channel)
 */
export async function installOrUpdateClaudePackage(
  channel: ReleaseChannel,
  specificVersion?: string | null,
): Promise<'in_progress' | 'success' | 'install_failed'> {
  try {
    // First ensure the environment is set up
    if (!(await ensureLocalPackageEnvironment())) {
      return 'install_failed'
    }

    // Use specific version if provided, otherwise use channel tag
    const versionSpec = specificVersion
      ? specificVersion
      : channel === 'stable'
        ? 'stable'
        : 'latest'
    const result = await execFileNoThrowWithCwd(
      'npm',
      ['install', `${MACRO.PACKAGE_URL}@${versionSpec}`],
      { cwd: getLocalInstallDir(), maxBuffer: 1000000 },
    )

    if (result.code !== 0) {
      const error = new Error(
        `Failed to install Claude CLI package: ${result.stderr}`,
      )
      logError(error)
      return result.code === 190 ? 'in_progress' : 'install_failed'
    }

    // Set installMethod to 'local' to prevent npm permission warnings
    saveGlobalConfig(current => ({
      ...current,
      installMethod: 'local',
    }))

    return 'success'
  } catch (error) {
    logError(error)
    return 'install_failed'
  }
}

/**
 * Check if local installation exists.
 * Pure existence probe — callers use this to choose update path / UI hints.
 */
export async function localInstallationExists(): Promise<boolean> {
  try {
    await access(join(getLocalInstallDir(), 'node_modules', '.bin', 'claude'))
    return true
  } catch {
    return false
  }
}

/**
 * Get shell type to determine appropriate path setup
 */
export function getShellType(): string {
  const shellPath = process.env.SHELL || ''
  if (shellPath.includes('zsh')) return 'zsh'
  if (shellPath.includes('bash')) return 'bash'
  if (shellPath.includes('fish')) return 'fish'
  return 'unknown'
}
