/**
 * Preferred instruction entrypoint.
 *
 * This module is the neutral surface for FORGE.md / .forge instruction loading.
 * Legacy Claude-specific names remain available via claudemd.ts for backward
 * compatibility, but new imports should land here.
 */

export * from './instructionEnv.js'
export * from './claudemd.js'
