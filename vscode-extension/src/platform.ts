/**
 * Cross-platform utilities for shell, terminal, and subprocess operations.
 * Centralizes all platform-dependent logic so the rest of the codebase
 * can remain platform-agnostic.
 */

const isWindows = () => process.platform === 'win32'

/** Default shell executable for terminal creation. */
export function getDefaultShell(): string {
  return isWindows() ? 'cmd.exe' : '/bin/bash'
}

/** Shell args that suppress user init scripts (rc files, profiles). */
export function getShellArgs(): string[] {
  return isWindows() ? ['/s', '/c'] : ['--norc', '--noprofile']
}

/**
 * Escape a prompt string for safe embedding in a shell command.
 * - Unix: wraps in single quotes, escaping internal single quotes via '\''
 * - Windows: escapes double quotes and percent signs for cmd.exe
 */
export function escapePromptForShell(prompt: string): string {
  if (isWindows()) {
    return prompt.replace(/"/g, '\\"').replace(/%/g, '%%')
  }
  return prompt.replace(/'/g, "'\\''")
}

/**
 * Build the full `claude` command string with the escaped prompt.
 * - Unix: `claude 'escaped prompt'`
 * - Windows: `claude "escaped prompt"`
 */
export function getClaudeCommand(escapedPrompt: string): string {
  if (isWindows()) {
    return `claude "${escapedPrompt}"`
  }
  return `claude '${escapedPrompt}'`
}

/**
 * The npx executable name — Windows requires `.cmd` extension
 * for `execFileSync` to find it on PATH.
 */
export function getNpxCommand(): string {
  return isWindows() ? 'npx.cmd' : 'npx'
}
