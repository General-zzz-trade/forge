type BidiLevelsResult = {
  levels: number[]
}

type BidiInstance = {
  getEmbeddingLevels: (text: string, _direction?: string) => BidiLevelsResult
}

export default function bidiFactory(): BidiInstance {
  return {
    getEmbeddingLevels(text: string) {
      return {
        levels: Array.from({ length: String(text ?? '').length }, () => 0),
      }
    },
  }
}
