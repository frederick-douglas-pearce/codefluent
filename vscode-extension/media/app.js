// CodeFluent — VS Code Webview Application
// Uses postMessage IPC to communicate with the extension host

const vscode = acquireVsCodeApi()

// --- postMessage IPC ---
const pendingRequests = new Map()
let requestCounter = 0

function postMessageRequest(type, payload) {
  const requestId = `req-${++requestCounter}-${Date.now()}`
  return new Promise((resolve, reject) => {
    pendingRequests.set(requestId, { resolve, reject })
    vscode.postMessage({ type, requestId, payload })
  })
}

window.addEventListener('message', event => {
  const msg = event.data
  if (msg.type === 'usageUpdated') {
    state.usage = msg.data
    renderUsageDashboard()
    updateCacheStatus('Usage data refreshed')
    return
  }
  if (msg.type === 'conversationsUpdated') {
    state.conversations = msg.data
    state.conversationAnalytics = null  // Invalidate so Usage tab re-fetches
    state.conversationsExplorer = null  // Invalidate so Conversations tab re-fetches
    if (document.querySelector('.tab.active')?.dataset?.tab === 'usage') {
      loadConversationAnalytics()
    }
    if (document.querySelector('.tab.active')?.dataset?.tab === 'conversations') {
      loadConversationsExplorer()
    }
    return
  }
  if (!msg.requestId) return
  const pending = pendingRequests.get(msg.requestId)
  if (!pending) return
  pendingRequests.delete(msg.requestId)
  if (msg.error) {
    pending.reject(new Error(msg.error))
  } else {
    pending.resolve(msg.data)
  }
})

// --- Config (display defaults, overridden by getConfig IPC) ---
let DISPLAY_CONFIG = {
  'display.scoreColorGreen': 70,
  'display.scoreColorAmber': 50,
  'display.sparklineMaxWeeks': 12,
  'display.dataCacheTtlMinutes': 5
}
const SPARKLINE_MAX_WEEKS = () => DISPLAY_CONFIG['display.sparklineMaxWeeks']
const SCORE_GREEN = () => DISPLAY_CONFIG['display.scoreColorGreen']
const SCORE_AMBER = () => DISPLAY_CONFIG['display.scoreColorAmber']

async function loadConfig() {
  try {
    DISPLAY_CONFIG = await postMessageRequest('getConfig')
  } catch (e) { /* use defaults */ }
}

// --- State ---
let state = {
  usage: null,
  conversations: null,
  scores: null,
  quickwins: null,
  optimizer: null,
  conversationAnalytics: null,
  conversationsExplorer: null,
  configMaturity: null,
  enforcementGaps: null,
  activeTab: 'fluency'
}

// --- Chart instances (destroy before re-creating) ---
let charts = {}

// --- Anthropic Benchmarks (loaded from shared/benchmarks.json via IPC) ---
let BENCHMARKS = {}

const BEHAVIOR_LABELS = {
  iteration_and_refinement: 'Iteration & Refinement',
  building_on_responses: 'Building on Responses',
  clarifying_goals: 'Clarifying Goals',
  adjusting_approach: 'Adjusting Approach',
  questioning_reasoning: 'Questioning Reasoning',
  providing_feedback: 'Providing Feedback',
  specifying_format: 'Specifying Format',
  setting_interaction_terms: 'Setting Interaction Terms',
  checking_facts: 'Checking Facts',
  providing_examples: 'Providing Examples',
  identifying_missing_context: 'Identifying Missing Context',
}

const BEHAVIOR_DESCRIPTIONS = {
  iteration_and_refinement: 'Builds on Claude\'s responses by refining requests rather than accepting the first answer. Indicates deeper engagement with AI output.',
  building_on_responses: 'Uses Claude\'s output as a foundation for further work — extending, combining, or adapting what was generated.',
  clarifying_goals: 'Clearly states what they\'re trying to accomplish before or during the interaction, giving Claude better context.',
  adjusting_approach: 'Changes strategy mid-conversation based on Claude\'s responses — pivoting when something isn\'t working.',
  questioning_reasoning: 'Asks Claude to explain its rationale — "Why this approach?" or "What are the trade-offs?" Drives deeper understanding.',
  providing_feedback: 'Gives explicit feedback on response quality — "That\'s not quite right" or "Good, but simplify it." Helps steer the conversation.',
  specifying_format: 'Tells Claude how to structure output — "Use bullet points", "Show me a table", "Keep it under 5 lines."',
  setting_interaction_terms: 'Defines how Claude should behave — "Push back if my approach is wrong", "Explain your uncertainty." Only ~30% of users do this.',
  checking_facts: 'Verifies or questions factual claims in Claude\'s output — "Are you sure this API exists?" Guards against hallucination.',
  providing_examples: 'Shows Claude examples of desired output — "Follow this pattern" or pasting a code snippet. Dramatically improves quality.',
  identifying_missing_context: 'Spots gaps in Claude\'s knowledge — "What assumptions are you making?" or "What context would help you here?"',
}

const PATTERN_LABELS = {
  conceptual_inquiry: 'Conceptual Inquiry',
  generation_then_comprehension: 'Gen-Then-Comprehension',
  hybrid_code_explanation: 'Hybrid Code+Explanation',
  ai_delegation: 'AI Delegation',
  progressive_ai_reliance: 'Progressive AI Reliance',
  iterative_ai_debugging: 'Iterative AI Debugging',
}

const PATTERN_DESCRIPTIONS = {
  conceptual_inquiry: 'Asks conceptual questions to understand how things work, then writes code manually. Highest comprehension scores (86%).',
  generation_then_comprehension: 'Generates code with AI first, then asks follow-up questions to understand what was produced.',
  hybrid_code_explanation: 'Requests code and explanations simultaneously — "Write X and explain how it works."',
  ai_delegation: 'Entirely delegates tasks to AI with minimal engagement or understanding. Lowest comprehension scores (<40%).',
  progressive_ai_reliance: 'Starts conversations engaged and asking questions, but gradually offloads more work to AI without checking understanding.',
  iterative_ai_debugging: 'Uses AI to debug code without trying to understand the root cause — repeatedly asks "fix this" without learning.',
}

const HIGH_QUALITY_PATTERNS = ['conceptual_inquiry', 'generation_then_comprehension', 'hybrid_code_explanation']

const PATTERN_COLORS = ['#D97706', '#059669', '#2563EB', '#DC2626', '#7C3AED', '#EC4899']

const TASK_TYPE_LABELS = {
  feature: 'Feature',
  bug_fix: 'Bug Fix',
  refactor: 'Refactor',
  debug: 'Debug',
  test: 'Test',
  docs: 'Docs',
  chore: 'Chore',
  exploration: 'Exploration',
}

const TASK_TYPE_COLORS = {
  feature: '#2563EB',
  bug_fix: '#DC2626',
  refactor: '#D97706',
  debug: '#7C3AED',
  test: '#059669',
  docs: '#0891B2',
  chore: '#6B7280',
  exploration: '#EC4899',
}

const TASK_TYPE_UNCLASSIFIED_COLOR = '#9CA3AF'

const TOTAL_BEHAVIORS = 11

// Only these behaviors can be credited from CLAUDE.md config (meta-interaction rules).
const CONFIG_ELIGIBLE = new Set([
  'setting_interaction_terms', 'identifying_missing_context', 'questioning_reasoning'
])

function computeEffectiveScore(fluencyBehaviors, configBehaviors) {
  const allKeys = new Set([
    ...Object.keys(fluencyBehaviors || {}),
    ...Object.keys(configBehaviors || {}),
  ])
  let count = 0
  for (const key of allKeys) {
    if (fluencyBehaviors?.[key] || (CONFIG_ELIGIBLE.has(key) && configBehaviors?.[key])) count++
  }
  return Math.round(count / TOTAL_BEHAVIORS * 100)
}

// --- Recommendations Data ---
const RECOMMENDATIONS = {
  setting_interaction_terms: {
    impact: 'high',
    title: 'Set Interaction Terms More Often',
    advice: "Tell Claude how to interact: 'Push back if my approach seems wrong', 'Explain your uncertainty'. Only ~30% of users do this.",
    action: "Add to your CLAUDE.md: 'Always explain trade-offs. Push back if my approach seems suboptimal.'",
    source: 'Anthropic AI Fluency Index (Feb 2026)',
    prompt: "Before we start, here are my interaction preferences: always explain trade-offs between approaches, push back if my approach seems suboptimal, and flag any assumptions you're making. Let's begin.",
  },
  checking_facts: {
    impact: 'high',
    title: 'Verify Claims After Code Generation',
    advice: "When Claude produces code or technical claims, ask: 'Are you sure this API exists in v4?' Fact-checking drops 3.7pp when generating artifacts.",
    action: 'After code generation, ask one verification question before accepting.',
    source: 'Anthropic AI Fluency Index (Feb 2026)',
    prompt: "Before I accept this code, can you verify: are all the APIs and methods you used actually available in the current version? List any that you're uncertain about.",
  },
  questioning_reasoning: {
    impact: 'medium',
    title: "Ask 'Why This Approach?'",
    advice: "'Why did you choose this approach over X?' — especially for architecture decisions.",
    action: 'Before accepting a design, ask Claude to compare alternatives.',
    source: 'Anthropic AI Fluency Index (Feb 2026)',
    prompt: "Why did you choose this approach? What are 2-3 alternative approaches you considered, and what are the trade-offs of each?",
  },
  identifying_missing_context: {
    impact: 'medium',
    title: 'Check for Missing Context',
    advice: "Ask: 'What assumptions are you making here?' or 'What context would help you do this better?'",
    action: 'At the start of complex tasks, ask Claude what it needs to know.',
    source: 'Anthropic AI Fluency Index (Feb 2026)',
    prompt: "Before you start, what assumptions are you making about this codebase? What additional context or files would help you do a better job?",
  },
  providing_examples: {
    impact: 'medium',
    title: 'Show Examples of What You Want',
    advice: "Paste a code snippet and say 'follow this pattern'. Examples dramatically improve output quality.",
    action: 'When requesting code, include at least one example of the style you want.',
    source: 'Anthropic AI Fluency Index / Best Practices',
    prompt: "Here's an example of the code style I want you to follow:\n\n```\n// [paste your example here]\n```\n\nPlease match this pattern for the new code you write.",
  },
  iteration_and_refinement: {
    impact: 'high',
    title: 'Refine Instead of Accepting First Answers',
    advice: "Don't accept Claude's first response — refine it. Users who iterate get significantly better results. Ask for changes, improvements, or alternatives.",
    action: "After Claude's first response, ask at least one follow-up to improve it before moving on.",
    source: 'Anthropic AI Fluency Index (Feb 2026)',
    prompt: "That's a good start, but I'd like you to improve it. Specifically: [describe what to change]. Also, are there any edge cases or improvements you'd make?",
  },
  building_on_responses: {
    impact: 'high',
    title: "Build on Claude's Output",
    advice: "Use Claude's responses as a foundation — extend, combine, or adapt what was generated rather than starting fresh each time.",
    action: "Reference Claude's previous output in your next prompt: 'Using the function you just wrote, now add...'",
    source: 'Anthropic AI Fluency Index (Feb 2026)',
    prompt: "Good. Now using the code you just wrote, extend it to also handle [describe next requirement]. Keep the same patterns and style.",
  },
  clarifying_goals: {
    impact: 'medium',
    title: 'State Your Goal Upfront',
    advice: "Tell Claude what you're trying to accomplish before asking for code. Context about the 'why' produces better results than just the 'what'.",
    action: 'Start complex prompts with a one-sentence goal statement before the request.',
    source: 'Anthropic AI Fluency Index (Feb 2026)',
    prompt: "Goal: I'm building [describe what and why]. To accomplish this, I need you to [specific request]. Here's the relevant context: [key details].",
  },
  adjusting_approach: {
    impact: 'medium',
    title: 'Pivot When Something Isn\'t Working',
    advice: "If Claude's approach isn't working, say so and change direction. Don't keep pushing the same failing strategy — pivot explicitly.",
    action: "When stuck, tell Claude: 'This approach isn't working. Let's try a different strategy.'",
    source: 'Anthropic AI Fluency Index (Feb 2026)',
    prompt: "This approach isn't working well because [explain why]. Let's try a completely different strategy. What alternatives would you suggest for solving [the problem]?",
  },
  providing_feedback: {
    impact: 'medium',
    title: 'Give Explicit Feedback on Responses',
    advice: "Tell Claude what's working and what isn't: 'The structure is good but simplify the error handling.' Specific feedback steers the conversation.",
    action: "After each major response, give one piece of positive and one piece of constructive feedback.",
    source: 'Anthropic AI Fluency Index (Feb 2026)',
    prompt: "The overall structure is good, but [specific issue]. Please revise with these changes: [list concrete changes]. Keep [what was good] the same.",
  },
  specifying_format: {
    impact: 'medium',
    title: 'Specify Your Desired Output Format',
    advice: "Tell Claude how to structure output: 'Use bullet points', 'Show a table', 'Keep it under 10 lines'. Format specs reduce back-and-forth.",
    action: 'Add format instructions to requests: length, structure, style, or level of detail.',
    source: 'Anthropic AI Fluency Index (Feb 2026)',
    prompt: "Please respond with: 1) A one-paragraph summary, 2) A bullet-point list of key changes, 3) Any caveats or risks. Keep the total response under 20 lines.",
  },
}

const PATTERN_RECOMMENDATIONS = {
  ai_delegation: {
    impact: 'high',
    title: "You're Delegating Too Much",
    advice: "You're offloading entire tasks without engaging. Ask 'How does this work?' after code generation. Comprehension scores 86% for conceptual inquiry vs <40% for delegation.",
    source: 'Anthropic Coding Skills Formation Study (Jan 2026)',
    prompt: "Before you implement this, walk me through your planned approach step by step. I want to understand the design before you write code.",
  },
  progressive_ai_reliance: {
    impact: 'high',
    title: 'You Start Engaged But Drift',
    advice: 'You begin conversations asking good questions but gradually let Claude drive. Set a rule: every 3rd prompt should be a comprehension question.',
    source: 'Anthropic Coding Skills Formation Study (Jan 2026)',
    prompt: "Pause — before we continue, explain what the last change you made actually does and why it works. I want to make sure I understand before moving on.",
  },
  iterative_ai_debugging: {
    impact: 'medium',
    title: 'Understand Before Debugging',
    advice: "Before asking Claude to fix a bug, explain what you think is wrong. 'I think the issue is X because Y' forces understanding.",
    source: 'Anthropic Coding Skills Formation Study (Jan 2026)',
    prompt: "I think the bug is caused by [describe your hypothesis]. Can you confirm whether I'm on the right track before fixing it? Explain what's actually happening.",
  },
}

