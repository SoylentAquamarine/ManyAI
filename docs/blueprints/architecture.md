# Architecture — ManyAI Mobile

## Directory Structure

```
/
├── app/                         # Expo Router — screens and navigation
│   ├── _layout.tsx              # Root: Stack navigator, OTA update check, ThemeProvider
│   ├── modal.tsx                # Modal screen
│   └── (tabs)/
│       ├── _layout.tsx          # Tab bar definition (Home, Saved, Settings)
│       ├── index.tsx            # Chat screen (primary)
│       ├── saved.tsx            # Saved responses
│       └── explore.tsx          # Settings / provider configuration
│
├── lib/
│   ├── providers/               # All AI provider logic
│   │   ├── providers.ts         # PROVIDERS registry, ROUTING_ORDER, pickProvider()
│   │   ├── callProvider.ts      # API adapter (text + vision)
│   │   ├── imageGen.ts          # Image generation — detection + API calls
│   │   ├── keyStore.ts          # AsyncStorage CRUD for API keys
│   │   ├── providerPrefs.ts     # AsyncStorage for order, enabled state, selected models
│   │   └── remoteConfig.ts      # Runtime model patching from remote JSON
│   └── saved/
│       ├── savedResponses.ts    # Save/load/delete responses by category
│       ├── shareUtils.ts        # Native share sheet + save-to-device (text and images)
│       └── refineSeed.ts        # Module-level variable for cross-tab refine handoff
│
├── components/                  # Pure UI — no business logic
│   ├── haptic-tab.tsx           # Tab bar button with haptic feedback
│   ├── parallax-scroll-view.tsx
│   ├── themed-text.tsx
│   ├── themed-view.tsx
│   └── ui/
│       ├── collapsible.tsx
│       ├── icon-symbol.tsx      # SF Symbol wrapper (iOS) + fallback
│       └── icon-symbol.ios.tsx
│
├── constants/
│   └── theme.ts                 # Color palette and theme tokens
│
├── hooks/
│   └── use-color-scheme.ts      # Detects light/dark mode
│
└── assets/images/               # App icons, splash screens
```

---

## Routing (Expo Router)

- File-based routing — directory structure defines URL/screen hierarchy.
- `app/_layout.tsx` is the root: wraps everything in `ThemeProvider`, mounts a `Stack` navigator, runs the OTA update check on mount.
- `unstable_settings.anchor = '(tabs)'` pins the initial route to the tab group.
- `(tabs)/_layout.tsx` defines the three-tab `Tabs` component with custom tab bar styling.
- OTA check: `expo-updates` runs silently on production builds; on update available, shows alert with "Restart now" option.

---

## Provider Layer (`lib/providers/`)

### `providers.ts`
The single source of truth for all provider metadata.

- **`PROVIDERS`**: Record mapping 13 `ProviderKey` values to `Provider` objects. Each `Provider` has: `key`, `name`, `model` (default), `models[]` (user-selectable), `baseUrl`, `needsKey`, `paidOnly`, `color`, `bestFor: TaskType[]`, `supportsVision`, `instructionsUrl`, optional `extraHeaders`, optional `keyHint`.
- **`ROUTING_ORDER`**: Ordered array of `ProviderKey` — defines priority when `taskType` has no bestFor match.
- **`pickProvider(availableKeys, taskType, exclude, order, enabled)`**:
  1. First pass: iterate `order`, skip if excluded/disabled/no key — return first where `bestFor.includes(taskType)`.
  2. Second pass: iterate `order`, return first capable provider.
  3. Fallback: return `'pollinations'` if not excluded.
  4. If all exhausted: return `null`.

### `callProvider.ts`
Unified API adapter. Handles 5 different API shapes:

| Shape | Providers | Notes |
|---|---|---|
| Pollinations | pollinations | `GET text.pollinations.ai/{encoded}` — no auth |
| Gemini | gemini | `POST /generateContent` — `parts` array, `inline_data` for images |
| Anthropic | anthropic | `POST /messages` — `x-api-key` header, `anthropic-version` header |
| Cloudflare | cloudflare | Key split `accountId:apiToken`, account ID embedded in URL |
| OpenAI-compat | all others | `POST /chat/completions`, `Authorization: Bearer` |

Timeout per call: **30 000 ms** (AbortController). History capped at `MAX_HISTORY = 10` messages.

### `imageGen.ts`
- **`isImageGenRequest(text)`**: Keyword-based detection (draw, generate image, create an image, paint, etc.).
- **`IMAGE_PROVIDERS`**: Ordered array of image providers (Pollinations first — no key; Fireworks second — paid).
- **`callImageProvider(key, prompt, apiKey?)`**: Returns `{ base64, mime, providerName, latencyMs, error? }`.
- **`imageProviderNeedsKey(key)`**: Used to skip providers without keys during fallback loop.

