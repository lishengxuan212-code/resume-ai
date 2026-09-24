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
- Record methodology, provider and model versions only in server-side results used for traceability. Never include provider or model identifiers, or the terms `AI` and `服务`, in user-visible interface copy.
- Keep methodology rule IDs in backend results for validation and traceability, but never display codes such as `D02`, `E03` or `F03` in the user interface.
- Structure every generated experience point as a concise user-facing title plus its supporting content. The title must explain what the candidate did, not use a generic placeholder.
- Present the final optimized resume as the same wide, full-page workspace used for material review, with consistent top bar, introduction, sidebar navigation, content cards and responsive behavior; do not return to a narrow result modal.
- Carry validated diagnosis findings and questions into optimization so generation must close the issues it identified. Never invent a comparison basis for an incomplete metric, but preserve the user's original metric wording rather than deleting a source-supported number.
- Keep skill sections short and transferable by grouping or removing only duplicate wording. Preserve each user-provided independent skill, including internal tools and dashboards, unless the user explicitly asks to remove it. Only label a skill as proficient or expert when the source or a user answer explicitly supports that level.
- In the result page, render experience titles in bold with plain text below and no individual card frames. Let users edit generated summaries, section names, experience metadata, item titles and item content in place, and export the current edited result without requiring another AI run.
- In result-page edit mode, users can delete the personal summary or an entire resume section. Remove the deleted content from the current state, navigation and every subsequent PDF rather than treating deletion as a visual hide.
- Put an edit entry in every final-result directory section; all entries toggle the same page-wide edit state, including basic details, so users never need to return to the page top. Fix the user-facing skill section name to `技能`, hide generic `技能清单` entry labels and do not label skill entries as `经历 01`. Rename result-only generation notes to `简历提醒` and never include them in the exported resume.
- Render every skill as one inline `小标题：正文` item in both the result page and PDF. Do not add entry-level headings or use broad skill bullet labels such as `商业化运营`, `用户运营`, `产品运营`, `工具`, `常用工具`, `工具使用`, or `工具能力`; prefer specific labels such as `付费与活动玩法` or `原型与数据处理`.
- Do not equate fact fidelity with copying the source. Before generation, diagnosis should propose a conservative, source-supported rewrite for unclear or poorly expressed material and let the user adopt or edit it as confirmation. Generation may restructure confirmed facts, but must retain complete source-supported content and must never guess missing metrics, responsibility boundaries or outcomes.
- Reject unknown sources/rules, unsupported new numbers and invented entry metadata during AI generation. A malformed AI response must fall back to the user's reviewed content instead of preventing a result. The final PDF export is a user-confirmed presentation step: normalize its shape for rendering, but do not reject the current resume because provenance or optimization validation is incomplete.

## Resume templates and PDF preview

- Keep facts, optimized resume content and template-only render data separate. Module `type` expresses semantics while the user-facing section title remains editable; AI never controls page layout, font, color, columns or pagination.
- In the result workspace, show a real PDF preview and make download reuse the same current PDF Blob. Rendering is manually initiated from the template library; a stale preview must never be presented as the current downloadable resume.
- Keep the enabled `推荐` PDF template white, black-text and A4 single-column, with a bundled Chinese serif font, bold headings, consistent hierarchy and punctuation.
- Aim for one page by removing irrelevant or duplicate material before rendering. Never achieve it by clipping facts, forcing a 1.5-line limit, or excessive type reduction. The template must allow Chinese text to wrap and paginate naturally, and must be visually checked with long content.
- Support an optional, local avatar as render-only presentation data. It must never enter facts, diagnosis, optimization prompts or AI provider requests. Normalize extraction-only gaps inside Chinese phrases and around uppercase acronyms before rendering, while preserving meaningful English and numeric spaces.
- The default `推荐` template follows the approved reference-resume arrangement while retaining A4: name and contact at upper left, a square portrait at upper right, and education directly below in the same top information area. For PDF uploads, prefer a detected first-page portrait and allow replacement on the result page; keep it presentation-only.
- Add a bold horizontal rule before every later experience entry. The rule separates whole experiences, not their individual bullets. The reference visual style uses a deployable Chinese sans-serif font; preserve the Song-style alternatives as optional templates.
- Keep `来源原文` collapsed on the material-review page until the user expands it.
- Selecting `在线填写` opens the full material-review workspace directly, with one empty experience row; do not put online material collection in a modal.
- Diagnosis `suggestedRewrite` values and user answers are inputs for editorial judgment, not final resume copy. Reorganize them with the verified facts and target role; preserve literal wording only when it is an irreducible fact such as a metric, proper noun or responsibility boundary.
- Skipping or leaving some diagnosis questions blank must not prevent generation. Repeated malformed AI output falls back to a clearly identified current-content draft; preserve visible provider authentication, network and timeout failures.
- Chinese PDF wrapping must not insert artificial hyphens. Preserve genuine source hyphens, use natural pre-wrapped Chinese lines, and let content paginate rather than clipping.
- Keep only the `推荐` PDF template enabled. As soon as optimization reaches the result workspace, generate this template asynchronously in the background without blocking the user from reading or editing content. Do not automatically regenerate after edits; make the stale state clear and let the user request a refreshed PDF. Show the generated document 1:1 in a modal and place the PDF download action beside it, never over its content.
- Place `简历提醒` above the layout preview. Normalize work and internship entries newest first when their dates are parseable, and keep education information out of `个人概述` while retaining work statements about university-user audiences.
- When all three AI attempts fail because their returned resume structure cannot pass validation, continue with a clearly identified current-content fallback built from reviewed material. Preserve visible failures for authentication, network, timeout and other provider errors.
- For work and internship entries, keep role, organization and dates on one desktop row. Put every non-skill point's bold numbered title (`1. 标题`) on its own line with the body beneath; do not prefix the body with a marker. Keep the existing inline `小标题：正文` skill presentation unchanged. PDF section headings must remain with their first content block rather than stranded at the bottom of a page.
- Preserve every numbered responsibility as its own complete title and body across PDF pages or source blocks. Never truncate or split resume content by character count, and never duplicate company, role or dates to satisfy output limits.
- Preserve explicit skill categories from the reviewed source, such as `原型设计`、`数据分析` and `证书／执照`. Do not invent `实践方法`, merge categories into a new label, or classify work responsibilities, internal knowledge-base work, methodology output or team enablement as skills.