// --- Tab Switching ---
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab))
})

function switchTab(tabName) {
  state.activeTab = tabName
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'))
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'))
  document.querySelector(`[data-tab="${tabName}"]`).classList.add('active')
  document.getElementById(`tab-${tabName}`).classList.add('active')

  if (tabName === 'recommendations' && state.scores) {
    renderRecommendations()
  }

  if (tabName === 'usage') {
    loadConversationAnalytics()
  }

  if (tabName === 'conversations') {
    if (!state.conversationsExplorer) loadConversationsExplorer()
  }

  if (tabName === 'config' && !state.configMaturity) {
    loadConfigMaturity()
  }
}

// --- Optimizer char counter ---
const optimizerTextarea = document.getElementById('optimizer-textarea')
if (optimizerTextarea) {
  optimizerTextarea.addEventListener('input', () => {
    const count = optimizerTextarea.value.length
    document.getElementById('optimizer-char-count').textContent = `${count.toLocaleString()} / 10,000`
  })
}

// --- Data Loading ---
async function loadData() {
  try {
    const [usage, conversations] = await Promise.all([
      postMessageRequest('getUsage'),
      postMessageRequest('getConversations'),
    ])
    state.usage = usage
    state.conversations = conversations
    renderUsageDashboard()
    updateTimeScopeCounts()
  } catch (e) {
    console.error('Failed to load data:', e)
    const pace = document.getElementById('usage-pace')
    const canvas = document.getElementById('usage-chart')
    if (pace) pace.innerHTML = ''
    if (canvas) {
      canvas.style.display = 'none'
      canvas.parentElement.querySelector('h3').insertAdjacentHTML('afterend',
        '<div class="empty-state-box"><div class="empty-state-icon">⚠️</div><p class="empty-state">Failed to load usage data. Ensure ccusage is installed (npx ccusage) and try the Refresh button on the Usage tab.</p></div>')
    }
  }
}

// --- Helpers ---
function escapeHtml(str) {
  if (typeof str !== 'string') return String(str)
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;')
}

let cacheStatusTimer = null
function updateCacheStatus(text) {
  const el = document.getElementById('cache-status')
  if (!el) return
  el.textContent = text
  if (cacheStatusTimer) clearTimeout(cacheStatusTimer)
  cacheStatusTimer = setTimeout(() => { el.textContent = '' }, 3000)
}

function formatTokens(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K'
  return n.toString()
}

function formatCost(n) {
  return '$' + n.toFixed(2)
}

// --- Tooltip Helper (ARIA-accessible) ---
let tooltipCounter = 0
function renderTooltip(text) {
  const id = `tooltip-${++tooltipCounter}`
  return `<span class="info-icon" tabindex="0" aria-describedby="${id}">i<span class="info-tooltip" id="${id}" role="tooltip">${text}</span></span>`
}

// Disable Chart.js animations for reliable rendering
Chart.defaults.animation = false

function destroyChart(name) {
  if (charts[name]) {
    charts[name].destroy()
    charts[name] = null
  }
}

function showLoader(tabId) {
  document.getElementById(tabId).innerHTML =
    '<div class="scoring-loader"><div class="spinner"></div><p>Analyzing conversations with Claude...</p></div>'
}

// --- Conversation Scope Resolution ---
function resolveConversationIds(scopeValue, conversations) {
  const [type, rawVal] = scopeValue.split(':')
  const val = parseInt(rawVal)

  if (type === 'days') {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - val)
    const filtered = conversations.filter(s =>
      s.started_at && new Date(s.started_at) >= cutoff
    )
    return {
      ids: filtered.map(s => s.id),
      description: `Last ${val} days (${filtered.length} conversations)`
    }
  }

  // Default: count-based
  const count = isNaN(val) ? 5 : val
  const sliced = conversations.slice(0, count)
  return {
    ids: sliced.map(s => s.id),
    description: `${sliced.length} conversations`
  }
}

function updateTimeScopeCounts() {
  if (!state.conversations?.conversations) return
  const select = document.getElementById('conversation-scope')
  if (!select) return
  for (const option of select.options) {
    if (!option.value.startsWith('days:')) continue
    const { description } = resolveConversationIds(option.value, state.conversations.conversations)
    option.textContent = description
  }
}

// --- Event Delegation (CSP blocks inline onclick handlers) ---
document.addEventListener('click', (e) => {
  const target = e.target

  // Onboarding dismiss
  if (target.classList.contains('onboarding-dismiss')) {
    const card = document.getElementById('onboarding-card')
    if (card) card.style.display = 'none'
    const s = vscode.getState() || {}
    s.hasSeenOnboarding = true
    vscode.setState(s)
    return
  }

  // Refresh data button
  if (target.id === 'refresh-data-btn') {
    vscode.postMessage({ type: 'refreshData' })
    updateCacheStatus('Refreshing...')
    return
  }

  // Copy button
  if (target.classList.contains('copy-btn')) {
    const wrapper = target.closest('.task-prompt') || target.closest('.prompt-box-wrapper')
    const text = (wrapper.querySelector('.prompt-text') || wrapper.querySelector('.prompt-box')).textContent
    vscode.postMessage({ type: 'copyToClipboard', text })
    target.textContent = 'Copied!'
    setTimeout(() => target.textContent = 'Copy', 2000)
    return
  }

  // Optimize button
  if (target.id === 'optimize-btn') {
    runOptimizer()
    return
  }

  // Optimizer copy button
  if (target.classList.contains('optimizer-copy-btn')) {
    const wrapper = target.closest('.optimizer-prompt-panel')
    const text = wrapper.querySelector('.prompt-box').textContent
    vscode.postMessage({ type: 'copyToClipboard', text })
    target.textContent = 'Copied!'
    setTimeout(() => target.textContent = 'Copy', 2000)
    return
  }

  // Optimizer run button
  if (target.classList.contains('optimizer-run-btn')) {
    const wrapper = target.closest('.optimizer-prompt-panel')
    const text = wrapper.querySelector('.prompt-box').textContent
    vscode.postMessage({ type: 'runInTerminal', prompt: text, repo: '' })
    target.textContent = 'Launched!'
    setTimeout(() => target.textContent = 'Run', 2000)
    return
  }

  // Run in terminal button
  if (target.classList.contains('run-btn')) {
    const wrapper = target.closest('.task-prompt')
    const text = wrapper.querySelector('.prompt-text').textContent
    const card = target.closest('.task-card')
    const repo = card ? (card.querySelector('.task-repo')?.textContent || '') : ''
    vscode.postMessage({ type: 'runInTerminal', prompt: text, repo: repo })
    target.textContent = 'Launched!'
    setTimeout(() => target.textContent = 'Run', 2000)
    return
  }

  // Show more conversations
  if (target.classList.contains('show-more-btn')) {
    const btn = target
    let shown = parseInt(btn.dataset.shown, 10)
    const total = parseInt(btn.dataset.total, 10)
    const batch = parseInt(btn.dataset.batch, 10)
    const items = btn.parentElement.querySelectorAll('.conversation-item')
    const newShown = Math.min(shown + batch, total)
    for (let i = shown; i < newShown; i++) {
      items[i].style.display = ''
    }
    btn.dataset.shown = newShown
    const remaining = total - newShown
    if (remaining <= 0) {
      btn.remove()
    } else {
      btn.textContent = `Show ${remaining} more conversation${remaining !== 1 ? 's' : ''}`
    }
    return
  }

  // Conversation table sort headers
  const sortTh = target.closest('#conversation-token-table th.sortable')
  if (sortTh) {
    const col = sortTh.dataset.sort
    if (conversationTableSort.column === col) {
      conversationTableSort.direction = conversationTableSort.direction === 'asc' ? 'desc' : 'asc'
    } else {
      conversationTableSort.column = col
      conversationTableSort.direction = col === 'date' ? 'desc' : 'desc'
    }
    if (state.conversationAnalytics) renderConversationTokenTable(state.conversationAnalytics.conversations)
    return
  }

  // Conversation table show more
  if (target.id === 'conversation-table-show-more') {
    conversationTableShowCount += 10
    if (state.conversationAnalytics) renderConversationTokenTable(state.conversationAnalytics.conversations)
    return
  }

  // Conversations list table sort headers
  const convListSortTh = target.closest('#conversations-list-table th.sortable')
  if (convListSortTh) {
    const col = convListSortTh.dataset.sort
    if (conversationsListSort.column === col) {
      conversationsListSort.direction = conversationsListSort.direction === 'asc' ? 'desc' : 'asc'
    } else {
      conversationsListSort.column = col
      conversationsListSort.direction = 'desc'
    }
    if (state.conversationsExplorer) renderConversationsListTable(state.conversationsExplorer.conversations)
    return
  }

  // Conversations list show more
  if (target.id === 'conversations-show-more-btn') {
    conversationsListShowCount += 20
    if (state.conversationsExplorer) renderConversationsListTable(state.conversationsExplorer.conversations)
    return
  }

  // Conversation row click for detail view
  const convRow = target.closest('#conversations-list-tbody tr')
  if (convRow && !target.closest('.conversation-detail-row')) {
    toggleConversationDetail(convRow)
    return
  }

  // Show more gaps button
  if (target.id === 'show-more-gaps-btn') {
    const hiddenGaps = document.querySelectorAll('.gap-item.gap-hidden')
    hiddenGaps.forEach(el => el.classList.remove('gap-hidden'))
    target.remove()
    return
  }

  // Conversation item expand/collapse
  const conversationItem = target.closest('.conversation-item')
  if (conversationItem) {
    conversationItem.classList.toggle('expanded')
    return
  }
})

// --- Usage Dashboard ---
function renderUsageDashboard() {
  const daily = state.usage?.daily?.daily || []
  if (!daily.length) {
    document.getElementById('usage-pace').innerHTML = ''
    const canvas = document.getElementById('usage-chart')
    if (canvas) {
      destroyChart('usage')
      canvas.parentElement.querySelector('h3').insertAdjacentHTML('afterend',
        '<div class="empty-state-box"><div class="empty-state-icon">📊</div><p class="empty-state">No usage data yet. Start using Claude Code to see your token usage and costs here.</p></div>')
      canvas.style.display = 'none'
    }
    return
  }

  // Token usage line chart with log scale (cache read, cache creation, input, output)
  // Zero values replaced with null so Chart.js skips them (log(0) is undefined)
  // spanGaps linearly interpolates between adjacent non-null points
  const toLog = v => (v > 0 ? v : null)

  destroyChart('usage')
  charts.usage = new Chart(document.getElementById('usage-chart').getContext('2d'), {
    type: 'line',
    data: {
      labels: daily.map(d => d.date),
      datasets: [
        {
          label: 'Output',
          data: daily.map(d => toLog(d.outputTokens)),
          borderColor: '#2563EB',
          backgroundColor: '#2563EB',
          tension: 0.3,
          pointRadius: 3,
          pointHoverRadius: 6,
          borderWidth: 2,
          spanGaps: true,
        },
        {
          label: 'Input',
          data: daily.map(d => toLog(d.inputTokens)),
          borderColor: '#059669',
          backgroundColor: '#059669',
          tension: 0.3,
          pointRadius: 3,
          pointHoverRadius: 6,
          borderWidth: 2,
          spanGaps: true,
        },
        {
          label: 'Cache Creation',
          data: daily.map(d => toLog(d.cacheCreationTokens)),
          borderColor: '#B45309',
          backgroundColor: '#B45309',
          tension: 0.3,
          pointRadius: 3,
          pointHoverRadius: 6,
          borderWidth: 2,
          spanGaps: true,
        },
        {
          label: 'Cache Read',
          data: daily.map(d => toLog(d.cacheReadTokens)),
          borderColor: '#D97706',
          backgroundColor: '#D97706',
          tension: 0.3,
          pointRadius: 3,
          pointHoverRadius: 6,
          borderWidth: 2,
          spanGaps: true,
        },
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top' },
        tooltip: {
          mode: 'index',
          callbacks: { label: ctx => ctx.raw != null ? `${ctx.dataset.label}: ${formatTokens(ctx.raw)}` : '' }
        }
      },
      scales: {
        y: {
          type: 'logarithmic',
          ticks: { callback: v => formatTokens(v) }
        },
        x: { ticks: { maxTicksLimit: 15 } }
      }
    }
  })

  // Usage pace
  renderUsagePace(daily)

  // Show ccusage scope label when we have data
  const scopeLabel = document.getElementById('ccusage-scope-label')
  if (scopeLabel) scopeLabel.style.display = daily.length ? '' : 'none'
}

