import { join, normalize } from 'path'
import { z } from 'zod/v4'
import {
  McpServerConfigSchema,
  type McpServerConfig,
} from '../../services/mcp/types.js'
import type { SystemDirectories } from '../systemDirectories.js'

export type McpbUserConfigurationOption = {
  type: 'string' | 'number' | 'boolean' | 'directory' | 'file'
  title: string
  description: string
  required?: boolean
  default?: string | number | boolean | string[]
  multiple?: boolean
  sensitive?: boolean
  min?: number
  max?: number
}

export type McpbManifest = {
  name: string
  version: string
  description?: string
  author: {
    name: string
    email?: string
  }
  server: McpServerConfig
  user_config?: Record<string, McpbUserConfigurationOption>
}

const McpbUserConfigurationOptionSchema = z
  .object({
    type: z.enum(['string', 'number', 'boolean', 'directory', 'file']),
    title: z.string(),
    description: z.string(),
    required: z.boolean().optional(),
    default: z
      .union([z.string(), z.number(), z.boolean(), z.array(z.string())])
      .optional(),
    multiple: z.boolean().optional(),
    sensitive: z.boolean().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
  })
  .strict()

export const McpbManifestSchema = z
  .object({
    name: z.string().min(1),
    version: z.string().min(1),
    description: z.string().optional(),
    author: z
      .object({
        name: z.string().min(1),
        email: z.string().optional(),
      })
      .strict(),
    server: McpServerConfigSchema(),
    user_config: z
      .record(z.string(), McpbUserConfigurationOptionSchema)
      .optional(),
  })
  .strict()

function substituteTemplateString(
  value: string,
  vars: Record<string, string | undefined>,
): string {
  return value.replace(/\$\{([^}]+)\}/g, (match, key) => vars[key] ?? match)
}

function deepSubstitute<T>(
  value: T,
  vars: Record<string, string | undefined>,
): T {
  if (typeof value === 'string') {
    return substituteTemplateString(value, vars) as T
  }
  if (Array.isArray(value)) {
    return value.map(item => deepSubstitute(item, vars)) as T
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        deepSubstitute(entry, vars),
      ]),
    ) as T
  }
  return value
}

function buildTemplateVars(params: {
  extensionPath: string
  systemDirs: SystemDirectories
  userConfig: Record<string, string | number | boolean | string[]>
}): Record<string, string | undefined> {
  const userConfigVars = Object.fromEntries(
    Object.entries(params.userConfig).map(([key, value]) => [
      `user_config.${key}`,
      Array.isArray(value) ? value.join(',') : String(value),
    ]),
  )

  return {
    EXTENSION_PATH: params.extensionPath,
    MCPB_EXTENSION_PATH: params.extensionPath,
    FORGE_PLUGIN_ROOT: params.extensionPath,
    CLAUDE_PLUGIN_ROOT: params.extensionPath,
    PATH_SEPARATOR: process.platform === 'win32' ? '\\' : '/',
    ...params.systemDirs,
    ...Object.fromEntries(
      Object.entries(process.env).map(([key, value]) => [key, value]),
    ),
    ...userConfigVars,
  }
}

export async function getMcpConfigForManifest(params: {
  manifest: McpbManifest
  extensionPath: string
  systemDirs: SystemDirectories
  userConfig?: Record<string, string | number | boolean | string[]>
  pathSeparator?: string
}): Promise<McpServerConfig | null> {
  const vars = buildTemplateVars({
    extensionPath: normalize(params.extensionPath),
    systemDirs: params.systemDirs,
    userConfig: params.userConfig ?? {},
  })

  const substituted = deepSubstitute(params.manifest.server, vars)

  if (
    substituted.type === 'stdio' &&
    typeof substituted.command === 'string' &&
    substituted.command.startsWith('./')
  ) {
    substituted.command = join(params.extensionPath, substituted.command)
  }

  const parsed = McpServerConfigSchema().safeParse(substituted)
  return parsed.success ? parsed.data : null
}
