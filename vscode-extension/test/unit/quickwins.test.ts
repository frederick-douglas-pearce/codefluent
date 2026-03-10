import { validateGitHubName, detectWorkspaceRepo } from '../../src/quickwins'

jest.mock('child_process', () => ({
  execFileSync: jest.fn(),
}))

import { execFileSync } from 'child_process'

const mockExecFileSync = execFileSync as jest.MockedFunction<typeof execFileSync>

describe('validateGitHubName', () => {
  it('accepts valid GitHub names', () => {
    expect(validateGitHubName('owner')).toBe('owner')
    expect(validateGitHubName('my-repo')).toBe('my-repo')
    expect(validateGitHubName('user.name')).toBe('user.name')
    expect(validateGitHubName('repo_name')).toBe('repo_name')
    expect(validateGitHubName('User123')).toBe('User123')
    expect(validateGitHubName('a')).toBe('a')
  })

  it('rejects names with shell metacharacters', () => {
    expect(() => validateGitHubName(';rm -rf /')).toThrow('Invalid GitHub name')
    expect(() => validateGitHubName('$(whoami)')).toThrow('Invalid GitHub name')
    expect(() => validateGitHubName('`id`')).toThrow('Invalid GitHub name')
    expect(() => validateGitHubName('owner/repo')).toThrow('Invalid GitHub name')
    expect(() => validateGitHubName('name with spaces')).toThrow('Invalid GitHub name')
    expect(() => validateGitHubName('')).toThrow('Invalid GitHub name')
    expect(() => validateGitHubName('foo&&bar')).toThrow('Invalid GitHub name')
    expect(() => validateGitHubName('foo|bar')).toThrow('Invalid GitHub name')
  })
})

describe('detectWorkspaceRepo', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns undefined when no workspace path is provided', () => {
    expect(detectWorkspaceRepo()).toBeUndefined()
    expect(detectWorkspaceRepo(undefined)).toBeUndefined()
  })

  it('parses HTTPS remote URL correctly', () => {
    mockExecFileSync.mockReturnValue('https://github.com/myowner/myrepo.git\n')

    const result = detectWorkspaceRepo('/some/path')

    expect(mockExecFileSync).toHaveBeenCalledWith(
      'git',
      ['remote', 'get-url', 'origin'],
      expect.objectContaining({ cwd: '/some/path' }),
    )
    expect(result).toEqual({ owner: 'myowner', name: 'myrepo' })
  })

  it('parses SSH remote URL correctly', () => {
    mockExecFileSync.mockReturnValue('git@github.com:myowner/myrepo.git\n')

    const result = detectWorkspaceRepo('/some/path')

    expect(result).toEqual({ owner: 'myowner', name: 'myrepo' })
  })

  it('parses GitHub Pages repo with dots in name', () => {
    mockExecFileSync.mockReturnValue('https://github.com/myowner/myowner.github.io.git\n')

    const result = detectWorkspaceRepo('/some/path')

    expect(result).toEqual({ owner: 'myowner', name: 'myowner.github.io' })
  })

  it('parses HTTPS remote URL without .git suffix', () => {
    mockExecFileSync.mockReturnValue('https://github.com/myowner/myrepo\n')

    const result = detectWorkspaceRepo('/some/path')

    expect(result).toEqual({ owner: 'myowner', name: 'myrepo' })
  })

  it('uses execFileSync with arg array (not shell string)', () => {
    mockExecFileSync.mockReturnValue('https://github.com/owner/repo.git\n')

    detectWorkspaceRepo('/workspace')

    // Verify it was called with separate args, not a shell string
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'git',
      expect.arrayContaining(['remote', 'get-url', 'origin']),
      expect.any(Object),
    )
  })

  it('rejects malicious owner names from remote URL', () => {
    mockExecFileSync.mockReturnValue('https://github.com/$(whoami)/repo.git\n')

    const result = detectWorkspaceRepo('/some/path')

    // validateGitHubName throws, caught by try/catch, returns undefined
    expect(result).toBeUndefined()
  })

  it('rejects malicious repo names from remote URL', () => {
    mockExecFileSync.mockReturnValue('https://github.com/owner/`id`.git\n')

    const result = detectWorkspaceRepo('/some/path')

    expect(result).toBeUndefined()
  })

  it('returns undefined when git command fails', () => {
    mockExecFileSync.mockImplementation(() => { throw new Error('not a git repo') })

    const result = detectWorkspaceRepo('/some/path')

    expect(result).toBeUndefined()
  })

  it('returns undefined for non-GitHub remotes', () => {
    mockExecFileSync.mockReturnValue('https://gitlab.com/owner/repo.git\n')

    const result = detectWorkspaceRepo('/some/path')

    expect(result).toBeUndefined()
  })
})