// --- Usage Pace ---
function renderUsagePace(daily) {
  if (!daily.length) return
  const container = document.getElementById('usage-pace')

  const today = daily[daily.length - 1]
  const last7 = daily.slice(-7)
  const last30 = daily.slice(-30)

  const avgDaily = daily.reduce((s, d) => s + d.totalCost, 0) / daily.length
  const avg7 = last7.reduce((s, d) => s + d.totalCost, 0) / last7.length
  const todayCost = today.totalCost
  const todayTokens = today.totalTokens

  // Pace comparison: today vs average
  const todayPct = avgDaily > 0 ? Math.round((todayCost / avgDaily) * 100) : 0
  const paceLabel = todayPct > 120 ? 'Above average' : todayPct > 80 ? 'On pace' : 'Below average'
  const paceClass = todayPct > 120 ? 'pace-high' : todayPct > 80 ? 'pace-normal' : 'pace-low'

  // Rolling windows
  const cost7 = last7.reduce((s, d) => s + d.totalCost, 0)
  const tokens7 = last7.reduce((s, d) => s + d.totalTokens, 0)
  const cost30 = last30.reduce((s, d) => s + d.totalCost, 0)
  const tokens30 = last30.reduce((s, d) => s + d.totalTokens, 0)

  // Monthly projection from last 7 day avg
  const projectedMonthly = avg7 * 30

  // Bar and average marker positions: scale is 0 to max(todayCost, avgDaily)
  const scaleMax = Math.max(todayCost, avgDaily, 0.01)
  const barWidth = (todayCost / scaleMax) * 100
  const avgPos = (avgDaily / scaleMax) * 100

  container.innerHTML = `
    <h3>Usage Pace</h3>
    <div class="pace-grid">
      <div class="pace-card">
        <div class="pace-card-title">Today</div>
        <div class="pace-card-value">${formatCost(todayCost)}</div>
        <div class="pace-card-detail">${formatTokens(todayTokens)} tokens</div>
        <div class="pace-bar-track">
          <div class="pace-bar-fill ${paceClass}" style="width: ${Math.min(barWidth, 100)}%"></div>
          <div class="pace-bar-avg" style="left: ${Math.min(avgPos, 100)}%" title="Daily average: ${formatCost(avgDaily)}"></div>
        </div>
        <div class="pace-bar-labels">
          <span class="${paceClass}">${paceLabel} (${todayPct}% of avg)</span>
          <span>avg: ${formatCost(avgDaily)}/day</span>
        </div>
      </div>
      <div class="pace-card">
        <div class="pace-card-title">Last 7 Days</div>
        <div class="pace-card-value">${formatCost(cost7)}</div>
        <div class="pace-card-detail">${formatTokens(tokens7)} tokens · avg ${formatCost(avg7)}/day</div>
      </div>
      <div class="pace-card">
        <div class="pace-card-title">Last 30 Days</div>
        <div class="pace-card-value">${formatCost(cost30)}</div>
        <div class="pace-card-detail">${formatTokens(tokens30)} tokens · ${last30.length} active days</div>
      </div>
      <div class="pace-card">
        <div class="pace-card-title">Monthly Projection</div>
        <div class="pace-card-value">${formatCost(projectedMonthly)}</div>
        <div class="pace-card-detail">Based on last 7-day avg of ${formatCost(avg7)}/day</div>
      </div>
    </div>`
}

// --- Fluency Scoring ---
document.getElementById('run-scoring-btn').addEventListener('click', () => {
  const scopeValue = document.getElementById('conversation-scope').value
  runScoring(scopeValue)
})

async function runScoring(scopeValue) {
  const btn = document.getElementById('run-scoring-btn')
  btn.disabled = true
  btn.textContent = 'Loading sessions...'

  // Always fetch fresh conversations before scoring
  try {
    state.conversations = await postMessageRequest('getConversations')
    updateTimeScopeCounts()
  } catch (e) {
    document.getElementById('fluency-results').innerHTML =
      '<p class="empty-state">Failed to load conversations. Please try again.</p>'
    btn.disabled = false
    btn.textContent = 'Run Analysis'
    return
  }

  if (!state.conversations?.conversations?.length) {
    document.getElementById('fluency-results').innerHTML =
      '<p class="empty-state">No conversations found. Check your session data path.</p>'
    btn.disabled = false
    btn.textContent = 'Run Analysis'
    return
  }

  const { ids, description } = resolveConversationIds(scopeValue, state.conversations.conversations)
  if (ids.length === 0) {
    document.getElementById('fluency-results').innerHTML =
      '<p class="empty-state">No conversations found in the selected time range.</p>'
    btn.disabled = false
    btn.textContent = 'Run Analysis'
    return
  }

  const forceRescore = document.getElementById('force-rescore').checked

  // Persist selection
  const s = vscode.getState() || {}
  s.conversationScope = scopeValue
  vscode.setState(s)

  btn.textContent = 'Analyzing...'
  showLoader('fluency-results')

  try {
    state.hasFreshScores = true
    state.scores = await postMessageRequest('runScoring', { conversation_ids: ids, force_rescore: forceRescore })
    renderFluencyScore()
  } catch (e) {
    document.getElementById('fluency-results').innerHTML =
      `<p class="empty-state">Error: ${escapeHtml(e.message)}</p>`
  } finally {
    btn.disabled = false
    btn.textContent = 'Run Analysis'
  }
}

function renderSparkline(history) {
  const scores = history.map(h => h.score)
  const min = 0
  const max = 100
  const w = 80
  const h = 28
  const pad = 3
  const points = scores.map((s, i) => {
    const x = pad + (i / Math.max(scores.length - 1, 1)) * (w - pad * 2)
    const y = pad + (1 - (s - min) / (max - min)) * (h - pad * 2)
    return `${x},${y}`
  })
  const polyline = points.join(' ')
  const fillPoints = `${points[0].split(',')[0]},${h - pad} ${polyline} ${points[points.length - 1].split(',')[0]},${h - pad}`
  const last = scores[scores.length - 1]
  const color = last >= SCORE_GREEN() ? 'var(--success)' : last >= SCORE_AMBER() ? 'var(--warning)' : 'var(--danger)'
  return `<svg class="sparkline" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">` +
    `<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="4" fill="var(--bg-card)" stroke="var(--border)" stroke-width="1"/>` +
    `<polygon points="${fillPoints}" fill="${color}" opacity="0.12"/>` +
    `<polyline points="${polyline}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>` +
    `</svg>`
}

function renderTrajectoryText(history) {
  if (!history || history.length < 2) return ''
  const current = history[history.length - 1]
  const previous = history[history.length - 2]
  const diff = current.score - previous.score
  const sparkline = renderSparkline(history.slice(-SPARKLINE_MAX_WEEKS()))
  let text
  if (diff > 0) {
    text = `<span class="trend-up">&#9650; Up from ${previous.score} last week</span>`
  } else if (diff < 0) {
    text = `<span class="trend-down">&#9660; Down from ${previous.score} last week</span>`
  } else {
    text = `<span class="trend-flat">&#8213; Same as last week</span>`
  }
  return `<div class="trend-line">${sparkline} ${text}</div>`
}

function renderFluencyScore() {
  const { aggregate, scores } = state.scores
  if (!aggregate?.average_score) {
    document.getElementById('fluency-results').innerHTML =
      '<p class="empty-state">No conversations could be scored.</p>'
    return
  }

  const score = aggregate.average_score
  const circumference = 2 * Math.PI * 52
  const offset = circumference * (1 - score / 100)

  const scoreColor = score >= SCORE_GREEN() ? 'var(--success)' : score >= SCORE_AMBER() ? 'var(--warning)' : 'var(--danger)'

  let html = `
    <div class="score-ring-container">
      <div class="score-ring">
        <svg viewBox="0 0 120 120" class="score-svg">
          <circle cx="60" cy="60" r="52" fill="none" stroke="var(--border)" stroke-width="8"/>
          <circle cx="60" cy="60" r="52" fill="none" stroke="${scoreColor}" stroke-width="8"
            stroke-dasharray="${circumference}" stroke-dashoffset="${offset}" stroke-linecap="round"
            transform="rotate(-90 60 60)"/>
        </svg>
        <div class="score-text">
          <span class="score-value" style="color: ${scoreColor}">${score}</span>
          <span class="score-label">/ 100</span>
        </div>
      </div>
      <p class="score-summary">${aggregate.conversations_scored} of ${aggregate.conversations_requested} conversations scored${aggregate.conversations_skipped ? ` · ${aggregate.conversations_skipped} had no prompts` : ''}${aggregate.conversations_errored ? ` · ${aggregate.conversations_errored} failed` : ''}</p>
      ${renderTrajectoryText(aggregate.score_history)}
    </div>`

  // Behavior bars
  html += '<div class="behaviors-section"><h3>Fluency Behaviors vs. Anthropic Benchmarks</h3>'
  const prevalence = aggregate.behavior_prevalence || {}
  const configBehaviors = aggregate.config_behaviors || {}
  for (const [key, benchmark] of Object.entries(BENCHMARKS)) {
    const userPct = (prevalence[key] || 0) * 100
    const benchPct = benchmark * 100
    let colorClass = 'color-success'
    if (userPct < benchPct - 15) colorClass = 'color-danger'
    else if (userPct < benchPct) colorClass = 'color-warning'

    const configTag = (CONFIG_ELIGIBLE.has(key) && configBehaviors[key]) ? ' <span class="config-tag">CLAUDE.md</span>' : ''

    html += `
      <div class="behavior-bar">
        <div class="behavior-label">
          <span class="behavior-name">${BEHAVIOR_LABELS[key]}${configTag} ${renderTooltip(BEHAVIOR_DESCRIPTIONS[key])}</span>
          <span class="behavior-pct">${Math.round(userPct)}%</span>
        </div>
        <div class="bar-track">
          <div class="bar-fill ${colorClass}" style="width: ${userPct}%"></div>
          <div class="bar-benchmark" style="left: ${benchPct}%" title="Anthropic avg: ${benchPct.toFixed(1)}%"></div>
        </div>
      </div>`
  }
  html += `
    <div class="behaviors-legend">
      <span class="legend-item"><span class="legend-swatch" style="background: var(--success)"></span> At or above benchmark</span>
      <span class="legend-item"><span class="legend-swatch" style="background: var(--warning)"></span> Within 15pp</span>
      <span class="legend-item"><span class="legend-swatch" style="background: var(--danger)"></span> Below by 15pp+</span>
      <span class="legend-item"><span class="legend-swatch" style="background: var(--text-primary); opacity: 0.5"></span> Anthropic benchmark</span>
    </div>
  </div>`

  // Coding patterns donut
  const patterns = aggregate.pattern_distribution || {}
  const patternEntries = Object.entries(patterns).sort((a, b) => b[1] - a[1])
  const totalConversations = Object.values(patterns).reduce((a, b) => a + b, 0)
  const highQualityCount = patternEntries
    .filter(([p]) => HIGH_QUALITY_PATTERNS.includes(p))
    .reduce((sum, [, c]) => sum + c, 0)
  const highQualityPct = totalConversations > 0 ? Math.round(highQualityCount / totalConversations * 100) : 0

  html += `
    <div class="pattern-section">
      <h3>Coding Interaction Patterns</h3>
      <p class="section-desc">Each conversation is classified into one of six coding interaction patterns based on how you engaged with Claude.</p>
      <div class="pattern-layout">
        <div class="pattern-chart-wrap"><canvas id="pattern-chart"></canvas></div>
        <div class="pattern-legend">`

  patternEntries.forEach(([p, count], i) => {
    const pct = totalConversations > 0 ? Math.round(count / totalConversations * 100) : 0
    const isHighQuality = HIGH_QUALITY_PATTERNS.includes(p)
    const nameClass = isHighQuality ? 'pattern-name-high' : 'pattern-name-low'
    const desc = PATTERN_DESCRIPTIONS[p] || ''
    const qualitySuffix = isHighQuality ? ' (High-quality pattern)' : ' (Low-quality pattern)'
    html += `
      <div class="pattern-legend-item">
        <span><span class="${nameClass}">${PATTERN_LABELS[p] || escapeHtml(p)}</span> ${renderTooltip(desc + qualitySuffix)}</span>
        <span>${count} (${pct}%)</span>
      </div>`
  })

  const qualityClass = highQualityPct >= SCORE_AMBER() ? 'quality-good' : 'quality-bad'
  html += `
        </div>
      </div>
      <div class="pattern-quality ${qualityClass}">
        ${highQualityPct}% high-quality interaction patterns
      </div>
    </div>`

  // Conversation breakdown
  const INITIAL_SHOWN = 5
  const BATCH_SIZE = 10
  const validConversations = Object.entries(scores).filter(([, sd]) => !sd.error)
  html += '<div class="conversation-list"><h3>Conversation Breakdown</h3>'
  validConversations.forEach(([sid, scoreData], idx) => {
    const conv = state.conversations.conversations.find(s => s.id === sid)
    const date = conv?.started_at ? new Date(conv.started_at).toLocaleDateString() : ''
    const project = conv?.project || ''
    const effectiveScore = scoreData.effective_score ?? scoreData.overall_score
    const hidden = idx >= INITIAL_SHOWN ? ' style="display:none"' : ''
    html += `
      <div class="conversation-item"${hidden}>
        <div class="conversation-header">
          <span class="conversation-id">${escapeHtml(project)} (${date})</span>
          <span class="conversation-score" style="color: ${effectiveScore >= SCORE_GREEN() ? 'var(--success)' : effectiveScore >= SCORE_AMBER() ? 'var(--warning)' : 'var(--danger)'}">
            ${effectiveScore}/100
          </span>
        </div>
        <div class="conversation-detail">
          <p>${escapeHtml(scoreData.one_line_summary || '')}</p>
          <p>Pattern: ${escapeHtml(PATTERN_LABELS[scoreData.coding_pattern] || scoreData.coding_pattern || '')}</p>
        </div>
      </div>`
  })
  if (validConversations.length > INITIAL_SHOWN) {
    const remaining = validConversations.length - INITIAL_SHOWN
    html += `<button class="show-more-btn" data-shown="${INITIAL_SHOWN}" data-total="${validConversations.length}" data-batch="${BATCH_SIZE}">Show ${remaining} more conversation${remaining !== 1 ? 's' : ''}</button>`
  }
  html += '</div>'

  document.getElementById('fluency-results').innerHTML = html

  // Render pattern donut chart
  if (patternEntries.length) {
    destroyChart('pattern')
    charts.pattern = new Chart(document.getElementById('pattern-chart').getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: patternEntries.map(([p]) => PATTERN_LABELS[p] || p),
        datasets: [{
          data: patternEntries.map(([, c]) => c),
          backgroundColor: patternEntries.map((_, i) => PATTERN_COLORS[i % PATTERN_COLORS.length]),
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } }
      }
    })
  }

}

// --- Prompt Optimizer ---
async function runOptimizer() {
  const textarea = document.getElementById('optimizer-textarea')
  const prompt = textarea.value.trim()
  if (!prompt) {
    document.getElementById('optimizer-results').innerHTML =
      '<p class="empty-state">Please enter a prompt to optimize.</p>'
    return
  }
  if (prompt.length > 10000) {
    document.getElementById('optimizer-results').innerHTML =
      '<p class="empty-state">Prompt must be 10,000 characters or less.</p>'
    return
  }

  const btn = document.getElementById('optimize-btn')
  btn.disabled = true
  btn.textContent = 'Optimizing...'
  showLoader('optimizer-results')

  try {
    state.optimizer = await postMessageRequest('optimizePrompt', { prompt })
    renderOptimizerResults(prompt)
  } catch (e) {
    document.getElementById('optimizer-results').innerHTML =
      `<p class="empty-state">Error: ${escapeHtml(e.message)}</p>`
  } finally {
    btn.disabled = false
    btn.textContent = 'Optimize'
  }
}

