/* eslint-disable custom-rules/no-process-exit -- CLI subcommand handler intentionally exits */

import {
  clearAuthRelatedCaches,
  performLogout,
} from '../../commands/logout/logout.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../services/analytics/index.js'
import {
  createAuthProvider,
  isAuthProviderConfigured,
} from '../../services/auth/providers/index.js'
import {
  getForgeSession,
  getIdentitySession,
  saveForgeSession,
  saveIdentitySession,
} from '../../services/auth/storage.js'
import type {
  ForgeAccountInfo,
  IdentityProviderId,
  ProviderLoginResult,
} from '../../services/auth/types.js'
import { getSSLErrorHint } from '../../services/api/errorUtils.js'
import { fetchAndStoreClaudeCodeFirstTokenDate } from '../../services/api/firstTokenDate.js'
import {
  createAndStoreApiKey,
  fetchAndStoreUserRoles,
  refreshOAuthToken,
  shouldUseClaudeAIAuth,
  storeOAuthAccountInfo,
} from '../../services/oauth/client.js'
import { getOauthProfileFromOauthToken } from '../../services/oauth/getOauthProfile.js'
import type { OAuthTokens } from '../../services/oauth/types.js'
import {
  clearOAuthTokenCache,
  getAnthropicApiKeyWithSource,
  getAuthTokenSource,
  getOauthAccountInfo,
  getSubscriptionType,
  isUsing3PServices,
  saveOAuthTokensIfNeeded,
  validateForceLoginOrg,
} from '../../utils/auth.js'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'
import { logForDebugging } from '../../utils/debug.js'
import { isRunningOnHomespace } from '../../utils/envUtils.js'
import { errorMessage } from '../../utils/errors.js'
import { logError } from '../../utils/log.js'
import { getAPIProvider } from '../../utils/model/providers.js'
import { getInitialSettings } from '../../utils/settings/settings.js'
import { jsonStringify } from '../../utils/slowOperations.js'
import {
  buildAccountProperties,
  buildAPIProviderProperties,
} from '../../utils/status.js'

/**
 * Shared post-token-acquisition logic. Saves tokens, fetches profile/roles,
 * and sets up the local auth state.
 */
export async function installOAuthTokens(tokens: OAuthTokens): Promise<void> {
  // Clear old state before saving new credentials
  await performLogout({ clearOnboarding: false })

  // Reuse pre-fetched profile if available, otherwise fetch fresh
  const profile =
    tokens.profile ?? (await getOauthProfileFromOauthToken(tokens.accessToken))
  if (profile) {
    storeOAuthAccountInfo({
      accountUuid: profile.account.uuid,
      emailAddress: profile.account.email,
      organizationUuid: profile.organization.uuid,
      displayName: profile.account.display_name || undefined,
      hasExtraUsageEnabled:
        profile.organization.has_extra_usage_enabled ?? undefined,
      billingType: profile.organization.billing_type ?? undefined,
      subscriptionCreatedAt:
        profile.organization.subscription_created_at ?? undefined,
      accountCreatedAt: profile.account.created_at,
    })
  } else if (tokens.tokenAccount) {
    // Fallback to token exchange account data when profile endpoint fails
    storeOAuthAccountInfo({
      accountUuid: tokens.tokenAccount.uuid,
      emailAddress: tokens.tokenAccount.emailAddress,
      organizationUuid: tokens.tokenAccount.organizationUuid,
    })
  }

  const storageResult = saveOAuthTokensIfNeeded(tokens)
  clearOAuthTokenCache()

  if (storageResult.warning) {
    logEvent('tengu_oauth_storage_warning', {
      warning:
        storageResult.warning as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })
  }

  // Roles and first-token-date may fail for limited-scope tokens (e.g.
  // inference-only from setup-token). They're not required for core auth.
  await fetchAndStoreUserRoles(tokens.accessToken).catch(err =>
    logForDebugging(String(err), { level: 'error' }),
  )

  if (shouldUseClaudeAIAuth(tokens.scopes)) {
    await fetchAndStoreClaudeCodeFirstTokenDate().catch(err =>
      logForDebugging(String(err), { level: 'error' }),
    )
  } else {
    // API key creation is critical for Console users — let it throw.
    const apiKey = await createAndStoreApiKey(tokens.accessToken)
    if (!apiKey) {
      throw new Error(
        'Unable to create API key. The server accepted the request but did not return a key.',
      )
    }
  }

  saveGlobalConfig(current => ({
    ...current,
    authProvider: 'anthropic',
    sessionIssuer: 'anthropic',
  }))

  await clearAuthRelatedCaches()
}

