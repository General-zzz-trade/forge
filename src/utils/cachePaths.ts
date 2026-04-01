import { existsSync } from 'fs'
import envPaths from 'env-paths'
import { join } from 'path'
import { getFsImplementation } from './fsOperations.js'
import { djb2Hash } from './hash.js'

const forgePaths = envPaths('forge')
const legacyPaths = envPaths('claude-cli')

function getCacheRoot(): string {
  if (existsSync(forgePaths.cache)) {
    return forgePaths.cache
  }
  if (existsSync(legacyPaths.cache)) {
    return legacyPaths.cache
  }
  return forgePaths.cache
}

// Local sanitizePath using djb2Hash — NOT the shared version from
// sessionStoragePortable.ts which uses Bun.hash (wyhash) when available.
// Cache directory names must remain stable across upgrades so existing cache
// data (error logs, MCP logs) is not orphaned.
const MAX_SANITIZED_LENGTH = 200
function sanitizePath(name: string): string {
  const sanitized = name.replace(/[^a-zA-Z0-9]/g, '-')
  if (sanitized.length <= MAX_SANITIZED_LENGTH) {
    return sanitized
  }
  return `${sanitized.slice(0, MAX_SANITIZED_LENGTH)}-${Math.abs(djb2Hash(name)).toString(36)}`
}

function getProjectDir(cwd: string): string {
  return sanitizePath(cwd)
}

export const CACHE_PATHS = {
  baseLogs: () => join(getCacheRoot(), getProjectDir(getFsImplementation().cwd())),
  errors: () =>
    join(getCacheRoot(), getProjectDir(getFsImplementation().cwd()), 'errors'),
  messages: () =>
    join(getCacheRoot(), getProjectDir(getFsImplementation().cwd()), 'messages'),
  mcpLogs: (serverName: string) =>
    join(
      getCacheRoot(),
      getProjectDir(getFsImplementation().cwd()),
      // Sanitize server name for Windows compatibility (colons are reserved for drive letters)
      `mcp-logs-${sanitizePath(serverName)}`,
    ),
}