function renderOptimizerBehaviorTags(behaviors, addedBehaviors) {
  const added = new Set(addedBehaviors || [])
  return Object.entries(behaviors).map(([key, val]) => {
    let cls = 'opt-behavior-tag'
    if (val && added.has(key)) cls += ' opt-behavior-added'
    else if (val) cls += ' opt-behavior-present'
    else cls += ' opt-behavior-absent'
    return `<span class="${cls}">${escapeHtml(BEHAVIOR_LABELS[key] || key)}</span>`
  }).join('')
}

function renderOptimizerResults(inputPrompt) {
  const data = state.optimizer
  if (!data) return

  const scoreColor = s => s >= SCORE_GREEN() ? 'var(--success)' : s >= SCORE_AMBER() ? 'var(--warning)' : 'var(--danger)'

  // Already good — no-op card
  if (data.already_good) {
    document.getElementById('optimizer-results').innerHTML = `
      <div class="optimizer-good-card">
        <div class="optimizer-good-icon">&#10003;</div>
        <div class="optimizer-good-score" style="color: ${scoreColor(data.input_score)}">${data.input_score}/100</div>
        <div class="optimizer-good-title">Great prompt!</div>
        <p class="optimizer-good-desc">${escapeHtml(data.one_line_summary)}</p>
        <div class="optimizer-behavior-tags">${renderOptimizerBehaviorTags(data.input_behaviors, [])}</div>
      </div>`
    return
  }

  const html = `
    <div class="optimizer-comparison">
      <div class="optimizer-prompt-panel optimizer-input-panel">
        <div class="optimizer-panel-header">
          <span class="optimizer-panel-title">Your Prompt</span>
          <span class="optimizer-panel-score" style="color: ${scoreColor(data.input_score)}">${data.input_score}/100</span>
        </div>
        <div class="optimizer-behavior-tags">${renderOptimizerBehaviorTags(data.input_behaviors, [])}</div>
        <div class="prompt-box-wrapper">
          <pre class="prompt-box">${escapeHtml(inputPrompt)}</pre>
        </div>
      </div>
      <div class="optimizer-arrow">&#x2192;</div>
      <div class="optimizer-prompt-panel optimizer-output-panel">
        <div class="optimizer-panel-header">
          <span class="optimizer-panel-title">Optimized Prompt</span>
          <span class="optimizer-panel-score" style="color: ${scoreColor(data.output_score)}">${data.output_score}/100</span>
        </div>
        <div class="optimizer-behavior-tags">${renderOptimizerBehaviorTags(data.output_behaviors || {}, data.behaviors_added)}</div>
        <div class="prompt-box-wrapper">
          <div class="prompt-box-header">
            <button class="optimizer-run-btn run-btn">Run</button>
            <button class="optimizer-copy-btn copy-btn">Copy</button>
          </div>
          <pre class="prompt-box">${escapeHtml(data.optimized_prompt)}</pre>
        </div>
      </div>
    </div>
    ${data.explanation ? `
    <div class="optimizer-explanation">
      <h4>What changed</h4>
      <p>${escapeHtml(data.explanation)}</p>
      ${data.behaviors_added?.length ? `<div class="optimizer-added-list">Behaviors added: ${data.behaviors_added.map(b => `<span class="opt-behavior-tag opt-behavior-added">${escapeHtml(BEHAVIOR_LABELS[b] || b)}</span>`).join('')}</div>` : ''}
    </div>` : ''}`

  document.getElementById('optimizer-results').innerHTML = html
}

// --- Quick Wins ---
document.getElementById('load-quickwins-btn').addEventListener('click', loadQuickWins)

async function loadQuickWins() {
  const btn = document.getElementById('load-quickwins-btn')
  btn.disabled = true
  btn.textContent = 'Generating...'
  showLoader('quickwins-results')

  try {
    state.quickwins = await postMessageRequest('getQuickwins')
    renderQuickWins()
  } catch (e) {
    document.getElementById('quickwins-results').innerHTML =
      `<p class="empty-state">Error: ${escapeHtml(e.message)}</p>`
  } finally {
    btn.disabled = false
    btn.textContent = 'Generate Suggestions'
  }
}

function renderQuickWins() {
  const suggestions = state.quickwins?.suggestions || []
  if (!suggestions.length) {
    const errorMsg = state.quickwins?.error
      ? `<br><small style="color:var(--text-secondary)">${escapeHtml(state.quickwins.error)}</small>`
      : ''
    document.getElementById('quickwins-results').innerHTML =
      `<p class="empty-state">No suggestions available.${errorMsg}</p>`
    return
  }

  const categoryIcons = { testing: 'testing', docs: 'docs', refactor: 'refactor', bugfix: 'bugfix', feature: 'feature' }

  const html = suggestions.map(s => {
    const fluencyTags = (s.fluency_behaviors_modeled || [])
      .map(b => `<span class="fluency-tag">${escapeHtml(BEHAVIOR_LABELS[b] || b)}</span>`)
      .join('')
    return `
    <div class="task-card">
      <div class="task-header">
        <span class="task-title">${escapeHtml(s.task)}</span>
      </div>
      <div class="task-meta">
        <span class="task-repo">${escapeHtml(s.repo)}</span>
        <span class="task-time">~${escapeHtml(s.estimated_minutes)} min</span>
        <span class="task-category category-${escapeHtml(categoryIcons[s.category] || 'feature')}">${escapeHtml(s.category)}</span>
      </div>${fluencyTags ? `
      <div class="task-fluency">${fluencyTags}</div>` : ''}
      <div class="task-prompt">
        <div class="prompt-header">
          <button class="run-btn">Run</button>
          <button class="copy-btn">Copy</button>
        </div>
        <pre class="prompt-text">${escapeHtml(s.prompt)}</pre>
      </div>
    </div>`
  }).join('')

  document.getElementById('quickwins-results').innerHTML = html
}

// --- Recommendations ---
function renderRecommendations() {
  if (!state.scores?.aggregate) {
    document.getElementById('recommendations-content').innerHTML =
      '<p class="empty-state">Run a fluency analysis first to get personalized recommendations.</p>'
    return
  }

  const { behavior_prevalence, pattern_distribution } = state.scores.aggregate
  const highImpact = []
  const mediumImpact = []
  const doingWell = []

  // Check behavior recommendations
  for (const [behavior, rec] of Object.entries(RECOMMENDATIONS)) {
    const userVal = behavior_prevalence[behavior] || 0
    if (userVal < BENCHMARKS[behavior]) {
      if (rec.impact === 'high') highImpact.push(rec)
      else mediumImpact.push(rec)
    } else {
      doingWell.push({ name: BEHAVIOR_LABELS[behavior], pct: Math.round(userVal * 100) })
    }
  }

  // Check pattern recommendations
  for (const [pattern, rec] of Object.entries(PATTERN_RECOMMENDATIONS)) {
    if (pattern_distribution[pattern]) {
      if (rec.impact === 'high') highImpact.push(rec)
      else mediumImpact.push(rec)
    }
  }

  // Check behaviors that are above benchmark
  for (const [behavior, benchmark] of Object.entries(BENCHMARKS)) {
    const userVal = behavior_prevalence[behavior] || 0
    if (userVal >= benchmark && !doingWell.find(d => d.name === BEHAVIOR_LABELS[behavior])) {
      doingWell.push({ name: BEHAVIOR_LABELS[behavior], pct: Math.round(userVal * 100) })
    }
  }

  let html = ''

  if (highImpact.length) {
    html += '<div class="rec-section"><div class="rec-section-title">HIGH IMPACT</div>'
    html += highImpact.map(renderRecCard).join('')
    html += '</div>'
  }

  if (mediumImpact.length) {
    html += '<div class="rec-section"><div class="rec-section-title">MEDIUM IMPACT</div>'
    html += mediumImpact.map(renderRecCard).join('')
    html += '</div>'
  }

  if (doingWell.length) {
    html += '<div class="rec-section"><div class="rec-section-title">YOU\'RE DOING WELL</div><div class="rec-card">'
    html += doingWell.map(d => `<div class="doing-well-item">${d.name} (${d.pct}%) — above average</div>`).join('')
    html += '</div></div>'
  }

  html += `
    <div class="research-sources">
      <h3>Research Sources</h3>
      <a href="https://www.anthropic.com/research/AI-fluency-index" target="_blank" rel="noopener noreferrer">AI Fluency Index (Feb 23, 2026)</a>
      <a href="https://www.anthropic.com/research/coding-skill-formation" target="_blank" rel="noopener noreferrer">Coding Skills Formation (Jan 29, 2026)</a>
      <a href="https://www.anthropic.com/research/claude-code-best-practices" target="_blank" rel="noopener noreferrer">Claude Code Best Practices</a>
    </div>`

  document.getElementById('recommendations-content').innerHTML = html
}

function renderRecCard(rec) {
  return `
    <div class="rec-card">
      <div class="rec-title">${escapeHtml(rec.title)}</div>
      <div class="rec-advice">${escapeHtml(rec.advice)}</div>
      ${rec.action ? `<div class="rec-action">${escapeHtml(rec.action)}</div>` : ''}
      ${rec.prompt ? `
        <div class="rec-prompt-section">
          <div class="rec-prompt-label">Try this prompt in Claude Code:</div>
          <div class="prompt-box-wrapper">
            <div class="prompt-box-header">
              <button class="copy-btn">Copy</button>
            </div>
            <pre class="prompt-box">${escapeHtml(rec.prompt)}</pre>
          </div>
        </div>` : ''}
      <div class="rec-source">${escapeHtml(rec.source)}</div>
    </div>`
}

// --- Conversation Analytics ---
let conversationTableSort = { column: 'date', direction: 'desc' }
let conversationTableShowCount = 10

async function loadConversationAnalytics() {
  if (state.conversationAnalytics) {
    renderConversationAnalytics()
    return
  }
  try {
    state.conversationAnalytics = await postMessageRequest('getConversationAnalytics', {})
    renderConversationAnalytics()
  } catch (e) {
    console.error('Failed to load conversation analytics:', e)
  }
}

function renderConversationAnalytics() {
  const analytics = state.conversationAnalytics
  if (!analytics || !analytics.conversations || analytics.conversations.length === 0) {
    document.getElementById('conversation-analytics-header').style.display = 'none'
    document.getElementById('conversation-efficiency-cards').innerHTML = ''
    document.getElementById('conversation-token-table-container').style.display = 'none'
    document.getElementById('score-correlation-container').innerHTML = ''
    return
  }

  // Show header
  const header = document.getElementById('conversation-analytics-header')
  header.style.display = ''
  header.textContent = 'Conversation Analytics'

  renderConversationEfficiencyCards(analytics)
  renderConversationTokenTable(analytics.conversations)
  renderScoreCorrelation(analytics.conversations)
}

function renderConversationEfficiencyCards(analytics) {
  const container = document.getElementById('conversation-efficiency-cards')
  const agg = analytics.aggregates
  const conversations = analytics.conversations

  // Find most efficient conversation (lowest tokens_per_prompt among conversations with prompts)
  let mostEfficient = null
  for (const s of conversations) {
    if ((s.prompt_count || s.user_message_count) > 0 && s.total_tokens > 0) {
      if (!mostEfficient || s.tokens_per_prompt < mostEfficient.tokens_per_prompt) {
        mostEfficient = s
      }
    }
  }

  const mostEffDate = mostEfficient && mostEfficient.started_at
    ? new Date(mostEfficient.started_at).toLocaleDateString()
    : ''
  const mostEffValue = mostEfficient
    ? formatTokens(Math.round(mostEfficient.tokens_per_prompt))
    : '-'

  const cacheHitPct = Math.round(agg.avg_cache_hit_rate * 100)

  const totalCost = agg.total_estimated_cost != null ? agg.total_estimated_cost : conversations.reduce((s, sess) => s + (sess.estimated_cost || 0), 0)

  const totalPrompts = conversations.reduce((s, sess) => s + (sess.prompt_count || sess.user_message_count), 0)

  // Compute avg cache read/creation ratio and output/input ratio
  const totalCacheRead = conversations.reduce((sum, s) => sum + (s.total_cache_read_tokens || 0), 0)
  const totalCacheCreation = conversations.reduce((sum, s) => sum + (s.total_cache_creation_tokens || 0), 0)
  const avgCacheRC = totalCacheCreation > 0 ? totalCacheRead / totalCacheCreation : null

  const totalOutput = conversations.reduce((sum, s) => sum + (s.total_output_tokens || 0), 0)
  const totalInput = conversations.reduce((sum, s) => sum + (s.total_input_tokens || 0), 0)
  const totalInputAll = totalInput + totalCacheRead + totalCacheCreation
  const avgOutIn = totalInputAll > 0 ? totalOutput / totalInputAll : null

  const scoredConversations = conversations.filter(s => s.overall_score != null)
  const avgScore = scoredConversations.length > 0
    ? Math.round(scoredConversations.reduce((sum, s) => sum + s.overall_score, 0) / scoredConversations.length)
    : null

  container.innerHTML = `
    <div class="pace-grid">
      <div class="pace-card">
        <div class="pace-card-title">Total Tokens</div>
        <div class="pace-card-value">${escapeHtml(formatTokens(conversations.reduce((s, sess) => s + sess.total_tokens, 0)))}</div>
        <div class="pace-card-detail">${escapeHtml(totalPrompts.toLocaleString())} prompts across ${escapeHtml(String(conversations.length))} conversations</div>
      </div>
      <div class="pace-card">
        <div class="pace-card-title">Estimated Total Cost</div>
        <div class="pace-card-value">${escapeHtml(formatCost(totalCost))}</div>
        <div class="pace-card-detail">Based on model pricing</div>
      </div>
      <div class="pace-card">
        <div class="pace-card-title">Avg Cost/Prompt</div>
        <div class="pace-card-value">${totalPrompts > 0 ? escapeHtml(formatCost(totalCost / totalPrompts)) : '—'}</div>
        <div class="pace-card-detail">${escapeHtml(totalPrompts.toLocaleString())} prompts across ${escapeHtml(String(conversations.length))} conversations</div>
      </div>
      <div class="pace-card">
        <div class="pace-card-title">Most Efficient Conversation</div>
        <div class="pace-card-value">${escapeHtml(mostEffValue)}</div>
        <div class="pace-card-detail">${escapeHtml(mostEffDate)} tokens/prompt</div>
      </div>
      <div class="pace-card">
        <div class="pace-card-title">Avg Cache Hit Rate</div>
        <div class="pace-card-value">${escapeHtml(String(cacheHitPct))}%</div>
        <div class="pace-card-detail">Higher is more cost-efficient</div>
      </div>
      <div class="pace-card">
        <div class="pace-card-title">Avg Cache R/C Ratio</div>
        <div class="pace-card-value">${avgCacheRC != null ? escapeHtml(avgCacheRC.toFixed(1)) + 'x' : '—'}</div>
        <div class="pace-card-detail">Cache reads per creation</div>
      </div>
      <div class="pace-card">
        <div class="pace-card-title">Avg Output/Input Ratio</div>
        <div class="pace-card-value">${avgOutIn != null ? escapeHtml((avgOutIn * 100).toFixed(1)) + '%' : '—'}</div>
        <div class="pace-card-detail">Output as % of input tokens</div>
      </div>
      <div class="pace-card">
        <div class="pace-card-title">Avg Fluency Score</div>
        <div class="pace-card-value">${avgScore != null ? escapeHtml(String(avgScore)) + '%' : '—'}</div>
        <div class="pace-card-detail">${avgScore != null ? escapeHtml(String(scoredConversations.length)) + ' scored conversations' : 'No scored conversations'}</div>
      </div>
    </div>`
}


