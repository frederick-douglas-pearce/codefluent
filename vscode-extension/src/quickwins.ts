import { execFileSync } from 'child_process'
import Anthropic from '@anthropic-ai/sdk'

const GITHUB_NAME_RE = /^[a-zA-Z0-9._-]+$/

export function validateGitHubName(name: string): string {
  if (!GITHUB_NAME_RE.test(name)) {
    throw new Error(`Invalid GitHub name: ${name}`)
  }
  return name
}

const QUICKWINS_PROMPT = `The user has a Claude Code Max plan and is underutilizing their token allocation.

Here are their active GitHub repositories with recent commits and README status:
{repos}

Here are their open issues:
{issues}

Suggest 3-5 quick tasks they could assign to Claude Code right now. Each should be:
- Completable in 15-30 minutes of Claude Code time
- Genuinely useful (not busywork)
- Specific enough to copy-paste as a Claude Code prompt
- NOT duplicating work already done (check recent commits to avoid suggesting completed work)
- NOT suggesting adding a README if one already exists

Respond with ONLY a JSON array:
[
  {
    "repo": "repo-name",
    "task": "Brief description",
    "prompt": "Exact Claude Code prompt to use",
    "estimated_minutes": 15,
    "category": "testing|docs|refactor|bugfix|feature"
  }
]`

const EXEC_OPTS: { timeout: number; encoding: 'utf8'; stdio: ['pipe', 'pipe', 'pipe'] } = {
  timeout: 10000, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
}

function getRepoContext(owner: string, repoName: string): { recent_commits: string[]; has_readme: boolean } {
  const context: { recent_commits: string[]; has_readme: boolean } = { recent_commits: [], has_readme: false }

  try {
    const commitsOutput = execFileSync(
      'gh',
      ['api', `repos/${owner}/${repoName}/commits`, '--jq', '.[0:5] | .[] | .commit.message'],
      EXEC_OPTS,
    )
    context.recent_commits = commitsOutput.trim().split('\n')
      .filter(l => l)
      .map(l => l.split('\n')[0])
  } catch {
    // ignore
  }

  try {
    const readmeOutput = execFileSync(
      'gh',
      ['api', `repos/${owner}/${repoName}/readme`, '--jq', '.name'],
      { timeout: 5000, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
    )
    context.has_readme = !!readmeOutput.trim()
  } catch {
    // ignore
  }

  return context
}

export function detectWorkspaceRepo(workspacePath?: string): { owner: string; name: string } | undefined {
  if (!workspacePath) return undefined
  try {
    const remoteUrl = execFileSync('git', ['remote', 'get-url', 'origin'], {
      cwd: workspacePath,
      timeout: 5000,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
    // Handle both HTTPS (https://github.com/owner/repo.git) and SSH (git@github.com:owner/repo.git)
    const match = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)/)
    if (match) {
      return { owner: validateGitHubName(match[1]), name: validateGitHubName(match[2]) }
    }
  } catch {
    // not a git repo or no remote
  }
  return undefined
}

export async function getQuickWins(client: Anthropic, workspacePath?: string): Promise<{ suggestions: any[]; error?: string }> {
  try {
    const scopedRepo = detectWorkspaceRepo(workspacePath)

    let reposList: any[]
    let owner: string

    if (scopedRepo) {
      // Scoped to current workspace repo
      owner = scopedRepo.owner
      const repoOutput = execFileSync(
        'gh',
        ['repo', 'view', `${scopedRepo.owner}/${scopedRepo.name}`, '--json', 'name,url,pushedAt,description'],
        EXEC_OPTS,
      )
      reposList = [JSON.parse(repoOutput)]
    } else {
      // Fallback to all repos
      const reposOutput = execFileSync(
        'gh',
        ['repo', 'list', '--json', 'name,url,pushedAt,description', '--limit', '20'],
        EXEC_OPTS,
      )
      reposList = JSON.parse(reposOutput)
      owner = reposList.length > 0
        ? reposList[0].url.split('/').slice(-2, -1)[0]
        : ''
    }

    for (const repo of reposList.slice(0, 10)) {
      const ctx = getRepoContext(owner, repo.name)
      repo.recent_commits = ctx.recent_commits
      repo.has_readme = ctx.has_readme
    }

    const repoScope = scopedRepo ? `${scopedRepo.owner}/${scopedRepo.name}` : ''
    let issuesOutput = '[]'
    try {
      const issueArgs = ['issue', 'list', '--json', 'title,url,labels,repository', '--state', 'open', '--limit', '30']
      if (repoScope) issueArgs.push('--repo', repoScope)
      issuesOutput = execFileSync('gh', issueArgs, EXEC_OPTS)
    } catch {
      // ignore
    }

    const prompt = QUICKWINS_PROMPT
      .replace('{repos}', JSON.stringify(reposList, null, 2))
      .replace('{issues}', issuesOutput)

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })

    let text = (response.content[0] as any).text.trim()
    if (text.startsWith('```')) {
      text = text.split('\n').slice(1).join('\n').replace(/```\s*$/, '').trim()
    }

    return { suggestions: JSON.parse(text) }
  } catch (e: any) {
    return { suggestions: [], error: e.message || String(e) }
  }
}
