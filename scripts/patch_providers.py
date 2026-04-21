"""
patch_providers.py — Reads scripts/test_results.json and removes permanently
dead models from lib/providers.ts.

"Permanently dead" = 404 / 410 / 400 HTTP errors (model gone or renamed).
Transient failures (429 rate-limit, 5xx, timeout) are left untouched.

If a provider's default model is removed, the default is updated to the
first surviving model in its list.

Exits with code 1 if any changes were made (so the CI step knows to commit).
Exits with code 0 if nothing changed.
"""

import json, re, sys, os

SCRIPT_DIR   = os.path.dirname(os.path.abspath(__file__))
RESULTS_PATH = os.path.join(SCRIPT_DIR, 'test_results.json')
PROVIDERS_TS = os.path.join(SCRIPT_DIR, '..', 'lib', 'providers.ts')

PERMANENT_ERRORS = [
    '400 Client Error',
    '404 Client Error',
    '410 Client Error',
]

# ── Load dead models ──────────────────────────────────────────────────────────

def is_permanent(response: str) -> bool:
    return any(e in response for e in PERMANENT_ERRORS)

def load_dead_models() -> dict[str, list[str]]:
    """Returns {provider: [model_id, ...]} for permanently dead models."""
    with open(RESULTS_PATH) as f:
        data = json.load(f)
    dead: dict[str, list[str]] = {}
    for entry in data.get('failed', []):
        if is_permanent(entry.get('response', '')):
            dead.setdefault(entry['provider'], []).append(entry['model'])
    return dead

# ── Patch providers.ts ────────────────────────────────────────────────────────

def patch_providers_ts(dead_by_provider: dict[str, list[str]]) -> list[str]:
    """
    Removes dead model entries from providers.ts.
    Updates the default `model:` field if it was among the removed ones.
    Returns list of removed "provider/model" strings.
    """
    all_dead_ids: set[str] = {mid for ids in dead_by_provider.values() for mid in ids}
    if not all_dead_ids:
        return []

    with open(PROVIDERS_TS) as f:
        lines = f.readlines()

    removed: list[str] = []
    kept_lines: list[str] = []
    removed_ids: set[str] = set()

    # ── Pass 1: strip dead model array entries ────────────────────────────────
    for line in lines:
        m = re.search(r"id:\s*['\"]([^'\"]+)['\"]", line)
        # Only remove lines that are array entries (they also have name:)
        if m and m.group(1) in all_dead_ids and 'name:' in line:
            removed_ids.add(m.group(1))
            # figure out which provider owns this model
            for provider, ids in dead_by_provider.items():
                if m.group(1) in ids:
                    removed.append(f"{provider}/{m.group(1)}")
                    break
            continue  # skip this line
        kept_lines.append(line)

    if not removed_ids:
        return []

    # ── Pass 2: fix default model: field if it was removed ───────────────────
    final_lines: list[str] = []
    current_provider: str | None = None

    for i, line in enumerate(kept_lines):
        # Track which provider block we're in
        pk_match = re.match(r"\s+key:\s*['\"](\w+)['\"]", line)
        if pk_match:
            current_provider = pk_match.group(1)

        # Check for: model: 'REMOVED_ID',
        default_match = re.match(r"(\s+model:\s*)['\"]([^'\"]+)['\"]", line)
        if default_match and default_match.group(2) in removed_ids:
            # Find the first surviving model in the remaining lines ahead
            new_default = None
            for future_line in kept_lines[i + 1:]:
                # Stop if we enter the next provider block
                if re.match(r"\s+key:\s*['\"]", future_line):
                    break
                fm = re.search(r"id:\s*['\"]([^'\"]+)['\"]", future_line)
                if fm and 'name:' in future_line:
                    new_default = fm.group(1)
                    break

            if new_default:
                indent = default_match.group(1)
                line = f"{indent}'{new_default}',\n"
                print(f"  Updated default for {current_provider}: {new_default}")
            else:
                print(f"  WARNING: No surviving models for {current_provider} — leaving default unchanged")

        final_lines.append(line)

    with open(PROVIDERS_TS, 'w') as f:
        f.writelines(final_lines)

    return removed

# ── Main ──────────────────────────────────────────────────────────────────────

if not os.path.exists(RESULTS_PATH):
    print("No test_results.json found. Run test_models.py first.")
    sys.exit(0)

dead = load_dead_models()

if not any(dead.values()):
    print("No permanently dead models found. providers.ts unchanged.")
    sys.exit(0)

print("Permanently dead models detected:")
for provider, ids in dead.items():
    for mid in ids:
        print(f"  {provider}/{mid}")

print("\nPatching lib/providers.ts...")
removed = patch_providers_ts(dead)

if removed:
    print(f"\nRemoved {len(removed)} model(s):")
    for r in removed:
        print(f"  - {r}")
    # Exit 1 signals to the workflow that changes were made
    sys.exit(1)
else:
    print("No lines matched for removal (model IDs may already be absent).")
    sys.exit(0)
