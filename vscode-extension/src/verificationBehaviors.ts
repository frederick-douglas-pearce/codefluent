import { TimestampedMessage } from './parser'
import { ParsedConversation } from './conversation'

const WINDOW = 10
const MIN_CONVS_FOR_RATE = 5
const EDIT_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit'])
const REVIEW_TOOLS = new Set(['Read', 'Grep'])
const TEST_PATTERN = /\b(npm (run )?test|pytest|jest|cargo test|go test|rspec|mocha|vitest|bun test|tox)\b/i
const COMMIT_PATTERN = /\bgit commit\b/

export interface ConversationVerification {
  edits_count: number             // count of edit clusters (maximal Edit/Write runs)
  reviewed_edits: number          // clusters followed by Read/Grep within WINDOW tool positions
  commits_count: number           // count of `git commit` Bash invocations
  tested_commits: number          // commits with a test command in the prior WINDOW tool positions
  review_before_accept_rate: number  // reviewed_edits / edits_count, 0-1
  test_before_commit_rate: number    // tested_commits / commits_count, 0-1
}

export interface AggregateVerification {
  total_edit_clusters: number
  total_reviewed_edits: number
  review_before_accept_rate: number
  total_commits: number
  total_tested_commits: number
  test_before_commit_rate: number
  conversations_with_edits: number
  conversations_with_commits: number
  conversation_count: number
  insufficient_edits: boolean       // conversations_with_edits < 5
  insufficient_commits: boolean     // conversations_with_commits < 5
}

export interface WeeklyVerification {
  week: string
  review_before_accept_rate: number
  test_before_commit_rate: number
  edit_clusters: number
  commits: number
  conversations_with_edits: number
  conversations_with_commits: number
  conversation_count: number
}

function roundRate(x: number): number {
  return Math.round(x * 10000) / 10000
}

function isoWeekKey(timestamp: string): string | null {
  const d = new Date(timestamp)
  if (isNaN(d.getTime())) return null
  const dayOfYear = Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 1).getTime()) / 86400000) + 1
  const dayOfWeek = d.getDay() || 7
  const weekNum = Math.ceil((dayOfYear - dayOfWeek + 10) / 7)
  let year = d.getFullYear()
  if (weekNum < 1) {
    year--
    return `${year}-W52`
  }
  if (weekNum > 52) {
    const dec31 = new Date(year, 11, 31)
    const dec31Day = dec31.getDay() || 7
    if (dec31Day < 4) return `${year + 1}-W01`
  }
  return `${year}-W${String(weekNum).padStart(2, '0')}`
}

function flattenTools(messages: TimestampedMessage[]): { tools: string[]; commands: string[] } {
  const tools: string[] = []
  const commands: string[] = []
  for (const msg of messages) {
    if (!msg.tool_names) continue
    for (let i = 0; i < msg.tool_names.length; i++) {
      tools.push(msg.tool_names[i])
      commands.push(msg.bash_commands?.[i] || '')
    }
  }
  return { tools, commands }
}

/**
 * Analyze a conversation's tool sequence for two verification patterns:
 * - Review after edit: each maximal Edit/Write cluster is "reviewed" if a
 *   Read/Grep follows within WINDOW tool positions.
 * - Test before commit: each `git commit` Bash is "tested" if a test-runner
 *   Bash precedes it within WINDOW tool positions.
 *
 * Edit clusters are counted as units (not per individual edit) so a long
 * burst of edits followed by a single Read scores as one reviewed cluster
 * rather than inflating both numerator and denominator.
 */