function renderConversationTokenTable(conversations) {
  const container = document.getElementById('conversation-token-table-container')
  const tbody = document.getElementById('conversation-token-tbody')
  if (!conversations || conversations.length === 0) {
    container.style.display = 'none'
    return
  }

  container.style.display = ''

  // Sort conversations
  const sorted = [...conversations].sort((a, b) => {
    const col = conversationTableSort.column
    const dir = conversationTableSort.direction === 'asc' ? 1 : -1
    let va, vb
    switch (col) {
      case 'date':
        va = a.started_at || ''
        vb = b.started_at || ''
        return va < vb ? -dir : va > vb ? dir : 0
      case 'project':
        va = (a.project || '').toLowerCase()
        vb = (b.project || '').toLowerCase()
        return va < vb ? -dir : va > vb ? dir : 0
      case 'prompts':
        return ((a.prompt_count || a.user_message_count) - (b.prompt_count || b.user_message_count)) * dir
      case 'total_tokens':
        return (a.total_tokens - b.total_tokens) * dir
      case 'estimated_cost':
        return ((a.estimated_cost || 0) - (b.estimated_cost || 0)) * dir
      case 'tokens_per_prompt':
        return (a.tokens_per_prompt - b.tokens_per_prompt) * dir
      case 'cost_per_prompt':
        va = (a.prompt_count || a.user_message_count) > 0 && a.estimated_cost > 0 ? a.estimated_cost / (a.prompt_count || a.user_message_count) : 0
        vb = (b.prompt_count || b.user_message_count) > 0 && b.estimated_cost > 0 ? b.estimated_cost / (b.prompt_count || b.user_message_count) : 0
        return (va - vb) * dir
      case 'cache_hit_rate':
        return (a.cache_hit_rate - b.cache_hit_rate) * dir
      case 'cache_read_creation':
        va = a.total_cache_creation_tokens > 0 ? a.total_cache_read_tokens / a.total_cache_creation_tokens : 0
        vb = b.total_cache_creation_tokens > 0 ? b.total_cache_read_tokens / b.total_cache_creation_tokens : 0
        return (va - vb) * dir
      case 'output_input':
        va = (a.total_input_tokens + a.total_cache_read_tokens + a.total_cache_creation_tokens) > 0 ? a.total_output_tokens / (a.total_input_tokens + a.total_cache_read_tokens + a.total_cache_creation_tokens) : 0
        vb = (b.total_input_tokens + b.total_cache_read_tokens + b.total_cache_creation_tokens) > 0 ? b.total_output_tokens / (b.total_input_tokens + b.total_cache_read_tokens + b.total_cache_creation_tokens) : 0
        return (va - vb) * dir
      case 'score':
        va = a.overall_score ?? -1
        vb = b.overall_score ?? -1
        return (va - vb) * dir
      default:
        return 0
    }
  })

  // Build rows — only render visible rows to avoid DOM bloat
  const visible = sorted.slice(0, conversationTableShowCount)
  const rows = visible.map(s => {
    const date = s.started_at ? new Date(s.started_at).toLocaleDateString() : '-'
    const project = s.project || '-'
    const pc = s.prompt_count || s.user_message_count || 0
    const prompts = pc
    const totalTokens = formatTokens(s.total_tokens || 0)
    const cost = s.estimated_cost > 0 ? formatCost(s.estimated_cost) : '-'
    const tokensPerPrompt = pc > 0 ? formatTokens(Math.round(s.tokens_per_prompt)) : '-'
    const costPerPrompt = pc > 0 && s.estimated_cost > 0 ? formatCost(s.estimated_cost / pc) : '-'
    const cacheHit = Math.round((s.cache_hit_rate || 0) * 100) + '%'
    const cacheRC = s.total_cache_creation_tokens > 0
      ? (s.total_cache_read_tokens / s.total_cache_creation_tokens).toFixed(1) + 'x' : '-'
    const outInRaw = (s.total_input_tokens + s.total_cache_read_tokens + s.total_cache_creation_tokens) > 0
      ? s.total_output_tokens / (s.total_input_tokens + s.total_cache_read_tokens + s.total_cache_creation_tokens) : null
    const outIn = outInRaw != null ? (outInRaw * 100).toFixed(1) + '%' : '-'
    const score = s.overall_score != null ? Math.round(s.overall_score) : null
    const scoreHtml = score != null
      ? escapeHtml(String(score))
      : '<span class="score-cell-na">\u2014</span>'
    return `<tr>
      <td>${escapeHtml(date)}</td>
      <td>${escapeHtml(project)}</td>
      <td>${escapeHtml(String(prompts))}</td>
      <td>${escapeHtml(totalTokens)}</td>
      <td>${escapeHtml(cost)}</td>
      <td>${escapeHtml(tokensPerPrompt)}</td>
      <td>${escapeHtml(costPerPrompt)}</td>
      <td>${escapeHtml(cacheHit)}</td>
      <td>${escapeHtml(cacheRC)}</td>
      <td>${escapeHtml(outIn)}</td>
      <td>${scoreHtml}</td>
    </tr>`
  })

  tbody.innerHTML = rows.join('')

  // Update sort header indicators
  const ths = document.querySelectorAll('#conversation-token-table th')
  ths.forEach(th => {
    th.classList.remove('sorted-asc', 'sorted-desc')
    if (th.dataset.sort === conversationTableSort.column) {
      th.classList.add(conversationTableSort.direction === 'asc' ? 'sorted-asc' : 'sorted-desc')
    }
  })

  // Show more button
  const showMoreBtn = document.getElementById('conversation-table-show-more')
  const remaining = sorted.length - conversationTableShowCount
  if (remaining > 0) {
    showMoreBtn.style.display = ''
    showMoreBtn.textContent = `Show ${remaining} more conversation${remaining !== 1 ? 's' : ''}`
  } else {
    showMoreBtn.style.display = 'none'
  }
}

function renderScoreCorrelation(conversations) {
  const container = document.getElementById('score-correlation-container')
  if (!container) return

  // Use all conversations for cost charts, scored subset for score-colored charts
  const allConversations = conversations.filter(s => s.tokens_per_prompt > 0 && s.estimated_cost > 0)
  const scored = allConversations.filter(s => s.overall_score != null)

  if (allConversations.length < 3) {
    container.innerHTML = allConversations.length === 0 ? '' : `
      <div class="correlation-section">
        <h3>Cost Efficiency Analysis</h3>
        <div class="correlation-placeholder">
          <p>Need at least 3 conversations for analysis (${escapeHtml(String(allConversations.length))} available).</p>
        </div>
      </div>`
    return
  }

  // --- Shared color helpers ---
  function normalizedColor(value, min, max) {
    const range = max - min || 1
    const t = (value - min) / range
    if (t <= 0.5) {
      const u = t / 0.5
      return `rgb(${Math.round(220 + (217 - 220) * u)},${Math.round(38 + (119 - 38) * u)},${Math.round(38 + (6 - 38) * u)})`
    }
    const u = (t - 0.5) / 0.5
    return `rgb(${Math.round(217 + (5 - 217) * u)},${Math.round(119 + (150 - 119) * u)},${Math.round(6 + (105 - 6) * u)})`
  }

  // --- Compute derived features for all conversations ---
  const enriched = allConversations.map(s => {
    const promptCount = s.prompt_count || s.user_message_count || 1
    const costPerPrompt = s.estimated_cost / promptCount
    const cacheReadCreation = s.total_cache_creation_tokens > 0
      ? s.total_cache_read_tokens / s.total_cache_creation_tokens : null
    const outputInput = (s.total_input_tokens + s.total_cache_read_tokens + s.total_cache_creation_tokens) > 0
      ? s.total_output_tokens / (s.total_input_tokens + s.total_cache_read_tokens + s.total_cache_creation_tokens) : null
    return { ...s, costPerPrompt, cacheReadCreation, outputInput }
  })

  // --- Chart subsets ---
  const chart1All = enriched.filter(s => s.cacheReadCreation != null)
  const chart2All = enriched.filter(s => s.outputInput != null)
  const chart3Data = enriched.filter(s => s.overall_score != null)

  // Score color bounds
  const scoreVals = scored.map(s => s.overall_score)
  const scoreMin = scoreVals.length > 0 ? Math.min(...scoreVals) : 0
  const scoreMax = scoreVals.length > 0 ? Math.max(...scoreVals) : 100

  // Cache hit color bounds
  const cacheVals = allConversations.map(s => s.cache_hit_rate || 0)
  const cacheMin = Math.min(...cacheVals)
  const cacheMax = Math.max(...cacheVals)

  // --- Build insights ---
  let insightsHtml = ''
  if (chart1All.length >= 5) {
    const sortedByCache = [...chart1All].sort((a, b) => a.cacheReadCreation - b.cacheReadCreation)
    const midIdx = Math.floor(sortedByCache.length / 2)
    const highCache = sortedByCache.slice(midIdx)
    const lowCache = sortedByCache.slice(0, midIdx)
    if (highCache.length > 0 && lowCache.length > 0) {
      const avgCostHigh = highCache.reduce((s, d) => s + d.costPerPrompt, 0) / highCache.length
      const avgCostLow = lowCache.reduce((s, d) => s + d.costPerPrompt, 0) / lowCache.length
      const costDiff = avgCostLow > 0 ? Math.round(((avgCostLow - avgCostHigh) / avgCostLow) * 100) : 0
      if (costDiff > 0) {
        insightsHtml += `
          <div class="insight-card">
            <span class="insight-icon">&#x1f4b0;</span>
            <span>Conversations with higher cache reuse cost <strong>${escapeHtml(String(costDiff))}% less</strong> per prompt on average</span>
          </div>`
      }
    }
  }
  if (chart3Data.length >= 5) {
    const sortedByScore = [...chart3Data].sort((a, b) => a.overall_score - b.overall_score)
    const midIdx = Math.floor(sortedByScore.length / 2)
    const medianScore = sortedByScore[midIdx].overall_score
    const highScore = chart3Data.filter(s => s.overall_score > medianScore)
    const lowScore = chart3Data.filter(s => s.overall_score <= medianScore)
    if (highScore.length > 0 && lowScore.length > 0) {
      const avgCostHigh = highScore.reduce((s, d) => s + d.costPerPrompt, 0) / highScore.length
      const avgCostLow = lowScore.reduce((s, d) => s + d.costPerPrompt, 0) / lowScore.length
      const costDir = avgCostHigh > avgCostLow ? 'more' : 'less'
      const costPct = avgCostLow > 0 ? Math.round(Math.abs(avgCostHigh - avgCostLow) / avgCostLow * 100) : 0
      insightsHtml += `
        <div class="insight-card">
          <span class="insight-icon">&#x1f3af;</span>
          <span>Conversations scoring above ${escapeHtml(String(Math.round(medianScore)))}% cost <strong>${escapeHtml(String(costPct))}% ${escapeHtml(costDir)}</strong> per prompt on average</span>
        </div>`
    }
  }

  // --- Render HTML (Score vs Cost first as headline, then detailed breakdowns) ---
  let chartsHtml = ''

  if (chart3Data.length >= 3) {
    chartsHtml += `
      <div class="correlation-chart-block">
        <h4>Fluency Score vs Cost/Prompt</h4>
        <div class="correlation-chart-wrap"><canvas id="chart-score-cost"></canvas></div>
        <div class="correlation-legend">
          <span>Cache hit rate:</span>
          <span class="legend-label">${escapeHtml(String(Math.round(cacheMin * 100)))}%</span>
          <span class="legend-gradient"></span>
          <span class="legend-label">${escapeHtml(String(Math.round(cacheMax * 100)))}%</span>
        </div>
      </div>`
  }

  if (chart1All.length >= 3) {
    chartsHtml += `
      <div class="correlation-chart-block">
        <h4>Cost/Prompt vs Cache Reuse Ratio</h4>
        <div class="correlation-chart-wrap"><canvas id="chart-cache-cost"></canvas></div>
        <div class="correlation-legend">
          <span>Fluency score:</span>
          <span class="legend-label">${escapeHtml(String(Math.round(scoreMin)))}%</span>
          <span class="legend-gradient"></span>
          <span class="legend-label">${escapeHtml(String(Math.round(scoreMax)))}%</span>
        </div>
      </div>`
  }

  if (chart2All.length >= 3) {
    chartsHtml += `
      <div class="correlation-chart-block">
        <h4>Cost/Prompt vs Output/Input Ratio</h4>
        <div class="correlation-chart-wrap"><canvas id="chart-output-cost"></canvas></div>
        <div class="correlation-legend">
          <span>Fluency score:</span>
          <span class="legend-label">${escapeHtml(String(Math.round(scoreMin)))}%</span>
          <span class="legend-gradient"></span>
          <span class="legend-label">${escapeHtml(String(Math.round(scoreMax)))}%</span>
        </div>
      </div>`
  }

  container.innerHTML = `
    <div class="correlation-section">
      <h3>Cost Efficiency Analysis</h3>
      ${insightsHtml ? '<div class="correlation-insights">' + insightsHtml + '</div>' : ''}
      ${chartsHtml}
    </div>`

  // --- Render Chart 1: Cost/Prompt vs Cache Read/Creation ---
  if (chart1All.length >= 3) {
    const d1 = chart1All.map(s => ({ x: s.cacheReadCreation, y: s.costPerPrompt, score: s.overall_score, date: s.started_at ? new Date(s.started_at).toLocaleDateString() : '-', cacheHit: Math.round((s.cache_hit_rate || 0) * 100) }))
    const c1 = d1.map(d => d.score != null ? normalizedColor(d.score, scoreMin, scoreMax) : 'rgba(150,150,150,0.5)')
    destroyChart('cacheCost')
    charts.cacheCost = new Chart(document.getElementById('chart-cache-cost').getContext('2d'), {
      type: 'scatter',
      data: { datasets: [{ data: d1, backgroundColor: c1, borderColor: c1, pointRadius: 6, pointHoverRadius: 9 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => { const d = ctx.raw; return [`Cache Read/Create: ${d.x.toFixed(1)}x`, `Cost/Prompt: $${d.y.toFixed(2)}`, d.score != null ? `Score: ${d.score}%` : 'Score: —', `Cache Hit: ${d.cacheHit}%`, `Date: ${d.date}`] } } } },
        scales: {
          x: { title: { display: true, text: 'Cache Read / Creation Ratio' } },
          y: { title: { display: true, text: 'Cost per Prompt ($)' }, ticks: { callback: v => '$' + v.toFixed(2) } }
        }
      }
    })
  }

  // --- Render Chart 2: Cost/Prompt vs Output/Input ---
  if (chart2All.length >= 3) {
    const d2 = chart2All.map(s => ({ x: s.outputInput * 100, y: s.costPerPrompt, score: s.overall_score, date: s.started_at ? new Date(s.started_at).toLocaleDateString() : '-', cacheHit: Math.round((s.cache_hit_rate || 0) * 100) }))
    const c2 = d2.map(d => d.score != null ? normalizedColor(d.score, scoreMin, scoreMax) : 'rgba(150,150,150,0.5)')
    destroyChart('outputCost')
    charts.outputCost = new Chart(document.getElementById('chart-output-cost').getContext('2d'), {
      type: 'scatter',
      data: { datasets: [{ data: d2, backgroundColor: c2, borderColor: c2, pointRadius: 6, pointHoverRadius: 9 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => { const d = ctx.raw; return [`Output/Input: ${d.x.toFixed(1)}%`, `Cost/Prompt: $${d.y.toFixed(2)}`, d.score != null ? `Score: ${d.score}%` : 'Score: —', `Cache Hit: ${d.cacheHit}%`, `Date: ${d.date}`] } } } },
        scales: {
          x: { title: { display: true, text: 'Output / Input Token Ratio (%)' }, ticks: { callback: v => v.toFixed(1) + '%' } },
          y: { title: { display: true, text: 'Cost per Prompt ($)' }, ticks: { callback: v => '$' + v.toFixed(2) } }
        }
      }
    })
  }

  // --- Render Chart 3: Score vs Cost/Prompt ---
  if (chart3Data.length >= 3) {
    const d3 = chart3Data.map(s => ({ x: s.costPerPrompt, y: s.overall_score, cacheHit: s.cache_hit_rate || 0, date: s.started_at ? new Date(s.started_at).toLocaleDateString() : '-' }))
    const c3 = d3.map(d => normalizedColor(d.cacheHit, cacheMin, cacheMax))
    const costValues = d3.map(d => d.x)
    const costMax2 = Math.max(...costValues)
    destroyChart('scoreCost')
    charts.scoreCost = new Chart(document.getElementById('chart-score-cost').getContext('2d'), {
      type: 'scatter',
      data: { datasets: [{ data: d3, backgroundColor: c3, borderColor: c3, pointRadius: 6, pointHoverRadius: 9 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => { const d = ctx.raw; return [`Cost/Prompt: $${d.x.toFixed(2)}`, `Score: ${d.y}%`, `Cache Hit: ${Math.round(d.cacheHit * 100)}%`, `Date: ${d.date}`] } } } },
        scales: {
          x: { title: { display: true, text: 'Cost per Prompt ($)' }, max: costMax2 * 1.05, ticks: { callback: v => '$' + v.toFixed(2) } },
          y: { title: { display: true, text: 'Fluency Score (%)' }, min: Math.max(0, Math.floor((Math.min(...d3.map(d => d.y)) - 5) / 10) * 10), max: 102, afterBuildTicks: axis => { axis.ticks = axis.ticks.filter(t => t.value <= 100); if (!axis.ticks.some(t => t.value === 100)) axis.ticks.push({ value: 100 }) }, ticks: { stepSize: 5 } }
        }
      }
    })
  }
}

