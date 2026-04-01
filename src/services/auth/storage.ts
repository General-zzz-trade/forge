import memoize from 'lodash-es/memoize.js'
import { getSecureStorage } from '../../utils/secureStorage/index.js'
import type { SecureStorageData } from '../../utils/secureStorage/types.js'
import type { ForgeSession, IdentityTokens } from './types.js'

function updateSecureStorage(
  updater: (current: SecureStorageData) => SecureStorageData,
): { success: boolean; warning?: string } {
  const secureStorage = getSecureStorage()
  const current = secureStorage.read() || {}
  const updated = updater(current)
  const result = secureStorage.update(updated)
  clearModernAuthCache()
  return result
}

export function saveIdentitySession(
  identity: IdentityTokens,
): { success: boolean; warning?: string } {
  return updateSecureStorage(current => ({
    ...current,
    identityOauth: {
      provider: identity.provider,
      accessToken: identity.accessToken,
      refreshToken: identity.refreshToken,
      expiresAt: identity.expiresAt,
      scopes: identity.scopes,
      idToken: identity.idToken ?? null,
      tokenType: identity.tokenType,
      subjectId: identity.subjectId,
      email: identity.email,
      metadata: identity.metadata,
    },
  }))
}

export function saveForgeSession(
  session: ForgeSession,
): { success: boolean; warning?: string } {
  return updateSecureStorage(current => ({
    ...current,
    forgeSession: {
      issuer: session.issuer,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresAt: session.expiresAt,
      userId: session.userId,
      authProvider: session.authProvider,
      capabilities: session.capabilities,
      metadata: session.metadata,
    },
  }))
}

export const getIdentitySession = memoize((): IdentityTokens | null => {
  const data = getSecureStorage().read()
  return data?.identityOauth ?? null
})

export const getForgeSession = memoize((): ForgeSession | null => {
  const data = getSecureStorage().read()
  return data?.forgeSession ?? null
})

export function clearModernAuthCache(): void {
  getIdentitySession.cache?.clear?.()
  getForgeSession.cache?.clear?.()
}
