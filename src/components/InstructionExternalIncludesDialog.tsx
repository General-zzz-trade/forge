import React, { useCallback } from 'react'
import { logEvent } from 'src/services/analytics/index.js'
import { Box, Link, Text } from '../ink.js'
import type { ExternalInstructionInclude } from '../utils/instructions.js'
import {
  saveCurrentProjectConfig,
  withInstructionExternalIncludesState,
} from '../utils/config.js'
import { Select } from './CustomSelect/index.js'
import { Dialog } from './design-system/Dialog.js'

type Props = {
  onDone(): void
  isStandaloneDialog?: boolean
  externalIncludes?: ExternalInstructionInclude[]
}

export function InstructionExternalIncludesDialog({
  onDone,
  isStandaloneDialog,
  externalIncludes,
}: Props): React.ReactNode {
  React.useEffect(() => {
    logEvent('tengu_claude_md_includes_dialog_shown', {})
  }, [])

  const handleSelection = useCallback(
    (value: 'yes' | 'no') => {
      const approved = value === 'yes'
      logEvent(
        approved
          ? 'tengu_claude_md_external_includes_dialog_accepted'
          : 'tengu_claude_md_external_includes_dialog_declined',
        {},
      )
      saveCurrentProjectConfig(current =>
        withInstructionExternalIncludesState(current, approved),
      )
      onDone()
    },
    [onDone],
  )

  const handleEscape = useCallback(() => {
    handleSelection('no')
  }, [handleSelection])

  return (
    <Dialog
      title="Allow external FORGE.md file imports?"
      color="warning"
      onCancel={handleEscape}
      hideBorder={!isStandaloneDialog}
      hideInputGuide={!isStandaloneDialog}
    >
      <Text>
        This project's FORGE.md imports files outside the current working
        directory. Never allow this for third-party repositories.
      </Text>

      {externalIncludes && externalIncludes.length > 0 && (
        <Box flexDirection="column">
          <Text dimColor>External imports:</Text>
          {externalIncludes.map((include, i) => (
            <Text key={i} dimColor>
              {'  '}
              {include.path}
            </Text>
          ))}
        </Box>
      )}

      <Text dimColor>
        Important: Only use Forge with files you trust. Accessing untrusted
        files may pose security risks{' '}
        <Link url="https://code.claude.com/docs/en/security" />{' '}
      </Text>

      <Select
        options={[
          { label: 'Yes, allow external imports', value: 'yes' },
          { label: 'No, disable external imports', value: 'no' },
        ]}
        onChange={value => handleSelection(value as 'yes' | 'no')}
      />
    </Dialog>
  )
}
