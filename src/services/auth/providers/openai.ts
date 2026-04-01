import axios from 'axios'
import { openBrowser } from '../../../utils/browser.js'
import { AuthCodeListener } from '../../oauth/auth-code-listener.js'
import {
  generateCodeChallenge,
  generateCodeVerifier,
  generateState,
} from '../../oauth/crypto.js'
import { hasCodexCliOpenAIAuth, readCodexCliIdentityTokens } from './codexCli.js'
import type {
  AuthProvider,
  AuthProviderOptions,
  BrowserAuthUrlHandler,
  ForgeSession,
  IdentityTokens,
  ProviderLoginResult,
} from '../types.js'

type OpenAIOidcMetadata = {
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  userinfo_endpoint?: string
}

type OpenAITokenResponse = {
  access_token: string
  refresh_token?: string
  expires_in?: number
  id_token?: string
  scope?: string
  token_type?: string
}

type OpenAIUserInfo = {
  sub: string
  email?: string
  name?: string
  picture?: string
}

function getRedirectUri(): URL {
  const raw = process.env.FORGE_OPENAI_REDIRECT_URI || 'http://localhost:1455/callback'
  const parsed = new URL(raw)
  if (parsed.hostname !== 'localhost') {
    throw new Error(
      'FORGE_OPENAI_REDIRECT_URI must use localhost so Forge can receive the callback.',
    )
  }
  if (!parsed.port) {
    throw new Error(
      'FORGE_OPENAI_REDIRECT_URI must include an explicit localhost port.',
    )
  }
  return parsed
}

function getScopes(inferenceOnly?: boolean): string[] {
  const raw =
    process.env.FORGE_OPENAI_SCOPES || 'openid profile email offline_access'
  const scopes = raw.split(/\s+/).filter(Boolean)
  if (inferenceOnly) {
    return scopes.filter(scope => scope !== 'offline_access')
  }
  return scopes
}

async function discoverOpenAIOidcMetadata(): Promise<OpenAIOidcMetadata> {
  const issuer =
    process.env.FORGE_OPENAI_ISSUER?.replace(/\/$/, '') ||
    'https://auth.openai.com'
  const wellKnown = `${issuer}/.well-known/openid-configuration`
  const response = await axios.get<OpenAIOidcMetadata>(wellKnown, {
    timeout: 15000,
  })
  return {
    issuer: response.data.issuer,
    authorization_endpoint:
      process.env.FORGE_OPENAI_AUTHORIZATION_ENDPOINT ||
      response.data.authorization_endpoint,
    token_endpoint:
      process.env.FORGE_OPENAI_TOKEN_ENDPOINT || response.data.token_endpoint,
    userinfo_endpoint:
      process.env.FORGE_OPENAI_USERINFO_ENDPOINT ||
      response.data.userinfo_endpoint,
  }
}

function buildAuthUrl(params: {
  metadata: OpenAIOidcMetadata
  redirectUri: string
  codeChallenge: string
  state: string
  loginHint?: string
  scopes: string[]
}): string {
  const url = new URL(params.metadata.authorization_endpoint)
  url.searchParams.append('client_id', process.env.FORGE_OPENAI_CLIENT_ID || '')
  url.searchParams.append('response_type', 'code')
  url.searchParams.append('redirect_uri', params.redirectUri)
  url.searchParams.append('scope', params.scopes.join(' '))
  url.searchParams.append('code_challenge', params.codeChallenge)
  url.searchParams.append('code_challenge_method', 'S256')
  url.searchParams.append('state', params.state)
  if (params.loginHint) {
    url.searchParams.append('login_hint', params.loginHint)
  }
  if (process.env.FORGE_OPENAI_AUDIENCE) {
    url.searchParams.append('audience', process.env.FORGE_OPENAI_AUDIENCE)
  }
  return url.toString()
}

async function exchangeCodeForTokens(params: {
  metadata: OpenAIOidcMetadata
  authorizationCode: string
  redirectUri: string
  codeVerifier: string
}): Promise<OpenAITokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.authorizationCode,
    redirect_uri: params.redirectUri,
    client_id: process.env.FORGE_OPENAI_CLIENT_ID || '',
    code_verifier: params.codeVerifier,
  })

  if (process.env.FORGE_OPENAI_CLIENT_SECRET) {
    body.append('client_secret', process.env.FORGE_OPENAI_CLIENT_SECRET)
  }

  const response = await axios.post<OpenAITokenResponse>(
    params.metadata.token_endpoint,
    body.toString(),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 15000,
    },
  )
  return response.data
}

async function fetchUserInfo(
  metadata: OpenAIOidcMetadata,
  accessToken: string,
): Promise<OpenAIUserInfo | undefined> {
  if (!metadata.userinfo_endpoint) {
    return undefined
  }

  const response = await axios.get<OpenAIUserInfo>(metadata.userinfo_endpoint, {
    headers: { Authorization: `Bearer ${accessToken}` },
    timeout: 10000,
  })
  return response.data
}

