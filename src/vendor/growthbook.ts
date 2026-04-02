type GrowthBookPayload = {
  features?: Record<string, unknown>
  [key: string]: unknown
}

type GrowthBookInitResult = {
  success: boolean
  source: string
}

export class GrowthBook {
  #payload: GrowthBookPayload = {}

  constructor(_options?: Record<string, unknown>) {}

  async init(_options?: Record<string, unknown>): Promise<GrowthBookInitResult> {
    return { success: false, source: 'forge-vendor-shim' }
  }

  async refreshFeatures(): Promise<void> {}

  async setPayload(payload: GrowthBookPayload): Promise<void> {
    this.#payload = payload ?? {}
  }

  getPayload(): GrowthBookPayload {
    return this.#payload
  }

  getFeatures(): Record<string, unknown> | undefined {
    return this.#payload.features
  }

  getFeatureValue<T>(feature: string, defaultValue: T): T {
    const features = this.#payload.features
    const entry = features?.[feature] as
      | { value?: T; defaultValue?: T }
      | undefined

    if (entry && typeof entry === 'object') {
      if ('value' in entry && entry.value !== undefined) {
        return entry.value
      }
      if ('defaultValue' in entry && entry.defaultValue !== undefined) {
        return entry.defaultValue
      }
    }

    return defaultValue
  }

  destroy(): void {}
}
