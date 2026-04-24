

\# MANYAI - CLAUDE OPERATING RULES



\## NON-NEGOTIABLE BEHAVIOR

You MUST follow these rules exactly.



\---



\## Core principle

Always prefer the smallest possible change set.

Do not refactor, redesign, or reorganize unless explicitly requested.



\---



\## File editing rules

\- Only modify files directly relevant to the request

\- Never touch unrelated files “for cleanliness”

\- Never move code between folders unless explicitly asked

\- Never rewrite full files unless required



\---



\## Project architecture (strict)



\### /app (Expo Router)

\- Routing + UI only

\- Each file = one screen

\- No shared business logic here



\### /app/\_layout.tsx

\- Root navigation + providers only

\- HIGH RISK FILE — only edit if explicitly requested



\### /app/(tabs)

\- Feature screens

\- Only one screen edited per request



\---



\### /lib/providers

\- ALL AI + API logic

\- Includes:

&#x20; - provider selection

&#x20; - API calls

&#x20; - image generation

&#x20; - key management

&#x20; - preferences



\---



\### /lib/saved

\- Saved responses + storage + sharing + refine flow



\---



\### /components

\- Pure UI only (no business logic)



\---



\### /hooks

\- Reusable logic only



\---



\## Editing strategy

\- Prefer local edits over global changes

\- Do not scan entire project unless necessary

\- Do not optimize or improve architecture unless asked



\---



\## Goal

Minimize changes and token usage by limiting scope strictly to requested files.

