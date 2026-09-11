# Prototype Instructions

## Confirmed product direction

Use docs/selected-homepage.png and docs/homepage-design.md as the approved homepage target. Pure black, artistic Chinese Song typography, frosted OFFER envelope. No moon, neon, workflow steps, or open-ended writing prompt. OFFER floats ±6px over 4 seconds with gentle brightness breathing. Keep text/controls static. Desktop-first, responsive on phones.

The product now moves beyond a frontend preview: implement real resume extraction, provider-selectable AI optimization, and PDF export. Do not claim an operation completed unless its backend task and result have completed. AI providers must be selectable by configuration (initial providers: OpenAI, DeepSeek, and Alibaba Cloud Qwen); browser code never receives provider credentials.

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.
