# Steve Pleasants — SoylentAquamarine

> Operations professional. Building things with AI because the tools are finally good enough.  
> Code authored by Claude under my direction. I supply the vision, requirements, and taste.

---

## Projects

### [ManyAI](https://github.com/SoylentAquamarine/ManyAI) — AI Router for Mobile
> *Never hit a rate limit again.*

A mobile app that intelligently routes AI queries across eight free-tier providers, automatically falling back when one fails. API keys stay encrypted in your device's secure enclave. No ads. No subscriptions. No paywalls.

**Highlights:**
- Multi-provider routing with seamless fallback (Cerebras, Groq, Gemini, Mistral, SambaNova, Fireworks, OpenAI, Pollinations)
- Compare mode — send any prompt to all providers simultaneously
- Image generation routing with automatic fallback
- Vision support with camera and image picker integration
- Per-provider model selection — pick which engine each provider uses
- Built-in setup guides for obtaining free API keys

**Stack:** React Native · Expo · TypeScript · expo-secure-store · expo-camera

---

### [ClamBakeSanta](https://github.com/SoylentAquamarine/ClamBakeSanta) — Daily AI Haiku Generator
> *A haiku every morning. Zero infrastructure cost. Forever.*

Fully automated daily haiku pipeline that generates AI poetry about holidays and birthdays, then distributes it across 9+ platforms — Mastodon, Bluesky, Tumblr, Telegram, Reddit, WordPress, Discord, email subscribers, and an RSS feed.

**Highlights:**
- Plugin-based adapter architecture — add new platforms with no core changes
- Human-curated editorial calendar keeps content safe and joyful
- Anti-repetition engine reviews 7 days of prior output before each generation
- Engagement analytics with weighted scoring and weekly reports
- Total infrastructure cost: $0.00/month

**Stack:** Python 3.11 · GitHub Actions · GitHub Models API (GPT-4o-mini) · GitHub Pages · YAML config

---

### [the-brain](https://github.com/SoylentAquamarine/the-brain) — Claude AI Orchestration Layer
> *Route heavy lifting to free models. Let Claude focus on decisions.*

An intelligent dispatcher that routes AI tasks to optimal free-tier providers based on task type, using Claude as the orchestrator. Every call is logged to Git for a full audit trail. Built to escape token anxiety and achieve near-zero-cost AI development workflows.

| Task | Provider | Why |
|------|----------|-----|
| Classification / Scoring | Cerebras | ~284ms latency |
| Summarization | Gemini | 1M token context |
| Code Generation | Mistral | Best free coding model |
| Reasoning | SambaNova | Free 70B model |
| General Q&A | Groq | Reliable, ~366ms |
| Image Generation | Pollinations | No key required |

**Stack:** Python · Groq · Gemini · Mistral · Cerebras · SambaNova · GitHub Actions · Git

---

### [javascriptguitar](https://github.com/SoylentAquamarine/javascriptguitar) — Fretboard Visualizer

A guitar fretboard visualizer preserved from its original late-1990s form, with an AI-modernized HTML5 version also available.

**Stack:** HTML · JavaScript

---

## About

All code in these repositories was written by Claude (Anthropic) under the direction of **Steve Pleasants**. Steve defines the architecture, requirements, and goals. Claude writes the code.

[![GitHub followers](https://img.shields.io/github/followers/SoylentAquamarine?style=flat-square&color=4a9eff)](https://github.com/SoylentAquamarine)
