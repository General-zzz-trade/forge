import { join } from 'path'
import { getFsImplementation } from '../fsOperations.js'

export const FORGE_PLUGIN_METADATA_DIR = '.forge-plugin'
export const LEGACY_CLAUDE_PLUGIN_METADATA_DIR = '.claude-plugin'
export const PLUGIN_MANIFEST_FILENAME = 'plugin.json'
export const MARKETPLACE_MANIFEST_FILENAME = 'marketplace.json'

function preferExistingPath(paths: string[]): string {
  const fs = getFsImplementation()
  for (const path of paths) {
    if (fs.existsSync(path)) {
      return path
    }
  }
  return paths[0]!
}

export function isPluginMetadataDirName(name: string): boolean {
  return (
    name === FORGE_PLUGIN_METADATA_DIR ||
    name === LEGACY_CLAUDE_PLUGIN_METADATA_DIR
  )
}

export function getPluginManifestCandidates(
  root: string,
  includeRootFallback = false,
): string[] {
  const candidates = [
    join(root, FORGE_PLUGIN_METADATA_DIR, PLUGIN_MANIFEST_FILENAME),
    join(root, LEGACY_CLAUDE_PLUGIN_METADATA_DIR, PLUGIN_MANIFEST_FILENAME),
  ]
  if (includeRootFallback) {
    candidates.push(join(root, PLUGIN_MANIFEST_FILENAME))
  }
  return candidates
}

export function getPreferredPluginManifestPath(
  root: string,
  includeRootFallback = false,
): string {
  return preferExistingPath(
    getPluginManifestCandidates(root, includeRootFallback),
  )
}

export function getMarketplaceManifestCandidates(
  root: string,
  includeRootFallback = false,
): string[] {
  const candidates = [
    join(root, FORGE_PLUGIN_METADATA_DIR, MARKETPLACE_MANIFEST_FILENAME),
    join(root, LEGACY_CLAUDE_PLUGIN_METADATA_DIR, MARKETPLACE_MANIFEST_FILENAME),
  ]
  if (includeRootFallback) {
    candidates.push(join(root, MARKETPLACE_MANIFEST_FILENAME))
  }
  return candidates
}

export function getPreferredMarketplaceManifestPath(
  root: string,
  includeRootFallback = false,
): string {
  return preferExistingPath(
    getMarketplaceManifestCandidates(root, includeRootFallback),
  )
}
