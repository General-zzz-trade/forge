import type { OAuthTokens, BillingType } from '../oauth/types.js'

export type IdentityProviderId = 'anthropic' | 'openai'
export type SessionIssuer = 'anthropic' | 'forge' | 'openai'
export type SupportedModelProvider =
  | 'anthropic'
  | 'openai'
  | 'bedrock'
  | 'vertex'
  | 'foundry'

export type IdentityTokens = {
  provider: IdentityProviderId
  accessToken: string
  refreshToken: string | null
  expiresAt: number | null
  scopes: string[]
  idToken?: string | null
  tokenType?: string
  subjectId?: string
  email?: string
  metadata?: Record<string, unknown>
}

export type ForgeSessionCapabilities = {
  profile: boolean
  roles: boolean
  bootstrap: boolean
  mcpProxy: boolean
  uploads: boolean
  modelProviders: SupportedModelProvider[]
}

export type ForgeSession = {
  issuer: 'forge' | 'openai'
  accessToken: string
  refreshToken: string | null
  expiresAt: number | null
  userId: string
  authProvider: IdentityProviderId
  capabilities: ForgeSessionCapabilities
  metadata?: Record<string, unknown>
}

export type ForgeAccountInfo = {
  accountUuid: string
  emailAddress: string
  organizationUuid?: string
  organizationName?: string | null
  organizationRole?: string | null
  workspaceRole?: string | null
  displayName?: string
  hasExtraUsageEnabled?: boolean
  billingType?: BillingType | null
  accountCreatedAt?: string
  subscriptionCreatedAt?: string
}

export type BrowserAuthUrlHandler = (
  url: string,
  automaticUrl?: string,
) => Promise<void>

export type AuthProviderOptions = {
  loginWithClaudeAi?: boolean
  inferenceOnly?: boolean
  expiresIn?: number
  orgUUID?: string
  loginHint?: string
  loginMethod?: string
  skipBrowserOpen?: boolean
}

export type ProviderLoginResult =
  | {
      kind: 'anthropic'
      tokens: OAuthTokens
    }
  | {
      kind: 'forge'
      provider: IdentityProviderId
      identity: IdentityTokens
      session: ForgeSession
      account?: ForgeAccountInfo
    }

export interface AuthProvider {
  id: IdentityProviderId
  displayName: string
  isConfigured(): boolean
  startInteractiveLogin(
    authURLHandler: BrowserAuthUrlHandler,
    options?: AuthProviderOptions,
  ): Promise<ProviderLoginResult>
  cleanup(): void
}

export type ForgeSessionExchangeResult = {
  session: ForgeSession
  account?: ForgeAccountInfo
}
