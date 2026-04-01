import type {
  BetaContentBlock,
  BetaJSONOutputFormat,
  BetaMessageParam,
  BetaStopReason,
  BetaToolChoiceAuto,
  BetaToolChoiceTool,
  BetaToolUnion,
  BetaUsage,
} from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import type { ClientOptions } from '@anthropic-ai/sdk'
import { spawn } from 'child_process'
import { randomUUID } from 'crypto'
import { mkdtemp, readFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import type { AssistantMessage } from 'src/types/message.js'
import { getActiveForgeSession } from 'src/services/auth/runtime.js'
import { logForDebugging } from 'src/utils/debug.js'
import { safeParseJSON } from 'src/utils/json.js'
import { createAssistantMessage } from 'src/utils/messages.js'
import { jsonStringify } from 'src/utils/slowOperations.js'
import { getClaudeCodeUserAgent } from 'src/utils/userAgent.js'

type OpenAIInputText = {
  type: 'input_text'
  text: string
}

type OpenAIMessageItem = {
  type: 'message'
  role: 'user' | 'assistant'
  content: string | OpenAIInputText[]
}

type OpenAIFunctionCallItem = {
  type: 'function_call'
  call_id: string
  name: string
  arguments: string
}

type OpenAIFunctionCallOutputItem = {
  type: 'function_call_output'
  call_id: string
  output: string
}

type OpenAIInputItem =
  | OpenAIMessageItem
  | OpenAIFunctionCallItem
  | OpenAIFunctionCallOutputItem

type OpenAIFunctionTool = {
  type: 'function'
  name: string
  description?: string
  parameters: Record<string, unknown>
  strict?: boolean
}

type OpenAIToolChoice =
  | 'none'
  | 'auto'
  | {
      type: 'function'
      name: string
    }

type OpenAIResponseOutputText = {
  type: 'output_text'
  text: string
}

type OpenAIResponseOutputMessage = {
  type: 'message'
  id?: string
  role: 'assistant'
  content?: OpenAIResponseOutputText[]
}

type OpenAIResponseFunctionCall = {
  type: 'function_call'
  id?: string
  call_id: string
  name: string
  arguments: string
}

type OpenAIResponsePayload = {
  id?: string
  model?: string
  error?: {
    code?: string
    message?: string
  } | null
  incomplete_details?: {
    reason?: string | null
  } | null
  output?: Array<OpenAIResponseOutputMessage | OpenAIResponseFunctionCall>
  usage?: {
    input_tokens?: number
    output_tokens?: number
  } | null
}

type ModelInputMessageLike = {
  role?: 'user' | 'assistant'
  content?: unknown
  message?: {
    role?: 'user' | 'assistant'
    content?: unknown
  } | null
}

function getOpenAIBaseUrl(): string {
  return (
    process.env.FORGE_OPENAI_API_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    'https://api.openai.com'
  ).replace(/\/$/, '')
}

function isLikelyOpenAIApiKey(token: string): boolean {
  return token.startsWith('sk-')
}

function canUseCodexExecFallback(
  session: ReturnType<typeof getActiveForgeSession>,
  tools: BetaToolUnion[],
  outputFormat?: BetaJSONOutputFormat,
): boolean {
  return (
    !!session &&
    session.issuer === 'openai' &&
    session.metadata?.source === 'codex_cli' &&
    !isLikelyOpenAIApiKey(session.accessToken) &&
    session.metadata.hasResponsesApiAccess !== true &&
    tools.length === 0 &&
    !outputFormat
  )
}

function isLikelyOpenAIModel(model: string): boolean {
  return /^(gpt-|o[134]|codex|computer-use-preview|gpt-oss)/.test(model)
}

function resolveOpenAIModel(requestedModel: string): string {
  const explicitModel = process.env.FORGE_OPENAI_MODEL?.trim()
  if (explicitModel) {
    return explicitModel
  }

  if (isLikelyOpenAIModel(requestedModel)) {
    return requestedModel
  }

  logForDebugging(
    `[openai-runtime] Mapping requested model ${requestedModel} to gpt-5-codex for native OpenAI session`,
  )
  return 'gpt-5-codex'
}

function getOpenAIMaxOutputTokens(override?: number): number {
  if (override && override > 0) {
    return override
  }

  const configured = parseInt(process.env.FORGE_OPENAI_MAX_OUTPUT_TOKENS || '', 10)
  if (configured > 0) {
    return configured
  }

  return 8192
}

function toInputText(text: string): OpenAIInputText[] {
  return [{ type: 'input_text', text }]
}

function flushBufferedText(
  input: OpenAIInputItem[],
  role: 'user' | 'assistant',
  bufferedText: string[],
): void {
  if (bufferedText.length === 0) {
    return
  }

  input.push({
    type: 'message',
    role,
    content: toInputText(bufferedText.join('\n\n')),
  })
  bufferedText.length = 0
}

function serializeToolResultContent(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    const textParts = content
      .filter(
        block =>
          block &&
          typeof block === 'object' &&
          'type' in block &&
          (block as { type?: unknown }).type === 'text' &&
          'text' in block &&
          typeof (block as { text?: unknown }).text === 'string',
      )
      .map(block => (block as { text: string }).text)

    if (textParts.length === content.length) {
      return textParts.join('\n\n')
    }
  }

  return jsonStringify(content)
}

