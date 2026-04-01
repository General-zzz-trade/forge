import axios from 'axios'
import type {
  ForgeAccountInfo,
  ForgeSession,
  ForgeSessionCapabilities,
  ForgeSessionExchangeResult,
  IdentityTokens,
  SupportedModelProvider,
} from './types.js'

type BrokerExchangeResponse = {
  access_token: string
  refresh_token?: string | null
  expires_in?: number | null
  expires_at?: number | null
  user_id: string
  capabilities?: Partial<
    Omit<ForgeSessionCapabilities, 'modelProviders'> & {
      modelProviders: SupportedModelProvider[]
    }
  >
  account?: Partial<ForgeAccountInfo>
  metadata?: Record<string, unknown>
}

const DEFAULT_CAPABILITIES: ForgeSessionCapabilities = {
  profile: false,
  roles: false,
  bootstrap: false,
  mcpProxy: false,
  uploads: false,
  modelProviders: [],
}

function getBrokerUrl(): string | null {
  const base = process.env.FORGE_AUTH_BROKER_URL?.trim()
  if (!base) return null
  const path = process.env.FORGE_AUTH_BROKER_EXCHANGE_PATH || '/oauth/exchange'
  return `${base.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`
}

export function isForgeBrokerConfigured(): boolean {
  return Boolean(getBrokerUrl())
}

function resolveExpiresAt(response: BrokerExchangeResponse): number | null {
  if (typeof response.expires_at === 'number') {
    return response.expires_at
  }
  if (typeof response.expires_in === 'number') {
    return Date.now() + response.expires_in * 1000
  }
  return null
}

function normalizeCapabilities(
  raw: BrokerExchangeResponse['capabilities'],
  identity: IdentityTokens,
): ForgeSessionCapabilities {
  const fallbackProvider: SupportedModelProvider[] =
    identity.provider === 'openai' ? ['openai'] : ['anthropic']
  return {
    ...DEFAULT_CAPABILITIES,
    ...raw,
    modelProviders:
      raw?.modelProviders && raw.modelProviders.length > 0
        ? raw.modelProviders
        : fallbackProvider,
  }
}

function normalizeAccount(
  account: BrokerExchangeResponse['account'] | undefined,
  identity: IdentityTokens,
  userId: string,
): ForgeAccountInfo | undefined {
  const emailAddress = account?.emailAddress ?? identity.email
  if (!emailAddress) {
    return undefined
  }
  return {
    accountUuid: account?.accountUuid ?? identity.subjectId ?? userId,
    emailAddress,
    organizationUuid: account?.organizationUuid,
    organizationName: account?.organizationName ?? null,
    organizationRole: account?.organizationRole ?? null,
    workspaceRole: account?.workspaceRole ?? null,
    displayName: account?.displayName,
    hasExtraUsageEnabled: account?.hasExtraUsageEnabled,
    billingType: account?.billingType,
    accountCreatedAt: account?.accountCreatedAt,
    subscriptionCreatedAt: account?.subscriptionCreatedAt,
  }
}

export async function exchangeIdentityForForgeSession(
  identity: IdentityTokens,
): Promise<ForgeSessionExchangeResult> {
  const url = getBrokerUrl()
  if (!url) {
    throw new Error(
      'Forge OpenAI login requires FORGE_AUTH_BROKER_URL to be configured.',
    )
  }

  const response = await axios.post<BrokerExchangeResponse>(
    url,
    {
      provider: identity.provider,
      access_token: identity.accessToken,
      refresh_token: identity.refreshToken,
      id_token: identity.idToken ?? null,
      expires_at: identity.expiresAt,
      scopes: identity.scopes,
      subject_id: identity.subjectId,
      email: identity.email,
      metadata: identity.metadata,
      audience: process.env.FORGE_AUTH_BROKER_AUDIENCE,
    },
    {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000,
    },
  )

  if (!response.data?.access_token || !response.data?.user_id) {
    throw new Error('Forge broker did not return a usable session.')
  }

  const session: ForgeSession = {
    issuer: 'forge',
    accessToken: response.data.access_token,
    refreshToken: response.data.refresh_token ?? null,
    expiresAt: resolveExpiresAt(response.data),
    userId: response.data.user_id,
    authProvider: identity.provider,
    capabilities: normalizeCapabilities(response.data.capabilities, identity),
    metadata: response.data.metadata,
  }

  return {
    session,
    account: normalizeAccount(response.data.account, identity, session.userId),
  }
}