describe('getQuickWins CLAUDE.md passthrough', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('includes CLAUDE.md content in API call when provided', async () => {
    // git remote
    mockExecFileSync.mockReturnValueOnce('https://github.com/testowner/testrepo.git\n')
    // gh repo view
    mockExecFileSync.mockReturnValueOnce(JSON.stringify({ name: 'testrepo', url: 'https://github.com/testowner/testrepo' }))
    // gh api commits
    mockExecFileSync.mockReturnValueOnce('commit msg\n')
    // gh api readme
    mockExecFileSync.mockReturnValueOnce('README.md\n')
    // gh issue list
    mockExecFileSync.mockReturnValueOnce('[]')

    const { getQuickWins } = require('../../src/quickwins')
    const mockClient = {
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ text: '[]' }],
        }),
      },
    }

    await getQuickWins(mockClient, '/workspace', '# My Project\n\nAlways explain trade-offs.')

    const apiCall = mockClient.messages.create.mock.calls[0][0]
    expect(apiCall.messages[0].content).toContain('<claude_md>')
    expect(apiCall.messages[0].content).toContain('Always explain trade-offs.')
    expect(apiCall.messages[0].content).toContain('</claude_md>')
  })

  it('works without CLAUDE.md content', async () => {
    // git remote
    mockExecFileSync.mockReturnValueOnce('https://github.com/testowner/testrepo.git\n')
    // gh repo view
    mockExecFileSync.mockReturnValueOnce(JSON.stringify({ name: 'testrepo', url: 'https://github.com/testowner/testrepo' }))
    // gh api commits
    mockExecFileSync.mockReturnValueOnce('commit msg\n')
    // gh api readme
    mockExecFileSync.mockReturnValueOnce('README.md\n')
    // gh issue list
    mockExecFileSync.mockReturnValueOnce('[]')

    const { getQuickWins } = require('../../src/quickwins')
    const mockClient = {
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ text: '[]' }],
        }),
      },
    }

    await getQuickWins(mockClient, '/workspace')

    const apiCall = mockClient.messages.create.mock.calls[0][0]
    expect(apiCall.messages[0].content).not.toContain('<claude_md>')
  })

  it('truncates CLAUDE.md content at 2000 chars', async () => {
    // git remote
    mockExecFileSync.mockReturnValueOnce('https://github.com/testowner/testrepo.git\n')
    // gh repo view
    mockExecFileSync.mockReturnValueOnce(JSON.stringify({ name: 'testrepo', url: 'https://github.com/testowner/testrepo' }))
    // gh api commits
    mockExecFileSync.mockReturnValueOnce('commit msg\n')
    // gh api readme
    mockExecFileSync.mockReturnValueOnce('README.md\n')
    // gh issue list
    mockExecFileSync.mockReturnValueOnce('[]')

    const { getQuickWins } = require('../../src/quickwins')
    const mockClient = {
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ text: '[]' }],
        }),
      },
    }

    const longContent = 'A'.repeat(3000)
    await getQuickWins(mockClient, '/workspace', longContent)

    const apiCall = mockClient.messages.create.mock.calls[0][0]
    // The content between <claude_md> tags should be truncated to 2000 chars
    const match = apiCall.messages[0].content.match(/<claude_md>\n([\s\S]*?)\n<\/claude_md>/)
    expect(match).toBeTruthy()
    expect(match[1].length).toBe(2000)
  })
})

describe('getQuickWins arg arrays', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('uses execFileSync for gh repo view with scoped repo', async () => {
    // First call: git remote
    mockExecFileSync.mockReturnValueOnce('https://github.com/testowner/testrepo.git\n')
    // Second call: gh repo view
    mockExecFileSync.mockReturnValueOnce(JSON.stringify({ name: 'testrepo', url: 'https://github.com/testowner/testrepo' }))
    // Third call: gh api commits
    mockExecFileSync.mockReturnValueOnce('commit msg\n')
    // Fourth call: gh api readme
    mockExecFileSync.mockReturnValueOnce('README.md\n')
    // Fifth call: gh issue list
    mockExecFileSync.mockReturnValueOnce('[]')

    const { getQuickWins } = require('../../src/quickwins')
    const mockClient = {
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ text: '[]' }],
        }),
      },
    }

    await getQuickWins(mockClient, '/workspace')

    // Verify gh repo view uses arg array
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'gh',
      ['repo', 'view', 'testowner/testrepo', '--json', 'name,url,pushedAt,description'],
      expect.any(Object),
    )

    // Verify gh issue list includes --repo flag with scoped repo
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'gh',
      ['issue', 'list', '--json', 'title,url,labels,repository', '--state', 'open', '--limit', '30', '--repo', 'testowner/testrepo'],
      expect.any(Object),
    )
  })

  it('uses execFileSync for gh repo list without scoped repo', async () => {
    // First call: git remote fails (no workspace)
    mockExecFileSync.mockImplementationOnce(() => { throw new Error('no remote') })
    // Second call: gh repo list
    mockExecFileSync.mockReturnValueOnce(JSON.stringify([{ name: 'repo1', url: 'https://github.com/owner/repo1' }]))
    // Third call: gh api commits
    mockExecFileSync.mockReturnValueOnce('commit\n')
    // Fourth call: gh api readme
    mockExecFileSync.mockReturnValueOnce('README.md\n')
    // Fifth call: gh issue list (no --repo flag)
    mockExecFileSync.mockReturnValueOnce('[]')

    const { getQuickWins } = require('../../src/quickwins')
    const mockClient = {
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ text: '[]' }],
        }),
      },
    }

    await getQuickWins(mockClient, '/workspace')

    // Verify gh repo list uses arg array
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'gh',
      ['repo', 'list', '--json', 'name,url,pushedAt,description', '--limit', '20'],
      expect.any(Object),
    )

    // Verify gh issue list does NOT include --repo flag
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'gh',
      ['issue', 'list', '--json', 'title,url,labels,repository', '--state', 'open', '--limit', '30'],
      expect.any(Object),
    )
  })
})