function resolveRequestedProvider({
  openai,
  anthropic,
  useConsole,
  claudeai,
}: {
  openai?: boolean
  anthropic?: boolean
  useConsole?: boolean
  claudeai?: boolean
}): IdentityProviderId {
  if (openai && anthropic) {
    throw new Error('--openai and --anthropic cannot be used together.')
  }
  if (openai && (useConsole || claudeai)) {
    throw new Error(
      '--openai cannot be combined with --console or --claudeai.',
    )
  }
  if (openai) return 'openai'
  if (anthropic || useConsole || claudeai) return 'anthropic'
  return process.env.FORGE_AUTH_PROVIDER === 'openai' ? 'openai' : 'anthropic'
}

function ensureOpenAIAuthReady(): void {
  if (!isAuthProviderConfigured('openai')) {
    throw new Error(
      'OpenAI login requires either an active Codex CLI login (`codex login`) or FORGE_OPENAI_CLIENT_ID to be configured.',
    )
  }
}

function buildFallbackForgeAccount(
  result: Extract<ProviderLoginResult, { kind: 'forge' }>,
): ForgeAccountInfo | undefined {
  if (!result.identity.email) {
    return undefined
  }
  return {
    accountUuid: result.identity.subjectId ?? result.session.userId,
    emailAddress: result.identity.email,
    displayName:
      typeof result.identity.metadata?.name === 'string'
        ? result.identity.metadata.name
        : undefined,
  }
}

async function installForgeLogin(
  result: Extract<ProviderLoginResult, { kind: 'forge' }>,
): Promise<void> {
  await performLogout({ clearOnboarding: false })

  const identityResult = saveIdentitySession(result.identity)
  const sessionResult = saveForgeSession(result.session)
  if (!identityResult.success || !sessionResult.success) {
    throw new Error('Unable to save Forge authentication state.')
  }

  const account = result.account ?? buildFallbackForgeAccount(result)
  saveGlobalConfig(current => ({
    ...current,
    hasCompletedOnboarding: true,
    authProvider: result.provider,
    sessionIssuer: result.session.issuer,
    preferredModelProvider:
      result.session.capabilities.modelProviders[0] ?? 'openai',
    oauthAccount: account ?? current.oauthAccount,
  }))

  await clearAuthRelatedCaches()
}

export async function installAuthLoginResult(
  result: ProviderLoginResult,
): Promise<void> {
  if (result.kind === 'anthropic') {
    await installOAuthTokens(result.tokens)
    return
  }
  await installForgeLogin(result)
}

