# ManyAI

### Never run out of AI. Always free.

ManyAI is a mobile AI router for Android and iOS. It automatically picks the best available free AI provider for each question, falls back silently when one fails, and keeps every API key encrypted on your device.

No ads. No banners. No subscriptions. Ever.

---

## What it does

- **Asks your question** to the best available free AI provider
- **Falls back automatically** if a provider fails, hits a rate limit, or returns an error — tries the next one without bothering you
- **Stores all keys encrypted** on your device using the OS secure enclave — nothing is sent to any ManyAI server
- **Routes by task type** — fastest providers for quick questions, highest-quality for reasoning, vision-capable for images

---

## Features

| Feature | Description |
|---|---|
| 🔀 Multi-provider routing | Automatically picks the best provider and falls back silently on failure |
| 🔑 API key management | Add keys by pasting or scanning a QR code from your laptop |
| ⚙️ Provider order control | Enable/disable providers and set your own priority order |
| 📊 Compare mode | Send the same prompt to all providers at once and compare responses side by side |
| 📷 Image & camera support | Attach photos or take pictures — routed to vision-capable providers (Gemini, OpenAI) |
| 💾 Save responses | Save any AI response to a custom category — Recipes, Code, Research, Ideas, and more |
| 📖 Built-in instructions | Step-by-step guide to getting free API keys for every provider |
| 🌙 Dark theme | Easy on the eyes |
| 💛 Freeware | No ads, no banners, no paywalls |

---

## Supported Providers

**Always Free (no credit card)**

| Provider | Default Model | Best For | Key Required |
|---|---|---|---|
| **Pollinations** | openai | No key needed — always available | No |

**Free API Tier (no credit card needed)**

| Provider | Default Model | Best For |
|---|---|---|
| **Cerebras** | Llama 3.1 8B | Fastest responses of any provider |
| **Groq** | Llama 3.1 8B | Fast, reliable general Q&A |
| **Gemini** | Gemini 2.5 Flash Lite | Long documents, translation, vision |
| **Mistral** | Mistral Small | Code generation, creative writing |
| **SambaNova** | Llama 3.3 70B | Deep reasoning, best quality |
| **Fireworks** | DeepSeek V3 | Strong coding, fast inference |
| **OpenAI** | GPT-4o Mini | Vision, general purpose |
| **Cloudflare** | Llama 3.1 8B | Edge-hosted, fast, no CC required |

**Paid API (credit card required to sign up)**

| Provider | Default Model | Best For |
|---|---|---|
| **OpenRouter** | Llama 3.1 8B (free tier available) | Access to hundreds of models |
| **Hugging Face** | Llama 3.1 8B | Thousands of open-source models |
| **Cohere** | Command R | Summarization, business tasks |
| **Claude (Anthropic)** | Claude 3.5 Haiku | Exceptional reasoning and coding |

---

## Getting Started

1. Install **Expo Go** on your Android or iPhone
2. Clone this repo and run `npx expo start`
3. Scan the QR code with Expo Go
4. Open **Settings → API Keys** and add free keys from:
   - Groq: [console.groq.com](https://console.groq.com)
   - Cerebras: [cloud.cerebras.ai](https://cloud.cerebras.ai)
   - Mistral: [console.mistral.ai](https://console.mistral.ai)
   - SambaNova: [cloud.sambanova.ai](https://cloud.sambanova.ai)
   - Fireworks: [fireworks.ai](https://fireworks.ai)
   - OpenAI: [platform.openai.com](https://platform.openai.com)
   - Gemini: [aistudio.google.com](https://aistudio.google.com)
   - Cloudflare: [dash.cloudflare.com](https://dash.cloudflare.com) (key format: accountID:apiToken)
   - OpenRouter: [openrouter.ai](https://openrouter.ai)
   - Hugging Face: [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens)
   - Cohere: [dashboard.cohere.com](https://dashboard.cohere.com)
   - Anthropic: [console.anthropic.com](https://console.anthropic.com)

> **Tip:** Go to [qr.io](https://qr.io) on your laptop, paste an API key, generate a QR code, then tap the **QR** button in the app to scan it in — no typing needed.

---

## Built With

- [React Native](https://reactnative.dev/) + [Expo](https://expo.dev/)
- [expo-secure-store](https://docs.expo.dev/versions/latest/sdk/securestore/) — encrypted key storage
- [expo-camera](https://docs.expo.dev/versions/latest/sdk/camera/) — QR scanning
- [expo-image-picker](https://docs.expo.dev/versions/latest/sdk/imagepicker/) — image/camera attachment
- [@react-native-async-storage/async-storage](https://react-native-async-storage.github.io/async-storage/) — saved responses

---

## How it was built

All code in this app was written by **[Claude](https://claude.ai)** (Anthropic), under the direction of Steve Pleasants.

AI calls during development were offloaded using **[the-brain](https://github.com/SoylentAquamarine/the-brain)** — an AI orchestration system that routes tasks to free providers so Claude doesn't burn tokens doing everything itself. ManyAI is essentially a mobile version of that same idea.

---

## Automated Model Maintenance

A GitHub Actions workflow runs every Monday at 8am UTC. It:

1. Calls every configured provider/model with a test prompt
2. Removes any model that returns a 404 or 410 (permanently gone)
3. Commits the change to `lib/providers.ts`
4. Pushes an OTA update so users get the fix automatically

Rate-limit errors (429) and timeouts are left alone — those are transient.
You can also trigger it manually from the **Actions** tab in GitHub.

---

## Credits

Designed and directed by **Steve Pleasants**
GitHub: [SoylentAquamarine](https://github.com/SoylentAquamarine)

---

## Support

ManyAI is free. If it saves you money or time, a tip is appreciated but never expected.

- **Cash App:** $StevePleasants9
- **Venmo:** @StevePleasants9

---

## License

**GNU General Public License v3.0**

Free to use, study, and modify. If you distribute a modified version — including publishing it on an app store — you must open-source your changes under the same GPL v3 license. You may not sell a closed-source product based on this code without the author's permission.

© Steve Pleasants. See [LICENSE](LICENSE) for full terms.
