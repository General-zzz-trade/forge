import { createRequire } from 'module'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

const require = createRequire(import.meta.url)

type UpstreamComputerUseModule = Record<string, unknown>

function loadModule(name: string): UpstreamComputerUseModule | null {
  try {
    return require(name) as UpstreamComputerUseModule
  } catch {
    return null
  }
}

const mcpModule = loadModule('@ant/computer-use-mcp')
const sentinelModule = loadModule('@ant/computer-use-mcp/sentinelApps')

export type CoordinateMode = 'pixels' | 'normalized'

export type CuSubGates = {
  pixelValidation: boolean
  clipboardPasteMultiline: boolean
  mouseAnimation: boolean
  hideBeforeAction: boolean
  autoTargetDisplay: boolean
  clipboardGuard: boolean
}

export type AppGrant = {
  bundleId: string
  displayName: string
  grantedAt: number
}

export type CuGrantFlags = {
  clipboardRead: boolean
  clipboardWrite: boolean
  systemKeyCombos: boolean
}

export const DEFAULT_GRANT_FLAGS: CuGrantFlags =
  (mcpModule?.DEFAULT_GRANT_FLAGS as CuGrantFlags | undefined) ?? {
    clipboardRead: false,
    clipboardWrite: false,
    systemKeyCombos: false,
  }

export type ScreenshotDims = {
  width: number
  height: number
  displayWidth: number
  displayHeight: number
  displayId?: number
  originX?: number
  originY?: number
}

export type CuPermissionRequest = {
  apps: Array<{ bundleId: string; displayName: string }>
  tccState?: {
    accessibility: boolean
    screenRecording: boolean
  }
}

export type CuPermissionResponse = {
  granted: AppGrant[]
  denied: string[]
  flags: CuGrantFlags
}

export interface Logger {
  silly(message: string, ...args: unknown[]): void
  debug(message: string, ...args: unknown[]): void
  info(message: string, ...args: unknown[]): void
  warn(message: string, ...args: unknown[]): void
  error(message: string, ...args: unknown[]): void
}

export type DisplayGeometry = {
  width: number
  height: number
  scaleFactor: number
  displayId?: number
}

export type FrontmostApp = {
  bundleId: string
  displayName?: string
}

export type InstalledApp = {
  bundleId: string
  displayName: string
  path: string
  iconDataUrl?: string
}

export type RunningApp = {
  bundleId: string
  displayName: string
}

export type ResolvePrepareCaptureResult = {
  hidden: string[]
  displayId?: number
  base64?: string
  width?: number
  height?: number
  displayWidth?: number
  displayHeight?: number
  originX?: number
  originY?: number
}

export type ScreenshotResult = {
  base64: string
  width: number
  height: number
  displayWidth?: number
  displayHeight?: number
  displayId?: number
  originX?: number
  originY?: number
}

export interface ComputerExecutor {
  capabilities: Record<string, unknown>
  prepareForAction(
    allowlistBundleIds: string[],
    displayId?: number,
  ): Promise<string[]>
  previewHideSet(
    allowlistBundleIds: string[],
    displayId?: number,
  ): Promise<Array<{ bundleId: string; displayName: string }>>
  getDisplaySize(displayId?: number): Promise<DisplayGeometry>
  listDisplays(): Promise<DisplayGeometry[]>
  findWindowDisplays(
    bundleIds: string[],
  ): Promise<Array<{ bundleId: string; displayIds: number[] }>>
  resolvePrepareCapture(opts: {
    allowedBundleIds: string[]
    preferredDisplayId?: number
    autoResolve: boolean
    doHide?: boolean
  }): Promise<ResolvePrepareCaptureResult>
  screenshot(opts: {
    allowedBundleIds: string[]
    displayId?: number
  }): Promise<ScreenshotResult>
  zoom(
    regionLogical: { x: number; y: number; w: number; h: number },
    allowedBundleIds: string[],
    displayId?: number,
  ): Promise<{ base64: string; width: number; height: number }>
  key(keySequence: string, repeat?: number): Promise<void>
  holdKey(keyNames: string[], durationMs: number): Promise<void>
  type(text: string, opts: { viaClipboard: boolean }): Promise<void>
  readClipboard(): Promise<string>
  writeClipboard(text: string): Promise<void>
  moveMouse(x: number, y: number): Promise<void>
  click(
    x: number,
    y: number,
    button: 'left' | 'right' | 'middle',
    count: 1 | 2 | 3,
    modifiers?: string[],
  ): Promise<void>
  mouseDown(): Promise<void>
  mouseUp(): Promise<void>
  getCursorPosition(): Promise<{ x: number; y: number }>
  drag(
    from: { x: number; y: number } | undefined,
    to: { x: number; y: number },
  ): Promise<void>
  scroll(x: number, y: number, dx: number, dy: number): Promise<void>
  getFrontmostApp(): Promise<FrontmostApp | null>
  appUnderPoint(
    x: number,
    y: number,
  ): Promise<{ bundleId: string; displayName: string } | null>
  listInstalledApps(): Promise<InstalledApp[]>
  getAppIcon(path: string): Promise<string | undefined>
  listRunningApps(): Promise<RunningApp[]>
  openApp(bundleId: string): Promise<void>
}

