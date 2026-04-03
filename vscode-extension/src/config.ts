import * as fs from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'

type ConfigValue = string | number | boolean
let defaults: Record<string, ConfigValue> | null = null

function loadDefaults(): Record<string, ConfigValue> {
  if (!defaults) {
    defaults = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', 'shared', 'defaults.json'), 'utf8')
    )
  }
  return defaults!
}

export function getConfig<T extends ConfigValue = ConfigValue>(key: string): T {
  const vsValue = vscode.workspace.getConfiguration('codefluent').get<T>(key)
  if (vsValue !== undefined) return vsValue
  const d = loadDefaults()
  if (!(key in d)) throw new Error(`Unknown config key: ${key}`)
  return d[key] as T
}

export function getDisplayConfig(): Record<string, ConfigValue> {
  const d = loadDefaults()
  const display = Object.fromEntries(
    Object.entries(d).filter(([k]) => k.startsWith('display.'))
      .map(([k, v]) => [k, getConfig(k)])
  )
  // Include conversation gap config for frontend chart rendering
  display['conversation.inactivityGapMinutes'] = getConfig('conversation.inactivityGapMinutes')
  return display
}

/** For testing: reset cached defaults */
export function resetConfigCache(): void { defaults = null }