function convertAnthropicMessagesToOpenAIInput(
  messages: BetaMessageParam[],
): OpenAIInputItem[] {
  const input: OpenAIInputItem[] = []

  for (const [index, message] of messages.entries()) {
    if (!message || typeof message !== 'object') {
      logForDebugging(
        `[openai-runtime] Skipping invalid API message at index ${index}: ${jsonStringify(message)}`,
        { level: 'warn' },
      )
      continue
    }

    const normalized = (() => {
      const candidate = message as ModelInputMessageLike
      if (
        candidate.message &&
        typeof candidate.message === 'object' &&
        'content' in candidate.message
      ) {
        return {
          role: candidate.message.role,
          content: candidate.message.content,
        }
      }

      if ('content' in candidate) {
        return {
          role: candidate.role,
          content: candidate.content,
        }
      }

      return null
    })()

    if (!normalized) {
      logForDebugging(
        `[openai-runtime] Skipping API message without content at index ${index}: ${jsonStringify(message)}`,
        { level: 'warn' },
      )
      continue
    }

    const role =
      normalized.role === 'assistant' ? ('assistant' as const) : ('user' as const)

    if (typeof normalized.content === 'string') {
      input.push({
        type: 'message',
        role,
        content: normalized.content,
      })
      continue
    }

    if (!Array.isArray(normalized.content)) {
      logForDebugging(
        `[openai-runtime] Skipping API message with unsupported content at index ${index}: ${jsonStringify(message)}`,
        { level: 'warn' },
      )
      continue
    }

    const bufferedText: string[] = []

    for (const block of normalized.content) {
      switch (block.type) {
        case 'text':
          bufferedText.push(block.text)
          break
        case 'tool_use':
          flushBufferedText(input, 'assistant', bufferedText)
          input.push({
            type: 'function_call',
            call_id: block.id,
            name: block.name,
            arguments:
              typeof block.input === 'string'
                ? block.input
                : jsonStringify(block.input ?? {}),
          })
          break
        case 'tool_result':
          flushBufferedText(input, 'user', bufferedText)
          input.push({
            type: 'function_call_output',
            call_id: block.tool_use_id,
            output: serializeToolResultContent(block.content),
          })
          break
        case 'thinking':
        case 'redacted_thinking':
          break
        default:
          throw new Error(
            `Native OpenAI runtime does not yet support Anthropic content block type "${block.type}".`,
          )
      }
    }

    flushBufferedText(input, role, bufferedText)
  }

  return input
}