export interface ComputerUseHostAdapter {
  serverName: string
  logger: Logger
  executor: ComputerExecutor
  ensureOsPermissions(): Promise<
    | { granted: true }
    | { granted: false; accessibility: boolean; screenRecording: boolean }
  >
  isDisabled(): boolean
  getSubGates(): CuSubGates
  getAutoUnhideEnabled(): boolean
  cropRawPatch(...args: unknown[]): unknown
}

export interface ComputerUseSessionContext {
  getAllowedApps(): readonly AppGrant[]
  getGrantFlags(): CuGrantFlags
  getUserDeniedBundleIds(): readonly string[]
  getSelectedDisplayId(): number | undefined
  getDisplayPinnedByModel(): boolean
  getDisplayResolvedForApps(): string | undefined
  getLastScreenshotDims(): ScreenshotDims | undefined
  onPermissionRequest(
    request: CuPermissionRequest,
    dialogSignal?: AbortSignal,
  ): Promise<CuPermissionResponse>
  onAllowedAppsChanged(apps: AppGrant[], flags: CuGrantFlags): void
  onAppsHidden(ids: string[]): void
  onResolvedDisplayUpdated(id: number | undefined): void
  onDisplayPinned(id: number | undefined): void
  onDisplayResolvedForApps(key: string | undefined): void
  onScreenshotCaptured(dims: ScreenshotDims): void
  checkCuLock(): Promise<{ holder: string | undefined; isSelf: boolean }>
  acquireCuLock(): Promise<void>
  formatLockHeldMessage(holder: string): string
}

export type CuToolContent =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType?: string }

export type CuCallToolResult = {
  content: CuToolContent[]
  telemetry?: {
    error_kind?: string
  }
}

export type ComputerUseInputAPI = {
  key(key: string, action: 'press' | 'release'): Promise<void>
  keys(parts: string[]): Promise<void>
  typeText(text: string): Promise<void>
  mouseLocation(): Promise<{ x: number; y: number }>
  moveMouse(x: number, y: number, smooth?: boolean): Promise<void>
  mouseButton(
    button: 'left' | 'right' | 'middle',
    action: 'click' | 'press' | 'release',
    count?: 1 | 2 | 3,
  ): Promise<void>
  mouseScroll(amount: number, axis: 'vertical' | 'horizontal'): Promise<void>
  getFrontmostAppInfo():
    | {
        bundleId?: string
        appName?: string
      }
    | null
}

export type ComputerUseInput =
  | ({ isSupported: true } & ComputerUseInputAPI)
  | { isSupported: false }

export type ComputerUseAPI = {
  tcc: {
    checkAccessibility(): boolean
    checkScreenRecording(): boolean
  }
  hotkey: {
    register(onEscape: () => void): boolean
    unregister(): void
    notifyExpectedEscape(): void
  }
  display: {
    getSize(displayId?: number): DisplayGeometry
    listAll(): DisplayGeometry[]
  }
  resolvePrepareCapture(
    allowedBundleIds: string[],
    hostBundleId: string,
    jpegQuality: number,
    targetWidth: number,
    targetHeight: number,
    preferredDisplayId?: number,
    autoResolve?: boolean,
    doHide?: boolean,
  ): Promise<ResolvePrepareCaptureResult>
  screenshot: {
    captureExcluding(
      allowedBundleIds: string[],
      jpegQuality: number,
      targetWidth: number,
      targetHeight: number,
      displayId?: number,
    ): Promise<ScreenshotResult>
    captureRegion(
      allowedBundleIds: string[],
      x: number,
      y: number,
      w: number,
      h: number,
      outW: number,
      outH: number,
      jpegQuality: number,
      displayId?: number,
    ): Promise<{ base64: string; width: number; height: number }>
  }
  apps: {
    prepareDisplay(
      allowlistBundleIds: string[],
      surrogateHost: string,
      displayId?: number,
    ): Promise<{ hidden: string[]; activated?: string }>
    previewHideSet(
      allowlistBundleIds: string[],
      displayId?: number,
    ): Promise<Array<{ bundleId: string; displayName: string }>>
    findWindowDisplays(
      bundleIds: string[],
    ): Promise<Array<{ bundleId: string; displayIds: number[] }>>
    appUnderPoint(
      x: number,
      y: number,
    ): Promise<{ bundleId: string; displayName: string } | null>
    listInstalled(): Promise<InstalledApp[]>
    iconDataUrl(path: string): string | null
    listRunning(): Promise<RunningApp[]>
    open(bundleId: string): Promise<void>
    unhide(bundleIds: string[]): Promise<void>
  }
}