// --- Conversations Explorer ---
let conversationsListSort = { column: 'date', direction: 'desc' }
let conversationsListShowCount = 20

// ISO 8601 week key — matches backend getISOWeekKey() in scoring.ts
function getISOWeekKey(dateStr) {
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const dayOfWeek = date.getUTCDay() || 7 // Monday=1, Sunday=7
  // Set to nearest Thursday (ISO week date algorithm)
  date.setUTCDate(date.getUTCDate() + 4 - dayOfWeek)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const weekNum = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  const year = date.getUTCFullYear()
  return `${year}-W${String(weekNum).padStart(2, '0')}`
}

function formatDuration(minutes) {
  if (minutes < 1) return '<1m'
  if (minutes < 60) return Math.round(minutes) + 'm'
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return m > 0 ? h + 'h ' + m + 'm' : h + 'h'
}

async function loadConversationsExplorer() {
  document.getElementById('conversations-loading').style.display = ''
  document.getElementById('conversations-summary-cards').style.display = 'none'
  document.getElementById('agent-metrics-section').style.display = 'none'
  document.getElementById('conversations-charts-row').style.display = 'none'
  document.getElementById('conversations-table-container').style.display = 'none'
  document.getElementById('conversations-empty').style.display = 'none'
  try {
    state.conversationsExplorer = await postMessageRequest('getConversationAnalytics', {})
    renderConversationsExplorer()
    try {
      const agentData = await postMessageRequest('getAgentMetrics', {})
      renderAgentMetrics(agentData)
    } catch (_e) { /* agent metrics are supplementary */ }
  } catch (e) {
    document.getElementById('conversations-loading').style.display = 'none'
    document.getElementById('conversations-empty').style.display = ''
  }
}

function renderConversationsExplorer() {
  const data = state.conversationsExplorer
  if (!data || !data.conversations || data.conversations.length === 0) {
    document.getElementById('conversations-loading').style.display = 'none'
    document.getElementById('conversations-empty').style.display = ''
    return
  }
  document.getElementById('conversations-loading').style.display = 'none'
  document.getElementById('conversations-empty').style.display = 'none'

  renderConversationsSummaryCards(data)
  renderConversationsCharts(data)
  renderConversationsListTable(data.conversations)
}

function renderAgentMetrics(metrics) {
  const container = document.getElementById('agent-metrics-cards')
  const section = document.getElementById('agent-metrics-section')
  if (!metrics || !container || !section) return

  // Destroy previous sparkline charts
  for (let i = 0; i < 4; i++) {
    destroyChart('agentSparkline' + i)
  }

  const items = [
    { title: 'Tool Diversity', value: metrics.tool_diversity_index, detail: 'unique tools / total uses', key: 'tool_diversity_index', color: '#D97706' },
    { title: 'Plan Mode Adoption', value: metrics.plan_mode_adoption_rate, detail: 'conversations using plan mode', key: 'plan_mode_adoption_rate', color: '#2563EB' },
    { title: 'Cache Efficiency', value: metrics.avg_cache_hit_rate, detail: 'average cache hit rate', key: 'avg_cache_hit_rate', color: '#059669' },
    { title: 'Thinking Utilization', value: metrics.thinking_utilization_rate, detail: 'responses using extended thinking', key: 'thinking_utilization_rate', color: '#7C3AED' }
  ]

  container.innerHTML = items.map(function(item, i) {
    return '<div class="pace-card">' +
      '<div class="pace-card-title">' + escapeHtml(item.title) + '</div>' +
      '<div class="pace-card-value">' + escapeHtml(String(Math.round(item.value * 100))) + '%</div>' +
      '<div class="pace-card-detail">' + escapeHtml(item.detail) + '</div>' +
      '<div style="height:40px; margin-top:8px"><canvas id="agent-sparkline-' + i + '" style="width:100%; height:40px"></canvas></div>' +
      '</div>'
  }).join('')

  if (metrics.weekly && metrics.weekly.length > 1) {
    items.forEach(function(item, i) {
      var canvas = document.getElementById('agent-sparkline-' + i)
      if (!canvas) return
      var weeks = metrics.weekly.map(function(w) { return w.week })
      var values = metrics.weekly.map(function(w) { return w[item.key] })
      charts['agentSparkline' + i] = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
          labels: weeks,
          datasets: [{
            data: values,
            borderColor: item.color,
            borderWidth: 1.5,
            pointRadius: 0,
            tension: 0.3,
            fill: false
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { enabled: false } },
          scales: { x: { display: false }, y: { display: false } }
        }
      })
    })
  }

  section.style.display = ''
}

function renderConversationsSummaryCards(data) {
  const container = document.getElementById('conversations-summary-cards')
  const convs = data.conversations
  const total = convs.length
  const avgPrompts = total > 0 ? Math.round(convs.reduce((s, c) => s + (c.prompt_count || 0), 0) / total) : 0

  const durations = convs.filter(c => c.started_at && c.ended_at).map(c => {
    return (new Date(c.ended_at) - new Date(c.started_at)) / 60000
  })
  const avgDuration = durations.length > 0 ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length) : 0

  const scored = convs.filter(c => c.overall_score != null)
  const avgScore = scored.length > 0 ? Math.round(scored.reduce((s, c) => s + c.overall_score, 0) / scored.length) : null

  container.innerHTML = `
    <div class="pace-card">
      <div class="pace-card-title">Total Conversations</div>
      <div class="pace-card-value">${escapeHtml(String(total))}</div>
    </div>
    <div class="pace-card">
      <div class="pace-card-title">Avg Prompts</div>
      <div class="pace-card-value">${escapeHtml(String(avgPrompts))}</div>
      <div class="pace-card-detail">per conversation</div>
    </div>
    <div class="pace-card">
      <div class="pace-card-title">Avg Duration</div>
      <div class="pace-card-value">${escapeHtml(formatDuration(avgDuration))}</div>
      <div class="pace-card-detail">per conversation</div>
    </div>
    <div class="pace-card">
      <div class="pace-card-title">Avg Score</div>
      <div class="pace-card-value">${avgScore != null ? escapeHtml(String(avgScore)) : '\u2014'}</div>
      <div class="pace-card-detail">${escapeHtml(String(scored.length))} scored</div>
    </div>
  `
  container.style.display = ''
}

