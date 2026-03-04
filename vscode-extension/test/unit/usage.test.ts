jest.mock('child_process', () => ({
  execFile: jest.fn(),
}))

jest.mock('../../src/platform', () => ({
  getNpxCommand: jest.fn().mockReturnValue('npx'),
}))

import { execFile } from 'child_process'
import { getNpxCommand } from '../../src/platform'
import { getUsageData } from '../../src/usage'

const mockExecFile = execFile as unknown as jest.MockedFunction<
  (cmd: string, args: string[], opts: any, cb: (err: Error | null, result: { stdout: string; stderr: string }) => void) => void
>

function mockSuccess(stdout: string) {
  return (_cmd: string, _args: string[], _opts: any, cb: Function) => {
    cb(null, { stdout, stderr: '' })
  }
}

function mockFailure(message: string) {
  return (_cmd: string, _args: string[], _opts: any, cb: Function) => {
    cb(new Error(message), { stdout: '', stderr: message })
  }
}

describe('getUsageData', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns all three data types on success', async () => {
    const dailyData = [{ date: '2026-03-01', totalCost: 1.5 }]
    const monthlyData = [{ month: '2026-03', totalCost: 45.0 }]
    const sessionData = [{ id: 'sess-1', cost: 0.5 }]

    mockExecFile
      .mockImplementationOnce(mockSuccess(JSON.stringify(dailyData)))
      .mockImplementationOnce(mockSuccess(JSON.stringify(monthlyData)))
      .mockImplementationOnce(mockSuccess(JSON.stringify(sessionData)))

    const result = await getUsageData()
    expect(result.daily).toEqual(dailyData)
    expect(result.monthly).toEqual(monthlyData)
    expect(result.session).toEqual(sessionData)
  })

  it('passes correct args for daily command', async () => {
    mockExecFile.mockImplementation(mockSuccess('[]'))

    await getUsageData()

    expect(mockExecFile).toHaveBeenCalledWith(
      'npx',
      ['ccusage@latest', 'daily', '--json'],
      expect.objectContaining({ timeout: 30000, encoding: 'utf8' }),
      expect.any(Function),
    )
  })

  it('passes correct args for monthly command', async () => {
    mockExecFile.mockImplementation(mockSuccess('[]'))

    await getUsageData()

    expect(mockExecFile).toHaveBeenCalledWith(
      'npx',
      ['ccusage@latest', 'monthly', '--json'],
      expect.objectContaining({ timeout: 30000, encoding: 'utf8' }),
      expect.any(Function),
    )
  })

  it('passes correct args for session command with -o desc', async () => {
    mockExecFile.mockImplementation(mockSuccess('[]'))

    await getUsageData()

    expect(mockExecFile).toHaveBeenCalledWith(
      'npx',
      ['ccusage@latest', 'session', '--json', '-o', 'desc'],
      expect.objectContaining({ timeout: 30000, encoding: 'utf8' }),
      expect.any(Function),
    )
  })

  it('uses 30s timeout on each call', async () => {
    mockExecFile.mockImplementation(mockSuccess('[]'))

    await getUsageData()

    for (const call of mockExecFile.mock.calls) {
      expect(call[2]).toEqual(expect.objectContaining({ timeout: 30000 }))
    }
  })

  it('uses getNpxCommand() as executable', async () => {
    mockExecFile.mockImplementation(mockSuccess('[]'))

    await getUsageData()

    expect(getNpxCommand).toHaveBeenCalled()
    for (const call of mockExecFile.mock.calls) {
      expect(call[0]).toBe('npx')
    }
  })

  it('returns partial data when one command fails', async () => {
    mockExecFile
      .mockImplementationOnce(mockSuccess(JSON.stringify([{ date: '2026-03-01' }])))
      .mockImplementationOnce(mockFailure('command failed'))
      .mockImplementationOnce(mockSuccess(JSON.stringify([{ id: 'sess-1' }])))

    const result = await getUsageData()
    expect(result.daily).toEqual([{ date: '2026-03-01' }])
    expect(result.monthly).toBeUndefined()
    expect(result.session).toEqual([{ id: 'sess-1' }])
  })

  it('returns empty result when all commands fail', async () => {
    mockExecFile.mockImplementation(mockFailure('all fail'))

    const result = await getUsageData()
    expect(result.daily).toBeUndefined()
    expect(result.monthly).toBeUndefined()
    expect(result.session).toBeUndefined()
  })

  it('leaves key undefined for invalid JSON output', async () => {
    mockExecFile
      .mockImplementationOnce(mockSuccess('not valid json'))
      .mockImplementationOnce(mockSuccess(JSON.stringify([{ month: '2026-03' }])))
      .mockImplementationOnce(mockSuccess('also bad'))

    const result = await getUsageData()
    expect(result.daily).toBeUndefined()
    expect(result.monthly).toEqual([{ month: '2026-03' }])
    expect(result.session).toBeUndefined()
  })

  it('dispatches all 3 calls in parallel before any settle', async () => {
    // All calls are dispatched synchronously, then we await
    let callCount = 0
    mockExecFile.mockImplementation((_cmd, _args, _opts, cb) => {
      callCount++
      // Defer callback to simulate async
      setImmediate(() => cb(null, { stdout: '[]', stderr: '' }))
    })

    const promise = getUsageData()
    // All 3 calls should be made before any callback fires
    expect(callCount).toBe(3)
    await promise
  })
})