export const API_RESIZE_PARAMS =
  (mcpModule?.API_RESIZE_PARAMS as Record<string, unknown> | undefined) ?? {}

export function targetImageSize(
  width: number,
  height: number,
  params: unknown,
): [number, number] {
  const upstreamTargetImageSize = mcpModule?.targetImageSize as
    | ((width: number, height: number, params: unknown) => [number, number])
    | undefined
  return upstreamTargetImageSize
    ? upstreamTargetImageSize(width, height, params)
    : [width, height]
}

export function buildComputerUseTools(
  capabilities: Record<string, unknown>,
  coordinateMode: CoordinateMode,
  installedAppNames?: string[],
): Array<{
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
}> {
  const upstreamBuildComputerUseTools = mcpModule?.buildComputerUseTools as
    | ((
        capabilities: Record<string, unknown>,
        coordinateMode: CoordinateMode,
        installedAppNames?: string[],
      ) => Array<{
        name: string
        description?: string
        inputSchema?: Record<string, unknown>
      }>)
    | undefined

  if (upstreamBuildComputerUseTools) {
    return upstreamBuildComputerUseTools(
      capabilities,
      coordinateMode,
      installedAppNames,
    )
  }

  return []
}

export function createComputerUseMcpServer(
  adapter: ComputerUseHostAdapter,
  coordinateMode: CoordinateMode,
): Server {
  const upstreamCreateComputerUseMcpServer = mcpModule?.createComputerUseMcpServer as
    | ((adapter: ComputerUseHostAdapter, coordinateMode: CoordinateMode) => Server)
    | undefined

  if (upstreamCreateComputerUseMcpServer) {
    return upstreamCreateComputerUseMcpServer(adapter, coordinateMode)
  }

  const server = new Server(
    { name: 'forge-computer-use', version: '0.0.0-local' },
    { capabilities: { tools: {} } },
  )
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [] }))
  server.setRequestHandler(CallToolRequestSchema, async () => ({
    content: [
      {
        type: 'text',
        text: 'Computer Use is unavailable in this Forge build.',
      },
    ],
  }))
  return server
}

export function bindSessionContext(
  adapter: ComputerUseHostAdapter,
  coordinateMode: CoordinateMode,
  sessionContext: ComputerUseSessionContext,
): (name: string, args: unknown) => Promise<CuCallToolResult> {
  const upstreamBindSessionContext = mcpModule?.bindSessionContext as
    | ((
        adapter: ComputerUseHostAdapter,
        coordinateMode: CoordinateMode,
        sessionContext: ComputerUseSessionContext,
      ) => (name: string, args: unknown) => Promise<CuCallToolResult>)
    | undefined

  if (upstreamBindSessionContext) {
    return upstreamBindSessionContext(adapter, coordinateMode, sessionContext)
  }

  return async () => ({
    content: [
      {
        type: 'text',
        text: 'Computer Use is unavailable in this Forge build.',
      },
    ],
    telemetry: { error_kind: 'unavailable' },
  })
}

export function getSentinelCategory(
  bundleId: string,
): 'shell' | 'filesystem' | 'system_settings' | null {
  const upstreamGetSentinelCategory = sentinelModule?.getSentinelCategory as
    | ((
        bundleId: string,
      ) => 'shell' | 'filesystem' | 'system_settings' | null)
    | undefined
  return upstreamGetSentinelCategory
    ? upstreamGetSentinelCategory(bundleId)
    : null
}

export function requireForgeComputerUseInputPackage(): ComputerUseInput {
  return require('@ant/computer-use-input') as ComputerUseInput
}

export function requireForgeComputerUseSwiftPackage(): ComputerUseAPI {
  return require('@ant/computer-use-swift') as ComputerUseAPI
}
