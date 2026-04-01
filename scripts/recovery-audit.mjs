#!/usr/bin/env node
import { existsSync, readFileSync } from 'fs'

const checks = [
  {
    id: 'sdk-generated',
    ok:
      existsSync('src/entrypoints/sdk/coreTypes.generated.ts') &&
      existsSync('src/entrypoints/sdk/controlTypes.ts') &&
      existsSync('src/entrypoints/sdk/runtimeTypes.ts') &&
      existsSync('src/entrypoints/sdk/settingsTypes.generated.ts'),
    detail: 'SDK generated/type bridge files are present',
  },
  {
    id: 'settings-schema',
    ok: existsSync('generated/settings.schema.json'),
    detail: 'Generated settings JSON schema is present',
  },
  {
    id: 'ant-chrome-stub',
    ok: !existsSync('node_modules/@ant/claude-for-chrome-mcp/index.js'),
    detail: 'No local stub for @ant/claude-for-chrome-mcp',
  },
  {
    id: 'color-diff-stub',
    ok: !existsSync('node_modules/color-diff-napi/index.js'),
    detail: 'No local stub for color-diff-napi',
  },
  {
    id: 'tungsten-stub',
    ok: !existsSync('src/tools/TungstenTool/TungstenTool.ts'),
    detail: 'TungstenTool local stub file has been removed',
  },
  {
    id: 'bundled-skill-placeholders',
    ok:
      !readFileSync('src/skills/bundled/claudeApiContent.ts', 'utf8').includes(
        'This local snapshot is missing the original bundled markdown reference set.',
      ) &&
      !readFileSync('src/skills/bundled/verifyContent.ts', 'utf8').includes(
        'Run the relevant CLI command and confirm the output.',
      ),
    detail: 'Bundled skill content has been restored from placeholders',
  },
]

let failed = 0
for (const check of checks) {
  const prefix = check.ok ? 'PASS' : 'FAIL'
  console.log(`${prefix}  ${check.id}  ${check.detail}`)
  if (!check.ok) failed++
}

if (failed > 0) {
  console.error(`\nRecovery audit found ${failed} remaining blocker(s).`)
  process.exit(1)
}

console.log('\nRecovery audit passed.')