export async function authLogin({
  email,
  sso,
  console: useConsole,
  claudeai,
  openai,
  anthropic,
}: {
  email?: string
  sso?: boolean
  console?: boolean
  claudeai?: boolean
  openai?: boolean
  anthropic?: boolean
}): Promise<void> {
  if (useConsole && claudeai) {
    process.stderr.write(
      'Error: --console and --claudeai cannot be used together.\n',
    )
    process.exit(1)
  }

  let authProviderId: IdentityProviderId
  try {
    authProviderId = resolveRequestedProvider({
      openai,
      anthropic,
      useConsole,
      claudeai,
    })
  } catch (error) {
    process.stderr.write(`Error: ${errorMessage(error)}\n`)
    process.exit(1)
  }

  if (authProviderId === 'openai') {
    if (useConsole || claudeai || sso) {
      process.stderr.write(
        'Error: --openai does not support --console, --claudeai, or --sso.\n',
      )
      process.exit(1)
    }
    try {
      ensureOpenAIAuthReady()
    } catch (error) {
      process.stderr.write(`Error: ${errorMessage(error)}\n`)
      process.exit(1)
    }
  }

  const settings = getInitialSettings()
  // forceLoginMethod is a hard constraint (enterprise setting) — matches ConsoleOAuthFlow behavior.
  // Without it, --console selects Console; --claudeai (or no flag) selects claude.ai.
  const loginWithClaudeAi = settings.forceLoginMethod
    ? settings.forceLoginMethod === 'claudeai'
    : !useConsole
  const orgUUID = settings.forceLoginOrgUUID

  // Fast path: if a refresh token is provided via env var, skip the browser
  // OAuth flow and exchange it directly for tokens.
  const envRefreshToken = process.env.CLAUDE_CODE_OAUTH_REFRESH_TOKEN
  if (envRefreshToken && authProviderId === 'anthropic') {
    const envScopes = process.env.CLAUDE_CODE_OAUTH_SCOPES
    if (!envScopes) {
      process.stderr.write(
        'CLAUDE_CODE_OAUTH_SCOPES is required when using CLAUDE_CODE_OAUTH_REFRESH_TOKEN.\n' +
          'Set it to the space-separated scopes the refresh token was issued with\n' +
          '(e.g. "user:inference" or "user:profile user:inference user:sessions:claude_code user:mcp_servers").\n',
      )
      process.exit(1)
    }

    const scopes = envScopes.split(/\s+/).filter(Boolean)

    try {
      logEvent('tengu_login_from_refresh_token', {})

      const tokens = await refreshOAuthToken(envRefreshToken, { scopes })
      await installOAuthTokens(tokens)

      const orgResult = await validateForceLoginOrg()
      if (!orgResult.valid) {
        process.stderr.write(orgResult.message + '\n')
        process.exit(1)
      }

      // Mark onboarding complete — interactive paths handle this via
      // the Onboarding component, but the env var path skips it.
      saveGlobalConfig(current => {
        if (current.hasCompletedOnboarding) return current
        return { ...current, hasCompletedOnboarding: true }
      })

      logEvent('tengu_oauth_success', {
        loginWithClaudeAi: shouldUseClaudeAIAuth(tokens.scopes),
      })
      process.stdout.write('Login successful.\n')
      process.exit(0)
    } catch (err) {
      logError(err)
      const sslHint = getSSLErrorHint(err)
      process.stderr.write(
        `Login failed: ${errorMessage(err)}\n${sslHint ? sslHint + '\n' : ''}`,
      )
      process.exit(1)
    }
  }

  const resolvedLoginMethod = sso ? 'sso' : undefined

  const authProvider = createAuthProvider(authProviderId)

  try {
    logEvent('tengu_oauth_flow_start', {
      loginWithClaudeAi,
      provider:
        authProviderId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })

    const result = await authProvider.startInteractiveLogin(
      async url => {
        process.stdout.write('Opening browser to sign in…\n')
        process.stdout.write(`If the browser didn't open, visit: ${url}\n`)
      },
      {
        loginWithClaudeAi,
        loginHint: email,
        loginMethod: resolvedLoginMethod,
        orgUUID,
      },
    )

    if (result.kind === 'anthropic') {
      await installOAuthTokens(result.tokens)

      const orgResult = await validateForceLoginOrg()
      if (!orgResult.valid) {
        process.stderr.write(orgResult.message + '\n')
        process.exit(1)
      }
    } else {
      await installAuthLoginResult(result)
    }

    logEvent('tengu_oauth_success', {
      loginWithClaudeAi,
      provider:
        authProviderId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })

    process.stdout.write('Login successful.\n')
    process.exit(0)
  } catch (err) {
    logError(err)
    const sslHint = getSSLErrorHint(err)
    process.stderr.write(
      `Login failed: ${errorMessage(err)}\n${sslHint ? sslHint + '\n' : ''}`,
    )
    process.exit(1)
  } finally {
    authProvider.cleanup()
  }
}

