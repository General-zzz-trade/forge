import { readFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { IdentityTokens } from '../types.js'

type CodexAuthFile = {
  auth_mode?: string
  OPENAI_API_KEY?: string | null
  last_refresh?: string
  tokens?: {
    access_token?: string
    refresh_token?: string
    id_token?: string
    account_id?: string
  }
}

type JwtPayload = Record<string, unknown> & {
  exp?: number
  sub?: string
  iss?: string
  email?: string
  name?: string
  scope?: string
  scp?: string[]
}

function decodeJwtPayload(token: string): JwtPayload | null {
  const parts = token.split('.')
  if (parts.length < 2 || !parts[1]) {
    return null
  }

  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'))
  } catch {
    return null
  }
}

function normalizeScopes(payload: JwtPayload | null): string[] {
  if (!payload) {
    return []
  }
  if (Array.isArray(payload.scp)) {
    return payload.scp.filter((value): value is string => typeof value === 'string')
  }
  if (typeof payload.scope === 'string') {
    return payload.scope.split(/\s+/).filter(Boolean)
  }
  return []
}

export function getCodexAuthFilePath(): string {
  return join(homedir(), '.codex', 'auth.json')
}

export function readCodexCliIdentityTokens(): IdentityTokens | null {
  let authFile: CodexAuthFile
  try {
    authFile = JSON.parse(readFileSync(getCodexAuthFilePath(), 'utf-8'))
  } catch {
    return null
  }

  if (authFile.auth_mode !== 'chatgpt') {
    return null
  }

  const oauthAccessToken = authFile.tokens?.access_token
  const apiKey =
    typeof authFile.OPENAI_API_KEY === 'string' &&
    authFile.OPENAI_API_KEY.trim().length > 0
      ? authFile.OPENAI_API_KEY.trim()
      : null

  if (!oauthAccessToken && !apiKey) {
    return null
  }

  const accessClaims = oauthAccessToken
    ? decodeJwtPayload(oauthAccessToken)
    : null
  const idClaims = authFile.tokens?.id_token
    ? decodeJwtPayload(authFile.tokens.id_token)
    : null

  const expiresAtSeconds =
    typeof accessClaims?.exp === 'number'
      ? accessClaims.exp
      : typeof idClaims?.exp === 'number'
        ? idClaims.exp
        : null
  const expiresAt = expiresAtSeconds ? expiresAtSeconds * 1000 : null

  if (expiresAt && expiresAt <= Date.now()) {
    return null
  }

  const usesApiKey = apiKey !== null
  const scopes = normalizeScopes(accessClaims)
  const hasResponsesApiAccess =
    usesApiKey || scopes.includes('api.responses.write')

  const profile =
    accessClaims?.['https://api.openai.com/profile'] &&
    typeof accessClaims['https://api.openai.com/profile'] === 'object'
      ? (accessClaims['https://api.openai.com/profile'] as Record<string, unknown>)
      : null
  const auth =
    accessClaims?.['https://api.openai.com/auth'] &&
    typeof accessClaims['https://api.openai.com/auth'] === 'object'
      ? (accessClaims['https://api.openai.com/auth'] as Record<string, unknown>)
      : null

  const email =
    (typeof idClaims?.email === 'string' && idClaims.email) ||
    (typeof profile?.email === 'string' && profile.email) ||
    undefined
  const subjectId =
    (typeof idClaims?.sub === 'string' && idClaims.sub) ||
    (typeof accessClaims?.sub === 'string' && accessClaims.sub) ||
    (typeof auth?.user_id === 'string' && auth.user_id) ||
    undefined

  return {
    provider: 'openai',
    accessToken: apiKey ?? oauthAccessToken!,
    refreshToken: usesApiKey ? null : (authFile.tokens?.refresh_token ?? null),
    expiresAt,
    scopes,
    idToken: authFile.tokens?.id_token ?? null,
    tokenType: 'Bearer',
    subjectId,
    email,
    metadata: {
      issuer:
        (typeof idClaims?.iss === 'string' && idClaims.iss) ||
        (typeof accessClaims?.iss === 'string' && accessClaims.iss) ||
        undefined,
      name: typeof idClaims?.name === 'string' ? idClaims.name : undefined,
      source: 'codex_cli',
      authMode: authFile.auth_mode,
      accountId: authFile.tokens?.account_id,
      lastRefresh: authFile.last_refresh,
      credentialKind: usesApiKey ? 'api_key' : 'oauth_access_token',
      hasResponsesApiAccess,
      chatgptPlanType:
        typeof auth?.chatgpt_plan_type === 'string'
          ? auth.chatgpt_plan_type
          : undefined,
    },
  }
}

export function hasCodexCliOpenAIAuth(): boolean {
  return readCodexCliIdentityTokens() !== null
}
