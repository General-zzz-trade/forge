export const SKILL_MODEL_VARS = {
  OPUS_ID: 'claude-opus-4-6',
  OPUS_NAME: 'Claude Opus 4.6',
  SONNET_ID: 'claude-sonnet-4-6',
  SONNET_NAME: 'Claude Sonnet 4.6',
  HAIKU_ID: 'claude-haiku-4-5',
  HAIKU_NAME: 'Claude Haiku 4.5',
  PREV_SONNET_ID: 'claude-sonnet-4-5',
} satisfies Record<string, string>

export const SKILL_PROMPT = `# Claude API

Use this skill when the user is integrating Anthropic models or the Claude API.

Focus on practical implementation guidance:

- choosing the right request shape
- tool use and structured outputs
- streaming and retries
- prompt caching and context management

## Reading Guide

Read the shared references below first, then answer with implementation-oriented guidance.

## When to Use WebFetch

Use WebFetch when the user needs the newest model list, pricing, release notes, or a recently changed SDK surface.
`

export const SKILL_FILES: Record<string, string> = {
  'shared/models.md': `# Models

Model selection guidance:

- Use the fastest model that still meets quality needs.
- Keep the model name configurable rather than hard-coding it deep in business logic.
- Treat context window and output token limits as first-class constraints.

If the user asks for the newest or exact currently available models, fetch current official docs instead of relying on this bundled reference.
`,
  'shared/error-codes.md': `# Errors and retries

Handle these classes explicitly:

- authentication and permission failures
- validation errors from malformed request bodies
- transient network failures
- rate limits and overload

Retry only idempotent requests, cap retries, and surface actionable diagnostics to the user.
`,
  'shared/tool-use-concepts.md': `# Tool use concepts

When using tool calling:

- keep tool names stable
- define a strict, minimal input schema
- validate tool results before feeding them back to the model
- separate tool execution failures from model failures

For structured outputs, define the schema at the boundary and validate before downstream use.
`,
}