function convertTools(tools: BetaToolUnion[]): OpenAIFunctionTool[] {
  const converted: OpenAIFunctionTool[] = []

  for (const tool of tools) {
    if (!('name' in tool) || !('input_schema' in tool)) {
      continue
    }

    converted.push({
      type: 'function',
      name: tool.name,
      ...('description' in tool &&
      typeof tool.description === 'string' &&
      tool.description.length > 0
        ? { description: tool.description }
        : {}),
      parameters:
        typeof tool.input_schema === 'object' && tool.input_schema !== null
          ? (tool.input_schema as Record<string, unknown>)
          : { type: 'object', properties: {} },
    })
  }

  return converted
}

function convertToolChoice(
  toolChoice: BetaToolChoiceAuto | BetaToolChoiceTool | undefined,
  toolNames: Set<string>,
): OpenAIToolChoice | undefined {
  if (toolNames.size === 0) {
    return 'none'
  }

  if (!toolChoice || toolChoice.type === 'auto') {
    return 'auto'
  }

  if (toolChoice.type === 'tool') {
    if (!toolNames.has(toolChoice.name)) {
      return 'auto'
    }
    return {
      type: 'function',
      name: toolChoice.name,
    }
  }

  return 'auto'
}

function createUsageFromOpenAI(
  usage?: OpenAIResponsePayload['usage'],
): BetaUsage {
  return {
    input_tokens: usage?.input_tokens ?? 0,
    output_tokens: usage?.output_tokens ?? 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    server_tool_use: { web_search_requests: 0, web_fetch_requests: 0 },
    service_tier: null,
    cache_creation: {
      ephemeral_1h_input_tokens: 0,
      ephemeral_5m_input_tokens: 0,
    },
    inference_geo: null,
    iterations: null,
    speed: null,
  }
}

function parseAssistantContent(
  response: OpenAIResponsePayload,
): {
  content: BetaContentBlock[]
  stopReason: BetaStopReason | null
  outputMessageId?: string
} {
  const content: BetaContentBlock[] = []
  let outputMessageId: string | undefined

  for (const item of response.output ?? []) {
    if (item.type === 'message') {
      outputMessageId = item.id ?? outputMessageId
      for (const block of item.content ?? []) {
        if (block.type === 'output_text') {
          content.push({
            type: 'text',
            text: block.text,
          } as BetaContentBlock)
        }
      }
      continue
    }

    if (item.type === 'function_call') {
      content.push({
        type: 'tool_use',
        id: item.call_id || item.id || randomUUID(),
        name: item.name,
        input: safeParseJSON(item.arguments) ?? item.arguments,
      } as BetaContentBlock)
    }
  }

  const stopReason: BetaStopReason | null =
    content.some(block => block.type === 'tool_use')
      ? 'tool_use'
      : response.incomplete_details?.reason === 'max_output_tokens'
        ? 'max_tokens'
        : 'stop_sequence'

  return { content, stopReason, outputMessageId }
}

function extractTextFromMessageContent(
  content: BetaMessageParam['content'],
  contextLabel?: string,
): string | null {
  if (typeof content === 'string') {
    return content
  }
  if (!Array.isArray(content)) {
    logForDebugging(
      `[openai-runtime] codex exec fallback cannot serialize non-array content${contextLabel ? ` (${contextLabel})` : ''}: ${jsonStringify(content)}`,
      { level: 'warn' },
    )
    return null
  }

  const textBlocks = content.filter(block => block.type === 'text')
  if (textBlocks.length !== content.length) {
    logForDebugging(
      `[openai-runtime] codex exec fallback encountered non-text content block${contextLabel ? ` (${contextLabel})` : ''}: ${jsonStringify(content)}`,
      { level: 'warn' },
    )
    return null
  }

  return textBlocks.map(block => block.text).join('\n\n')
}

