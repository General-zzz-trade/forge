// In its own file to avoid circular dependencies
export const FILE_EDIT_TOOL_NAME = 'Edit'

// Permission patterns for granting session-level access to the project's config folder
export const FORGE_FOLDER_PERMISSION_PATTERN = '/.forge/**'
export const LEGACY_CLAUDE_FOLDER_PERMISSION_PATTERN = '/.claude/**'
export const CLAUDE_FOLDER_PERMISSION_PATTERN = FORGE_FOLDER_PERMISSION_PATTERN

// Permission patterns for granting session-level access to the global config folder
export const GLOBAL_FORGE_FOLDER_PERMISSION_PATTERN = '~/.forge/**'
export const LEGACY_GLOBAL_CLAUDE_FOLDER_PERMISSION_PATTERN = '~/.claude/**'
export const GLOBAL_CLAUDE_FOLDER_PERMISSION_PATTERN =
  GLOBAL_FORGE_FOLDER_PERMISSION_PATTERN

export const FILE_UNEXPECTEDLY_MODIFIED_ERROR =
  'File has been unexpectedly modified. Read it again before attempting to write it.'
