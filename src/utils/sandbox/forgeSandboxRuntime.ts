import { createRequire } from 'module'
import { z } from 'zod/v4'
import { getPlatform } from '../platform.js'

const require = createRequire(import.meta.url)

type UpstreamSandboxModule = {
  SandboxManager: typeof SandboxManager
  SandboxRuntimeConfigSchema: typeof SandboxRuntimeConfigSchema
  SandboxViolationStore: typeof SandboxViolationStore
}

function loadUpstreamSandboxRuntime(): UpstreamSandboxModule | null {
  try {
    return require('@anthropic-ai/sandbox-runtime') as UpstreamSandboxModule
  } catch {
    return null
  }
}

const upstream = loadUpstreamSandboxRuntime()

export type FsReadRestrictionConfig = {
  denyOnly: string[]
  allowWithinDeny?: string[]
}

export type FsWriteRestrictionConfig = {
  allowOnly: string[]
  denyWithinAllow: string[]
}

export type IgnoreViolationsConfig = Record<string, string[]>

export type NetworkHostPattern = {
  host: string
  port?: number
}

export type NetworkRestrictionConfig = {
  allowedHosts?: string[]
  deniedHosts?: string[]
}

export type SandboxAskCallback = (
  hostPattern: NetworkHostPattern,
) => Promise<boolean>

export type SandboxDependencyCheck = {
  errors: string[]
  warnings: string[]
}

export type SandboxViolationEvent = {
  timestamp: Date
  line: string
  command?: string
}

export type SandboxRuntimeConfig = {
  filesystem?: {
    denyRead?: string[]
    allowRead?: string[]
    allowWrite?: string[]
    denyWrite?: string[]
  }
  network?: {
    allowedDomains?: string[]
    deniedDomains?: string[]
    allowUnixSockets?: string[]
    allowAllUnixSockets?: boolean
    allowLocalBinding?: boolean
    httpProxyPort?: number
    socksProxyPort?: number
  }
  ignoreViolations?: IgnoreViolationsConfig
  enableWeakerNestedSandbox?: boolean
  enableWeakerNetworkIsolation?: boolean
  ripgrep?: {
    command: string
    args?: string[]
    argv0?: string
  }
}

const LocalSandboxRuntimeConfigSchema = z.object({
  filesystem: z
    .object({
      denyRead: z.array(z.string()).optional(),
      allowRead: z.array(z.string()).optional(),
      allowWrite: z.array(z.string()).optional(),
      denyWrite: z.array(z.string()).optional(),
    })
    .optional(),
  network: z
    .object({
      allowedDomains: z.array(z.string()).optional(),
      deniedDomains: z.array(z.string()).optional(),
      allowUnixSockets: z.array(z.string()).optional(),
      allowAllUnixSockets: z.boolean().optional(),
      allowLocalBinding: z.boolean().optional(),
      httpProxyPort: z.number().optional(),
      socksProxyPort: z.number().optional(),
    })
    .optional(),
  ignoreViolations: z.record(z.string(), z.array(z.string())).optional(),
  enableWeakerNestedSandbox: z.boolean().optional(),
  enableWeakerNetworkIsolation: z.boolean().optional(),
  ripgrep: z
    .object({
      command: z.string(),
      args: z.array(z.string()).optional(),
      argv0: z.string().optional(),
    })
    .optional(),
})

export const SandboxRuntimeConfigSchema =
  upstream?.SandboxRuntimeConfigSchema ?? LocalSandboxRuntimeConfigSchema

class LocalSandboxViolationStore {
  #events: SandboxViolationEvent[] = []
  #listeners = new Set<(events: SandboxViolationEvent[]) => void>()

  subscribe(
    listener: (events: SandboxViolationEvent[]) => void,
  ): () => void {
    this.#listeners.add(listener)
    listener([...this.#events])
    return () => {
      this.#listeners.delete(listener)
    }
  }

  getTotalCount(): number {
    return this.#events.length
  }

  add(event: SandboxViolationEvent): void {
    this.#events.push(event)
    for (const listener of this.#listeners) {
      listener([...this.#events])
    }
  }

  clear(): void {
    this.#events = []
    for (const listener of this.#listeners) {
      listener([])
    }
  }
}

export const SandboxViolationStore =
  upstream?.SandboxViolationStore ?? LocalSandboxViolationStore

const localViolationStore = new SandboxViolationStore()
let localConfig: SandboxRuntimeConfig = {}
let localAskCallback: SandboxAskCallback | undefined

function unavailableDependencyCheck(): SandboxDependencyCheck {
  return {
    errors: ['forge sandbox runtime is unavailable in this build'],
    warnings: [],
  }
}

function getFsReadConfig(): FsReadRestrictionConfig {
  return {
    denyOnly: [...(localConfig.filesystem?.denyRead ?? [])],
    allowWithinDeny: [...(localConfig.filesystem?.allowRead ?? [])],
  }
}

function getFsWriteConfig(): FsWriteRestrictionConfig {
  return {
    allowOnly: [...(localConfig.filesystem?.allowWrite ?? [])],
    denyWithinAllow: [...(localConfig.filesystem?.denyWrite ?? [])],
  }
}

function getNetworkRestrictionConfig(): NetworkRestrictionConfig {
  return {
    allowedHosts: [...(localConfig.network?.allowedDomains ?? [])],
    deniedHosts: [...(localConfig.network?.deniedDomains ?? [])],
  }
}

function isSupportedPlatform(): boolean {
  const platform = getPlatform()
  return platform === 'macos' || platform === 'linux' || platform === 'wsl'
}

const LocalSandboxManager = {
  async initialize(
    config: SandboxRuntimeConfig,
    askCallback?: SandboxAskCallback,
  ): Promise<void> {
    localConfig = config
    localAskCallback = askCallback
  },
  updateConfig(config: SandboxRuntimeConfig): void {
    localConfig = config
  },
  async wrapWithSandbox(command: string): Promise<string> {
    return command
  },
  async reset(): Promise<void> {
    localConfig = {}
    localAskCallback = undefined
    localViolationStore.clear()
  },
  checkDependencies(): SandboxDependencyCheck {
    return unavailableDependencyCheck()
  },
  isSupportedPlatform(): boolean {
    return isSupportedPlatform()
  },
  getFsReadConfig,
  getFsWriteConfig,
  getNetworkRestrictionConfig,
  getIgnoreViolations(): IgnoreViolationsConfig | undefined {
    return localConfig.ignoreViolations
  },
  getAllowUnixSockets(): string[] | undefined {
    return localConfig.network?.allowUnixSockets
  },
  getAllowLocalBinding(): boolean | undefined {
    return localConfig.network?.allowLocalBinding
  },
  getEnableWeakerNestedSandbox(): boolean | undefined {
    return localConfig.enableWeakerNestedSandbox
  },
  getProxyPort(): number | undefined {
    return localConfig.network?.httpProxyPort
  },
  getSocksProxyPort(): number | undefined {
    return localConfig.network?.socksProxyPort
  },
  getLinuxHttpSocketPath(): string | undefined {
    return undefined
  },
  getLinuxSocksSocketPath(): string | undefined {
    return undefined
  },
  async waitForNetworkInitialization(): Promise<boolean> {
    return Boolean(localAskCallback)
  },
  getSandboxViolationStore(): InstanceType<typeof SandboxViolationStore> {
    return localViolationStore
  },
  annotateStderrWithSandboxFailures(_command: string, stderr: string): string {
    return stderr
  },
  cleanupAfterCommand(): void {},
}

export const SandboxManager = upstream?.SandboxManager ?? LocalSandboxManager
