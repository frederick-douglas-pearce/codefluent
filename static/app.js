// CodeFluent — Frontend Application

// --- State ---
let state = {
  usage: null,
  sessions: null,
  scores: null,
  quickwins: null,
  activeTab: 'usage'
}

// --- Chart instances (destroy before re-creating) ---
let charts = {}

// --- Anthropic Benchmarks ---
const BENCHMARKS = {
  iteration_and_refinement: 0.857,
  building_on_responses: 0.75,
  clarifying_goals: 0.70,
  adjusting_approach: 0.60,
  questioning_reasoning: 0.40,
  providing_feedback: 0.35,
  specifying_format: 0.30,
  setting_interaction_terms: 0.30,
  checking_facts: 0.25,
  providing_examples: 0.25,
  identifying_missing_context: 0.20,
}

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

const PATTERN_LABELS = {
  conceptual_inquiry: 'Conceptual Inquiry',
  generation_then_comprehension: 'Gen-Then-Comprehension',
  hybrid_code_explanation: 'Hybrid Code+Explanation',
  ai_delegation: 'AI Delegation',
  progressive_ai_reliance: 'Progressive AI Reliance',
  iterative_ai_debugging: 'Iterative AI Debugging',
}

const HIGH_QUALITY_PATTERNS = ['conceptual_inquiry', 'generation_then_comprehension', 'hybrid_code_explanation']

const PATTERN_COLORS = ['#D97706', '#059669', '#2563EB', '#DC2626', '#7C3AED', '#EC4899']

// --- Recommendations Data ---
const RECOMMENDATIONS = {
  setting_interaction_terms: {
    threshold: 0.30,
    impact: 'high',
    title: 'Set Interaction Terms More Often',
    advice: "Tell Claude how to interact: 'Push back if my approach seems wrong', 'Explain your uncertainty'. Only ~30% of users do this.",
    action: "Add to your CLAUDE.md: 'Always explain trade-offs. Push back if my approach seems suboptimal.'",
    source: 'Anthropic AI Fluency Index (Feb 2026)',
  },
  checking_facts: {
    threshold: 0.35,
    impact: 'high',
    title: 'Verify Claims After Code Generation',
    advice: "When Claude produces code or technical claims, ask: 'Are you sure this API exists in v4?' Fact-checking drops 3.7pp when generating artifacts.",
    action: 'After code generation, ask one verification question before accepting.',
    source: 'Anthropic AI Fluency Index (Feb 2026)',
  },
  questioning_reasoning: {
    threshold: 0.40,
    impact: 'medium',
    title: "Ask 'Why This Approach?'",
    advice: "'Why did you choose this approach over X?' — especially for architecture decisions.",
    action: 'Before accepting a design, ask Claude to compare alternatives.',
    source: 'Anthropic AI Fluency Index (Feb 2026)',
  },
  identifying_missing_context: {
    threshold: 0.25,
    impact: 'medium',
    title: 'Check for Missing Context',
    advice: "Ask: 'What assumptions are you making here?' or 'What context would help you do this better?'",
    action: 'At the start of complex tasks, ask Claude what it needs to know.',
    source: 'Anthropic AI Fluency Index (Feb 2026)',
  },
  providing_examples: {
    threshold: 0.30,
    impact: 'medium',
    title: 'Show Examples of What You Want',
    advice: "Paste a code snippet and say 'follow this pattern'. Examples dramatically improve output quality.",
    action: 'When requesting code, include at least one example of the style you want.',
    source: 'Anthropic AI Fluency Index / Best Practices',
  },
}

const PATTERN_RECOMMENDATIONS = {
  ai_delegation: {
    impact: 'high',
    title: "You're Delegating Too Much",
    advice: "You're offloading entire tasks without engaging. Ask 'How does this work?' after code generation. Comprehension scores 86% for conceptual inquiry vs <40% for delegation.",
    source: 'Anthropic Coding Skills Formation Study (Jan 2026)',
  },
  progressive_ai_reliance: {
    impact: 'high',
    title: 'You Start Engaged But Drift',
    advice: 'You begin sessions asking good questions but gradually let Claude drive. Set a rule: every 3rd prompt should be a comprehension question.',
    source: 'Anthropic Coding Skills Formation Study (Jan 2026)',
  },
  iterative_ai_debugging: {
    impact: 'medium',
    title: 'Understand Before Debugging',
    advice: "Before asking Claude to fix a bug, explain what you think is wrong. 'I think the issue is X because Y' forces understanding.",
    source: 'Anthropic Coding Skills Formation Study (Jan 2026)',
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
      fetch('/api/usage').then(r => r.json()),
      fetch('/api/sessions').then(r => r.json()),
    ])
    state.usage = usage
    state.sessions = sessions
    renderUsageDashboard()
  } catch (e) {
    console.error('Failed to load data:', e)
  }
}

