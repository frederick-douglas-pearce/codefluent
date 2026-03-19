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

## Eval Runner

Automated regression checker that scores the golden set against the Anthropic API and validates outputs.

### Quick Start

```bash
# From project root — set your API key
export ANTHROPIC_API_KEY=sk-ant-...

# Dry run (no API calls)
cd webapp && uv run python ../shared/eval/run_eval.py --dry-run

# Run schema + agreement checks (default)
cd webapp && uv run python ../shared/eval/run_eval.py

# Run specific sections only
cd webapp && uv run python ../shared/eval/run_eval.py --sections single_scoring,config_scoring

# Run with verbose output
cd webapp && uv run python ../shared/eval/run_eval.py --verbose
```

### Checks

| Check | What it does | API calls | Opt-in |
|-------|-------------|-----------|--------|
| `schema` | Validates response structure (keys, types) | Included in default run | Default |
| `agreement` | Compares actual vs expected behaviors | Included in default run | Default |
| `consistency` | Runs subset N times, measures self-agreement | N × subset_size | `--check consistency` |
| `drift` | Compares activation rates against a baseline | 0 (uses saved results) | `--check drift --baseline PATH` |
| `regression` | Diffs results between two prompt versions | 2 × section_size | `--check regression` |

### CLI Options

```
--check {all,schema,agreement,consistency,drift,regression}  (default: all)
--threshold FLOAT       Agreement threshold (default: 0.85)
--sections LIST         Comma-separated sections (default: all)
--delay FLOAT           Seconds between API calls (default: 0.5)
--runs INT              Consistency runs (default: 3)
--subset INT            Consistency subset size (default: 10)
--baseline PATH         For drift check
--old-version PATH      For regression (e.g., scoring/v1.0.md)
--new-version PATH      For regression (e.g., scoring/v1.1.md)
--regression-section    Which section for regression
--output DIR            Output dir (default: shared/eval/results/)
--dry-run               Show what would run, no API calls
--verbose               Print each API call
```

### Cost

- Full golden set (50 entries): ~$0.20-0.30
- Consistency (10 × 3 runs): ~$0.10
- Regression (one section, 2 versions): ~$0.05-0.15

### Tests

```bash
cd webapp
uv run pytest tests/test_eval.py -v              # Unit + mock integration tests
uv run pytest tests/test_eval.py -m live          # Live API tests (~$0.02)
```
