import { OAuthService } from '../../oauth/index.js'
import type { AuthProvider, AuthProviderOptions, BrowserAuthUrlHandler, ProviderLoginResult } from '../types.js'

export class AnthropicAuthProvider implements AuthProvider {
  readonly id = 'anthropic' as const
  readonly displayName = 'Anthropic'
  private readonly oauthService = new OAuthService()

  isConfigured(): boolean {
    return true
  }

  async startInteractiveLogin(
    authURLHandler: BrowserAuthUrlHandler,
    options?: AuthProviderOptions,
  ): Promise<ProviderLoginResult> {
    const tokens = await this.oauthService.startOAuthFlow(authURLHandler, {
      loginWithClaudeAi: options?.loginWithClaudeAi,
      inferenceOnly: options?.inferenceOnly,
      expiresIn: options?.expiresIn,
      orgUUID: options?.orgUUID,
      loginHint: options?.loginHint,
      loginMethod: options?.loginMethod,
      skipBrowserOpen: options?.skipBrowserOpen,
    })
    return {
      kind: 'anthropic',
      tokens,
    }
  }

  cleanup(): void {
    this.oauthService.cleanup()
  }
}
