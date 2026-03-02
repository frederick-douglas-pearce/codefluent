import { execSync } from 'child_process'

export interface UsageData {
  daily?: any
  monthly?: any
  session?: any
}

export function getUsageData(): UsageData {
  const result: UsageData = {}

  const commands: Array<{ key: keyof UsageData; args: string }> = [
    { key: 'daily', args: 'daily --json' },
    { key: 'monthly', args: 'monthly --json' },
    { key: 'session', args: 'session --json -o desc' },
  ]

  for (const { key, args } of commands) {
    try {
      const output = execSync(`npx ccusage@latest ${args}`, {
        timeout: 30000,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      result[key] = JSON.parse(output)
    } catch {
      // Leave undefined on failure
    }
  }

  return result
}
