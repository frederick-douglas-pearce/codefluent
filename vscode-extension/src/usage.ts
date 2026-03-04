import { execFile } from 'child_process'
import { promisify } from 'util'
import { getNpxCommand } from './platform'

const execFileAsync = promisify(execFile)

export interface UsageData {
  daily?: any
  monthly?: any
  session?: any
}

export async function getUsageData(): Promise<UsageData> {
  const commands: Array<{ key: keyof UsageData; args: string[] }> = [
    { key: 'daily', args: ['ccusage@latest', 'daily', '--json'] },
    { key: 'monthly', args: ['ccusage@latest', 'monthly', '--json'] },
    { key: 'session', args: ['ccusage@latest', 'session', '--json', '-o', 'desc'] },
  ]

  const npx = getNpxCommand()
  const promises = commands.map(({ args }) =>
    execFileAsync(npx, args, { timeout: 30000, encoding: 'utf8' })
  )

  const results = await Promise.allSettled(promises)
  const data: UsageData = {}

  for (let i = 0; i < commands.length; i++) {
    const r = results[i]
    if (r.status === 'fulfilled') {
      try {
        data[commands[i].key] = JSON.parse(r.value.stdout)
      } catch {
        // Invalid JSON — leave undefined
      }
    }
  }

  return data
}
