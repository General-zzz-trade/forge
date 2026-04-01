import type { IdentityProviderId, ForgeSessionCapabilities } from '../../services/auth/types.js'
import type { RateLimitTier, SubscriptionType } from '../../services/oauth/types.js'

export type StoredClaudeAiOauth = {
  accessToken: string
  refreshToken: string | null
  expiresAt: number | null
  scopes: string[]
  subscriptionType: SubscriptionType | null
  rateLimitTier: RateLimitTier | null
}

export type StoredIdentityOAuth = {
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

export type StoredForgeSession = {
  issuer: 'forge' | 'openai'
  accessToken: string
  refreshToken: string | null
  expiresAt: number | null
  userId: string
  authProvider: IdentityProviderId
  capabilities: ForgeSessionCapabilities
  metadata?: Record<string, unknown>
}

export type StoredMcpOAuthEntry = {
  serverName: string
  serverUrl: string
  accessToken: string
  refreshToken?: string
  expiresAt: number
  scope?: string
  clientId?: string
  clientSecret?: string
  stepUpScope?: string
  discoveryState?: {
    authorizationServerUrl?: string
    resourceMetadataUrl?: string
    resourceMetadata?: unknown
    authorizationServerMetadata?: unknown
  }
}

export type SecureStorageData = {
  claudeAiOauth?: StoredClaudeAiOauth
  identityOauth?: StoredIdentityOAuth
  forgeSession?: StoredForgeSession
  mcpOAuth?: Record<string, StoredMcpOAuthEntry>
  mcpOAuthClientConfig?: Record<string, { clientSecret?: string }>
}

export interface SecureStorage {
  name: string
  read(): SecureStorageData | null
  readAsync(): Promise<SecureStorageData | null>
  update(data: SecureStorageData): { success: boolean; warning?: string }
  delete(): boolean
}