export function computeConversationVerification(
  messages: TimestampedMessage[],
): ConversationVerification {
  const { tools, commands } = flattenTools(messages)

  let editClusters = 0
  let reviewedClusters = 0
  let i = 0
  while (i < tools.length) {
    if (!EDIT_TOOLS.has(tools[i])) {
      i++
      continue
    }
    let end = i
    while (end + 1 < tools.length && EDIT_TOOLS.has(tools[end + 1])) end++
    editClusters++
    const limit = Math.min(end + 1 + WINDOW, tools.length)
    for (let j = end + 1; j < limit; j++) {
      if (REVIEW_TOOLS.has(tools[j])) {
        reviewedClusters++
        break
      }
    }
    i = end + 1
  }

  let commits = 0
  let testedCommits = 0
  for (let k = 0; k < tools.length; k++) {
    if (tools[k] !== 'Bash') continue
    if (!COMMIT_PATTERN.test(commands[k])) continue
    commits++
    const lo = Math.max(0, k - WINDOW)
    for (let m = k - 1; m >= lo; m--) {
      if (tools[m] !== 'Bash') continue
      if (COMMIT_PATTERN.test(commands[m])) break
      if (TEST_PATTERN.test(commands[m])) {
        testedCommits++
        break
      }
    }
  }

  return {
    edits_count: editClusters,
    reviewed_edits: reviewedClusters,
    commits_count: commits,
    tested_commits: testedCommits,
    review_before_accept_rate: editClusters > 0 ? roundRate(reviewedClusters / editClusters) : 0,
    test_before_commit_rate: commits > 0 ? roundRate(testedCommits / commits) : 0,
  }
}

export function computeVerificationMetrics(
  conversations: ParsedConversation[],
): AggregateVerification {
  let totalEdits = 0
  let totalReviewed = 0
  let totalCommits = 0
  let totalTested = 0
  let convsWithEdits = 0
  let convsWithCommits = 0

  for (const conv of conversations) {
    totalEdits += conv.edits_count || 0
    totalReviewed += conv.reviewed_edits || 0
    totalCommits += conv.commits_count || 0
    totalTested += conv.tested_commits || 0
    if ((conv.edits_count || 0) > 0) convsWithEdits++
    if ((conv.commits_count || 0) > 0) convsWithCommits++
  }

  return {
    total_edit_clusters: totalEdits,
    total_reviewed_edits: totalReviewed,
    review_before_accept_rate: totalEdits > 0 ? roundRate(totalReviewed / totalEdits) : 0,
    total_commits: totalCommits,
    total_tested_commits: totalTested,
    test_before_commit_rate: totalCommits > 0 ? roundRate(totalTested / totalCommits) : 0,
    conversations_with_edits: convsWithEdits,
    conversations_with_commits: convsWithCommits,
    conversation_count: conversations.length,
    insufficient_edits: convsWithEdits < MIN_CONVS_FOR_RATE,
    insufficient_commits: convsWithCommits < MIN_CONVS_FOR_RATE,
  }
}

export function computeWeeklyVerification(
  conversations: ParsedConversation[],
): WeeklyVerification[] {
  if (conversations.length === 0) return []

  const weekGroups = new Map<string, ParsedConversation[]>()
  for (const conv of conversations) {
    if (!conv.started_at) continue
    const week = isoWeekKey(conv.started_at)
    if (!week) continue
    const group = weekGroups.get(week)
    if (group) group.push(conv)
    else weekGroups.set(week, [conv])
  }

  const result: WeeklyVerification[] = []
  for (const [week, weekConvs] of weekGroups) {
    const edits = weekConvs.reduce((s, c) => s + (c.edits_count || 0), 0)
    const reviewed = weekConvs.reduce((s, c) => s + (c.reviewed_edits || 0), 0)
    const commits = weekConvs.reduce((s, c) => s + (c.commits_count || 0), 0)
    const tested = weekConvs.reduce((s, c) => s + (c.tested_commits || 0), 0)
    const convsWithEdits = weekConvs.filter(c => (c.edits_count || 0) > 0).length
    const convsWithCommits = weekConvs.filter(c => (c.commits_count || 0) > 0).length

    result.push({
      week,
      review_before_accept_rate: edits > 0 ? roundRate(reviewed / edits) : 0,
      test_before_commit_rate: commits > 0 ? roundRate(tested / commits) : 0,
      edit_clusters: edits,
      commits,
      conversations_with_edits: convsWithEdits,
      conversations_with_commits: convsWithCommits,
      conversation_count: weekConvs.length,
    })
  }
  result.sort((a, b) => a.week.localeCompare(b.week))
  return result
}
