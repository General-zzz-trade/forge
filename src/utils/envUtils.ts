import {
  accessSync,
  constants,
  existsSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from 'fs'
import memoize from 'lodash-es/memoize.js'
import { homedir, tmpdir } from 'os'
import { dirname, join } from 'path'

export const FORGE_CONFIG_DIR_ENV = 'FORGE_CONFIG_DIR'
export const CLAUDE_CONFIG_DIR_ENV = 'CLAUDE_CONFIG_DIR'
export const FORGE_USE_LEGACY_CONFIG_DIR_ENV = 'FORGE_USE_LEGACY_CONFIG_DIR'

export type ConfigHomeDirResolution = {
  path: string
  source: 'explicit' | 'default' | 'legacy' | 'fallback'
  reason: string
}

export function getDefaultForgeConfigHomeDir(): string {
  return join(homedir(), '.forge').normalize('NFC')
}

export function getLegacyClaudeConfigHomeDir(): string {
  return join(homedir(), '.claude').normalize('NFC')
}

function isWritableDirectory(path: string): boolean {
  try {
    accessSync(path, constants.R_OK | constants.W_OK | constants.X_OK)
    const probePath = join(
      path,
      `.forge-write-probe-${process.pid}-${Date.now()}`,
    )
    writeFileSync(probePath, '', { mode: 0o600 })
    unlinkSync(probePath)
    return true
  } catch {
    return false
  }
}

function canCreateInParent(path: string): boolean {
  try {
    accessSync(dirname(path), constants.W_OK | constants.X_OK)
    const probePath = join(
      dirname(path),
      `.forge-write-probe-${process.pid}-${Date.now()}`,
    )
    writeFileSync(probePath, '', { mode: 0o600 })
    unlinkSync(probePath)
    return true
  } catch {
    return false
  }
}

function isUsableConfigHomeDir(path: string): boolean {
  return existsSync(path) ? isWritableDirectory(path) : canCreateInParent(path)
}

function getFallbackForgeConfigHomeDir(): string {
  const uid =
    typeof process.getuid === 'function' ? String(process.getuid()) : 'user'
  return join(tmpdir(), `forge-config-${uid}`).normalize('NFC')
}

function hasDirectoryEntries(path: string): boolean {
  try {
    return readdirSync(path).length > 0
  } catch {
    return false
  }
}

function resolveConfigHomeDir(): ConfigHomeDirResolution {
  const explicitConfigDir =
    process.env[FORGE_CONFIG_DIR_ENV] ?? process.env[CLAUDE_CONFIG_DIR_ENV]
  if (explicitConfigDir) {
    return {
      path: explicitConfigDir.normalize('NFC'),
      source: 'explicit',
      reason: `using ${FORGE_CONFIG_DIR_ENV}/${CLAUDE_CONFIG_DIR_ENV} override`,
    }
  }

  const forgeConfigDir = getDefaultForgeConfigHomeDir()
  const legacyConfigDir = getLegacyClaudeConfigHomeDir()
  const useLegacyConfigDir = isEnvTruthy(
    process.env[FORGE_USE_LEGACY_CONFIG_DIR_ENV],
  )

  // Forge now treats ~/.forge as the primary config home.
  // Legacy ~/.claude remains a compatibility source for individual files,
  // but it should not become the default runtime directory just because it
  // happens to exist. Otherwise startup keeps inheriting stale plugin state,
  // session metadata, and migration work from old installs.
  if (useLegacyConfigDir && existsSync(legacyConfigDir)) {
    return {
      path: legacyConfigDir,
      source: 'legacy',
      reason: `using legacy config dir because ${FORGE_USE_LEGACY_CONFIG_DIR_ENV}=1`,
    }
  }

  const forgeExists = existsSync(forgeConfigDir)
  if (
    forgeExists &&
    hasDirectoryEntries(forgeConfigDir) &&
    isUsableConfigHomeDir(forgeConfigDir)
  ) {
    return {
      path: forgeConfigDir,
      source: 'default',
      reason: 'using existing writable ~/.forge directory',
    }
  }

  if (isUsableConfigHomeDir(forgeConfigDir)) {
    return {
      path: forgeConfigDir,
      source: 'default',
      reason: 'using writable ~/.forge directory',
    }
  }

  if (
    useLegacyConfigDir &&
    existsSync(legacyConfigDir) &&
    hasDirectoryEntries(legacyConfigDir) &&
    isUsableConfigHomeDir(legacyConfigDir)
  ) {
    return {
      path: legacyConfigDir,
      source: 'legacy',
      reason: 'using existing writable legacy ~/.claude directory',
    }
  }

  if (useLegacyConfigDir && isUsableConfigHomeDir(legacyConfigDir)) {
    return {
      path: legacyConfigDir,
      source: 'legacy',
      reason: 'using writable legacy ~/.claude directory',
    }
  }

  return {
    path: getFallbackForgeConfigHomeDir(),
    source: 'fallback',
    reason: '~/.forge is unavailable or read-only; using writable fallback under tmp',
  }
}

export function isUsingDefaultConfigHomeDir(): boolean {
  return !process.env[FORGE_CONFIG_DIR_ENV] && !process.env[CLAUDE_CONFIG_DIR_ENV]
}

// Memoized: 150+ callers, many on hot paths. Keyed off the explicit config-dir
// env vars so tests that change them get a fresh value without cache.clear().
// Filesystem fallback (~/.forge vs ~/.claude) is expected to be process-stable.
export const getConfigHomeDirResolution = memoize(
  (): ConfigHomeDirResolution => resolveConfigHomeDir(),
  () =>
    `${process.env[FORGE_CONFIG_DIR_ENV] ?? ''}\0${process.env[CLAUDE_CONFIG_DIR_ENV] ?? ''}\0${process.env[FORGE_USE_LEGACY_CONFIG_DIR_ENV] ?? ''}`,
)

export const getClaudeConfigHomeDir = memoize(
  (): string => getConfigHomeDirResolution().path,
  () =>
    `${process.env[FORGE_CONFIG_DIR_ENV] ?? ''}\0${process.env[CLAUDE_CONFIG_DIR_ENV] ?? ''}\0${process.env[FORGE_USE_LEGACY_CONFIG_DIR_ENV] ?? ''}`,
)

export function getTeamsDir(): string {
  return join(getClaudeConfigHomeDir(), 'teams')
}

/**
 * Check if NODE_OPTIONS contains a specific flag.
 * Splits on whitespace and checks for exact match to avoid false positives.
 */
export function hasNodeOption(flag: string): boolean {
  const nodeOptions = process.env.NODE_OPTIONS
  if (!nodeOptions) {
    return false
  }
  return nodeOptions.split(/\s+/).includes(flag)
}

export function isEnvTruthy(envVar: string | boolean | undefined): boolean {
  if (!envVar) return false
  if (typeof envVar === 'boolean') return envVar
  const normalizedValue = envVar.toLowerCase().trim()
  return ['1', 'true', 'yes', 'on'].includes(normalizedValue)
}

export function isEnvDefinedFalsy(
  envVar: string | boolean | undefined,
): boolean {
  if (envVar === undefined) return false
  if (typeof envVar === 'boolean') return !envVar
  if (!envVar) return false
  const normalizedValue = envVar.toLowerCase().trim()
  return ['0', 'false', 'no', 'off'].includes(normalizedValue)
}

export function isClaudeHostedServiceAccessEnabled(): boolean {
  return false
}

export function isManagedOauthAvailable(): boolean {
  if (process.env.CLAUDE_CODE_CUSTOM_OAUTH_URL) {
    return true
  }

  if (
    process.env.USER_TYPE === 'ant' &&
    isEnvTruthy(process.env.USE_LOCAL_OAUTH)
  ) {
    return true
  }

  return false
}

export function getDisabledClaudeServiceBaseUrl(): string {
  return (
    process.env.FORGE_DISABLED_CLAUDE_SERVICE_BASE_URL ||
    'http://127.0.0.1:8787'
  )
    .trim()
    .replace(/\/$/, '')
}

/**
 * --bare / CLAUDE_CODE_SIMPLE — skip hooks, LSP, plugin sync, skill dir-walk,
 * attribution, background prefetches, and ALL keychain/credential reads.
 * Auth is strictly ANTHROPIC_API_KEY env or apiKeyHelper from --settings.
 * Explicit CLI flags (--plugin-dir, --add-dir, --mcp-config) still honored.
 * ~30 gates across the codebase.
 *
 * Checks argv directly (in addition to the env var) because several gates
 * run before main.tsx's action handler sets CLAUDE_CODE_SIMPLE=1 from --bare
 * — notably startKeychainPrefetch() at main.tsx top-level.
 */
export function isBareMode(): boolean {
  return (
    isEnvTruthy(process.env.CLAUDE_CODE_SIMPLE) ||
    process.argv.includes('--bare')
  )
}

/**
 * Parses an array of environment variable strings into a key-value object
 * @param envVars Array of strings in KEY=VALUE format
 * @returns Object with key-value pairs
 */
export function parseEnvVars(
  rawEnvArgs: string[] | undefined,
): Record<string, string> {
  const parsedEnv: Record<string, string> = {}

  // Parse individual env vars
  if (rawEnvArgs) {
    for (const envStr of rawEnvArgs) {
      const [key, ...valueParts] = envStr.split('=')
      if (!key || valueParts.length === 0) {
        throw new Error(
          `Invalid environment variable format: ${envStr}, environment variables should be added as: -e KEY1=value1 -e KEY2=value2`,
        )
      }
      parsedEnv[key] = valueParts.join('=')
    }
  }
  return parsedEnv
}

/**
 * Get the AWS region with fallback to default
 * Matches the Anthropic Bedrock SDK's region behavior
 */
export function getAWSRegion(): string {
  return process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1'
}

/**
 * Get the default Vertex AI region
 */
export function getDefaultVertexRegion(): string {
  return process.env.CLOUD_ML_REGION || 'us-east5'
}

/**
 * Check if bash commands should maintain project working directory (reset to original after each command)
 * @returns true if CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR is set to a truthy value
 */
export function shouldMaintainProjectWorkingDir(): boolean {
  return isEnvTruthy(process.env.CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR)
}

/**
 * Check if running on Homespace (ant-internal cloud environment)
 */
export function isRunningOnHomespace(): boolean {
  return (
    process.env.USER_TYPE === 'ant' &&
    isEnvTruthy(process.env.COO_RUNNING_ON_HOMESPACE)
  )
}

/**
 * Conservative check for whether Forge is running inside a protected
 * (privileged or ASL3+) COO namespace or cluster.
 *
 * Conservative means: when signals are ambiguous, assume protected. We would
 * rather over-report protected usage than miss it. Unprotected environments
 * are homespace, namespaces on the open allowlist, and no k8s/COO signals
 * at all (laptop/local dev).
 *
 * Used for telemetry to measure auto-mode usage in sensitive environments.
 */
export function isInProtectedNamespace(): boolean {
  // USER_TYPE is build-time --define'd; in external builds this block is
  // DCE'd so the require() and namespace allowlist never appear in the bundle.
  if (process.env.USER_TYPE === 'ant') {
    /* eslint-disable @typescript-eslint/no-require-imports */
    return (
      require('./protectedNamespace.js') as typeof import('./protectedNamespace.js')
    ).checkProtectedNamespace()
    /* eslint-enable @typescript-eslint/no-require-imports */
  }
  return false
}

// @[MODEL LAUNCH]: Add a Vertex region override env var for the new model.
/**
 * Model prefix → env var for Vertex region overrides.
 * Order matters: more specific prefixes must come before less specific ones
 * (e.g., 'claude-opus-4-1' before 'claude-opus-4').
 */
const VERTEX_REGION_OVERRIDES: ReadonlyArray<[string, string]> = [
  ['claude-haiku-4-5', 'VERTEX_REGION_CLAUDE_HAIKU_4_5'],
  ['claude-3-5-haiku', 'VERTEX_REGION_CLAUDE_3_5_HAIKU'],
  ['claude-3-5-sonnet', 'VERTEX_REGION_CLAUDE_3_5_SONNET'],
  ['claude-3-7-sonnet', 'VERTEX_REGION_CLAUDE_3_7_SONNET'],
  ['claude-opus-4-1', 'VERTEX_REGION_CLAUDE_4_1_OPUS'],
  ['claude-opus-4', 'VERTEX_REGION_CLAUDE_4_0_OPUS'],
  ['claude-sonnet-4-6', 'VERTEX_REGION_CLAUDE_4_6_SONNET'],
  ['claude-sonnet-4-5', 'VERTEX_REGION_CLAUDE_4_5_SONNET'],
  ['claude-sonnet-4', 'VERTEX_REGION_CLAUDE_4_0_SONNET'],
]

/**
 * Get the Vertex AI region for a specific model.
 * Different models may be available in different regions.
 */
export function getVertexRegionForModel(
  model: string | undefined,
): string | undefined {
  if (model) {
    const match = VERTEX_REGION_OVERRIDES.find(([prefix]) =>
      model.startsWith(prefix),
    )
    if (match) {
      return process.env[match[1]] || getDefaultVertexRegion()
    }
  }
  return getDefaultVertexRegion()
}
