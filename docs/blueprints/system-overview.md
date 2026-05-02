# System Overview — ManyAI Mobile

## Purpose

ManyAI is a React Native mobile application that acts as a multi-provider AI router. It intelligently routes user prompts to the best available free AI provider, implementing an automatic fallback chain that cycles through up to 8 providers before giving up. The core promise: you always get an answer, even when individual providers are rate-limited or down. It is shareware — free to use, supported by donations.

## Tech Stack

| Component | Technology |
|---|---|
| Framework | React Native (Expo SDK) |
| Routing | Expo Router v3 (file-based) |
| Language | TypeScript |
| Storage | AsyncStorage |
| Image handling | expo-image-picker |
| OTA updates | expo-updates |
| Version | 1.0.5 |

## Navigation (3 Tabs)

The app uses a bottom tab navigator (`expo-router` Tabs). Tab bar is dark-themed (`#16213e` background, `#4ECDC4` active tint).

| Tab | File | Purpose |
|---|---|---|
| Home | `app/(tabs)/index.tsx` | Main chat interface |
| Saved | `app/(tabs)/saved.tsx` | Saved responses management |
| Settings | `app/(tabs)/explore.tsx` | API keys, providers, models |

## Provider System (13 Providers)

Providers are defined in `lib/providers/providers.ts`. The routing order (`ROUTING_ORDER`) defines priority. `pickProvider()` first tries task-best providers, then any capable provider, then falls back to Pollinations.

| Provider | Free Tier | Vision | Key Required | Notes |
|---|---|---|---|---|
| Cerebras | Yes | No | Yes | Fastest inference |
| Groq | Yes | No | Yes | Fast, reliable general |
| Gemini | Yes | **Yes** | Yes | Best for summarization, translation |
| Mistral | Yes | No | Yes | Best for coding, creative |
| SambaNova | Yes | No | Yes | Best for deep reasoning |
| OpenRouter | Yes | No | Yes | Multi-model gateway |
| Hugging Face | Yes | No | Yes | Massive model selection |
| Cohere | Yes | No | Yes | Strong summarization |
| Cloudflare AI | Yes | No | Yes | Key format: `accountId:apiToken` |
| Fireworks | Yes | No | Yes | Strong with DeepSeek V3 |
| OpenAI | Yes* | **Yes** | Yes | *Requires billing setup |
| Anthropic | No | **Yes** | Yes | Paid only, no free tier |
| Pollinations | Always | No | **No** | Ultimate fallback, always available |

Vision-capable providers (accept image input): **Gemini, OpenAI, Anthropic**

## Key Features

- **Auto-fallback**: Up to `MAX_RETRIES = 8` provider attempts per message
- **Session failure tracking**: Failed providers are skipped for the rest of the session (`failedProviders` useRef)
- **Conversation history**: Last 10 messages sent as context (excludes system/error messages)
- **Image input**: Attach from gallery (`🖼`) or camera (`📷`); base64 encoded, quality 0.5; vision providers only
- **Image generation**: Keyword detection (`isImageGenRequest()`) routes to image providers (Pollinations, free)
- **Save responses**: Any AI reply can be saved to a user-defined category
- **Refine flow**: Saved responses can be sent back to Chat to continue the conversation
- **OTA updates**: Silent background check on every launch via `expo-updates`; prompts to restart if update available
- **First-launch onboarding**: Help modal shown automatically on first open, dismissable, accessible via `/help` command or `?` button
- **Remote config**: `stevepleasants.com/manyai/config.json` can patch model lists without a new build

## Storage (AsyncStorage Keys)

| Key | Contents |
|---|---|
| `manyai_keys_*` | API keys per provider |
| `manyai_provider_order` | User-customized provider priority |
| `manyai_enabled_*` | Per-provider enabled toggle |
| `manyai_model_*` | Per-provider selected model |
| `manyai_saved_*` | Saved responses by category |
| `manyai_categories` | List of user-created categories |
| `manyai_onboarded` | Flag — hide help modal after first launch |

## Routing Logic (`pickProvider`)

```
1. Build available = keys present + pollinations (always)
2. If image attached: filter to VISION_PROVIDERS only
3. First pass: iterate ROUTING_ORDER, skip excluded/disabled, prefer bestFor[taskType] match
4. Second pass: iterate ROUTING_ORDER, return first capable provider
5. Final fallback: return 'pollinations' if candidate
6. If all exhausted: return null → show error message
```

## API Shapes Supported (`callProvider.ts`)

- **Pollinations**: `GET text.pollinations.ai/{encoded_prompt}` — no auth, no key
- **Gemini**: `POST /models/{model}:generateContent` — parts array with `inline_data` for images
- **Anthropic**: `POST /messages` — `x-api-key` header, different body structure
- **Cloudflare**: Account ID embedded in URL, key split on `:` separator
- **All others**: OpenAI-compatible `/chat/completions` with `Authorization: Bearer` header

Request timeout: **30 seconds** per attempt.
