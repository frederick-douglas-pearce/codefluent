jest.mock('child_process', () => ({
  execFileSync: jest.fn(),
}))

jest.mock('../../src/platform', () => ({
  getNpxCommand: jest.fn().mockReturnValue('npx'),
}))

import { execFileSync } from 'child_process'
import { getNpxCommand } from '../../src/platform'
import { getUsageData } from '../../src/usage'

const mockExecFileSync = execFileSync as jest.MockedFunction<typeof execFileSync>

describe('getUsageData', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns all three data types on success', () => {
    const dailyData = [{ date: '2026-03-01', totalCost: 1.5 }]
    const monthlyData = [{ month: '2026-03', totalCost: 45.0 }]
    const sessionData = [{ id: 'sess-1', cost: 0.5 }]

    mockExecFileSync
      .mockReturnValueOnce(JSON.stringify(dailyData))
      .mockReturnValueOnce(JSON.stringify(monthlyData))
      .mockReturnValueOnce(JSON.stringify(sessionData))

    const result = getUsageData()
    expect(result.daily).toEqual(dailyData)
    expect(result.monthly).toEqual(monthlyData)
    expect(result.session).toEqual(sessionData)
  })

  it('passes correct args for daily command', () => {
    mockExecFileSync.mockReturnValue('[]')

    getUsageData()

    expect(mockExecFileSync).toHaveBeenCalledWith(
      'npx',
      ['ccusage@latest', 'daily', '--json'],
      expect.objectContaining({ timeout: 30000, encoding: 'utf8' }),
    )
  })

  it('passes correct args for monthly command', () => {
    mockExecFileSync.mockReturnValue('[]')

    getUsageData()

    expect(mockExecFileSync).toHaveBeenCalledWith(
      'npx',
      ['ccusage@latest', 'monthly', '--json'],
      expect.objectContaining({ timeout: 30000, encoding: 'utf8' }),
    )
  })

  it('passes correct args for session command with -o desc', () => {
    mockExecFileSync.mockReturnValue('[]')

    getUsageData()

    expect(mockExecFileSync).toHaveBeenCalledWith(
      'npx',
      ['ccusage@latest', 'session', '--json', '-o', 'desc'],
      expect.objectContaining({ timeout: 30000, encoding: 'utf8' }),
    )
  })

  it('uses 30s timeout on each call', () => {
    mockExecFileSync.mockReturnValue('[]')

    getUsageData()

    for (const call of mockExecFileSync.mock.calls) {
      expect(call[2]).toEqual(expect.objectContaining({ timeout: 30000 }))
    }
  })

  it('uses getNpxCommand() as executable', () => {
    mockExecFileSync.mockReturnValue('[]')

    getUsageData()

    expect(getNpxCommand).toHaveBeenCalled()
    for (const call of mockExecFileSync.mock.calls) {
      expect(call[0]).toBe('npx')
    }
  })

  it('returns partial data when one command fails', () => {
    mockExecFileSync
      .mockReturnValueOnce(JSON.stringify([{ date: '2026-03-01' }]))
      .mockImplementationOnce(() => { throw new Error('command failed') })
      .mockReturnValueOnce(JSON.stringify([{ id: 'sess-1' }]))

    const result = getUsageData()
    expect(result.daily).toEqual([{ date: '2026-03-01' }])
    expect(result.monthly).toBeUndefined()
    expect(result.session).toEqual([{ id: 'sess-1' }])
  })

  it('returns empty result when all commands fail', () => {
    mockExecFileSync.mockImplementation(() => { throw new Error('all fail') })

    const result = getUsageData()
    expect(result.daily).toBeUndefined()
    expect(result.monthly).toBeUndefined()
    expect(result.session).toBeUndefined()
  })

  it('leaves key undefined for invalid JSON output', () => {
    mockExecFileSync
      .mockReturnValueOnce('not valid json')
      .mockReturnValueOnce(JSON.stringify([{ month: '2026-03' }]))
      .mockReturnValueOnce('also bad')

    const result = getUsageData()
    expect(result.daily).toBeUndefined()
    expect(result.monthly).toEqual([{ month: '2026-03' }])
    expect(result.session).toBeUndefined()
  })
})
