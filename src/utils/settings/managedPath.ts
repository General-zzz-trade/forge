import { existsSync } from 'fs'
import memoize from 'lodash-es/memoize.js'
import { join } from 'path'
import { getPlatform } from '../platform.js'

export const FORGE_MANAGED_SETTINGS_PATH_ENV = 'FORGE_MANAGED_SETTINGS_PATH'
export const LEGACY_CLAUDE_MANAGED_SETTINGS_PATH_ENV =
  'CLAUDE_CODE_MANAGED_SETTINGS_PATH'

function getManagedPathCandidates(): [preferred: string, legacy: string] {
  switch (getPlatform()) {
    case 'macos':
      return [
        '/Library/Application Support/Forge',
        '/Library/Application Support/ClaudeCode',
      ]
    case 'windows':
      return ['C:\\Program Files\\Forge', 'C:\\Program Files\\ClaudeCode']
    default:
      return ['/etc/forge', '/etc/claude-code']
  }
}

/**
 * Get the path to the managed settings directory based on the current platform.
 */
export const getManagedFilePath = memoize(function (): string {
  // Allow override for testing/demos (Ant-only, eliminated from external builds)
  if (
    process.env.USER_TYPE === 'ant' &&
    (process.env[FORGE_MANAGED_SETTINGS_PATH_ENV] ||
      process.env[LEGACY_CLAUDE_MANAGED_SETTINGS_PATH_ENV])
  ) {
    return (
      process.env[FORGE_MANAGED_SETTINGS_PATH_ENV] ??
      process.env[LEGACY_CLAUDE_MANAGED_SETTINGS_PATH_ENV]!
    )
  }

  const [preferredPath, legacyPath] = getManagedPathCandidates()
  if (existsSync(preferredPath)) {
    return preferredPath
  }
  if (existsSync(legacyPath)) {
    return legacyPath
  }
  return preferredPath
})

/**
 * Get the path to the managed-settings.d/ drop-in directory.
 * managed-settings.json is merged first (base), then files in this directory
 * are merged alphabetically on top (drop-ins override base, later files win).
 */
export const getManagedSettingsDropInDir = memoize(function (): string {
  return join(getManagedFilePath(), 'managed-settings.d')
})
