import { join } from 'path'
import { getClaudeConfigHomeDir } from './envUtils.js'
import { getFsImplementation } from './fsOperations.js'

export const FORGE_PROJECT_CONFIG_DIRNAME = '.forge'
export const LEGACY_CLAUDE_PROJECT_CONFIG_DIRNAME = '.claude'

export const FORGE_INSTRUCTIONS_FILENAME = 'FORGE.md'
export const LEGACY_CLAUDE_INSTRUCTIONS_FILENAME = 'CLAUDE.md'

export const FORGE_LOCAL_INSTRUCTIONS_FILENAME = 'FORGE.local.md'
export const LEGACY_CLAUDE_LOCAL_INSTRUCTIONS_FILENAME = 'CLAUDE.local.md'

function preferExistingPath(preferredPath: string, legacyPath: string): string {
  const fs = getFsImplementation()
  if (fs.existsSync(preferredPath)) {
    return preferredPath
  }
  if (fs.existsSync(legacyPath)) {
    return legacyPath
  }
  return preferredPath
}

function preferFirstExistingPath(paths: string[]): string {
  const fs = getFsImplementation()
  for (const path of paths) {
    if (fs.existsSync(path)) {
      return path
    }
  }
  return paths[0]!
}

export function getProjectConfigDirCandidates(root: string): [string, string] {
  return [
    join(root, FORGE_PROJECT_CONFIG_DIRNAME),
    join(root, LEGACY_CLAUDE_PROJECT_CONFIG_DIRNAME),
  ]
}

export function getPreferredProjectConfigDir(root: string): string {
  const [preferredDir, legacyDir] = getProjectConfigDirCandidates(root)
  return preferExistingPath(preferredDir, legacyDir)
}

export function getProjectConfigSubdirCandidates(
  root: string,
  subdir: string,
): [string, string] {
  return [
    join(root, FORGE_PROJECT_CONFIG_DIRNAME, subdir),
    join(root, LEGACY_CLAUDE_PROJECT_CONFIG_DIRNAME, subdir),
  ]
}

export function getPreferredProjectConfigSubdir(
  root: string,
  subdir: string,
): string {
  const [preferredPath, legacyPath] = getProjectConfigSubdirCandidates(
    root,
    subdir,
  )
  return preferExistingPath(preferredPath, legacyPath)
}

export function getProjectInstructionFileCandidates(
  root: string,
): [string, string] {
  return [
    join(root, FORGE_INSTRUCTIONS_FILENAME),
    join(root, LEGACY_CLAUDE_INSTRUCTIONS_FILENAME),
  ]
}

export function getScopedProjectInstructionFileCandidates(
  root: string,
): [string, string] {
  return [
    join(
      root,
      FORGE_PROJECT_CONFIG_DIRNAME,
      FORGE_INSTRUCTIONS_FILENAME,
    ),
    join(
      root,
      LEGACY_CLAUDE_PROJECT_CONFIG_DIRNAME,
      LEGACY_CLAUDE_INSTRUCTIONS_FILENAME,
    ),
  ]
}

export function getPreferredProjectInstructionPath(root: string): string {
  const [preferredPath, legacyPath] = getProjectInstructionFileCandidates(root)
  return preferExistingPath(preferredPath, legacyPath)
}

export function getPreferredScopedProjectInstructionPath(root: string): string {
  const [preferredPath, legacyPath] =
    getScopedProjectInstructionFileCandidates(root)
  return preferExistingPath(preferredPath, legacyPath)
}

export function getPreferredProjectRulesDir(root: string): string {
  return preferExistingPath(
    join(root, FORGE_PROJECT_CONFIG_DIRNAME, 'rules'),
    join(root, LEGACY_CLAUDE_PROJECT_CONFIG_DIRNAME, 'rules'),
  )
}

export function getPreferredManagedInstructionRulesDir(baseDir: string): string {
  return preferFirstExistingPath([
    join(baseDir, 'rules'),
    join(baseDir, FORGE_PROJECT_CONFIG_DIRNAME, 'rules'),
    join(baseDir, LEGACY_CLAUDE_PROJECT_CONFIG_DIRNAME, 'rules'),
  ])
}

export function getPreferredManagedConfigSubdir(
  baseDir: string,
  subdir: string,
): string {
  return preferFirstExistingPath([
    join(baseDir, subdir),
    join(baseDir, FORGE_PROJECT_CONFIG_DIRNAME, subdir),
    join(baseDir, LEGACY_CLAUDE_PROJECT_CONFIG_DIRNAME, subdir),
  ])
}

export function getPreferredLocalInstructionPath(root: string): string {
  return preferExistingPath(
    join(root, FORGE_LOCAL_INSTRUCTIONS_FILENAME),
    join(root, LEGACY_CLAUDE_LOCAL_INSTRUCTIONS_FILENAME),
  )
}

export function getPreferredUserInstructionPath(
  configHomeDir = getClaudeConfigHomeDir(),
): string {
  return preferExistingPath(
    join(configHomeDir, FORGE_INSTRUCTIONS_FILENAME),
    join(configHomeDir, LEGACY_CLAUDE_INSTRUCTIONS_FILENAME),
  )
}

export function getPreferredUserInstructionRulesDir(
  configHomeDir = getClaudeConfigHomeDir(),
): string {
  return join(configHomeDir, 'rules')
}

export function getPreferredManagedInstructionPath(baseDir: string): string {
  return preferExistingPath(
    join(baseDir, FORGE_INSTRUCTIONS_FILENAME),
    join(baseDir, LEGACY_CLAUDE_INSTRUCTIONS_FILENAME),
  )
}

export function getRelativeProjectSettingsFilePathCandidates(
  source: 'projectSettings' | 'localSettings',
): [string, string] {
  switch (source) {
    case 'projectSettings':
      return [
        join(FORGE_PROJECT_CONFIG_DIRNAME, 'settings.json'),
        join(LEGACY_CLAUDE_PROJECT_CONFIG_DIRNAME, 'settings.json'),
      ]
    case 'localSettings':
      return [
        join(FORGE_PROJECT_CONFIG_DIRNAME, 'settings.local.json'),
        join(LEGACY_CLAUDE_PROJECT_CONFIG_DIRNAME, 'settings.local.json'),
      ]
  }
}

export function getPreferredRelativeProjectSettingsFilePath(
  source: 'projectSettings' | 'localSettings',
  root: string,
): string {
  const [preferredPath, legacyPath] =
    getRelativeProjectSettingsFilePathCandidates(source)
  const fs = getFsImplementation()
  if (fs.existsSync(join(root, preferredPath))) {
    return preferredPath
  }
  if (fs.existsSync(join(root, legacyPath))) {
    return legacyPath
  }
  return preferredPath
}

export function hasAnyProjectInstructionFile(root: string): boolean {
  const fs = getFsImplementation()
  return [
    ...getProjectInstructionFileCandidates(root),
    ...getScopedProjectInstructionFileCandidates(root),
  ].some(path => fs.existsSync(path))
}

export function isInstructionFileBasename(name: string): boolean {
  return (
    name === FORGE_INSTRUCTIONS_FILENAME ||
    name === LEGACY_CLAUDE_INSTRUCTIONS_FILENAME ||
    name === FORGE_LOCAL_INSTRUCTIONS_FILENAME ||
    name === LEGACY_CLAUDE_LOCAL_INSTRUCTIONS_FILENAME
  )
}