function renderConversationsCharts(data) {
  const convs = data.conversations

  // Task type distribution (doughnut)
  destroyChart('convTaskType')
  const taskTypeCounts = {}
  convs.forEach(c => {
    const tt = c.heuristic_task_type || 'unclassified'
    taskTypeCounts[tt] = (taskTypeCounts[tt] || 0) + 1
  })
  const taskTypeEntries = Object.entries(taskTypeCounts).sort((a, b) => b[1] - a[1])
  const totalConvs = convs.length

  if (taskTypeEntries.length > 0) {
    charts.convTaskType = new Chart(document.getElementById('conv-task-type-chart').getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: taskTypeEntries.map(([t]) =>
          t === 'unclassified' ? 'Unclassified' : (TASK_TYPE_LABELS[t] || t)
        ),
        datasets: [{
          data: taskTypeEntries.map(([, c]) => c),
          backgroundColor: taskTypeEntries.map(([t]) =>
            t === 'unclassified' ? TASK_TYPE_UNCLASSIFIED_COLOR : (TASK_TYPE_COLORS[t] || '#9CA3AF')
          ),
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function(ctx) {
                const count = ctx.raw
                const pct = totalConvs > 0 ? (count / totalConvs * 100).toFixed(1) : '0.0'
                return ctx.label + ': ' + count + ' (' + pct + '%)'
              }
            }
          }
        }
      }
    })
  }

  // Render task type legend
  const taskTypeLegendEl = document.getElementById('conv-task-type-legend')
  if (taskTypeLegendEl) {
    taskTypeLegendEl.innerHTML = taskTypeEntries.map(([t, count]) => {
      const label = t === 'unclassified' ? 'Unclassified' : (TASK_TYPE_LABELS[t] || t)
      const color = t === 'unclassified' ? TASK_TYPE_UNCLASSIFIED_COLOR : (TASK_TYPE_COLORS[t] || '#9CA3AF')
      const pct = totalConvs > 0 ? (count / totalConvs * 100).toFixed(1) : '0.0'
      return '<div class="task-type-legend-item">' +
        '<span class="task-type-swatch" style="background:' + color + '"></span>' +
        '<span>' + escapeHtml(label) + '</span>' +
        '<span class="task-type-legend-count">' + count + ' (' + pct + '%)</span>' +
      '</div>'
    }).join('')
  }

  // 1. Conversations per week (bar chart)
  destroyChart('convPerWeek')
  const weeklyData = (data.weekly || []).sort((a, b) => a.week.localeCompare(b.week))
  if (weeklyData.length > 0) {
    charts.convPerWeek = new Chart(document.getElementById('conv-per-week-chart').getContext('2d'), {
      type: 'bar',
      data: {
        labels: weeklyData.map(w => w.week),
        datasets: [{
          label: 'Conversations',
          data: weeklyData.map(w => w.conversation_count),
          backgroundColor: '#D97706',
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { stepSize: 1 } },
          x: { ticks: { maxRotation: 45 } }
        }
      }
    })
  }

  // 2. Conversation length distribution (histogram)
  const bins = [
    { label: '1-3', min: 1, max: 3, count: 0 },
    { label: '4-10', min: 4, max: 10, count: 0 },
    { label: '11-20', min: 11, max: 20, count: 0 },
    { label: '21-50', min: 21, max: 50, count: 0 },
    { label: '50+', min: 51, max: Infinity, count: 0 }
  ]
  convs.forEach(c => {
    const pc = c.prompt_count || 0
    const bin = bins.find(b => pc >= b.min && pc <= b.max)
    if (bin) bin.count++
  })

  destroyChart('convLength')
  charts.convLength = new Chart(document.getElementById('conv-length-chart').getContext('2d'), {
    type: 'bar',
    data: {
      labels: bins.map(b => b.label + ' prompts'),
      datasets: [{
        label: 'Conversations',
        data: bins.map(b => b.count),
        backgroundColor: '#059669',
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { stepSize: 1 } },
        x: {}
      }
    }
  })

  // 3. Duration distribution (histogram)
  const durationBins = [
    { label: '<5m', min: 0, max: 5, count: 0 },
    { label: '5-15m', min: 5, max: 15, count: 0 },
    { label: '15-30m', min: 15, max: 30, count: 0 },
    { label: '30m-1h', min: 30, max: 60, count: 0 },
    { label: '1-2h', min: 60, max: 120, count: 0 },
    { label: '2h+', min: 120, max: Infinity, count: 0 }
  ]
  convs.forEach(c => {
    if (!c.started_at || !c.ended_at) return
    const dur = (new Date(c.ended_at) - new Date(c.started_at)) / 60000
    const bin = durationBins.find(b => dur >= b.min && dur < b.max)
    if (bin) bin.count++
  })

  destroyChart('convDuration')
  charts.convDuration = new Chart(document.getElementById('conv-duration-chart').getContext('2d'), {
    type: 'bar',
    data: {
      labels: durationBins.map(b => b.label),
      datasets: [{
        label: 'Conversations',
        data: durationBins.map(b => b.count),
        backgroundColor: '#7C3AED',
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { stepSize: 1 } },
        x: {}
      }
    }
  })

  // 4. Average conversation length trend (line chart)
  const weeklyPrompts = {}
  convs.forEach(c => {
    if (!c.started_at) return
    const key = getISOWeekKey(c.started_at)
    if (!key) return
    if (!weeklyPrompts[key]) weeklyPrompts[key] = { total: 0, count: 0 }
    weeklyPrompts[key].total += (c.prompt_count || 0)
    weeklyPrompts[key].count++
  })
  const avgWeeks = Object.keys(weeklyPrompts).sort()
  const avgValues = avgWeeks.map(w => Math.round(weeklyPrompts[w].total / weeklyPrompts[w].count * 10) / 10)

  destroyChart('convAvgLength')
  if (avgWeeks.length > 0) {
    charts.convAvgLength = new Chart(document.getElementById('conv-avg-length-chart').getContext('2d'), {
      type: 'line',
      data: {
        labels: avgWeeks,
        datasets: [{
          label: 'Avg Prompts',
          data: avgValues,
          borderColor: '#2563EB',
          backgroundColor: '#2563EB',
          tension: 0.3,
          pointRadius: 3,
          pointHoverRadius: 6,
          borderWidth: 2,
          fill: false
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true },
          x: { ticks: { maxRotation: 45 } }
        }
      }
    })
  }

  // 5. Inter-prompt gap distribution with threshold line
  // Collect all prompt timestamps across all conversations, compute gaps between consecutive prompts
  const allPromptTimestamps = []
  convs.forEach(c => {
    if (c.prompt_timestamps && c.prompt_timestamps.length > 0) {
      c.prompt_timestamps.forEach(t => allPromptTimestamps.push(new Date(t).getTime()))
    }
  })
  allPromptTimestamps.sort((a, b) => a - b)

  const gapBins = [
    { label: '<1m', min: 0, max: 1, count: 0 },
    { label: '1-5m', min: 1, max: 5, count: 0 },
    { label: '5-15m', min: 5, max: 15, count: 0 },
    { label: '15-30m', min: 15, max: 30, count: 0 },
    { label: '30m-1h', min: 30, max: 60, count: 0 },
    { label: '1-2h', min: 60, max: 120, count: 0 },
    { label: '2-4h', min: 120, max: 240, count: 0 },
    { label: '4h+', min: 240, max: Infinity, count: 0 }
  ]

  for (let i = 1; i < allPromptTimestamps.length; i++) {
    const gap = (allPromptTimestamps[i] - allPromptTimestamps[i - 1]) / 60000
    const bin = gapBins.find(b => gap >= b.min && gap < b.max)
    if (bin) bin.count++
  }

  const gapMinutes = DISPLAY_CONFIG?.['conversation.inactivityGapMinutes'] || 60

  const thresholdLinePlugin = {
    id: 'thresholdLine',
    afterDraw(chart) {
      const threshold = chart.options.plugins.thresholdLine?.value
      if (threshold == null) return
      const { ctx, chartArea, scales } = chart
      const bins = chart.options.plugins.thresholdLine?.bins || []
      const binIndex = bins.findIndex(b => threshold >= b.min && threshold < b.max)
      if (binIndex < 0) return

      const x = scales.x.getPixelForValue(binIndex)
      const { top, bottom } = chartArea

      ctx.save()
      ctx.beginPath()
      ctx.setLineDash([6, 4])
      ctx.lineWidth = 2
      ctx.strokeStyle = '#DC2626'
      ctx.moveTo(x, top)
      ctx.lineTo(x, bottom)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = '#DC2626'
      ctx.font = '11px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(threshold + 'm threshold', x, top + 12)
      ctx.restore()
    }
  }

  destroyChart('convGap')
  charts.convGap = new Chart(document.getElementById('conv-gap-chart').getContext('2d'), {
    type: 'bar',
    data: {
      labels: gapBins.map(b => b.label),
      datasets: [{
        label: 'Gaps',
        data: gapBins.map(b => b.count),
        backgroundColor: '#6366F1',
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        thresholdLine: { value: gapMinutes, bins: gapBins }
      },
      scales: {
        y: { beginAtZero: true },
        x: {}
      }
    },
    plugins: [thresholdLinePlugin]
  })

  document.getElementById('conversations-charts-row').style.display = ''
}

let expandedConversationId = null

function renderConversationsListTable(conversations) {
  expandedConversationId = null
  const tbody = document.getElementById('conversations-list-tbody')
  if (!tbody) return

  const sorted = [...conversations].sort((a, b) => {
    const col = conversationsListSort.column
    const dir = conversationsListSort.direction === 'asc' ? 1 : -1
    switch (col) {
      case 'date': return dir * ((a.started_at || '').localeCompare(b.started_at || ''))
      case 'project': return dir * ((a.project || '').localeCompare(b.project || ''))
      case 'prompts': return dir * ((a.prompt_count || 0) - (b.prompt_count || 0))
      case 'duration': {
        const durA = (a.started_at && a.ended_at) ? new Date(a.ended_at) - new Date(a.started_at) : 0
        const durB = (b.started_at && b.ended_at) ? new Date(b.ended_at) - new Date(b.started_at) : 0
        return dir * (durA - durB)
      }
      case 'tokens': return dir * ((a.total_tokens || 0) - (b.total_tokens || 0))
      case 'cost': return dir * ((a.estimated_cost || 0) - (b.estimated_cost || 0))
      case 'cache': return dir * ((a.cache_hit_rate || 0) - (b.cache_hit_rate || 0))
      case 'tools': return dir * ((a.tool_use_count || 0) - (b.tool_use_count || 0))
      case 'score': return dir * ((a.overall_score ?? -1) - (b.overall_score ?? -1))
      case 'task_type': return dir * ((a.heuristic_task_type || 'zzz').localeCompare(b.heuristic_task_type || 'zzz'))
      default: return 0
    }
  })

  const visible = sorted.slice(0, conversationsListShowCount)
  tbody.innerHTML = visible.map(c => {
    const date = c.started_at ? new Date(c.started_at).toLocaleDateString() : '\u2014'
    const dur = (c.started_at && c.ended_at) ? formatDuration((new Date(c.ended_at) - new Date(c.started_at)) / 60000) : '\u2014'
    const tokens = (c.total_tokens || 0).toLocaleString()
    const cost = c.estimated_cost != null && c.estimated_cost > 0 ? '$' + c.estimated_cost.toFixed(2) : '\u2014'
    const cache = c.cache_hit_rate != null ? (c.cache_hit_rate * 100).toFixed(1) + '%' : '\u2014'
    const tools = c.tool_use_count || 0
    const score = c.overall_score != null ? c.overall_score : '\u2014'
    const taskTypeLabel = c.heuristic_task_type
      ? (TASK_TYPE_LABELS[c.heuristic_task_type] || c.heuristic_task_type)
      : '\u2014'

    return `<tr data-conv-id="${escapeHtml(c.id || c.session_id || '')}">
      <td>${escapeHtml(date)}</td>
      <td>${escapeHtml(c.project || '\u2014')}</td>
      <td>${escapeHtml(String(c.prompt_count || 0))}</td>
      <td>${escapeHtml(dur)}</td>
      <td>${escapeHtml(tokens)}</td>
      <td>${escapeHtml(cost)}</td>
      <td>${escapeHtml(cache)}</td>
      <td>${escapeHtml(String(tools))}</td>
      <td>${escapeHtml(String(score))}</td>
      <td>${escapeHtml(taskTypeLabel)}</td>
    </tr>`
  }).join('')

  // Update sort indicators
  document.querySelectorAll('#conversations-list-table th').forEach(th => {
    th.classList.remove('sorted-asc', 'sorted-desc')
    if (th.dataset.sort === conversationsListSort.column) {
      th.classList.add(conversationsListSort.direction === 'asc' ? 'sorted-asc' : 'sorted-desc')
    }
  })

  // Show more button
  const showMoreDiv = document.getElementById('conversations-show-more')
  const remaining = sorted.length - conversationsListShowCount
  if (remaining > 0) {
    showMoreDiv.style.display = ''
    document.getElementById('conversations-show-more-btn').textContent = `Show ${remaining} more conversation${remaining !== 1 ? 's' : ''}`
  } else {
    showMoreDiv.style.display = 'none'
  }

  document.getElementById('conversations-table-container').style.display = ''
}

// --- Conversation Detail View ---
async function fetchConversationDetail(convId) {
  return await postMessageRequest('getConversationDetail', { conversationId: convId })
}

function renderConversationDetailContent(conv) {
  const model = conv.model || '\u2014'
  const branch = conv.git_branch || '\u2014'
  const version = conv.claude_code_version || '\u2014'
  const planMode = conv.used_plan_mode ? 'Yes' : 'No'
  const thinking = conv.thinking_count || 0
  const started = conv.started_at ? new Date(conv.started_at).toLocaleString() : '\u2014'
  const ended = conv.ended_at ? new Date(conv.ended_at).toLocaleString() : '\u2014'
  const taskType = conv.heuristic_task_type
    ? (TASK_TYPE_LABELS[conv.heuristic_task_type] || conv.heuristic_task_type)
    : 'Unclassified'

  const toolsHtml = (conv.tools_used || []).map(t =>
    `<span class="tool-tag">${escapeHtml(t)}</span>`
  ).join('') || '<em>No tools used</em>'

  const promptsHtml = (conv.user_prompts || []).map((p, i) =>
    `<div class="prompt-item">
      <span class="prompt-number">${i + 1}.</span>
      <span class="prompt-text">${escapeHtml(p)}</span>
    </div>`
  ).join('') || '<em>No prompts</em>'

  return `
    <div class="detail-grid">
      <div class="detail-section">
        <h4>Metadata</h4>
        <div class="detail-meta">
          <span><strong>Model:</strong> ${escapeHtml(model)}</span>
          <span><strong>Branch:</strong> ${escapeHtml(branch)}</span>
          <span><strong>Version:</strong> ${escapeHtml(version)}</span>
          <span><strong>Plan Mode:</strong> ${escapeHtml(planMode)}</span>
          <span><strong>Thinking:</strong> ${thinking} blocks</span>
          <span><strong>Task Type:</strong> ${escapeHtml(taskType)}</span>
          <span><strong>Started:</strong> ${escapeHtml(started)}</span>
          <span><strong>Ended:</strong> ${escapeHtml(ended)}</span>
        </div>
      </div>
      <div class="detail-section">
        <h4>Tools Used (${conv.tool_use_count || 0} invocations)</h4>
        <div class="detail-tools">${toolsHtml}</div>
      </div>
      <div class="detail-section">
        <h4>User Prompts (${(conv.user_prompts || []).length})</h4>
        <div class="detail-prompts">${promptsHtml}</div>
      </div>
    </div>
  `
}

async function toggleConversationDetail(row) {
  const convId = row.dataset.convId
  if (!convId) return

  const existingDetail = document.querySelector('.conversation-detail-row')
  const existingExpanded = document.querySelector('tr.expanded')
  if (existingDetail) existingDetail.remove()
  if (existingExpanded) existingExpanded.classList.remove('expanded')

  if (expandedConversationId === convId) {
    expandedConversationId = null
    return
  }

  expandedConversationId = convId
  row.classList.add('expanded')

  const detailRow = document.createElement('tr')
  detailRow.className = 'conversation-detail-row'
  detailRow.innerHTML = `<td colspan="10" class="conv-detail-content"><em>Loading...</em></td>`
  row.after(detailRow)

  try {
    const conv = await fetchConversationDetail(convId)
    if (!conv) {
      detailRow.innerHTML = `<td colspan="10" class="conv-detail-content"><em>Conversation not found</em></td>`
      return
    }
    detailRow.innerHTML = `<td colspan="10" class="conv-detail-content">${renderConversationDetailContent(conv)}</td>`
  } catch (e) {
    detailRow.innerHTML = `<td colspan="10" class="conv-detail-content"><em>Failed to load details</em></td>`
  }
}

