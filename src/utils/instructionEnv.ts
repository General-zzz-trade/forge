import { isEnvTruthy } from './envUtils.js'

export const FORGE_DISABLE_INSTRUCTIONS_ENV_VAR = 'FORGE_DISABLE_INSTRUCTIONS'
export const LEGACY_CLAUDE_DISABLE_INSTRUCTIONS_ENV_VAR =
  'CLAUDE_CODE_DISABLE_CLAUDE_MDS'

export const FORGE_ENABLE_ADDITIONAL_INSTRUCTION_DIRECTORIES_ENV_VAR =
  'FORGE_ENABLE_ADDITIONAL_INSTRUCTION_DIRECTORIES'
export const LEGACY_CLAUDE_ENABLE_ADDITIONAL_INSTRUCTION_DIRECTORIES_ENV_VAR =
  'CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD'

export function isInstructionsDisabledByEnv(): boolean {
  return (
    isEnvTruthy(process.env[FORGE_DISABLE_INSTRUCTIONS_ENV_VAR]) ||
    isEnvTruthy(process.env[LEGACY_CLAUDE_DISABLE_INSTRUCTIONS_ENV_VAR])
  )
}

export function shouldLoadAdditionalInstructionDirectoriesByEnv(): boolean {
  return (
    isEnvTruthy(
      process.env[FORGE_ENABLE_ADDITIONAL_INSTRUCTION_DIRECTORIES_ENV_VAR],
    ) ||
    isEnvTruthy(
      process.env[
        LEGACY_CLAUDE_ENABLE_ADDITIONAL_INSTRUCTION_DIRECTORIES_ENV_VAR
      ],
    )
  )
}