export async function authStatus(opts: {
  json?: boolean
  text?: boolean
}): Promise<void> {
  const { source: authTokenSource, hasToken } = getAuthTokenSource()
  const { source: apiKeySource } = getAnthropicApiKeyWithSource()
  const hasApiKeyEnvVar =
    !!process.env.ANTHROPIC_API_KEY && !isRunningOnHomespace()
  const config = getGlobalConfig()
  const oauthAccount = getOauthAccountInfo() ?? config.oauthAccount
  const subscriptionType = getSubscriptionType()
  const using3P = isUsing3PServices()
  const forgeSession = getForgeSession()
  const identitySession = getIdentitySession()
  const hasForgeSession = !!forgeSession?.accessToken
  const loggedIn =
    hasForgeSession ||
    hasToken ||
    apiKeySource !== 'none' ||
    hasApiKeyEnvVar ||
    using3P

  // Determine auth method
  let authMethod: string = 'none'
  if (hasForgeSession) {
    authMethod =
      forgeSession.issuer === 'openai' ? 'openai_session' : 'forge_session'
  } else if (using3P) {
    authMethod = 'third_party'
  } else if (authTokenSource === 'claude.ai') {
    authMethod = 'claude.ai'
  } else if (authTokenSource === 'apiKeyHelper') {
    authMethod = 'api_key_helper'
  } else if (authTokenSource !== 'none') {
    authMethod = 'oauth_token'
  } else if (apiKeySource === 'ANTHROPIC_API_KEY' || hasApiKeyEnvVar) {
    authMethod = 'api_key'
  } else if (apiKeySource === '/login managed key') {
    authMethod = 'claude.ai'
  }

  if (opts.text) {
    if (hasForgeSession) {
      const provider =
        identitySession?.provider ??
        config.authProvider ??
        forgeSession.authProvider
      process.stdout.write(`Auth provider: ${provider}\n`)
      process.stdout.write(`Session issuer: ${forgeSession.issuer}\n`)
      if (oauthAccount?.emailAddress) {
        process.stdout.write(`Email: ${oauthAccount.emailAddress}\n`)
      }
      if (oauthAccount?.organizationUuid) {
        process.stdout.write(`Org ID: ${oauthAccount.organizationUuid}\n`)
      }
      if (oauthAccount?.organizationName) {
        process.stdout.write(`Org Name: ${oauthAccount.organizationName}\n`)
      }
      if (forgeSession.capabilities.modelProviders.length > 0) {
        process.stdout.write(
          `Model providers: ${forgeSession.capabilities.modelProviders.join(', ')}\n`,
        )
      }
    } else {
      const properties = [
        ...buildAccountProperties(),
        ...buildAPIProviderProperties(),
      ]
      let hasAuthProperty = false
      for (const prop of properties) {
        const value =
          typeof prop.value === 'string'
            ? prop.value
            : Array.isArray(prop.value)
              ? prop.value.join(', ')
              : null
        if (value === null || value === 'none') {
          continue
        }
        hasAuthProperty = true
        if (prop.label) {
          process.stdout.write(`${prop.label}: ${value}\n`)
        } else {
          process.stdout.write(`${value}\n`)
        }
      }
      if (!hasAuthProperty && hasApiKeyEnvVar) {
        process.stdout.write('API key: ANTHROPIC_API_KEY\n')
      }
    }
    if (!loggedIn) {
      process.stdout.write(
        'Not logged in. Run forge auth login to authenticate.\n',
      )
    }
  } else {
    const apiProvider = getAPIProvider()
    const resolvedApiKeySource =
      apiKeySource !== 'none'
        ? apiKeySource
        : hasApiKeyEnvVar
          ? 'ANTHROPIC_API_KEY'
          : null
    const output: Record<string, string | boolean | null> = {
      loggedIn,
      authMethod,
      apiProvider,
    }
    if (hasForgeSession) {
      output.authProvider =
        identitySession?.provider ??
        config.authProvider ??
        forgeSession.authProvider
      output.sessionIssuer = forgeSession.issuer
      output.modelProvider =
        config.preferredModelProvider ??
        forgeSession.capabilities.modelProviders[0] ??
        null
      output.email = oauthAccount?.emailAddress ?? identitySession?.email ?? null
      output.orgId = oauthAccount?.organizationUuid ?? null
      output.orgName = oauthAccount?.organizationName ?? null
    }
    if (resolvedApiKeySource) {
      output.apiKeySource = resolvedApiKeySource
    }
    if (authMethod === 'claude.ai') {
      output.email = oauthAccount?.emailAddress ?? null
      output.orgId = oauthAccount?.organizationUuid ?? null
      output.orgName = oauthAccount?.organizationName ?? null
      output.subscriptionType = subscriptionType ?? null
    }

    process.stdout.write(jsonStringify(output, null, 2) + '\n')
  }
  process.exit(loggedIn ? 0 : 1)
}

export async function authLogout(): Promise<void> {
  try {
    await performLogout({ clearOnboarding: false })
  } catch {
    process.stderr.write('Failed to log out.\n')
    process.exit(1)
  }
  process.stdout.write('Successfully logged out.\n')
  process.exit(0)
}