function buildIdentityTokens(
  tokenResponse: OpenAITokenResponse,
  profile: OpenAIUserInfo | undefined,
  scopes: string[],
  metadata: OpenAIOidcMetadata,
): IdentityTokens {
  return {
    provider: 'openai',
    accessToken: tokenResponse.access_token,
    refreshToken: tokenResponse.refresh_token ?? null,
    expiresAt: tokenResponse.expires_in
      ? Date.now() + tokenResponse.expires_in * 1000
      : null,
    scopes:
      tokenResponse.scope?.split(/\s+/).filter(Boolean).length
        ? tokenResponse.scope.split(/\s+/).filter(Boolean)
        : scopes,
    idToken: tokenResponse.id_token ?? null,
    tokenType: tokenResponse.token_type,
    subjectId: profile?.sub,
    email: profile?.email,
    metadata: {
      issuer: metadata.issuer,
      name: profile?.name,
      picture: profile?.picture,
    },
  }
}

function buildNativeOpenAISession(identity: IdentityTokens): ForgeSession {
  return {
    issuer: 'openai',
    accessToken: identity.accessToken,
    refreshToken: identity.refreshToken,
    expiresAt: identity.expiresAt,
    userId: identity.subjectId ?? identity.email ?? 'openai-user',
    authProvider: 'openai',
    capabilities: {
      profile: false,
      roles: false,
      bootstrap: false,
      mcpProxy: false,
      uploads: false,
      modelProviders: ['openai'],
    },
    metadata: {
      ...identity.metadata,
      sessionSource:
        typeof identity.metadata?.source === 'string'
          ? identity.metadata.source
          : 'openai_oauth',
    },
  }
}

function respondWithHtml(listener: AuthCodeListener, body: string): void {
  listener.handleSuccessRedirect([], res => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(body)
  })
}

export function isOpenAIAuthConfigured(): boolean {
  return hasCodexCliOpenAIAuth() || Boolean(process.env.FORGE_OPENAI_CLIENT_ID)
}

export class OpenAIAuthProvider implements AuthProvider {
  readonly id = 'openai' as const
  readonly displayName = 'OpenAI'
  private readonly codeVerifier = generateCodeVerifier()
  private authCodeListener: AuthCodeListener | null = null

  isConfigured(): boolean {
    return isOpenAIAuthConfigured()
  }

  async startInteractiveLogin(
    authURLHandler: BrowserAuthUrlHandler,
    options?: AuthProviderOptions,
  ): Promise<ProviderLoginResult> {
    const codexIdentity = readCodexCliIdentityTokens()
    if (codexIdentity) {
      return {
        kind: 'forge',
        provider: 'openai',
        identity: codexIdentity,
        session: buildNativeOpenAISession(codexIdentity),
      }
    }

    if (!process.env.FORGE_OPENAI_CLIENT_ID) {
      throw new Error(
        'OpenAI login requires either an active Codex CLI login (`codex login`) or FORGE_OPENAI_CLIENT_ID to be configured.',
      )
    }

    const redirectUri = getRedirectUri()
    const metadata = await discoverOpenAIOidcMetadata()
    const state = generateState()
    const codeChallenge = generateCodeChallenge(this.codeVerifier)
    const scopes = getScopes(options?.inferenceOnly)

    this.authCodeListener = new AuthCodeListener(redirectUri.pathname)
    await this.authCodeListener.start(Number.parseInt(redirectUri.port, 10))

    const authUrl = buildAuthUrl({
      metadata,
      redirectUri: redirectUri.toString(),
      codeChallenge,
      state,
      loginHint: options?.loginHint,
      scopes,
    })

    const authorizationCode = await new Promise<string>((resolve, reject) => {
      this.authCodeListener
        ?.waitForAuthorization(state, async () => {
          await authURLHandler(authUrl)
          if (!options?.skipBrowserOpen) {
            await openBrowser(authUrl)
          }
        })
        .then(resolve)
        .catch(reject)
    })

    try {
      const tokenResponse = await exchangeCodeForTokens({
        metadata,
        authorizationCode,
        redirectUri: redirectUri.toString(),
        codeVerifier: this.codeVerifier,
      })
      const profile = await fetchUserInfo(
        metadata,
        tokenResponse.access_token,
      ).catch(() => undefined)
      const identity = buildIdentityTokens(
        tokenResponse,
        profile,
        scopes,
        metadata,
      )
      respondWithHtml(
        this.authCodeListener,
        '<html><body><h1>Forge login complete</h1><p>You can return to Forge.</p></body></html>',
      )
      return {
        kind: 'forge',
        provider: 'openai',
        identity,
        session: buildNativeOpenAISession(identity),
      }
    } catch (error) {
      if (this.authCodeListener?.hasPendingResponse()) {
        this.authCodeListener.handleErrorRedirect(res => {
          res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(
            '<html><body><h1>Forge login failed</h1><p>Return to Forge for details.</p></body></html>',
          )
        })
      }
      throw error
    } finally {
      this.authCodeListener?.close()
    }
  }

  cleanup(): void {
    this.authCodeListener?.close()
  }
}