// --- Helpers ---
function formatTokens(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K'
  return n.toString()
}

function formatCost(n) {
  return '$' + n.toFixed(2)
}

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

function copyPrompt(btn) {
  const text = btn.previousElementSibling.textContent
  navigator.clipboard.writeText(text)
  btn.textContent = 'Copied!'
  setTimeout(() => btn.textContent = 'Copy', 2000)
}

// --- Usage Dashboard ---
function renderUsageDashboard() {
  const daily = state.usage?.daily?.daily || []
  if (!daily.length) return

  const totalTokens = daily.reduce((sum, d) => sum + d.totalTokens, 0)
  const totalCost = daily.reduce((sum, d) => sum + d.totalCost, 0)
  const daysActive = daily.length
  const allModels = new Set(daily.flatMap(d => d.modelsUsed || []))

  document.getElementById('stat-total-tokens').textContent = formatTokens(totalTokens)
  document.getElementById('stat-tokens-detail').textContent = `across ${daysActive} days`
  document.getElementById('stat-total-cost').textContent = formatCost(totalCost)
  document.getElementById('stat-cost-detail').textContent = `avg ${formatCost(totalCost / daysActive)}/day`
  document.getElementById('stat-days-active').textContent = daysActive
  document.getElementById('stat-days-detail').textContent = `${daily[0]?.date} to ${daily[daily.length - 1]?.date}`
  document.getElementById('stat-models-used').textContent = allModels.size
  document.getElementById('stat-models-detail').textContent = [...allModels].map(m => m.split('-').slice(0, 4).join('-')).join(', ')

  // Token usage line chart
  destroyChart('usage')
  charts.usage = new Chart(document.getElementById('usage-chart').getContext('2d'), {
    type: 'line',
    data: {
      labels: daily.map(d => d.date),
      datasets: [{
        label: 'Total Tokens',
        data: daily.map(d => d.totalTokens),
        borderColor: '#D97706',
        backgroundColor: 'rgba(217, 119, 6, 0.1)',
        fill: true,
        tension: 0.3,
        pointRadius: 2,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top' },
        tooltip: { callbacks: { label: ctx => `${formatTokens(ctx.raw)} tokens` } }
      },
      scales: {
        y: { beginAtZero: true, ticks: { callback: v => formatTokens(v) } },
        x: { ticks: { maxTicksLimit: 15 } }
      }
    }
  })

  // Cost bar chart
  destroyChart('cost')
  charts.cost = new Chart(document.getElementById('cost-chart').getContext('2d'), {
    type: 'bar',
    data: {
      labels: daily.map(d => d.date),
      datasets: [{
        label: 'Cost (USD)',
        data: daily.map(d => d.totalCost),
        backgroundColor: '#059669',
        borderRadius: 4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'top' } },
      scales: {
        y: { beginAtZero: true, ticks: { callback: v => '$' + v.toFixed(2) } },
        x: { ticks: { maxTicksLimit: 15 } }
      }
    }
  })

  // Model breakdown
  renderModelBreakdown(daily)
}

function renderModelBreakdown(daily) {
  const modelTotals = {}
  for (const day of daily) {
    for (const mb of (day.modelBreakdowns || [])) {
      const name = mb.modelName
      modelTotals[name] = (modelTotals[name] || 0) + mb.cost
    }
  }
  const totalCost = Object.values(modelTotals).reduce((a, b) => a + b, 0)
  const sorted = Object.entries(modelTotals).sort((a, b) => b[1] - a[1])

  const container = document.getElementById('model-breakdown')
  container.innerHTML = sorted.map(([name, cost]) => {
    const pct = totalCost > 0 ? (cost / totalCost * 100).toFixed(1) : 0
    const shortName = name.split('-').slice(0, 4).join('-')
    return `
      <div class="model-bar-item">
        <div class="model-bar-label">
          <span>${shortName}</span>
          <span>${formatCost(cost)} (${pct}%)</span>
        </div>
        <div class="model-bar-track">
          <div class="model-bar-fill" style="width: ${pct}%"></div>
        </div>
      </div>`
  }).join('')
}

// --- Fluency Scoring ---
document.getElementById('run-scoring-btn').addEventListener('click', () => {
  const count = parseInt(document.getElementById('session-count').value)
  runScoring(count)
})

async function runScoring(count) {
  if (!state.sessions?.sessions?.length) return

  const btn = document.getElementById('run-scoring-btn')
  btn.disabled = true
  btn.textContent = 'Analyzing...'
  showLoader('fluency-results')

  try {
    const ids = state.sessions.sessions.slice(0, count).map(s => s.id)
    const res = await fetch('/api/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_ids: ids })
    })
    state.scores = await res.json()
    renderFluencyScore()
  } catch (e) {
    document.getElementById('fluency-results').innerHTML =
      `<p class="empty-state">Error: ${e.message}</p>`
  } finally {
    btn.disabled = false
    btn.textContent = 'Run Analysis'
  }
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
      <p class="score-summary">${aggregate.sessions_scored} sessions analyzed</p>
    </div>`

  // Behavior bars
  html += '<div class="behaviors-section"><h3>Fluency Behaviors vs. Anthropic Benchmarks</h3>'
  const prevalence = aggregate.behavior_prevalence || {}
  for (const [key, benchmark] of Object.entries(BENCHMARKS)) {
    const userPct = (prevalence[key] || 0) * 100
    const benchPct = benchmark * 100
    let colorClass = 'color-success'
    if (userPct < benchPct - 15) colorClass = 'color-danger'
    else if (userPct < benchPct) colorClass = 'color-warning'

    html += `
      <div class="behavior-bar">
        <div class="behavior-label">
          <span class="behavior-name">${BEHAVIOR_LABELS[key]}</span>
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
      <div class="pattern-layout">
        <div class="pattern-chart-wrap"><canvas id="pattern-chart"></canvas></div>
        <div class="pattern-legend">`

  patternEntries.forEach(([p, count], i) => {
    const pct = totalSessions > 0 ? Math.round(count / totalSessions * 100) : 0
    html += `
      <div class="pattern-legend-item">
        <span>${PATTERN_LABELS[p] || p}</span>
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
  html += '<div class="session-list"><h3>Session Breakdown</h3>'
  for (const [sid, scoreData] of Object.entries(scores)) {
    if (scoreData.error) continue
    const session = state.sessions.sessions.find(s => s.id === sid)
    const date = session?.started_at ? new Date(session.started_at).toLocaleDateString() : ''
    const project = session?.project || ''
    html += `
      <div class="session-item" onclick="this.classList.toggle('expanded')">
        <div class="session-header">
          <span class="session-id">${project} (${date})</span>
          <span class="session-score" style="color: ${scoreData.overall_score >= 70 ? 'var(--success)' : scoreData.overall_score >= 50 ? 'var(--warning)' : 'var(--danger)'}">
            ${scoreData.overall_score}/100
          </span>
        </div>
        <div class="session-detail">
          <p>${scoreData.one_line_summary || ''}</p>
          <p>Pattern: ${PATTERN_LABELS[scoreData.coding_pattern] || scoreData.coding_pattern}</p>
        </div>
      </div>`
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
    const res = await fetch('/api/quickwins')
    state.quickwins = await res.json()
    renderQuickWins()
  } catch (e) {
    document.getElementById('quickwins-results').innerHTML =
      `<p class="empty-state">Error: ${e.message}</p>`
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

  const html = suggestions.map(s => `
    <div class="task-card">
      <div class="task-header">
        <span class="task-title">${s.task}</span>
      </div>
      <div class="task-meta">
        <span class="task-repo">${s.repo}</span>
        <span class="task-time">~${s.estimated_minutes} min</span>
        <span class="task-category category-${categoryIcons[s.category] || 'feature'}">${s.category}</span>
      </div>
      <div class="task-prompt">
        <pre class="prompt-text">${s.prompt}</pre>
        <button class="copy-btn" onclick="copyPrompt(this)">Copy</button>
      </div>
    </div>
  `).join('')

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
    if (userVal < rec.threshold) {
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
      <div class="rec-source">${rec.source}</div>
    </div>`
}

// --- Init ---
document.addEventListener('DOMContentLoaded', loadData)
