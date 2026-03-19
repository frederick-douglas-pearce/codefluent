"""Prompt loading, template filling, and Anthropic API calls for eval runner."""

import json
import os
import random
import re
import time
from pathlib import Path

SHARED_DIR = Path(__file__).parent.parent
PROMPTS_DIR = SHARED_DIR / "prompts"

BEHAVIORS = [
    "iteration_and_refinement", "clarifying_goals", "specifying_format",
    "providing_examples", "setting_interaction_terms", "checking_facts",
    "questioning_reasoning", "identifying_missing_context",
    "adjusting_approach", "building_on_responses", "providing_feedback",
]

MODEL = "claude-sonnet-4-20250514"


def load_prompt(prompt_type, version_override=None):
    """Load a prompt template and version from the shared prompts registry.

    Args:
        prompt_type: One of 'scoring', 'config', 'optimizer', 'single_scoring'.
        version_override: If given, load this file directly (e.g. 'scoring/v1.1.md').

    Returns:
        dict with 'version' and 'template' keys.
    """
    if version_override:
        path = PROMPTS_DIR / version_override
        if not path.exists():
            raise FileNotFoundError(f"Prompt file not found: {path}")
        return {"version": version_override, "template": path.read_text()}

    with open(PROMPTS_DIR / "registry.json") as f:
        registry = json.load(f)
    if prompt_type not in registry:
        raise KeyError(f"Unknown prompt type: {prompt_type}")
    entry = registry[prompt_type]
    with open(PROMPTS_DIR / entry["file"]) as f:
        template = f.read()
    return {"version": entry["version"], "template": template}


def fill_template(template, variables):
    """Replace {{KEY}} placeholders with values from variables dict."""
    result = template
    for key, value in variables.items():
        result = result.replace("{{" + key + "}}", str(value))
    return result


def build_filled_prompt(entry, section, template):
    """Build a filled prompt for a golden set entry.

    Args:
        entry: A golden set entry dict.
        section: One of 'single_scoring', 'session_scoring', 'config_scoring', 'optimizer'.
        template: The prompt template string.

    Returns:
        Filled prompt string ready for API call.
    """
    if section == "single_scoring":
        return fill_template(template, {"PROMPT": entry["prompt"]})

    elif section == "session_scoring":
        prompts = entry["prompts"]
        prompt_tags = "\n".join(
            f'<user_prompt index="{i+1}">{p}</user_prompt>'
            for i, p in enumerate(prompts)
        )
        meta = entry.get("metadata", {})
        return fill_template(template, {
            "USED_PLAN_MODE": str(meta.get("used_plan_mode", False)),
            "THINKING_COUNT": str(meta.get("thinking_count", 0)),
            "TOOLS_USED": ", ".join(meta.get("tools_used", [])) or "none",
            "PROMPTS": prompt_tags,
        })

    elif section == "config_scoring":
        return fill_template(template, {"CONTENT": entry["content"]})

    elif section == "optimizer":
        return fill_template(template, {
            "PROMPT": entry["prompt"],
            "MAX_LENGTH": str(entry.get("max_length", 2000)),
            "CONFIG_BEHAVIORS": entry.get("config_behaviors", ""),
        })

    else:
        raise ValueError(f"Unknown section: {section}")


def create_client():
    """Create an Anthropic client, reading API key from env or .env file."""
    try:
        from dotenv import load_dotenv
        # Try loading .env from webapp/ or project root
        for env_path in [
            Path(__file__).parent.parent.parent / "webapp" / ".env",
            Path(__file__).parent.parent.parent / ".env",
        ]:
            if env_path.exists():
                load_dotenv(env_path)
                break
    except ImportError:
        pass

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError(
            "ANTHROPIC_API_KEY not found. Set it as an environment variable "
            "or in a .env file in the webapp/ or project root directory."
        )

    import anthropic
    return anthropic.Anthropic(api_key=api_key)


def _sanitize_error(msg):
    """Remove API keys from error messages."""
    return re.sub(r'sk-ant-[a-zA-Z0-9_-]+', '[REDACTED]', str(msg))


def call_api(client, prompt, max_tokens=1024):
    """Make a single API call. Returns dict with result, tokens, and any parse error."""
    response = client.messages.create(
        model=MODEL,
        max_tokens=max_tokens,
        messages=[{"role": "user", "content": prompt}],
    )
    text = response.content[0].text
    input_tokens = response.usage.input_tokens
    output_tokens = response.usage.output_tokens

    # Strip markdown code fences if present
    if text.strip().startswith("```"):
        text = text.strip().split("\n", 1)[1].rsplit("```", 1)[0].strip()

    parse_error = None
    try:
        result = json.loads(text)
    except json.JSONDecodeError as e:
        result = None
        parse_error = str(e)

    return {
        "result": result,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "parse_error": parse_error,
        "raw_text": text,
    }


def call_with_retry(client, prompt, max_tokens=1024, max_attempts=3):
    """Call API with exponential backoff on retryable errors."""
    last_error = None
    for attempt in range(1, max_attempts + 1):
        try:
            return call_api(client, prompt, max_tokens)
        except Exception as e:
            last_error = e
            status_code = getattr(e, "status_code", None)
            retryable = status_code == 429 or (isinstance(status_code, int) and status_code >= 500)
            if not retryable or attempt == max_attempts:
                raise
            delay = (1000 * (2 ** (attempt - 1)) + random.random() * 200) / 1000
            print(f"  Retry {attempt}/{max_attempts} after {_sanitize_error(e)}, waiting {delay:.1f}s")
            time.sleep(delay)
    raise last_error  # pragma: no cover


def run_golden_set(client, golden_set, sections=None, delay=0.5, verbose=False):
    """Run the golden set through the API and return results.

    Args:
        client: Anthropic client.
        golden_set: Parsed golden_set.json dict.
        sections: List of sections to run, or None for all.
        delay: Seconds between API calls.
        verbose: Print each API call.

    Returns:
        List of result dicts with entry info, API response, and tokens.
    """
    all_sections = ["single_scoring", "session_scoring", "config_scoring", "optimizer"]
    if sections:
        for s in sections:
            if s not in all_sections:
                raise ValueError(f"Unknown section: {s}")
    else:
        sections = all_sections

    # Map section names to prompt types
    prompt_type_map = {
        "single_scoring": "single_scoring",
        "session_scoring": "scoring",
        "config_scoring": "config",
        "optimizer": "optimizer",
    }

    results = []
    for section in sections:
        entries = golden_set.get(section, [])
        if not entries:
            continue

        prompt_info = load_prompt(prompt_type_map[section])
        template = prompt_info["template"]
        version = prompt_info["version"]

        for i, entry in enumerate(entries):
            if verbose:
                print(f"  [{section}] {entry['id']} ({i+1}/{len(entries)})")

            filled = build_filled_prompt(entry, section, template)
            try:
                api_result = call_with_retry(client, filled)
            except Exception as e:
                api_result = {
                    "result": None,
                    "input_tokens": 0,
                    "output_tokens": 0,
                    "parse_error": _sanitize_error(e),
                    "raw_text": None,
                }

            results.append({
                "id": entry["id"],
                "section": section,
                "prompt_version": version,
                "expected": entry["expected"],
                "actual": api_result["result"],
                "parse_error": api_result["parse_error"],
                "input_tokens": api_result["input_tokens"],
                "output_tokens": api_result["output_tokens"],
            })

            if delay > 0 and i < len(entries) - 1:
                time.sleep(delay)

    return results


def load_pricing():
    """Load pricing data from shared/pricing.json."""
    with open(SHARED_DIR / "pricing.json") as f:
        return json.load(f)
