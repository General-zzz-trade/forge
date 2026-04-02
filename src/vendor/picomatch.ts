type PicomatchOptions = {
  dot?: boolean
}

function escapeRegex(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
}

function globToRegex(pattern: string): RegExp {
  let source = ''

  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i]
    const next = pattern[i + 1]

    if (char === '*') {
      if (next === '*') {
        source += '.*'
        i++
      } else {
        source += '[^/]*'
      }
      continue
    }

    if (char === '?') {
      source += '.'
      continue
    }

    source += escapeRegex(char)
  }

  return new RegExp(`^${source}$`)
}

function matchPattern(
  input: string,
  pattern: string,
  options?: PicomatchOptions,
): boolean {
  if (!options?.dot) {
    const basename = input.split('/').at(-1) ?? input
    if (basename.startsWith('.') && !pattern.includes('.')) {
      return false
    }
  }
  return globToRegex(pattern).test(input)
}

type Matcher = ((input: string) => boolean) & {
  isMatch: (input: string) => boolean
}

function picomatch(patterns: string | string[], options?: PicomatchOptions): Matcher {
  const list = Array.isArray(patterns) ? patterns : [patterns]
  const fn = ((input: string) =>
    list.some(pattern => matchPattern(input, pattern, options))) as Matcher
  fn.isMatch = (input: string) => fn(input)
  return fn
}

picomatch.isMatch = (
  input: string,
  patterns: string | string[],
  options?: PicomatchOptions,
): boolean => {
  return picomatch(patterns, options)(input)
}

export default picomatch
