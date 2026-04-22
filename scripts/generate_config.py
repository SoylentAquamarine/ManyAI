"""
generate_config.py — Reads lib/providers.ts and writes public/config.json.

Run any time providers.ts changes to keep the remote config in sync.
The weekly CI workflow runs this automatically after patch_providers.py.

Exits with code 1 if config.json was updated (signals CI to commit).
Exits with code 0 if nothing changed.
"""

import json
import os
import re
import sys

SCRIPT_DIR   = os.path.dirname(os.path.abspath(__file__))
PROVIDERS_TS = os.path.join(SCRIPT_DIR, '..', 'lib', 'providers.ts')
CONFIG_JSON  = os.path.join(SCRIPT_DIR, '..', 'public', 'config.json')


def parse_providers() -> dict:
    """
    Parse lib/providers.ts and return a dict of:
      { provider_key: { "model": "default-id", "models": [...] } }

    Uses a simple line-by-line state machine that matches the consistent
    formatting in providers.ts rather than trying to eval TypeScript.
    """
    with open(PROVIDERS_TS, encoding='utf-8') as f:
        lines = f.readlines()

    providers: dict = {}
    current_key: str | None = None
    current_default: str | None = None
    current_models: list = []
    in_models: bool = False

    for line in lines:
        # ── New provider block: first field is always  key: 'xxx',
        pk_match = re.match(r"\s+key:\s*['\"](\w+)['\"]", line)
        if pk_match:
            # Flush the previous provider
            if current_key:
                providers[current_key] = {
                    "model": current_default,
                    "models": current_models,
                }
            current_key    = pk_match.group(1)
            current_default = None
            current_models  = []
            in_models       = False
            continue

        if current_key is None:
            continue

        # ── Default model (only outside the models array)
        if not in_models:
            dm_match = re.match(r"\s+model:\s*['\"]([^'\"]+)['\"]", line)
            if dm_match:
                current_default = dm_match.group(1)

        # ── Start of models array
        if re.search(r'\bmodels:\s*\[', line):
            in_models = True
            continue

        # ── Inside models array
        if in_models:
            em = re.search(
                r"id:\s*['\"]([^'\"]+)['\"].*?name:\s*['\"]([^'\"]+)['\"]", line
            )
            if em:
                current_models.append({"id": em.group(1), "name": em.group(2)})

            # Closing bracket ends the array
            if re.match(r"\s+\],?\s*$", line) and 'id:' not in line:
                in_models = False

    # Flush the last provider
    if current_key:
        providers[current_key] = {
            "model": current_default,
            "models": current_models,
        }

    return providers


def read_current_config() -> dict:
    if os.path.exists(CONFIG_JSON):
        try:
            with open(CONFIG_JSON, encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            pass
    return {"version": 1, "providers": {}}


# ── Parse providers.ts ────────────────────────────────────────────────────────

providers = parse_providers()

if not providers:
    print("ERROR: No providers parsed from providers.ts — check the file format.")
    sys.exit(2)

print(f"Parsed {len(providers)} providers from providers.ts.")

# ── Compare with existing config.json ────────────────────────────────────────

current = read_current_config()
current_version = current.get("version", 1)

if current.get("providers") == providers:
    print("public/config.json is already up to date.")
    sys.exit(0)

# ── Write updated config.json ─────────────────────────────────────────────────

new_version = current_version + 1
new_config  = {"version": new_version, "providers": providers}

os.makedirs(os.path.dirname(CONFIG_JSON), exist_ok=True)
with open(CONFIG_JSON, 'w', encoding='utf-8') as f:
    json.dump(new_config, f, indent=2, ensure_ascii=False)
    f.write('\n')

print(f"public/config.json updated: version {current_version} -> {new_version}")
sys.exit(1)  # Signal to CI that a change was made
