export type SubscriptionType = 'pro' | 'max' | 'team' | 'enterprise'

export type RateLimitTier =
  | 'default_claude_max_5x'
  | 'default_claude_max_20x'
  | (string & {})

export type BillingType =
  | 'stripe_subscription'
  | 'stripe_subscription_contracted'
  | 'apple_subscription'
  | 'google_play_subscription'
  | (string & {})

export type OAuthProfileResponse = {
  account: {
    uuid: string
    email: string
    display_name?: string
    created_at?: string
  }
  organization: {
    uuid: string
    organization_type?: string
    rate_limit_tier?: RateLimitTier | null
    has_extra_usage_enabled?: boolean
    billing_type?: BillingType | null
    subscription_created_at?: string
  }
}

export type OAuthTokenExchangeResponse = {
  access_token: string
  refresh_token?: string
  expires_in: number
  scope?: string
  token_type?: string
  account?: {
    uuid: string
    email_address: string
  }
  organization?: {
    uuid: string
  }
}

export type OAuthTokens = {
  accessToken: string
  refreshToken: string | null
  expiresAt: number | null
  scopes: string[]
  subscriptionType: SubscriptionType | null
  rateLimitTier: RateLimitTier | null
  profile?: OAuthProfileResponse
  tokenAccount?: {
    uuid: string
    emailAddress: string
    organizationUuid?: string
  }
}

export type UserRolesResponse = {
  organization_role?: string | null
  workspace_role?: string | null
  organization_name?: string | null
}

export type ReferralCampaign = 'claude_code_guest_pass' | (string & {})

export type ReferrerRewardInfo = {
  amount_minor_units: number
  currency: string
}

export type ReferralEligibilityResponse = {
  eligible: boolean
  remaining_passes?: number
  max_passes?: number
  campaign?: ReferralCampaign
  referrer_reward?: ReferrerRewardInfo | null
  [key: string]: unknown
}

export type ReferralRedemptionsResponse = {
  redemptions?: Array<Record<string, unknown>>
  [key: string]: unknown
}
