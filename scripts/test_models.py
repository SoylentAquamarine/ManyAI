"""
test_models.py — Reads current models from lib/providers.ts, tests each one
with "What is 2+2?", and writes results to scripts/test_results.json.
API keys are read from environment variables (set as GitHub Secrets).
"""

import os, time, json, re, requests
from concurrent.futures import ThreadPoolExecutor, as_completed

TIMEOUT = 25
PROMPT  = "What is 2+2? Reply with only the number."

SCRIPT_DIR   = os.path.dirname(os.path.abspath(__file__))
PROVIDERS_TS = os.path.join(SCRIPT_DIR, '..', 'lib', 'providers.ts')

# ── Provider connection details ───────────────────────────────────────────────

PROVIDER_META = {
    "cerebras":    {"base_url": "https://api.cerebras.ai/v1",                       "type": "openai"},
    "groq":        {"base_url": "https://api.groq.com/openai/v1",                   "type": "openai"},
    "gemini":      {"base_url": "https://generativelanguage.googleapis.com/v1beta", "type": "gemini"},
    "mistral":     {"base_url": "https://api.mistral.ai/v1",                        "type": "openai"},
    "sambanova":   {"base_url": "https://api.sambanova.ai/v1",                      "type": "openai"},
    "openrouter":  {"base_url": "https://openrouter.ai/api/v1",                     "type": "openai",
                    "extra_headers": {"HTTP-Referer": "https://stevepleasants.com/manyai", "X-Title": "ManyAI"}},
    "huggingface": {"base_url": "https://router.huggingface.co/hf-inference/v1",    "type": "openai"},
    "cohere":      {"base_url": "https://api.cohere.com/compatibility/v1",          "type": "openai"},
    "fireworks":   {"base_url": "https://api.fireworks.ai/inference/v1",            "type": "openai"},
    "openai":      {"base_url": "https://api.openai.com/v1",                        "type": "openai"},
    "anthropic":   {"base_url": "https://api.anthropic.com/v1",                     "type": "anthropic"},
    "pollinations":{"base_url": "https://text.pollinations.ai",                     "type": "pollinations"},
}

KEY_ENV = {
    "cerebras":    "CEREBRAS_API_KEY",
    "groq":        "GROQ_API_KEY",
    "gemini":      "GEMINI_API_KEY",
    "mistral":     "MISTRAL_API_KEY",
    "sambanova":   "SAMBANOVA_API_KEY",
    "openrouter":  "OPENROUTER_API_KEY",
    "huggingface": "HUGGINGFACE_API_KEY",
    "cohere":      "COHERE_API_KEY",
    "fireworks":   "FIREWORKS_API_KEY",
    "openai":      "OPENAI_API_KEY",
    "anthropic":   "ANTHROPIC_API_KEY",
}

# ── Parse model IDs from providers.ts ────────────────────────────────────────

def extract_provider_block(content, provider_key):
    """Return the full { ... } block for a provider key."""
    pattern = rf"\b{re.escape(provider_key)}:\s*\{{"
    m = re.search(pattern, content)
    if not m:
        return None
    depth, start = 0, None
    for i in range(m.start(), len(content)):
        if content[i] == '{':
            depth += 1
            if start is None:
                start = i
        elif content[i] == '}':
            depth -= 1
            if depth == 0:
                return content[start:i+1]
    return None

def get_models_for_provider(provider_key):
    """Return list of model ID strings defined in providers.ts for this provider."""
    with open(PROVIDERS_TS) as f:
        content = f.read()
    block = extract_provider_block(content, provider_key)
    if not block:
        return []
    # Find models array (entries that have both id: and name:)
    return re.findall(r"id:\s*['\"]([^'\"]+)['\"]", block)

# ── Single model test ─────────────────────────────────────────────────────────

def test_model(provider_key, model):
    meta  = PROVIDER_META[provider_key]
    key   = os.getenv(KEY_ENV.get(provider_key, "")) if provider_key != "pollinations" else None
    ptype = meta["type"]
    base  = meta["base_url"]
    extra = meta.get("extra_headers", {})

    start = time.time()
    try:
        if ptype == "pollinations":
            r = requests.get(f"{base}/{requests.utils.quote(PROMPT)}", timeout=TIMEOUT)
            r.raise_for_status()
            content = r.text.strip()[:80]

        elif ptype == "gemini":
            body = {"contents": [{"role": "user", "parts": [{"text": PROMPT}]}]}
            r = requests.post(f"{base}/models/{model}:generateContent?key={key}",
                              json=body, timeout=TIMEOUT)
            r.raise_for_status()
            content = r.json()["candidates"][0]["content"]["parts"][0]["text"].strip()[:80]

        elif ptype == "anthropic":
            headers = {"x-api-key": key, "anthropic-version": "2023-06-01",
                       "Content-Type": "application/json"}
            body = {"model": model, "max_tokens": 16,
                    "messages": [{"role": "user", "content": PROMPT}]}
            r = requests.post(f"{base}/messages", headers=headers, json=body, timeout=TIMEOUT)
            r.raise_for_status()
            content = r.json()["content"][0]["text"].strip()[:80]

        else:  # openai-compatible
            headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json",
                       **extra}
            body = {"model": model, "max_tokens": 16,
                    "messages": [{"role": "user", "content": PROMPT}]}
            r = requests.post(f"{base}/chat/completions", headers=headers, json=body,
                              timeout=TIMEOUT)
            r.raise_for_status()
            content = r.json()["choices"][0]["message"]["content"].strip()[:80]

        ms = int((time.time() - start) * 1000)
        return (provider_key, model, "PASS", ms, content)

    except Exception as e:
        ms = int((time.time() - start) * 1000)
        return (provider_key, model, "FAIL", ms, str(e)[:120])

# ── Build task list ───────────────────────────────────────────────────────────

tasks = []
for pk in PROVIDER_META:
    if pk != "pollinations" and not os.getenv(KEY_ENV.get(pk, "")):
        print(f"[SKIP] {pk} - no API key in environment")
        continue
    models = get_models_for_provider(pk)
    if not models:
        print(f"[SKIP] {pk} - no models found in providers.ts")
        continue
    for m in models:
        tasks.append((pk, m))

print(f"\nTesting {len(tasks)} provider/model combinations...\n")

# ── Run concurrently ──────────────────────────────────────────────────────────

results = []
with ThreadPoolExecutor(max_workers=12) as ex:
    futures = {ex.submit(test_model, pk, m): (pk, m) for pk, m in tasks}
    for future in as_completed(futures):
        r = future.result()
        results.append(r)
        pk, model, status, ms, content = r
        print(f"[{status}] {pk:15} {model:55} {ms:5}ms  {content}")

# ── Summary ───────────────────────────────────────────────────────────────────

passed = [r for r in results if r[2] == "PASS"]
failed = [r for r in results if r[2] == "FAIL"]
print(f"\nPassed: {len(passed)}   Failed: {len(failed)}")
if failed:
    print("\nFailed:")
    for pk, model, _, ms, err in sorted(failed):
        print(f"  {pk}/{model}: {err[:80]}")

# ── Save ──────────────────────────────────────────────────────────────────────

out = {"passed": [], "failed": []}
for pk, model, status, ms, content in results:
    out["passed" if status == "PASS" else "failed"].append(
        {"provider": pk, "model": model, "latency_ms": ms, "response": content}
    )

results_path = os.path.join(SCRIPT_DIR, 'test_results.json')
with open(results_path, "w") as f:
    json.dump(out, f, indent=2)
print(f"\nResults saved to {results_path}")