function buildCodexExecPrompt(
  systemPrompt: string[],
  messages: BetaMessageParam[],
): string | null {
  let lastUserText: string | null = null
  for (const [index, message] of messages.entries()) {
    if (!message || typeof message !== 'object') {
      logForDebugging(
        `[openai-runtime] codex exec fallback skipping malformed message at index ${index}: ${jsonStringify(message)}`,
        { level: 'warn' },
      )
      continue
    }

    const normalized = (() => {
      const candidate = message as ModelInputMessageLike
      if (
        candidate.message &&
        typeof candidate.message === 'object' &&
        'content' in candidate.message
      ) {
        return {
          role: candidate.message.role,
          content: candidate.message.content,
        }
      }

      if ('content' in candidate) {
        return {
          role: candidate.role,
          content: candidate.content,
        }
      }

      return null
    })()

    if (!normalized) {
      logForDebugging(
        `[openai-runtime] codex exec fallback skipping non-message entry at index ${index}: ${jsonStringify(message)}`,
        { level: 'warn' },
      )
      continue
    }

    const text = extractTextFromMessageContent(
      normalized.content as BetaMessageParam['content'],
      `message ${index} role=${normalized.role}`,
    )
    if (text === null) {
      return null
    }
    if (normalized.role !== 'assistant') {
      lastUserText = text
    }
  }

  if (!lastUserText) {
    return null
  }

  const systemHint =
    systemPrompt.length > 0
      ? 'Act as Forge, a terminal coding assistant. Follow the user request directly and keep the answer concise.'
      : 'Reply to the user request directly and keep the answer concise.'

  return `${systemHint}\n\nUser request:\n${lastUserText}`.trim()
}

