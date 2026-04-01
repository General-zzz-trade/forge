#!/usr/bin/env node

import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'

const host = process.env.FORGE_MOCK_HOST || '127.0.0.1'
const port = Number.parseInt(process.env.FORGE_MOCK_PORT || '8787', 10)
const brokerPath = process.env.FORGE_AUTH_BROKER_EXCHANGE_PATH || '/oauth/exchange'

function writeJson(res, statusCode, body) {
  const payload = JSON.stringify(body, null, 2)
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  })
  res.end(payload)
}

function writeText(res, statusCode, body) {
  res.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  })
  res.end(body)
}

async function readJson(req) {
  let raw = ''
  for await (const chunk of req) {
    raw += chunk
  }
  if (!raw) {
    return {}
  }
  return JSON.parse(raw)
}

function buildMockSession(identity) {
  const provider = identity.provider === 'openai' ? 'openai' : 'anthropic'
  const userId = identity.subject_id || identity.email || `mock-user-${provider}`
  const email =
    typeof identity.email === 'string' && identity.email
      ? identity.email
      : `${provider}.user@example.com`

  return {
    access_token: `forge_mock_access_${randomUUID().replaceAll('-', '')}`,
    refresh_token: `forge_mock_refresh_${randomUUID().replaceAll('-', '')}`,
    expires_in: 3600,
    user_id: userId,
    capabilities: {
      profile: true,
      roles: false,
      bootstrap: true,
      mcpProxy: false,
      uploads: false,
      modelProviders: [provider],
    },
    account: {
      accountUuid: userId,
      emailAddress: email,
      displayName:
        typeof identity.metadata?.name === 'string'
          ? identity.metadata.name
          : 'Mock Forge User',
      organizationUuid: 'mock-org',
      organizationName: 'Mock Forge Org',
      organizationRole: 'member',
      workspaceRole: 'member',
    },
    metadata: {
      mock: true,
      issuedBy: 'scripts/mock-forge-gateway.mjs',
      authProvider: provider,
    },
  }
}

function routeBootstrap(req, res) {
  const authHeader = req.headers.authorization || ''
  if (!authHeader.startsWith('Bearer ')) {
    writeJson(res, 401, {
      error: 'missing_authorization',
      message: 'Expected Authorization: Bearer <forge_session_token>.',
    })
    return
  }

  writeJson(res, 200, {
    client_data: {
      source: 'mock-forge-gateway',
      note: 'Bootstrap response for local OpenAI OAuth smoke tests.',
    },
    additional_model_options: [
      {
        model: 'gpt-5.4',
        name: 'GPT-5.4',
        description: 'Mock OpenAI-backed model exposed through Forge gateway',
      },
    ],
  })
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || host}`)

  if (req.method === 'GET' && url.pathname === '/healthz') {
    writeJson(res, 200, {
      ok: true,
      service: 'mock-forge-gateway',
      brokerPath,
      apiBootstrapPath: '/api/claude_cli/bootstrap',
    })
    return
  }

  if (req.method === 'POST' && url.pathname === brokerPath) {
    try {
      const body = await readJson(req)
      if (!body.provider || !body.access_token) {
        writeJson(res, 400, {
          error: 'invalid_request',
          message: 'Expected provider and access_token in broker exchange body.',
        })
        return
      }

      writeJson(res, 200, buildMockSession(body))
    } catch (error) {
      writeJson(res, 400, {
        error: 'invalid_json',
        message: error instanceof Error ? error.message : 'Unable to parse JSON body.',
      })
    }
    return
  }

  if (req.method === 'GET' && url.pathname === brokerPath) {
    writeJson(res, 405, {
      error: 'method_not_allowed',
      message: 'Use POST for broker exchange requests.',
    })
    return
  }

  if (req.method === 'GET' && url.pathname === '/api/claude_cli/bootstrap') {
    routeBootstrap(req, res)
    return
  }

  if (req.method === 'POST' && url.pathname === '/v1/messages') {
    writeJson(res, 501, {
      error: 'not_implemented',
      message:
        'The mock Forge gateway does not emulate Anthropic/OpenAI inference responses. It only supports OAuth exchange and bootstrap smoke tests.',
    })
    return
  }

  writeText(
    res,
    404,
    `No route for ${req.method || 'GET'} ${url.pathname}\n` +
      'Supported routes:\n' +
      `  POST ${brokerPath}\n` +
      '  GET  /api/claude_cli/bootstrap\n' +
      '  GET  /healthz\n',
  )
})

server.listen(port, host, () => {
  process.stdout.write(
    `mock-forge-gateway listening on http://${host}:${port}\n` +
      `broker exchange: POST ${brokerPath}\n` +
      'bootstrap: GET /api/claude_cli/bootstrap\n',
  )
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => {
      process.exit(0)
    })
  })
}
