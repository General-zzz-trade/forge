#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const DEFAULT_REDIRECT_URI = 'http://localhost:1455/callback'
const DEFAULT_ISSUER = 'https://auth.openai.com'
const RECOMMENDED_ENV_VARS = ['FORGE_OPENAI_CLIENT_SECRET']

function ok(label, detail = '') {
  process.stdout.write(`OK   ${label}${detail ? `: ${detail}` : ''}\n`)
}

function warn(label, detail = '') {
  process.stdout.write(`WARN ${label}${detail ? `: ${detail}` : ''}\n`)
}

function fail(label, detail = '') {
  process.stdout.write(`FAIL ${label}${detail ? `: ${detail}` : ''}\n`)
}

function summarizeList(values) {
  return values.length > 0 ? values.join(', ') : 'none'
}

function getRedirectUri() {
  return process.env.FORGE_OPENAI_REDIRECT_URI || DEFAULT_REDIRECT_URI
}

function decodeJwtPayload(token) {
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

function getCodexAuthPath() {
  return join(homedir(), '.codex', 'auth.json')
}

function readCodexAuthSummary() {
  try {
    const parsed = JSON.parse(readFileSync(getCodexAuthPath(), 'utf-8'))
    if (parsed?.auth_mode !== 'chatgpt') {
      return {
        source: 'codex_cli',
        usable: false,
        reason:
          'Codex CLI is not using ChatGPT login. Run `codex login` instead of `codex login --with-api-key`.',
      }
    }
    const apiKey =
      typeof parsed?.OPENAI_API_KEY === 'string' &&
      parsed.OPENAI_API_KEY.trim().length > 0
        ? parsed.OPENAI_API_KEY.trim()
        : null
    if (!parsed?.tokens?.access_token && !apiKey) {
      return {
        source: 'codex_cli',
        usable: false,
        reason: 'Codex CLI auth.json is missing both an access token and an API key.',
      }
    }
    const claims = parsed?.tokens?.access_token
      ? decodeJwtPayload(parsed.tokens.access_token)
      : null
    const expiresAt =
      typeof claims?.exp === 'number' ? claims.exp * 1000 : null
    if (expiresAt && expiresAt <= Date.now()) {
      return {
        source: 'codex_cli',
        usable: false,
        reason: 'Codex CLI access token is expired.',
      }
    }
    const scopes = Array.isArray(claims?.scp)
      ? claims.scp.filter(value => typeof value === 'string')
      : typeof claims?.scope === 'string'
        ? claims.scope.split(/\s+/).filter(Boolean)
        : []
    return {
      source: 'codex_cli',
      usable: true,
      reason: `loaded from ${getCodexAuthPath()}`,
      credentialKind: apiKey ? 'api_key' : 'oauth_access_token',
      hasResponsesApiAccess: Boolean(apiKey) || scopes.includes('api.responses.write'),
    }
  } catch {
    return null
  }
}

function getIssuer() {
  return (process.env.FORGE_OPENAI_ISSUER || DEFAULT_ISSUER).replace(/\/$/, '')
}

function getBrokerExchangeUrl() {
  const base = process.env.FORGE_AUTH_BROKER_URL?.trim()
  if (!base) return null
  const path = process.env.FORGE_AUTH_BROKER_EXCHANGE_PATH || '/oauth/exchange'
  return `${base.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`
}

function getApiBootstrapUrl() {
  const base =
    process.env.FORGE_API_BASE_URL?.trim() ||
    process.env.CLAUDE_CODE_API_BASE_URL?.trim()
  if (!base) return null
  return `${base.replace(/\/$/, '')}/api/claude_cli/bootstrap`
}

function validateRedirectUri(raw) {
  try {
    const parsed = new URL(raw)
    const errors = []
    if (parsed.protocol !== 'http:') {
      errors.push('must use http:// for localhost callback handling')
    }
    if (parsed.hostname !== 'localhost') {
      errors.push('hostname must be localhost')
    }
    if (!parsed.port) {
      errors.push('must include an explicit localhost port')
    }
    if (errors.length > 0) {
      return { valid: false, detail: errors.join('; ') }
    }
    return { valid: true, detail: parsed.toString() }
  } catch (error) {
    return {
      valid: false,
      detail: error instanceof Error ? error.message : 'invalid URL',
    }
  }
}

async function fetchJson(url, timeoutMs = 15000) {
  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  })
  const text = await response.text()
  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    body: text,
  }
}

async function probeUrl(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: options.headers || {},
    signal: AbortSignal.timeout(options.timeoutMs || 10000),
  })
  return {
    status: response.status,
    statusText: response.statusText,
  }
}