async function runCodexExecFallback(
  prompt: string,
  model: string,
): Promise<AssistantMessage> {
  const outputDir = await mkdtemp(join(tmpdir(), 'forge-codex-fallback-'))
  const outputPath = join(outputDir, 'last-message.txt')
  const codexBin = process.env.FORGE_CODEX_BIN?.trim() || 'codex'
  const args = [
    'exec',
    '--skip-git-repo-check',
    '--dangerously-bypass-approvals-and-sandbox',
    '-C',
    process.cwd(),
    '-m',
    model,
    '-o',
    outputPath,
    prompt,
  ]

  try {
    const { stderr } = await new Promise<{ stderr: string }>((resolve, reject) => {
      const child = spawn(codexBin, args, {
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      let stderr = ''
      child.stderr.on('data', chunk => {
        stderr += chunk.toString()
      })

      const killTimer = setTimeout(() => {
        child.kill('SIGTERM')
      }, 120000)

      child.on('error', error => {
        clearTimeout(killTimer)
        reject(
          new Error(
            stderr.trim()
              ? `codex exec fallback failed: ${stderr.trim()}`
              : `codex exec fallback failed: ${error.message}`,
          ),
        )
      })

      child.on('close', code => {
        clearTimeout(killTimer)
        if (code !== 0) {
          reject(
            new Error(
              stderr.trim()
                ? `codex exec fallback failed: ${stderr.trim()}`
                : `codex exec fallback exited with code ${code ?? 'unknown'}`,
            ),
          )
          return
        }
        resolve({ stderr })
      })
    })

    if (stderr.trim()) {
      logForDebugging(
        `[openai-runtime] codex exec fallback stderr: ${stderr.trim()}`,
      )
    }

    const text = (await readFile(outputPath, 'utf8')).trim()
    if (!text) {
      throw new Error('codex exec fallback returned an empty final message')
    }

    const assistantMessage = createAssistantMessage({ content: text })
    assistantMessage.message.model = model
    assistantMessage.message.stop_reason = 'end_turn'
    assistantMessage.requestId = `codex-exec:${randomUUID()}`
    return assistantMessage
  } finally {
    await rm(outputDir, { recursive: true, force: true }).catch(() => {})
  }
}

export async function queryOpenAIModel({
  messages,
  systemPrompt,
  tools,
  signal,
  model,
  maxOutputTokensOverride,
  toolChoice,
  fetchOverride,
  outputFormat,
}: {
  messages: BetaMessageParam[]
  systemPrompt: string[]
  tools: BetaToolUnion[]
  signal: AbortSignal
  model: string
  maxOutputTokensOverride?: number
  toolChoice?: BetaToolChoiceAuto | BetaToolChoiceTool
  fetchOverride?: ClientOptions['fetch']
  outputFormat?: BetaJSONOutputFormat
}): Promise<AssistantMessage> {
  const session = getActiveForgeSession()
  if (!session || session.issuer !== 'openai') {
    throw new Error(
      'Native OpenAI model runtime requires an active OpenAI session.',
    )
  }

  const resolvedModel = resolveOpenAIModel(model)
  if (canUseCodexExecFallback(session, tools, outputFormat)) {
    const prompt = buildCodexExecPrompt(systemPrompt, messages)
    if (!prompt) {
      throw new Error(
        'Codex CLI login was imported successfully, but this request contains content that cannot be bridged through the codex exec fallback path.',
      )
    }
    logForDebugging(
      '[openai-runtime] Falling back to codex exec because the imported Codex CLI credential lacks Responses API scope.',
      { level: 'warn' },
    )
    return runCodexExecFallback(prompt, resolvedModel)
  }

  if (
    typeof session.metadata?.source === 'string' &&
    session.metadata.source === 'codex_cli' &&
    !isLikelyOpenAIApiKey(session.accessToken) &&
    session.metadata.hasResponsesApiAccess !== true
  ) {
    throw new Error(
      'Codex CLI login was imported successfully, but this machine only exposed a ChatGPT OAuth token without Responses API scope. Forge can start the OpenAI session, but native model requests still need a Codex-provided API key or another credential with api.responses.write.',
    )
  }

  const input = convertAnthropicMessagesToOpenAIInput(messages)
  const convertedTools = convertTools(tools)
  if (outputFormat) {
    throw new Error(
      'Native OpenAI runtime does not yet support structured output schemas.',
    )
  }

  const toolNames = new Set(convertedTools.map(tool => tool.name))
  const requestBody = {
    model: resolvedModel,
    instructions: systemPrompt.join('\n\n'),
    input,
    tools: convertedTools,
    tool_choice: convertToolChoice(toolChoice, toolNames),
    max_output_tokens: getOpenAIMaxOutputTokens(maxOutputTokensOverride),
    parallel_tool_calls: convertedTools.length > 0,
    store: false,
  }

  const request = fetchOverride ?? globalThis.fetch
  const response = await request(`${getOpenAIBaseUrl()}/v1/responses`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      'Content-Type': 'application/json',
      'User-Agent': getClaudeCodeUserAgent(),
    },
    body: jsonStringify(requestBody),
    signal,
  })

  const requestId = response.headers.get('x-request-id') ?? undefined
  const payload = (await response.json()) as OpenAIResponsePayload

  if (!response.ok) {
    throw new Error(
      payload.error?.message ||
        `OpenAI Responses API request failed with status ${response.status}`,
    )
  }

  if (payload.error) {
    throw new Error(payload.error.message || 'OpenAI Responses API error')
  }

  const { content, stopReason, outputMessageId } = parseAssistantContent(payload)
  if (content.length === 0) {
    throw new Error('OpenAI Responses API returned no assistant content.')
  }

  const assistantMessage = createAssistantMessage({
    content,
    usage: createUsageFromOpenAI(payload.usage),
  })
  assistantMessage.message.model = payload.model || resolvedModel
  assistantMessage.message.id = outputMessageId || payload.id || assistantMessage.message.id
  assistantMessage.message.stop_reason = stopReason
  assistantMessage.requestId = requestId || payload.id
  return assistantMessage
}