### `keyStore.ts`
AsyncStorage-backed key CRUD. Keys stored per `ProviderKey`. `loadAllKeys()` returns `Partial<Record<ProviderKey, string>>`.

### `providerPrefs.ts`
- `loadProviderOrder()` → `ProviderKey[]` from AsyncStorage.
- `loadEnabledProviders()` → `Partial<Record<ProviderKey, boolean>>`.
- `loadSelectedModels()` → `Partial<Record<ProviderKey, string>>`.
- All three are loaded together on tab focus via `useFocusEffect`.

### `remoteConfig.ts`
Fetches `stevepleasants.com/manyai/config.json` to patch model lists at runtime without a build. Applied to the `PROVIDERS` object on app load.

---

## Saved Layer (`lib/saved/`)

### `savedResponses.ts`
- Responses stored in AsyncStorage keyed by category.
- Supports: save (with optional title derivation from prompt), load, delete, move, rename category.
- Saved item shape: `{ id, prompt, response, provider, category, title, generatedImageUri?, createdAt }`.

### `shareUtils.ts`
- `shareText(content)`: Native share sheet (OS share dialog).
- `shareImage(dataUri)`: Converts data URI → file, shares via native sheet.
- `saveImageToDevice(dataUri)`: Writes to device media library.

### `refineSeed.ts`
- Module-level variable (not state/AsyncStorage) holding `{ prompt, response, title, provider }`.
- `setRefineSeed(seed)` is called from the Saved tab when user taps "Refine".
- `consumeRefineSeed()` is called in Chat tab's `useFocusEffect` — reads and clears the variable atomically.
- This achieves cross-tab communication without navigation params or global state.

---

## Chat Screen (`app/(tabs)/index.tsx`) — Key State

| State | Type | Notes |
|---|---|---|
| `messages` | `Message[]` | Conversation array including system greeting |
| `input` | `string` | Current text field value |
| `pendingImage` | `PendingImage\|null` | Attached image (uri + base64 + mime) |
| `loading` | `boolean` | True while any API call is in flight |
| `loadingLabel` | `string` | "Trying ProviderName · model..." shown in typing indicator |
| `keys` | `Partial<Record<ProviderKey, string>>` | Reloaded on each tab focus |
| `providerOrder` | `ProviderKey[]` | Reloaded on each tab focus |
| `enabledProviders` | `Partial<Record<ProviderKey, boolean>>` | Reloaded on each tab focus |
| `selectedModels` | `Partial<Record<ProviderKey, string>>` | Reloaded on each tab focus |
| `failedProviders` | `useRef<Set<ProviderKey>>` | **Not state** — persists across renders, reset on tab focus |
| `saveTarget` | `Message\|null` | Message awaiting category selection |
| `refineTitle` | `string\|null` | Set when refine seed is consumed |
| `showHelp` | `boolean` | Help modal visibility |

---

## Send Flow

```
send()
  │
  ├─ /help → show help modal, return
  │
  ├─ IMAGE GENERATION PATH (text prompt + no attached image + isImageGenRequest())
  │   └─ for each IMAGE_PROVIDER:
  │       skip if needs key and key missing
  │       callImageProvider() → success: display generatedImage bubble, return
  │       failure: try next provider
  │   └─ all failed → show error bubble
  │
  └─ TEXT GENERATION PATH (default)
      build available = keys + 'pollinations'
      if pendingImage: filter to VISION_PROVIDERS ∩ available
      build history (last 10 non-error non-system messages)
      tried = session failedProviders
      while attempts < MAX_RETRIES (8):
          providerKey = pickProvider(pool, 'general', tried, order, enabled)
          if null → break (all exhausted)
          inject selectedModel override
          setLoadingLabel("Trying Name · model...")
          result = callProvider(providerWithModel, text, key, imageBase64, mime, history)
          if success → add assistant bubble, return
          else: tried.add(key), failedProviders.current.add(key)
      all failed → show error bubble with instructions
```

---

## Render Optimization

- `renderItem` wrapped in `useCallback(fn, [])` — no deps, because message content never mutates after creation.
- `keyExtractor` wrapped in `useCallback`.
- `FlatList` with `removeClippedSubviews={false}` — suppresses VirtualizedList warning for short lists.
- Image bubbles: `generatedImageUri` triggers wider `imageBubble` style (95% width vs 82%).

---

## Color Palette (Dark Theme)

| Token | Value | Use |
|---|---|---|
| Background | `#1a1a2e` | Screen background |
| Surface | `#16213e` | Header, AI bubbles, input bar |
| Accent | `#0f3460` | User bubbles, buttons |
| Teal | `#4ECDC4` | Active tint, provider labels, send button |
| Error | `#FF6B6B` | Error messages |
| Text | `#eeeeee` | Primary text |
| Muted | `#888` | Secondary text, timestamps |