async function main() {
  let failures = 0

  process.stdout.write('OpenAI OAuth preflight for Forge\n\n')

  const codexAuth = readCodexAuthSummary()
  const hasBrowserOAuthConfig = Boolean(process.env.FORGE_OPENAI_CLIENT_ID)
  const missingRecommended = hasBrowserOAuthConfig
    ? RECOMMENDED_ENV_VARS.filter(name => !process.env[name])
    : []

  if (codexAuth?.usable) {
    ok(
      'OpenAI auth source',
      `${codexAuth.reason} (${codexAuth.credentialKind})`,
    )
    if (!codexAuth.hasResponsesApiAccess) {
      warn(
        'Codex CLI credential scope',
        'login import will work, but native model requests will fail without Responses API access (missing api.responses.write or Codex-provided API key)',
      )
    }
  } else if (hasBrowserOAuthConfig) {
    ok('OpenAI auth source', 'FORGE_OPENAI_CLIENT_ID is configured')
  } else {
    failures += 1
    fail(
      'OpenAI auth source',
      codexAuth?.reason
        ? `${codexAuth.reason} Need either an active Codex CLI login (\`codex login\`) or FORGE_OPENAI_CLIENT_ID.`
        : 'need either an active Codex CLI login (`codex login`) or FORGE_OPENAI_CLIENT_ID',
    )
  }

  if (!hasBrowserOAuthConfig) {
    ok('recommended env vars', 'browser OAuth client not in use')
  } else if (missingRecommended.length === 0) {
    ok('recommended env vars', summarizeList(RECOMMENDED_ENV_VARS))
  } else {
    warn(
      'recommended env vars',
      `missing ${summarizeList(missingRecommended)}`,
    )
  }

  const redirectUri = getRedirectUri()
  const redirectCheck = validateRedirectUri(redirectUri)
  if (redirectCheck.valid) {
    ok('redirect URI', redirectCheck.detail)
  } else {
    failures += 1
    fail('redirect URI', `${redirectUri} (${redirectCheck.detail})`)
  }

  const issuer = getIssuer()
  try {
    const metadata = await fetchJson(`${issuer}/.well-known/openid-configuration`)
    if (!metadata.ok) {
      failures += 1
      fail(
        'OpenAI OIDC discovery',
        `${metadata.status} ${metadata.statusText}`,
      )
    } else {
      const parsed = JSON.parse(metadata.body)
      ok('OpenAI OIDC discovery', `${parsed.issuer || issuer}`)
      process.stdout.write(
        `     authorization_endpoint=${parsed.authorization_endpoint}\n`,
      )
      process.stdout.write(`     token_endpoint=${parsed.token_endpoint}\n`)
      process.stdout.write(`     userinfo_endpoint=${parsed.userinfo_endpoint}\n`)
    }
  } catch (error) {
    failures += 1
    fail(
      'OpenAI OIDC discovery',
      error instanceof Error ? error.message : 'request failed',
    )
  }

  const brokerExchangeUrl = getBrokerExchangeUrl()
  if (!brokerExchangeUrl) {
    warn(
      'broker endpoint',
      'FORGE_AUTH_BROKER_URL is not configured; direct OpenAI login is still allowed',
    )
  } else {
    try {
      const result = await probeUrl(brokerExchangeUrl, { method: 'GET' })
      if ([200, 204, 400, 401, 403, 405].includes(result.status)) {
        ok(
          'broker endpoint reachable',
          `${brokerExchangeUrl} -> ${result.status} ${result.statusText}`,
        )
      } else {
        warn(
          'broker endpoint probe',
          `${brokerExchangeUrl} -> ${result.status} ${result.statusText}`,
        )
      }
    } catch (error) {
      failures += 1
      fail(
        'broker endpoint reachable',
        error instanceof Error ? error.message : 'request failed',
      )
    }
  }

  const bootstrapUrl = getApiBootstrapUrl()
  if (!bootstrapUrl) {
    warn(
      'API bootstrap URL',
      'FORGE_API_BASE_URL or CLAUDE_CODE_API_BASE_URL is not configured; native OpenAI login now skips bootstrap',
    )
  } else {
    try {
      const result = await probeUrl(bootstrapUrl, {
        method: 'GET',
        headers: { Authorization: 'Bearer preflight_dummy_token' },
      })
      if ([200, 401, 403].includes(result.status)) {
        ok(
          'API bootstrap endpoint reachable',
          `${bootstrapUrl} -> ${result.status} ${result.statusText}`,
        )
      } else {
        warn(
          'API bootstrap probe',
          `${bootstrapUrl} -> ${result.status} ${result.statusText}`,
        )
      }
    } catch (error) {
      failures += 1
      fail(
        'API bootstrap endpoint reachable',
        error instanceof Error ? error.message : 'request failed',
      )
    }
  }

  process.stdout.write('\n')
  if (failures === 0) {
    ok(
      'preflight summary',
      hasBrowserOAuthConfig && !codexAuth?.usable
        ? 'environment is ready for browser-based OpenAI login'
        : codexAuth?.usable && !codexAuth.hasResponsesApiAccess
          ? 'Codex CLI login can be imported, but native OpenAI model requests still need a Responses-capable credential'
          : 'environment is ready to reuse Codex CLI login directly',
    )
    process.stdout.write('Next step: forge auth login --openai\n')
    process.exitCode = 0
    return
  }

  fail('preflight summary', `${failures} blocking check(s) failed`)
  process.stdout.write(
    'Load .env.openai.example, run `codex login`, or fill the missing real OpenAI settings.\n',
  )
  process.exitCode = 1
}

main().catch(error => {
  fail(
    'preflight crashed',
    error instanceof Error ? error.stack || error.message : String(error),
  )
  process.exitCode = 1
})
