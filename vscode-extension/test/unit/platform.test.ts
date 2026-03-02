import {
  getDefaultShell,
  getShellArgs,
  escapePromptForShell,
  getClaudeCommand,
  getNpxCommand,
} from '../../src/platform'

describe('platform utilities', () => {
  const originalPlatform = process.platform

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform })
  })

  function setPlatform(value: string) {
    Object.defineProperty(process, 'platform', { value })
  }

  describe('getDefaultShell', () => {
    it('returns /bin/bash on linux', () => {
      setPlatform('linux')
      expect(getDefaultShell()).toBe('/bin/bash')
    })

    it('returns /bin/bash on darwin', () => {
      setPlatform('darwin')
      expect(getDefaultShell()).toBe('/bin/bash')
    })

    it('returns cmd.exe on win32', () => {
      setPlatform('win32')
      expect(getDefaultShell()).toBe('cmd.exe')
    })
  })

  describe('getShellArgs', () => {
    it('returns bash flags on unix', () => {
      setPlatform('linux')
      expect(getShellArgs()).toEqual(['--norc', '--noprofile'])
    })

    it('returns cmd flags on win32', () => {
      setPlatform('win32')
      expect(getShellArgs()).toEqual(['/s', '/c'])
    })
  })

  describe('escapePromptForShell', () => {
    describe('unix', () => {
      beforeEach(() => setPlatform('linux'))

      it('escapes single quotes', () => {
        expect(escapePromptForShell("it's a test")).toBe("it'\\''s a test")
      })

      it('leaves double quotes unchanged', () => {
        expect(escapePromptForShell('say "hello"')).toBe('say "hello"')
      })

      it('leaves backticks unchanged (safe inside single quotes)', () => {
        expect(escapePromptForShell('run `ls`')).toBe('run `ls`')
      })

      it('handles multiple single quotes', () => {
        expect(escapePromptForShell("a'b'c")).toBe("a'\\''b'\\''c")
      })

      it('handles empty string', () => {
        expect(escapePromptForShell('')).toBe('')
      })
    })

    describe('windows', () => {
      beforeEach(() => setPlatform('win32'))

      it('escapes double quotes', () => {
        expect(escapePromptForShell('say "hello"')).toBe('say \\"hello\\"')
      })

      it('escapes percent signs', () => {
        expect(escapePromptForShell('100% done')).toBe('100%% done')
      })

      it('leaves single quotes unchanged', () => {
        expect(escapePromptForShell("it's fine")).toBe("it's fine")
      })

      it('handles combined special chars', () => {
        expect(escapePromptForShell('"100%"')).toBe('\\"100%%\\"')
      })
    })
  })

  describe('getClaudeCommand', () => {
    it('wraps in single quotes on unix', () => {
      setPlatform('linux')
      expect(getClaudeCommand('hello world')).toBe("claude 'hello world'")
    })

    it('wraps in double quotes on win32', () => {
      setPlatform('win32')
      expect(getClaudeCommand('hello world')).toBe('claude "hello world"')
    })

    it('works with pre-escaped unix prompt', () => {
      setPlatform('linux')
      const escaped = escapePromptForShell("it's a test")
      expect(getClaudeCommand(escaped)).toBe("claude 'it'\\''s a test'")
    })

    it('works with pre-escaped windows prompt', () => {
      setPlatform('win32')
      const escaped = escapePromptForShell('say "hello"')
      expect(getClaudeCommand(escaped)).toBe('claude "say \\"hello\\""')
    })
  })

  describe('getNpxCommand', () => {
    it('returns npx on unix', () => {
      setPlatform('linux')
      expect(getNpxCommand()).toBe('npx')
    })

    it('returns npx.cmd on win32', () => {
      setPlatform('win32')
      expect(getNpxCommand()).toBe('npx.cmd')
    })
  })
})