// --- Load cached scores ---
async function loadCachedScores() {
  try {
    const data = await postMessageRequest('getCachedScores')
    if (data.aggregate?.average_score && !state.hasFreshScores) {
      state.scores = data
      renderFluencyScore()
    }
  } catch (e) {
    // Silently ignore — user can still run manual scoring
  }
}

// --- Config Maturity ---
function computeMaturityScore(maturity, gaps) {
  const breakdown = []

  // CLAUDE.md (20 pts)
  const claudeMd = maturity?.claudeMd || {}
  const claudeItems = []
  const claudePresent = claudeMd.present || false
  claudeItems.push({ label: 'CLAUDE.md present', status: claudePresent ? 'done' : 'missing', detail: claudePresent ? 'Found in project' : 'Create a CLAUDE.md to guide Claude' })
  const claudeMultiple = (claudeMd.locations?.length || 0) > 1
  claudeItems.push({ label: 'Multiple locations', status: claudeMultiple ? 'done' : 'missing', detail: claudeMultiple ? `${claudeMd.locations.length} locations found` : 'Add CLAUDE.md at multiple directory levels' })
  const claudeImports = claudeMd.hasImports || false
  claudeItems.push({ label: 'Uses @imports', status: claudeImports ? 'done' : 'missing', detail: claudeImports ? 'Modular configuration via imports' : 'Use @import to split config into modules' })
  const claudeEarned = (claudePresent ? 10 : 0) + (claudeMultiple ? 5 : 0) + (claudeImports ? 5 : 0)
  breakdown.push({ category: 'CLAUDE.md', earned: claudeEarned, max: 20, items: claudeItems })

  // Hooks (20 pts)
  const hooks = maturity?.hooks || {}
  const hookItems = []
  const hooksConfigured = hooks.configured || false
  hookItems.push({ label: 'Hooks configured', status: hooksConfigured ? 'done' : 'missing', detail: hooksConfigured ? 'Hook system is active' : 'Add hooks to .claude/settings.json' })
  const hookEvents = hooks.events || []
  const hookMultiEvent = hookEvents.length >= 2
  hookItems.push({ label: '2+ hook events', status: hookMultiEvent ? 'done' : hookEvents.length === 1 ? 'partial' : 'missing', detail: hookMultiEvent ? `${hookEvents.length} events: ${hookEvents.join(', ')}` : hookEvents.length === 1 ? `1 event: ${hookEvents[0]}` : 'Add hooks for multiple events' })
  const hookMatchers = hooks.hasMatchers || false
  hookItems.push({ label: 'File matchers', status: hookMatchers ? 'done' : 'missing', detail: hookMatchers ? 'Hooks use file pattern matching' : 'Add file matchers to scope hooks' })
  const hooksEarned = (hooksConfigured ? 10 : 0) + (hookMultiEvent ? 5 : hookEvents.length === 1 ? 2 : 0) + (hookMatchers ? 5 : 0)
  breakdown.push({ category: 'Hooks', earned: hooksEarned, max: 20, items: hookItems })

  // Rules (15 pts)
  const rules = maturity?.rules || {}
  const ruleItems = []
  const ruleCount = rules.count || 0
  ruleItems.push({ label: 'Rules defined', status: ruleCount > 0 ? 'done' : 'missing', detail: ruleCount > 0 ? `${ruleCount} rule${ruleCount !== 1 ? 's' : ''} found` : 'Add .mdc rule files to .claude/rules/' })
  const ruleScoping = rules.hasPathScoping || false
  ruleItems.push({ label: 'Path scoping', status: ruleScoping ? 'done' : 'missing', detail: ruleScoping ? 'Rules use path-based scoping' : 'Scope rules to specific file patterns' })
  const rulesEarned = (ruleCount > 0 ? 10 : 0) + (ruleScoping ? 5 : 0)
  breakdown.push({ category: 'Rules', earned: rulesEarned, max: 15, items: ruleItems })

  // Commands (10 pts)
  const commands = maturity?.commands || {}
  const cmdItems = []
  const cmdCount = commands.count || 0
  cmdItems.push({ label: 'Custom commands', status: cmdCount > 0 ? 'done' : 'missing', detail: cmdCount > 0 ? `${cmdCount} command${cmdCount !== 1 ? 's' : ''} defined` : 'Add slash commands to .claude/commands/' })
  const cmdMany = cmdCount >= 3
  cmdItems.push({ label: '3+ commands', status: cmdMany ? 'done' : cmdCount > 0 ? 'partial' : 'missing', detail: cmdMany ? 'Rich command library' : 'Add more commands for common workflows' })
  const cmdEarned = (cmdCount > 0 ? 5 : 0) + (cmdMany ? 5 : cmdCount > 0 ? 2 : 0)
  breakdown.push({ category: 'Commands', earned: cmdEarned, max: 10, items: cmdItems })

  // MCP (10 pts)
  const mcp = maturity?.mcp || {}
  const mcpItems = []
  const mcpConfigured = mcp.configured || false
  mcpItems.push({ label: 'MCP configured', status: mcpConfigured ? 'done' : 'missing', detail: mcpConfigured ? 'MCP servers are set up' : 'Configure MCP servers for extended capabilities' })
  const mcpServerCount = mcp.serverCount || 0
  const mcpMultiple = mcpServerCount >= 2
  mcpItems.push({ label: '2+ MCP servers', status: mcpMultiple ? 'done' : mcpServerCount === 1 ? 'partial' : 'missing', detail: mcpMultiple ? `${mcpServerCount} servers configured` : mcpServerCount === 1 ? '1 server configured' : 'Add multiple MCP servers' })
  const mcpEarned = (mcpConfigured ? 5 : 0) + (mcpMultiple ? 5 : mcpServerCount === 1 ? 2 : 0)
  breakdown.push({ category: 'MCP', earned: mcpEarned, max: 10, items: mcpItems })

  // Skills (10 pts)
  const skills = maturity?.skills || {}
  const skillItems = []
  const skillCount = skills.count || 0
  skillItems.push({ label: 'Custom skills', status: skillCount > 0 ? 'done' : 'missing', detail: skillCount > 0 ? `${skillCount} skill${skillCount !== 1 ? 's' : ''} defined` : 'Add skill files to .claude/skills/' })
  const skillFrontmatter = skills.hasFrontmatter || false
  skillItems.push({ label: 'Frontmatter metadata', status: skillFrontmatter ? 'done' : 'missing', detail: skillFrontmatter ? 'Skills use structured frontmatter' : 'Add frontmatter to skill files for better discovery' })
  const skillsEarned = (skillCount > 0 ? 5 : 0) + (skillFrontmatter ? 5 : 0)
  breakdown.push({ category: 'Skills', earned: skillsEarned, max: 10, items: skillItems })

  // Permissions (5 pts)
  const permissions = maturity?.permissions || {}
  const permItems = []
  const permConfigured = permissions.configured || false
  permItems.push({ label: 'Permissions configured', status: permConfigured ? 'done' : 'missing', detail: permConfigured ? 'Permission boundaries are set' : 'Configure permissions in .claude/settings.json' })
  const permEarned = permConfigured ? 5 : 0
  breakdown.push({ category: 'Permissions', earned: permEarned, max: 5, items: permItems })

  // Enforcement (10 pts)
  const stmtCount = gaps?.enforcementStatements?.length || 0
  const coveredCount = gaps?.coveredCount || 0
  const enfItems = []
  const enfRatio = stmtCount > 0 ? coveredCount / stmtCount : 0
  const enfEarned = Math.round(enfRatio * 10)
  enfItems.push({ label: 'Enforcement coverage', status: enfRatio >= 0.8 ? 'done' : enfRatio > 0 ? 'partial' : 'missing', detail: stmtCount > 0 ? `${coveredCount} of ${stmtCount} statements covered by hooks` : 'No enforcement statements found in CLAUDE.md' })
  breakdown.push({ category: 'Enforcement', earned: enfEarned, max: 10, items: enfItems })

  const score = breakdown.reduce((sum, b) => sum + b.earned, 0)
  const maxScore = 100
  let tier = 'Beginner'
  if (score > 75) tier = 'Expert'
  else if (score > 50) tier = 'Advanced'
  else if (score > 25) tier = 'Intermediate'

  return { score, tier, maxScore, breakdown }
}

async function loadConfigMaturity() {
  const container = document.getElementById('config-maturity-content')
  container.innerHTML = '<div class="empty-state-box"><div class="empty-state-icon">&#x2699;</div><p class="empty-state">Loading configuration data...</p></div>'
  try {
    const [maturity, gaps] = await Promise.all([
      postMessageRequest('getConfigMaturity'),
      postMessageRequest('getEnforcementGaps'),
    ])
    state.configMaturity = maturity
    state.enforcementGaps = gaps
    renderConfigMaturity()
  } catch (e) {
    container.innerHTML = `<div class="empty-state-box"><p class="empty-state">Failed to load configuration data: ${escapeHtml(e.message)}</p></div>`
  }
}

function renderConfigMaturity() {
  const container = document.getElementById('config-maturity-content')
  const result = computeMaturityScore(state.configMaturity, state.enforcementGaps)
  const { score, tier, breakdown } = result

  const circumference = 2 * Math.PI * 52
  const offset = circumference * (1 - score / 100)
  const tierClass = tier.toLowerCase()
  const tierColors = { beginner: '#DC2626', intermediate: '#D97706', advanced: '#D97706', expert: '#059669' }
  const scoreColor = tierColors[tierClass] || '#D97706'

  let html = ''

  // Section A: Score Ring + Tier Badge
  html += `
    <div class="maturity-score-section">
      <div class="score-ring">
        <svg viewBox="0 0 120 120" class="score-svg">
          <circle cx="60" cy="60" r="52" fill="none" stroke="var(--border)" stroke-width="8"/>
          <circle cx="60" cy="60" r="52" fill="none" stroke="${scoreColor}" stroke-width="8"
            stroke-dasharray="${circumference}" stroke-dashoffset="${offset}" stroke-linecap="round"
            transform="rotate(-90 60 60)"/>
        </svg>
        <div class="score-text">
          <span class="score-value" style="color: ${scoreColor}">${score}</span>
          <span class="score-label">/ 100</span>
        </div>
      </div>
      <div class="maturity-tier maturity-tier-${tierClass}">${escapeHtml(tier)}</div>
      <p style="margin-top: 4px; color: var(--text-secondary)">Your configuration is at the ${escapeHtml(tier)} level.</p>
    </div>`

  // Section B: Maturity Checklist
  html += '<div class="maturity-checklist">'
  for (const cat of breakdown) {
    html += `
      <div class="maturity-category">
        <div class="maturity-category-header">
          <span>${escapeHtml(cat.category)}</span>
          <span class="maturity-points">${cat.earned} / ${cat.max}</span>
        </div>`
    for (const item of cat.items) {
      const iconClass = item.status === 'done' ? 'maturity-icon-done' : item.status === 'partial' ? 'maturity-icon-partial' : 'maturity-icon-missing'
      const icon = item.status === 'done' ? '&#x2713;' : item.status === 'partial' ? '&#x26A0;' : '&#x25CB;'
      html += `
        <div class="maturity-item">
          <span class="maturity-icon ${iconClass}">${icon}</span>
          <div class="maturity-item-text">
            ${escapeHtml(item.label)}
            <div class="maturity-item-detail">${escapeHtml(item.detail)}</div>
          </div>
        </div>`
    }
    html += '</div>'
  }
  html += '</div>'

  // Section C: Enforcement Gap Summary
  const gaps = state.enforcementGaps || {}
  const stmtCount = gaps.enforcementStatements?.length || 0
  const coveredCount = gaps.coveredCount || 0
  const gapList = gaps.gaps || []

  html += `
    <h3>Enforcement Gaps</h3>
    <div class="gap-summary">
      <div class="gap-summary-card">
        <div class="gap-summary-stat">${stmtCount}</div>
        <div class="gap-summary-label">Enforcement statements</div>
      </div>
      <div class="gap-summary-card">
        <div class="gap-summary-stat">${coveredCount}</div>
        <div class="gap-summary-label">Covered by hooks</div>
      </div>
    </div>`

  if (gapList.length > 0) {
    const INITIAL_GAPS = 5
    gapList.forEach((gap, i) => {
      const hiddenClass = i >= INITIAL_GAPS ? ' gap-hidden' : ''
      const severity = gap.severity || 'medium'
      const severityClass = severity === 'high' ? 'severity-high' : 'severity-medium'
      html += `
        <div class="gap-item${hiddenClass}">
          <div class="gap-statement">${escapeHtml(gap.statement || '')}</div>
          <div class="gap-source">${escapeHtml(gap.source || '')}${gap.line ? `, line ${gap.line}` : ''} <span class="severity-badge ${severityClass}">${escapeHtml(severity)}</span></div>
          ${gap.suggestedHookEvent ? `<div class="gap-suggestion">Suggested hook: <strong>${escapeHtml(gap.suggestedHookEvent)}</strong></div>` : ''}
        </div>`
    })
    if (gapList.length > INITIAL_GAPS) {
      const remaining = gapList.length - INITIAL_GAPS
      html += `<button class="btn btn-secondary" id="show-more-gaps-btn">Show ${remaining} more</button>`
    }
  } else if (stmtCount > 0) {
    html += '<p style="color: var(--text-secondary)">All enforcement statements are covered by hooks.</p>'
  } else {
    html += '<p style="color: var(--text-secondary)">No enforcement statements found. Add rules to your CLAUDE.md to enable gap analysis.</p>'
  }

  container.innerHTML = html
}

// --- Load Benchmarks ---
async function loadBenchmarks() {
  try {
    BENCHMARKS = await postMessageRequest('getBenchmarks')
  } catch (e) {
    console.error('Failed to load benchmarks:', e)
  }
}

// --- Init ---
document.addEventListener('DOMContentLoaded', async () => {
  // Show onboarding card on first run
  const savedState = vscode.getState() || {}
  if (!savedState.hasSeenOnboarding) {
    const card = document.getElementById('onboarding-card')
    if (card) card.style.display = 'block'
  }

  // Restore saved conversation scope selection
  if (savedState.conversationScope) {
    const select = document.getElementById('conversation-scope')
    if (select) select.value = savedState.conversationScope
  }

  await Promise.all([loadBenchmarks(), loadConfig()])
  loadData()
  loadCachedScores()
})
