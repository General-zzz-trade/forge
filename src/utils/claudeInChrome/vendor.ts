import { createRequire } from 'module'

const require = createRequire(import.meta.url)

export type PermissionMode =
  | 'ask'
  | 'skip_all_permission_checks'
  | 'follow_a_plan'

export interface Logger {
  silly(message: string, ...args: unknown[]): void
  debug(message: string, ...args: unknown[]): void
  info(message: string, ...args: unknown[]): void
  warn(message: string, ...args: unknown[]): void
  error(message: string, ...args: unknown[]): void
}

export type ClaudeForChromeContext = {
  serverName: string
  logger: Logger
  [key: string]: unknown
}

type BrowserTool = {
  name: string
}

type ChromeVendorModule = {
  BROWSER_TOOLS?: BrowserTool[]
  createClaudeForChromeMcpServer?: (
    context: ClaudeForChromeContext,
  ) => {
    connect(transport: unknown): Promise<void>
  }
}

function loadChromeVendor(): ChromeVendorModule | null {
  try {
    return require('@ant/claude-for-chrome-mcp') as ChromeVendorModule
  } catch {
    return null
  }
}

export const BROWSER_TOOLS: BrowserTool[] =
  loadChromeVendor()?.BROWSER_TOOLS ?? []

export function createClaudeForChromeMcpServer(
  context: ClaudeForChromeContext,
): {
  connect(transport: unknown): Promise<void>
} {
  const actual = loadChromeVendor()?.createClaudeForChromeMcpServer
  if (actual) {
    return actual(context)
  }
  return {
    async connect() {},
  }
}
