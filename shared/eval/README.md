# Evaluation Framework

Golden set and regression testing for CodeFluent's scoring prompts.

## Golden Set (`golden_set.json`)

A curated set of 50 entries with human-verified expected scores for regression testing prompt changes, cross-model comparison, and scoring accuracy validation.

### Structure

| Section | Count | What it tests |
|---------|-------|---------------|
| `single_scoring` | 25 | Single-prompt behavior classification across the full score range |
| `session_scoring` | 12 | Multi-prompt sessions with metadata signals and pattern classification |
| `config_scoring` | 8 | CLAUDE.md config files testing behavior credit boundaries |
| `optimizer` | 5 | Prompt optimizer input scoring, config skip logic, and early exit |

### Domain Coverage

Prompts span: web development (React, Express, FastAPI), data science (pandas, XGBoost), systems programming (Rust), mobile (SwiftUI, Flutter), infrastructure (Terraform, Kubernetes, Docker, GitHub Actions), documentation, and beginner learning scenarios.

### Tags

Each entry has tags for filtering:
- **Fluency level:** `low-fluency`, `medium-fluency`, `high-fluency`, `very-high-fluency`
- **Domain:** `web-dev`, `data-science`, `mobile`, `infrastructure`, `devops`, etc.
- **Edge cases:** `edge-case-short`, `edge-case-vague`, `edge-case-code-only`, `edge-case-injection`
- **Config-specific:** `key-regression-118`, `should-be-zero-post-118`, `gold-standard-post-118`

### Config Scoring and Issue #118

Config entries include a `config_eligible_expected` field that tracks the 3 behaviors eligible for config credit after #118 is implemented:
- `setting_interaction_terms`
- `identifying_missing_context`
- `questioning_reasoning`

The `expected.fluency_behaviors` field reflects current v1.0 prompt behavior. After #118, use `config_eligible_expected` as the new ground truth for the config-eligible subset.

### How to Use

1. **Baseline capture:** Run all entries against current prompt versions, record results
2. **Regression testing:** Before a prompt version bump, run the golden set with both old and new prompts, diff results
3. **Cross-model comparison:** Run the golden set with different LLM providers, compare agreement per behavior
4. **Expanding the set:** Add entries that surface real-world scoring surprises; label with rationale

### Labeling Methodology

Each behavior label was determined by:
1. Reading the prompt text and identifying explicit behavioral signals
2. Checking against the behavior definitions in the scoring prompts
3. Documenting rationale for non-obvious labels (borderline cases)
4. Aiming for conservative labeling — behaviors are `true` only when clearly demonstrated

### Expected Scores

`overall_score` and `input_score` are computed as `(true_count / 11) * 100` rounded to nearest integer. These are expected values — the actual model may produce slightly different scores due to the `one_line_summary` and qualitative assessment influencing the JSON output.

Acceptable tolerance: individual behaviors should match exactly; overall scores may differ by ±9 (one behavior).
