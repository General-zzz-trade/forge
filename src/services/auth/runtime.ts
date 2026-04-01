import { getOauthConfig } from '../../constants/oauth.js'
import { getGlobalConfig } from '../../utils/config.js'
import { getForgeSession } from './storage.js'
import type {
  ForgeSession,
  SupportedModelProvider,
} from './types.js'

function normalizeBaseUrl(baseUrl: string | null | undefined): string | null {
  const trimmed = baseUrl?.trim()
  return trimmed ? trimmed.replace(/\/$/, '') : null
}

export function getActiveForgeSession(): ForgeSession | null {
  const session = getForgeSession()
  if (!session?.accessToken) {
    return null
  }

  const configuredIssuer = getGlobalConfig().sessionIssuer
  if (configuredIssuer && configuredIssuer !== session.issuer) {
    return null
  }

  return session
}

export function isUsingForgeSession(): boolean {
  return getActiveForgeSession() !== null
}

export function isUsingNativeOpenAISession(): boolean {
  return getActiveForgeSession()?.issuer === 'openai'
}

export function isUsingBrokeredForgeSession(): boolean {
  return getActiveForgeSession()?.issuer === 'forge'
}

export function getForgeApiBaseUrl(): string | null {
  return normalizeBaseUrl(
    process.env.FORGE_API_BASE_URL || process.env.CLAUDE_CODE_API_BASE_URL,
  )
}

export function requireForgeApiBaseUrl(): string {
  const baseUrl = getForgeApiBaseUrl()
  if (!baseUrl) {
    throw new Error(
      'Forge session requires FORGE_API_BASE_URL or CLAUDE_CODE_API_BASE_URL to be configured.',
    )
  }
  return baseUrl
}

export function getAuthenticatedApiBaseUrl(): string | null {
  const session = getActiveForgeSession()
  if (session?.issuer === 'forge') {
    return getForgeApiBaseUrl()
  }
  if (session?.issuer === 'openai') {
    return null
  }

  return normalizeBaseUrl(getOauthConfig().BASE_API_URL)
}

export function requireAuthenticatedApiBaseUrl(): string {
  const baseUrl = getAuthenticatedApiBaseUrl()
  if (!baseUrl) {
    if (isUsingNativeOpenAISession()) {
      throw new Error(
        'Native OpenAI sessions do not use Forge or Anthropic first-party API endpoints.',
      )
    }
    throw new Error(
      'No authenticated API base URL is configured for the current session.',
    )
  }
  return baseUrl
}

export function getPreferredForgeModelProvider(): SupportedModelProvider | null {
  const config = getGlobalConfig()
  if (config.preferredModelProvider) {
    return config.preferredModelProvider
  }

  return getActiveForgeSession()?.capabilities.modelProviders[0] ?? null
}
