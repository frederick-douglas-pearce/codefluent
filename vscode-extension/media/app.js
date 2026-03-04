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
  if (msg.type === 'sessionsUpdated') {
    state.sessions = msg.data
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

// --- Config ---
const SPARKLINE_MAX_WEEKS = 12

// --- State ---
let state = {
  usage: null,
  sessions: null,
  scores: null,
  quickwins: null,
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
  progressive_ai_reliance: 'Starts sessions engaged and asking questions, but gradually offloads more work to AI without checking understanding.',
  iterative_ai_debugging: 'Uses AI to debug code without trying to understand the root cause — repeatedly asks "fix this" without learning.',
}

const HIGH_QUALITY_PATTERNS = ['conceptual_inquiry', 'generation_then_comprehension', 'hybrid_code_explanation']

const PATTERN_COLORS = ['#D97706', '#059669', '#2563EB', '#DC2626', '#7C3AED', '#EC4899']

const TOTAL_BEHAVIORS = 11

function computeEffectiveScore(fluencyBehaviors, configBehaviors) {
  const allKeys = new Set([
    ...Object.keys(fluencyBehaviors || {}),
    ...Object.keys(configBehaviors || {}),
  ])
  let count = 0
  for (const key of allKeys) {
    if (fluencyBehaviors?.[key] || configBehaviors?.[key]) count++
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
    advice: 'You begin sessions asking good questions but gradually let Claude drive. Set a rule: every 3rd prompt should be a comprehension question.',
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
}

// --- Data Loading ---
async function loadData() {
  try {
    const [usage, sessions] = await Promise.all([
      postMessageRequest('getUsage'),
      postMessageRequest('getSessions'),
    ])
    state.usage = usage
    state.sessions = sessions
    renderUsageDashboard()
    updateTimeScopeCounts()
  } catch (e) {
    console.error('Failed to load data:', e)
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
    '<div class="scoring-loader"><div class="spinner"></div><p>Analyzing sessions with Claude...</p></div>'
}

// --- Session Scope Resolution ---
function resolveSessionIds(scopeValue, sessions) {
  const [type, rawVal] = scopeValue.split(':')
  const val = parseInt(rawVal)

  if (type === 'days') {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - val)
    const filtered = sessions.filter(s =>
      s.started_at && new Date(s.started_at) >= cutoff
    )
    return {
      ids: filtered.map(s => s.id),
      description: `Last ${val} days (${filtered.length} sessions)`
    }
  }

  // Default: count-based
  const count = isNaN(val) ? 5 : val
  const sliced = sessions.slice(0, count)
  return {
    ids: sliced.map(s => s.id),
    description: `${sliced.length} sessions`
  }
}

function updateTimeScopeCounts() {
  if (!state.sessions?.sessions) return
  const select = document.getElementById('session-scope')
  for (const option of select.options) {
    if (!option.value.startsWith('days:')) continue
    const { description } = resolveSessionIds(option.value, state.sessions.sessions)
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

  // Show more sessions
  if (target.classList.contains('show-more-btn')) {
    const btn = target
    let shown = parseInt(btn.dataset.shown, 10)
    const total = parseInt(btn.dataset.total, 10)
    const batch = parseInt(btn.dataset.batch, 10)
    const items = btn.parentElement.querySelectorAll('.session-item')
    const newShown = Math.min(shown + batch, total)
    for (let i = shown; i < newShown; i++) {
      items[i].style.display = ''
    }
    btn.dataset.shown = newShown
    const remaining = total - newShown
    if (remaining <= 0) {
      btn.remove()
    } else {
      btn.textContent = `Show ${remaining} more session${remaining !== 1 ? 's' : ''}`
    }
    return
  }

  // Session item expand/collapse
  const sessionItem = target.closest('.session-item')
  if (sessionItem) {
    sessionItem.classList.toggle('expanded')
    return
  }
})

// --- Usage Dashboard ---
function renderUsageDashboard() {
  const daily = state.usage?.daily?.daily || []
  if (!daily.length) return

  // Token usage stacked area chart (cache read, cache creation, input, output)
  destroyChart('usage')
  charts.usage = new Chart(document.getElementById('usage-chart').getContext('2d'), {
    type: 'line',
    data: {
      labels: daily.map(d => d.date),
      datasets: [
        {
          label: 'Cache Read',
          data: daily.map(d => d.cacheReadTokens || 0),
          borderColor: '#D97706',
          backgroundColor: 'rgba(217, 119, 6, 0.35)',
          fill: true,
          tension: 0.3,
          pointRadius: 3,
          pointHoverRadius: 6,
          borderWidth: 2,
          order: 4,
        },
        {
          label: 'Cache Creation',
          data: daily.map(d => d.cacheCreationTokens || 0),
          borderColor: '#B45309',
          backgroundColor: 'rgba(180, 83, 9, 0.35)',
          fill: true,
          tension: 0.3,
          pointRadius: 3,
          pointHoverRadius: 6,
          borderWidth: 2,
          order: 3,
        },
        {
          label: 'Input',
          data: daily.map(d => d.inputTokens || 0),
          borderColor: '#059669',
          backgroundColor: 'rgba(5, 150, 105, 0.35)',
          fill: true,
          tension: 0.3,
          pointRadius: 3,
          pointHoverRadius: 6,
          borderWidth: 2,
          order: 2,
        },
        {
          label: 'Output',
          data: daily.map(d => d.outputTokens || 0),
          borderColor: '#2563EB',
          backgroundColor: 'rgba(37, 99, 235, 0.35)',
          fill: true,
          tension: 0.3,
          pointRadius: 3,
          pointHoverRadius: 6,
          borderWidth: 2,
          order: 1,
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
          callbacks: { label: ctx => `${ctx.dataset.label}: ${formatTokens(ctx.raw)}` }
        }
      },
      scales: {
        y: {
          stacked: true,
          beginAtZero: true,
          ticks: { callback: v => formatTokens(v) }
        },
        x: { ticks: { maxTicksLimit: 15 } }
      }
    }
  })

  // Usage pace
  renderUsagePace(daily)
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

  // Bar width capped at 100%
  const barWidth = Math.min(todayPct, 200)

  container.innerHTML = `
    <h3>Usage Pace</h3>
    <div class="pace-grid">
      <div class="pace-card">
        <div class="pace-card-title">Today</div>
        <div class="pace-card-value">${formatCost(todayCost)}</div>
        <div class="pace-card-detail">${formatTokens(todayTokens)} tokens</div>
        <div class="pace-bar-track">
          <div class="pace-bar-fill ${paceClass}" style="width: ${Math.min(barWidth, 100)}%"></div>
          <div class="pace-bar-avg" style="left: ${Math.min(100, 100)}%" title="Daily average: ${formatCost(avgDaily)}"></div>
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
  const scopeValue = document.getElementById('session-scope').value
  runScoring(scopeValue)
})

async function runScoring(scopeValue) {
  if (!state.sessions?.sessions?.length) {
    document.getElementById('fluency-results').innerHTML =
      '<p class="empty-state">Sessions still loading — please wait a moment and try again.</p>'
    return
  }

  const { ids, description } = resolveSessionIds(scopeValue, state.sessions.sessions)
  if (ids.length === 0) {
    document.getElementById('fluency-results').innerHTML =
      '<p class="empty-state">No sessions found in the selected time range.</p>'
    return
  }

  const forceRescore = document.getElementById('force-rescore').checked
  if (forceRescore && ids.length > 20) {
    if (!confirm(`Force Rescore will re-score all ${ids.length} sessions using the Anthropic API. Continue?`)) return
  }

  // Persist selection
  const s = vscode.getState() || {}
  s.sessionScope = scopeValue
  vscode.setState(s)

  const btn = document.getElementById('run-scoring-btn')
  btn.disabled = true
  btn.textContent = 'Analyzing...'
  showLoader('fluency-results')

  try {
    state.scores = await postMessageRequest('runScoring', { session_ids: ids, force_rescore: forceRescore })
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
  const color = last >= 70 ? 'var(--success)' : last >= 50 ? 'var(--warning)' : 'var(--danger)'
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
  const sparkline = renderSparkline(history.slice(-SPARKLINE_MAX_WEEKS))
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
      '<p class="empty-state">No sessions could be scored.</p>'
    return
  }

  const score = aggregate.average_score
  const circumference = 2 * Math.PI * 52
  const offset = circumference * (1 - score / 100)

  const scoreColor = score >= 70 ? 'var(--success)' : score >= 50 ? 'var(--warning)' : 'var(--danger)'

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
      <p class="score-summary">${aggregate.sessions_scored} sessions analyzed${aggregate.sessions_skipped ? ` (${aggregate.sessions_skipped} skipped — no prompts)` : ''}</p>
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

    const configTag = configBehaviors[key] ? ' <span class="config-tag">CLAUDE.md</span>' : ''

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
  const totalSessions = Object.values(patterns).reduce((a, b) => a + b, 0)
  const highQualityCount = patternEntries
    .filter(([p]) => HIGH_QUALITY_PATTERNS.includes(p))
    .reduce((sum, [, c]) => sum + c, 0)
  const highQualityPct = totalSessions > 0 ? Math.round(highQualityCount / totalSessions * 100) : 0

  html += `
    <div class="pattern-section">
      <h3>Coding Interaction Patterns</h3>
      <p class="section-desc">Each session is classified into one of six coding interaction patterns based on how you engaged with Claude.</p>
      <div class="pattern-layout">
        <div class="pattern-chart-wrap"><canvas id="pattern-chart"></canvas></div>
        <div class="pattern-legend">`

  patternEntries.forEach(([p, count], i) => {
    const pct = totalSessions > 0 ? Math.round(count / totalSessions * 100) : 0
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

  const qualityClass = highQualityPct >= 50 ? 'quality-good' : 'quality-bad'
  html += `
        </div>
      </div>
      <div class="pattern-quality ${qualityClass}">
        ${highQualityPct}% high-quality interaction patterns
      </div>
    </div>`

  // Session breakdown
  const INITIAL_SHOWN = 5
  const BATCH_SIZE = 10
  const validSessions = Object.entries(scores).filter(([, sd]) => !sd.error)
  html += '<div class="session-list"><h3>Session Breakdown</h3>'
  validSessions.forEach(([sid, scoreData], idx) => {
    const session = state.sessions.sessions.find(s => s.id === sid)
    const date = session?.started_at ? new Date(session.started_at).toLocaleDateString() : ''
    const project = session?.project || ''
    const effectiveScore = scoreData.effective_score ?? scoreData.overall_score
    const hidden = idx >= INITIAL_SHOWN ? ' style="display:none"' : ''
    html += `
      <div class="session-item"${hidden}>
        <div class="session-header">
          <span class="session-id">${escapeHtml(project)} (${date})</span>
          <span class="session-score" style="color: ${effectiveScore >= 70 ? 'var(--success)' : effectiveScore >= 50 ? 'var(--warning)' : 'var(--danger)'}">
            ${effectiveScore}/100
          </span>
        </div>
        <div class="session-detail">
          <p>${escapeHtml(scoreData.one_line_summary || '')}</p>
          <p>Pattern: ${PATTERN_LABELS[scoreData.coding_pattern] || escapeHtml(scoreData.coding_pattern)}</p>
        </div>
      </div>`
  })
  if (validSessions.length > INITIAL_SHOWN) {
    const remaining = validSessions.length - INITIAL_SHOWN
    html += `<button class="show-more-btn" data-shown="${INITIAL_SHOWN}" data-total="${validSessions.length}" data-batch="${BATCH_SIZE}">Show ${remaining} more session${remaining !== 1 ? 's' : ''}</button>`
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
    document.getElementById('quickwins-results').innerHTML =
      '<p class="empty-state">No suggestions available.</p>'
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
      <a href="https://www.anthropic.com/research/AI-fluency-index">AI Fluency Index (Feb 23, 2026)</a>
      <a href="https://www.anthropic.com/research/coding-skill-formation">Coding Skills Formation (Jan 29, 2026)</a>
      <a href="https://www.anthropic.com/research/claude-code-best-practices">Claude Code Best Practices</a>
    </div>`

  document.getElementById('recommendations-content').innerHTML = html
}

function renderRecCard(rec) {
  return `
    <div class="rec-card">
      <div class="rec-title">${rec.title}</div>
      <div class="rec-advice">${rec.advice}</div>
      ${rec.action ? `<div class="rec-action">${rec.action}</div>` : ''}
      ${rec.prompt ? `
        <div class="rec-prompt-section">
          <div class="rec-prompt-label">Try this prompt in Claude Code:</div>
          <div class="prompt-box-wrapper">
            <div class="prompt-box-header">
              <button class="copy-btn">Copy</button>
            </div>
            <pre class="prompt-box">${rec.prompt}</pre>
          </div>
        </div>` : ''}
      <div class="rec-source">${rec.source}</div>
    </div>`
}

// --- Load cached scores ---
async function loadCachedScores() {
  try {
    const data = await postMessageRequest('getCachedScores')
    if (data.aggregate?.average_score) {
      state.scores = data
      renderFluencyScore()
    }
  } catch (e) {
    // Silently ignore — user can still run manual scoring
  }
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

  // Restore saved session scope selection
  if (savedState.sessionScope) {
    const select = document.getElementById('session-scope')
    if (select) select.value = savedState.sessionScope
  }

  await loadBenchmarks()
  loadData()
  loadCachedScores()
})
