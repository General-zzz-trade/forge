/**
 * Utilities for handling local installation
 */

import { access, chmod, readFile, rename, writeFile } from 'fs/promises'
import { homedir } from 'os'
import { dirname, join } from 'path'
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
import { ensureDirectoryInShellPath, isDirectoryInPath } from './shellConfig.js'

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
export function getUserLocalBinDir(): string {
  return join(homedir(), '.local', 'bin')
}
export function getUserForgePath(): string {
  return join(getUserLocalBinDir(), 'forge')
}
export function getUserClaudePath(): string {
  return join(getUserLocalBinDir(), 'claude')
}

const MANAGED_LAUNCHER_MARKER_PREFIX = '# Managed by Forge'

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

async function ensureManagedLauncher(
  wrapperPath: string,
  targetPath: string,
  marker: string,
): Promise<'created' | 'already_configured' | 'conflict'> {
  try {
    const existing = await readFile(wrapperPath, 'utf8')
    if (
      existing.includes(MANAGED_LAUNCHER_MARKER_PREFIX) &&
      existing.includes(`exec "${targetPath}" "$@"`)
    ) {
      return 'already_configured'
    }
    if (existing.includes(MANAGED_LAUNCHER_MARKER_PREFIX)) {
      // Managed wrapper from another Forge install path. Replace it atomically.
    } else {
      return 'conflict'
    }
  } catch (error) {
    if (getErrnoCode(error) !== 'ENOENT') {
      throw error
    }
  }

  await getFsImplementation().mkdir(dirname(wrapperPath))
  const tempPath = `${wrapperPath}.tmp-${process.pid}`
  const content = `#!/bin/sh\n${marker}\nexec "${targetPath}" "$@"\n`
  await writeFile(tempPath, content, { encoding: 'utf8', mode: 0o755 })
  await chmod(tempPath, 0o755)
  await rename(tempPath, wrapperPath)
  return 'created'
}

export async function ensureLocalInstallLaunchers(): Promise<{
  launcherCreated: boolean
  pathUpdated: boolean
  conflictingLauncherPath: string | null
  updatedConfigPath: string | null
}> {
  let launcherCreated = false
  let conflictingLauncherPath: string | null = null

  const launchers = [
    {
      wrapperPath: getUserForgePath(),
      targetPath: getLocalForgePath(),
      marker: `${MANAGED_LAUNCHER_MARKER_PREFIX} local installation`,
    },
    {
      wrapperPath: getUserClaudePath(),
      targetPath: getLocalClaudePath(),
      marker: `${MANAGED_LAUNCHER_MARKER_PREFIX} local installation`,
    },
  ]

  for (const launcher of launchers) {
    const result = await ensureManagedLauncher(
      launcher.wrapperPath,
      launcher.targetPath,
      launcher.marker,
    )
    if (result === 'created') {
      launcherCreated = true
    } else if (result === 'conflict') {
      conflictingLauncherPath ??= launcher.wrapperPath
    }
  }

  const shellType = getShellType()
  let pathUpdated = false
  let updatedConfigPath: string | null = null
  if (!isDirectoryInPath(getUserLocalBinDir())) {
    const ensured = await ensureDirectoryInShellPath(
      shellType,
      getUserLocalBinDir(),
    )
    pathUpdated = ensured.updated
    updatedConfigPath = ensured.configPath
  }

  return {
    launcherCreated,
    pathUpdated,
    conflictingLauncherPath,
    updatedConfigPath,
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

    const launcherSetup = await ensureLocalInstallLaunchers()
    if (launcherSetup.conflictingLauncherPath) {
      logError(
        new Error(
          `Local install launcher already exists and is not managed by Forge: ${launcherSetup.conflictingLauncherPath}`,
        ),
      )
    }

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
