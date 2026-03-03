import * as fs from 'fs'
import * as path from 'path'

interface PromptEntry {
  version: string
  file: string
}

interface Registry {
  scoring: PromptEntry
  config: PromptEntry
}

function getPromptsDir(): string {
  return path.join(__dirname, '..', 'shared', 'prompts')
}

function loadRegistry(): Registry {
  const registryPath = path.join(getPromptsDir(), 'registry.json')
  return JSON.parse(fs.readFileSync(registryPath, 'utf8'))
}

export function loadScoringPrompt(): { version: string; template: string } {
  const registry = loadRegistry()
  const filePath = path.join(getPromptsDir(), registry.scoring.file)
  return {
    version: registry.scoring.version,
    template: fs.readFileSync(filePath, 'utf8'),
  }
}

export function loadConfigPrompt(): { version: string; template: string } {
  const registry = loadRegistry()
  const filePath = path.join(getPromptsDir(), registry.config.file)
  return {
    version: registry.config.version,
    template: fs.readFileSync(filePath, 'utf8'),
  }
}

export function fillTemplate(template: string, vars: Record<string, string>): string {
  let result = template
  for (const [key, value] of Object.entries(vars)) {
    result = result.split(`{{${key}}}`).join(value)
  }
  return result
}
