# Prototype Instructions

## Confirmed product direction

Use docs/selected-homepage.png and docs/homepage-design.md as the approved homepage target. Pure black, artistic Chinese Song typography, frosted OFFER envelope. No moon, neon, workflow steps, or open-ended writing prompt. OFFER floats ±6px over 4 seconds with gentle brightness breathing. Keep text/controls static. Desktop-first, responsive on phones.

The product now moves beyond a frontend preview: implement real resume extraction, provider-selectable AI optimization, and PDF export. Do not claim an operation completed unless its backend task and result have completed. AI providers must be selectable by configuration (initial providers: OpenAI, DeepSeek, and Alibaba Cloud Qwen); browser code never receives provider credentials.

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Resume extraction decisions

- If OCR is added, it must run locally in the user's browser. Do not use cloud OCR or send rendered PDF pages to third-party recognition services. This does not make the existing server-side extraction or AI optimization browser-local.
- Diagnose missing text, incorrect reading order, and incorrect field classification separately. Preserve numbered responsibility headings with their own body text in both source text and reviewed work experience. Do not treat a reading-order bug as a reason to add OCR.

## Material review preferences

- Use a wide, full-page material review workspace rather than the narrow intake modal; preserve the approved homepage visual direction.
- Contact information uses a compact single-line input. Mark every enforced required field with a visible `*` consistent with validation; do not invent additional mandatory personal fields merely for the redesign.
- Do not show source-selection checkboxes alongside basic information, education or work entries. Keep source material together at the end of the review page and manage provenance automatically when users add or correct facts.
- Work descriptions, skills and source text must display in full, with readable heading, paragraph and list hierarchy. Provide inline editing with content-height text areas; do not constrain these sections to small internally scrolling boxes.

## Waiting experience

- During extraction, diagnosis, optimization and PDF export, show a centered modal overlay with rotating career encouragement and an original pixel platform adventure toward an OFFER. Keep the homepage visual direction.
- The animation is illustrative, never a fabricated completion percentage. Show actual elapsed time, remove the overlay on success or failure, prevent duplicate submissions, offer pause, and respect reduced-motion preferences.

## Resume optimization rules

- Treat `简历AI方法论_v0.1.md` as a product specification, not as a file to append wholesale to every prompt. Maintain a versioned executable rule registry with stable rule IDs and select only stage-relevant rules.
- Run a diagnosis before generation. Show every independent question that can materially change the result and give each one a conservative suggested rewrite; do not arbitrarily keep only three. Keep a 12-question technical safety bound against repeated model output, and always let the user skip all questions and optimize conservatively from existing facts.
- Every generated resume bullet must expose its supporting source IDs and applied methodology rule IDs. Record the methodology, provider and model versions in the result.
- Keep methodology rule IDs in backend results for validation and traceability, but never display codes such as `D02`, `E03` or `F03` in the user interface.
- Structure every generated experience point as a concise user-facing title plus its supporting content. The title must explain what the candidate did, not use a generic placeholder.
- Present the final optimized resume as the same wide, full-page workspace used for material review, with consistent top bar, introduction, sidebar navigation, content cards and responsive behavior; do not return to a narrow result modal.
- Carry validated diagnosis findings and questions into optimization so generation must close the issues it identified. If a diagnosed percentage or metric remains ambiguous after the user skips its question, omit the ambiguous number or use a conservative factual statement; never choose a comparison basis for the user.
- Keep skill sections short and transferable. Omit company-internal AI tools and proprietary dashboards by default. Only label a skill as proficient or expert when the source or a user answer explicitly supports that level.
- In the result page, render experience titles in bold with plain text below and no individual card frames. Let users edit generated summaries, section names, experience metadata, item titles and item content in place, and export the current edited result without requiring another AI run.
- Put an edit entry in every final-result directory section; all entries toggle the same page-wide edit state, including basic details, so users never need to return to the page top. Fix the user-facing skill section name to `技能`, hide generic `技能清单` entry labels and do not label skill entries as `经历 01`. Rename result-only generation notes to `简历提醒` and never include them in the exported resume.
- Render every skill as one inline `小标题：正文` item in both the result page and PDF. Do not add entry-level headings or use broad skill bullet labels such as `商业化运营`, `用户运营`, `产品运营`, `工具`, `常用工具`, `工具使用`, or `工具能力`; prefer specific labels such as `付费与活动玩法` or `原型与数据处理`.
- Do not equate fact fidelity with copying the source. Before generation, diagnosis should propose a conservative, source-supported rewrite for unclear or poorly expressed material and let the user adopt or edit it as confirmation. Generation may omit irrelevant, duplicate or ambiguous source wording and restructure confirmed facts, but must never guess missing metrics, responsibility boundaries or outcomes.
- Reject unknown sources/rules, unsupported new numbers and invented entry metadata. Compare generated bullets with cited material. Keep one browser request and loading overlay active while the server performs an initial attempt plus at most two automatic retries for invalid or insufficiently optimized results; only surface failure after all three attempts fail.
