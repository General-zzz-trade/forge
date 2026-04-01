import type { AuthProvider, IdentityProviderId } from '../types.js'
import { AnthropicAuthProvider } from './anthropic.js'
import { isOpenAIAuthConfigured, OpenAIAuthProvider } from './openai.js'

export function createAuthProvider(providerId: IdentityProviderId): AuthProvider {
  switch (providerId) {
    case 'openai':
      return new OpenAIAuthProvider()
    case 'anthropic':
    default:
      return new AnthropicAuthProvider()
  }
}

export function isAuthProviderConfigured(
  providerId: IdentityProviderId,
): boolean {
  switch (providerId) {
    case 'openai':
      return isOpenAIAuthConfigured()
    case 'anthropic':
    default:
      return true
  }
}
