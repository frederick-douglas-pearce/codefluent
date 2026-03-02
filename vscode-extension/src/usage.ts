import { execFileSync } from 'child_process'
import { getNpxCommand } from './platform'

export interface UsageData {
  daily?: any
  monthly?: any
  session?: any
}

export function getUsageData(): UsageData {
  const result: UsageData = {}

  const commands: Array<{ key: keyof UsageData; args: string[] }> = [
    { key: 'daily', args: ['ccusage@latest', 'daily', '--json'] },
    { key: 'monthly', args: ['ccusage@latest', 'monthly', '--json'] },
    { key: 'session', args: ['ccusage@latest', 'session', '--json', '-o', 'desc'] },
  ]

  for (const { key, args } of commands) {
    try {
      const output = execFileSync(getNpxCommand(), args, {
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
