# Homepage Design QA

final result: passed

## 2026-09-26 annotated diagnosis and requirement coverage

- Audit finding: the previous diagnosis separated findings, suggested changes and follow-up questions from the resume material, forcing users to perform the mapping themselves. Equal-weight cards also hid which source passage each issue affected.
- Implemented a two-column annotation workspace: reviewed resume blocks on the left and a sticky comment rail on the right. Exact quoted matches are highlighted; source-linked but non-exact findings are explicitly labelled as whole-entry issues; unresolved findings are grouped as whole-resume annotations.
- Linked fact questions now live inside the related annotation, with the conservative suggestion and answer field together. All questions remain optional and the skip-all path remains available.
- Replaced the broad role-association summary with per-requirement evidence coverage. Version 0.2 records source metadata and makes the finite sample boundary visible. A user-provided job description counts as one target sample; without it, the interface states that the offline baseline cannot represent most employers.
- Official ByteDance role pages found during source review were already offline on 2026-09-26, so their requirements were not silently promoted into the current evidence library. This preserves the distinction between a current verified requirement and an archived job title.
- Verification: focused career/diagnosis/methodology/API tests passed 24/24; production build passed; Sites packaging passed 4/4; `git diff --check` reported no whitespace errors. A live synthetic diagnosis displayed knowledge version 0.2, three requirement rows, explicit finite-sample copy, exact-phrase highlighting and linked comments. Marker-to-comment navigation was exercised in the in-app browser.
- Repository-wide tests remain at 232 passes and 11 failures. The failures are the previously recorded extraction punctuation, corrupted-DOCX wording, provider-quality/spacing and validation-boundary expectations; none are in the new career-knowledge or diagnosis tests, so this change is verified on its altered surfaces without claiming a clean full suite.

## 2026-09-26 annotation ordering correction

- User review found that the right-edge marker stack was ordered by model output rather than resume position, and coarse page-level source IDs placed unrelated issues beside education or the wrong work paragraph.
- Removed the standalone `岗位要求覆盖` card from the diagnosis page.
- Visual placement now requires an exact quoted-text match or a strong line-level text overlap. Source IDs only help confirm a match and cannot place a marker by themselves. Unmatched issues remain in the whole-resume annotation group.
- Annotation numbers are recalculated after visual-position sorting, so both the resume and comment rail follow the same top-to-bottom order. Pins render inline after the matched phrase or line instead of in a detached full-entry gutter.
- Browser verification on the current diagnosis state confirmed nine comments in order: education has no misplaced marker, marker 5 opens the numeric-evidence comment and highlights its source phrase, and marker 9 opens the final skills comment and highlights the matching skill label.
- Focused tests passed 24/24; the production build passed; Sites packaging passed 4/4; `git diff --check` found no whitespace errors beyond Windows line-ending notices.

## 2026-09-27 annotation rail visibility and alignment

- Kept the rail heading outside the independently scrollable comment list so `问题与修改方向` remains fully visible.
- Resume annotation clicks now scroll only the right-hand list and align the matching card 16 px below its top edge. They no longer use centered `scrollIntoView`, which previously moved the page and exposed the middle of the selected card.
- Browser verification clicked annotation 5 from the resume: its source phrase remained visible, comment 5 became the first card under the intact rail heading, and the linked questions followed below it.
- Focused diagnosis/career/API tests passed 24/24; production build passed; Sites packaging passed 4/4; `git diff --check` found no whitespace errors beyond Windows line-ending notices.

## Source and state

- Source visual truth: docs/selected-homepage.png (selected OFFER homepage).
- Intended state: initial desktop homepage, pure black, no open dialog; responsive phone view also requires verification.
- Implementation: src/App.jsx, src/styles.css, public/assets/offer.png.
- Browser screenshot: unavailable.
- Actual browser viewport and pixel dimensions: not captured; no density normalization or image comparison claimed.

## Findings

- Browser verification blocked: the preview service mailbox is unavailable. Both the initial preview start and status check returned the same infrastructure error. Per the preview recovery contract, no replacement daemon, alternate port or browser path was attempted.
- Consequently no full-view or focused-region comparison is available, and no claim of visual fidelity or working browser interactions is made.

## Required fidelity surfaces

- Fonts/typography: Noto Serif SC is bundled for display text; actual rendered glyphs, metrics and wrapping remain unverified.
- Spacing/layout rhythm: desktop and mobile CSS are implemented; viewport geometry and overflow remain unverified.
- Colors/tokens: black/white/charcoal style is implemented; rendered contrast has not been visually verified.
- Image quality: the generated standalone OFFER envelope was directly inspected before integration; its in-page size and black-edge blending remain unverified.
- Copy/content: source copy is implemented; screen rendering remains unverified. Entry dialogs explicitly describe frontend-only status.

## Verification completed

- Four file-validation cases passed: uppercase extension, exact size limit, empty file, unsupported format, and oversize (the first case combines uppercase extension with exact-size boundary).
- Vite build log records completion and generated client/worker output.
- No browser-rendered primary interaction test or console error check was possible.

## Implementation checklist for next available preview

1. Start supported preview and capture homepage at reference viewport.
2. Compare reference and browser output together; fix any actionable P0/P1/P2 mismatch.
3. Verify OFFER animation cycle, amplitude and reduced-motion behavior.
4. Test file selection/drag-drop and rejection feedback, form validation, review/back, modal Escape and focus restoration.
5. Verify narrow phone width and 200% text scaling without horizontal overflow.
6. Check browser console and record evidence before changing final result to passed.

## Comparison history

No visual comparison iteration performed due to infrastructure blocker.

## 2026-09-12 resume-processing browser verification

The historical homepage QA above is retained. The following checks cover the current processing flow and are recorded separately from a real supplier generation claim.

- File recognition: a real DOCX fixture was uploaded through the running local page and reached the editable fact-review dialog. Its extracted source text was visible for confirmation.
- Unconfigured service: with no local provider key/model configured, the review dialog showed that the AI service was not configured and kept the optimize action unavailable.
- Optimization failure recovery: using a local injected fake service that returned the existing 502 failure, the browser retained the reviewed facts and target role for retry instead of discarding them.
- PDF download: using a local injected fake service to reach the result state, the browser action invoked the real fixed-template PDF endpoint and displayed its download confirmation. The API end-to-end regression also asserts the returned bytes begin with `%PDF-`; no real supplier-generated resume was required for either check.
- Narrow screen: at a phone-width viewport, the initial homepage and the review dialog had no horizontal overflow.

The initial OFFER homepage remained black with the static copy and controls plus the existing floating/breathing OFFER image. This browser pass does not claim a pixel-level comparison with `docs/selected-homepage.png`.

Real OpenAI, DeepSeek, or Qwen success was not verified in this run because no user supplier key was configured. Any later successful call must be recorded separately with the selected provider and model, without recording the credential.

## 2026-09-12 PDF reading-order repair

- Reproduced the reported fifth/sixth responsibility mismatch using the user's authorized desktop PDF. The PDF content stream placed the sixth responsibility's body after the fifth heading, and the sixth heading before only the final sentence fragment. The visible page contained both complete bodies; OCR was unnecessary for this defect.
- Compared a locally rendered page with extraction results. The parser now orders text by visual rows and horizontal positions, tolerates small baseline differences, and preserves actual inter-item gaps instead of inserting spaces between adjacent Chinese glyphs. Wide separators between company, role and dates remain distinguishable.
- Submitted that original PDF to the running Vite `/api/extract` proxy. HTTP 200 returned correct fifth/sixth body boundaries in both page-one source text and the work experience description, including the complete final sentence. Company and role fields were also checked. No AI service was called; the private PDF was not added as a repository fixture.
- Synthetic Chinese PDF fixtures cover out-of-order body text, reverse horizontal field order, small baseline offsets, adjacent Chinese fragments, and multipart upload through the extraction API. The earlier ordering test incorrectly used a font without Chinese glyph support; it now embeds the same bundled Chinese font used by PDF export and asserts complete content as well as order.
- Verification: `npm test` passed 164/164; `npm run build` passed and emitted all three required Sites files; `npm run test:sites` passed 4/4; `git diff --check` passed.
- Local frontend and backend were started with `npm run dev:full`; preview at `http://localhost:5173/`. The app's open-preview request was queued. Browser automation could not initialize (`unsupported Codex auth method: apikey`), so this entry reports a live API verification and PDF visual inspection, not a new browser interaction pass.
- Scope: confirmed for the supplied PDF and synthetic horizontal reading-order regressions. This is not a general multi-column or rotated-layout accuracy claim, and does not implement OCR or additional templates.

## 2026-09-12 real AI connectivity repair

- Runtime configuration selected DeepSeek `deepseek-flash`, with a 30-second deadline. Qwen was listed as a fallback but was not configured, so it could not serve as a fallback.
- A connection probe from the restricted execution environment failed with `EACCES`. The approved probe outside that environment returned HTTP 200 from DeepSeek's authenticated model-list endpoint and confirmed the configured model was available. Before restarting, the local optimization endpoint returned generic HTTP 502 in about 35 milliseconds.
- Stopped the local development processes started in the restricted environment and restarted `npm run dev:full` with approved external network access. Credentials and model selection were unchanged.
- A synthetic one-block resume submitted through the real Vite `/api/optimize` proxy completed successfully in 4,561 milliseconds with HTTP 200, provider `deepseek`, model `deepseek-flash`, and one validated section. The returned resume was sent to `/api/export`, which returned HTTP 200 and a 14,534-byte buffer with a valid PDF header. No user resume was sent to the model during this check. These timings describe this small test only, not full-resume latency or content quality.
- Added fixed, sanitized provider failure messages for denied outbound access, network failure, timeout, authentication, balance, permission, request/model configuration, rate limiting, service unavailability and schema rejection. Provider fallback and existing failure recovery remain intact. Raw provider error bodies and credentials are not displayed.
- Verification: `npm test` passed 173/173, including error classification through the actual API and provider fallback; build passed; Sites tests passed 4/4. This was a live API generation/export check, not a new browser automation pass or a representative resume-quality evaluation.

## 2026-09-12 full-page material review

- Replaced the narrow review dialog with a full-page workspace: desktop section navigation, wide reading column, grouped short fields, and a single page scrollbar. Contact is a single-line input. Required stars reflect actual validation in the intake and review flows.
- Removed all per-entry source pickers. Imported source text stays at the end of the page. Education/work corrections and skill edits automatically create or update user-statement sources; empty newly added entries are omitted, deleting a user-created entry cleans up its unused source, and the server still validates citations.
- Work descriptions, skill lists and source blocks render full text with numbered headings, emphasized category labels and paragraph spacing. Inline editing uses auto-growing plain-text inputs; this is formatted reading with inline text editing, not a general-purpose rich-text authoring toolbar. React renders all material as text, including pasted HTML.
- Independent headless Edge browser regression passed 6/6: desktop geometry, compact contact, required markers, no source checkboxes, complete long-content display/editing, automatic citations on submission, retained edits after generation and replacement failures, unconfigured service gating, and 390 px mobile layout without horizontal overflow. Browser console/page errors were checked in the relevant flows. Provider calls were mocked for UI tests; no user document or live AI request was used.
- Screenshots reviewed: `output/playwright/review-desktop.png`, `review-work.png`, `review-mobile.png` (all synthetic material, ignored by Git). The in-app control connector remains unavailable; the independent browser test environment was usable for this pass.
- Validation: core tests passed 177/177, UI tests passed 6/6, build passed, Sites tests passed 4/4. The required client/server/hosting build artifacts remain present.

## 2026-09-13 executable methodology integration

- Root cause: the provider prompt previously contained only generic generation instructions. `简历AI方法论_v0.1.md` explicitly stated that it had not been connected to model runtime, and no server code loaded or represented its rule IDs. A successful provider response could therefore remain almost identical to the source while still passing the old shape/source-ID validator.
- Added methodology registry v0.1 with 16 stable rules. Diagnosis and generation now select stage-relevant rules; JD-specific `T01` is only included when a JD exists. Prompt sections identify their stability and keep untrusted resume/JD/answers in the user payload.
- Added `/api/diagnose`, a full-page diagnosis view, no more than three questions, and both answered and skip-all generation paths. User answers become separately cited source blocks.
- Each generated bullet now contains text, source IDs and applied rule IDs. The server rejects unknown citations/rules, bullets without `F01`, unsupported new numbers, and invented organization/date metadata. Output records methodology/provider/model versions.
- Added cited-source similarity checking. A near-verbatim result triggers one provider retry with explicit restructuring feedback; a second near-copy returns a recoverable `insufficient_optimization` message instead of being presented as optimized.
- Eight independent methodology acceptance scenarios now run as named regressions, covering weekly-report scope, event assistance, course project identity, no-internship portfolios, unsupported JD skills, team results, skip-all questions and prompt injection.
- Live verification used synthetic material only. Through the real Vite proxy and configured DeepSeek `deepseek-flash`, diagnosis returned methodology v0.1 with five findings and three questions. Skip-all optimization returned four validated bullets, each with source/rule IDs; similarity was 0.417 with no exact-copy bullets and no invented channel-analysis or growth result. The combined sequential check completed in about 20 seconds; this is not a representative latency or resume-quality benchmark.
- Final verification: core tests passed 200/200; independent headless Edge UI regressions passed 7/7; production build passed; Sites packaging tests passed 4/4; `git diff --check` passed. The local frontend/backend remains running at `http://localhost:5173/` with the configured provider credentials kept server-side.

## 2026-09-13 waiting overlay and generation latency

- Added one native modal loading overlay for extraction, diagnosis, optimization and PDF download. It traps focus, blocks duplicate actions/Escape dismissal, restores scrolling/focus on completion or failure, and uses an original SVG pixel runner hopping over three obstacles toward an OFFER flag. Rotating encouragement, real elapsed seconds, pause and reduced-motion support are included; no generated percentages or time-based success claims.
- Confirmed `.env` and the transport default limited the entire non-streaming provider response to 30 seconds. Changed the default and current local configuration to 120 seconds per attempt (configurable through 300 seconds); the abort deadline and existing timeout error remain functional. Explicit `thinking.type=disabled` is sent only to DeepSeek, following its official thinking-mode documentation.
- Live synthetic checks: old parameters returned after 10.669 seconds on 682 characters and 21.690 seconds on 4,330 characters, both rejected by result validation. Neither recreated the user's historical timeout, so attribution to model delay on that specific request is not proven. Inspection found skill category labels being mistaken for invented job titles, plus a mandatory F01 marker that the prompt did not explicitly require. Scoped skill-label validation and explicit prompt requirements now address these two independent failures.
- Final synthetic successes: 682 characters optimized in 3.785 seconds; 4,330 characters optimized in 4.075 seconds. Both returned HTTP 200 with eight bullets, methodology v0.1 and quality metadata; PDF exports returned HTTP 200, valid PDF headers, 57,414 and 55,468 bytes respectively. These are individual tests, not guaranteed response times or evidence of production-wide semantic quality. No user resume was sent for these tests.
- Core suite passed 203/203, plus focused provider/prompt/validation tests after the final prompt edit. Browser tests passed 8/8, including a delayed diagnosis, centered desktop/mobile overlay, pause, Escape handling, reduced motion, and preserved facts after failure. Captures: `output/playwright/loading-desktop.png` and `loading-mobile.png`. Build and all four Sites tests passed.

## 2026-09-13 user-facing rule labels and invalid-result recovery

- Removed internal methodology codes from diagnosis findings and generated bullet presentation. Rule IDs remain in the API result and server validation path for traceability; this is a presentation change, not a relaxation of fact or methodology checks.
- A structurally invalid provider result now triggers one automatic complete regeneration with explicit schema, citation, `F01` and no-invention constraints. Only a second invalid result reaches the user, with a message that states the automatic retry already happened.
- Added provider and browser regressions for both behaviors. Focused validation/provider tests passed 113/113; the full core suite passed 204/204; browser UI tests passed 8/8; the production build and Sites tests passed 4/4; `git diff --check` reported no whitespace errors.
- A live check used 4,330 characters of synthetic material with the configured DeepSeek `deepseek-flash` service. It returned HTTP 200 in 4.245 seconds with methodology v0.1, 16 validated bullets and substantive-change quality metadata. This successful response required one provider call, so it confirms the ordinary real-service path but does not force the invalid-result repair branch; that branch is covered by deterministic provider regression tests. No user resume was sent.

## 2026-09-13 titled experience results and full-page continuity

- Changed every generated bullet from a text-only object to a required `title + text` pair. The prompt asks for an informative action/topic title rather than a generic placeholder; validation rejects missing, blank or overlong titles and checks numbers across both title and body. PDF output uses the same title-first hierarchy.
- Internal methodology IDs are now rejected when they occur inside diagnosis copy, summary, section/entry metadata, bullet titles, bullet bodies, omissions or warnings. Rule IDs remain available only in their dedicated backend metadata arrays.
- Replaced the result modal with a wide full-page workspace that reuses the material review shell: top bar, introduction, sticky sidebar directory, bordered content column, section headers, bottom actions and responsive mobile layout. Each experience point has a visible title and supporting content.
- Browser regression confirms the result is not a dialog, its desktop content column remains wider than 850 px, the titled experience is visible, and no internal code appears. Visual capture reviewed at `output/playwright/result-desktop.png`.
- Final verification: core suite passed 211/211, including rejection of generic titles such as “工作内容”; browser UI regression passed 8/8, production build passed, Sites packaging passed 4/4 and required artifacts were present; `git diff --check` reported only the repository's existing Windows line-ending notices and no whitespace errors.
- Live verification used 4,330 characters of synthetic material with configured DeepSeek `deepseek-flash`. The new schema returned HTTP 200 in 4.648 seconds with eight validated titled bullets and substantive-change quality metadata in one provider call. Because `title` is now required by schema and server validation, this successful response confirms the live model produced the new title/content structure. No user resume was sent.

## 2026-09-13 diagnosis closure, restrained results and direct editing

- Root cause of unaddressed diagnosis findings: the optimization request previously sent facts and answers but dropped the validated diagnosis itself. The client and server now carry, validate and prompt with the diagnosis findings/questions. An explicit regression prevents an unresolved diagnosed percentage such as “提升100%” from passing through unchanged after its related question is skipped; a user answer unlocks the confirmed wording.
- Skill generation is constrained to concise transferable tools. Validation rejects company-internal/proprietary tool wording in skill sections and rejects “精通”“熟练”“掌握”“擅长” unless the cited source explicitly contains that level.
- Removed the border, radius and filled background from each experience item. The presentation is now a plain numbered list with a bold title, supporting text and only a light separator between adjacent items, making it compatible with later resume templates and the already plain PDF renderer.
- Added direct result editing for summary, section headings, experience title/organization/date, and every item title/body. Edits update the current resume state; the existing export endpoint receives the edited values without another diagnosis or AI generation. Browser regression captures the edited title/body in the PDF request.
- Generation and export now have deliberately different semantic validation boundaries: AI output must still prove numbers, metadata and proficiency wording from cited sources, while a final-page edit is treated as an explicit user confirmation at export. Structural limits, valid hidden source/rule references and the ban on visible internal diagnostic codes remain enforced. A regression confirms edited experience titles, a new experience-duration summary and user-confirmed “精通” wording reach the PDF service without another AI pass.
- The final synthetic live check used configured DeepSeek `deepseek-flash` with an unresolved “提升100%” diagnosis and company-internal tools. It returned HTTP 200 in 3.310 seconds with one provider call: the ambiguous percentage was omitted and explained, the summary used concrete sourced tasks instead of empty capability labels, skills were reduced to “工具：Axure、Excel、禅道”, education remained factual with no invented coursework, and PDF export returned a valid 57,512-byte PDF. This is one synthetic acceptance check, not a production quality or latency guarantee; no user resume was sent.
- Final verification: core suite passed 220/220; independent headless Edge UI regression passed 8/8; production build passed; Sites packaging passed 4/4 with all required artifacts present; `git diff --check` reported only Windows line-ending notices and no whitespace errors. The refreshed frontend/backend is running at `http://localhost:5173/`, and `/api/config` confirms configured DeepSeek `deepseek-flash` with credentials remaining server-side.

## 2026-09-13 confirmation-first rewriting and section-local editing

- Clarified the product boundary between fact fidelity and source copying. Diagnosis questions now require a source-supported `suggestedRewrite`, presented before generation with an “采用建议表达” action and an editable answer. The prompt allows deletion of irrelevant, duplicate or ambiguous wording and professional restructuring of confirmed facts, while continuing to forbid guessed metrics, responsibility boundaries and outcomes.
- Added an edit entry beside every final-result directory section. All entries toggle one page-wide editing state, so users can start or finish editing beside basic details, the summary, any resume section or the reminder without returning to the top. Basic name/contact and target role are now editable in the same final workspace, in addition to the previously editable resume content.
- Canonicalized all generated `专业技能` / `专业能力` / `核心技能` / `技能清单` headings to the fixed user-facing name `技能`. Generic `技能清单` entry headings are removed, and skill bullets do not display experience numbering. The material review navigation and heading use the same fixed name.
- Renamed `生成说明` to `简历提醒`, explicitly labels it as excluded from the formal resume, and added a PDF text regression proving warnings never enter the downloaded document.
- Browser screenshots reviewed at `output/playwright/diagnosis-suggestion.png` and `result-desktop.png`. The suggestion is legible and adoptable; the result visibly exposes section-local edit entries, `技能`, no skill experience number and the non-exported reminder.
- Real DeepSeek `deepseek-flash` checks used synthetic material only. Diagnosis returned three validated questions and a conservative suggestion for every question. Optimization returned `工作经历` and canonical `技能`: the formal resume omitted the unresolved `100%` metric and the company-internal AI tool, retained their reasons only in omission/reminder metadata, and used sourced conservative wording. No user resume was sent.
- Final verification: core suite passed 221/221; browser UI regression passed 8/8; focused diagnosis/methodology/resume/PDF tests passed 64/64; production build passed; Sites packaging passed 4/4; `git diff --check` reported only Windows line-ending notices and no whitespace errors. The network-enabled local backend was restarted with the updated schema.

## 2026-09-13 inline skills, complete questions and bounded regeneration

- Skill entries now render and export as one inline `小标题：正文` sentence. Skill entries have no additional title, organization, dates or experience number. Broad bullet labels including `商业化运营`, `用户运营`, `产品运营`, `工具`, `常用工具`, `工具使用` and `工具能力` fail AI-output validation; the prompt asks for specific capability contexts such as `付费与活动玩法` or `原型与数据处理`.
- Diagnosis no longer keeps an arbitrary top three. It accepts and displays every independent material question returned by the diagnosis, with a conservative suggested rewrite for each. A 12-question technical safety bound remains to reject duplicate/runaway model arrays; it is not a ranking or silent truncation rule.
- Invalid provider JSON/structure and valid-but-insufficiently-optimized output now regenerate inside the same browser request. The loading overlay remains mounted across the original call and at most two automatic retries. The three-call budget is shared across provider fallback; authentication, permission, network and timeout failures are not repeatedly retried.
- Browser regression passed 8/8. The reviewed `result-desktop.png` shows the exact inline skill presentation and the unchanged wide result workspace. Core tests passed 223/223, including the overall three-call retry budget, 12-question boundary, generic skill-title rejection and PDF inline skill output. The production build and Sites packaging tests passed 4/4; `git diff --check` reported only Windows line-ending notices and no whitespace errors.
- A live synthetic DeepSeek `deepseek-flash` run completed in 3,449 milliseconds and one provider call. The final AI output used `原型与流程梳理：…` and `数据整理与表格处理：…`, omitted internal tools, retained the fixed `技能` section name, and exported a valid 57,310-byte PDF. This confirms the ordinary real-service path after the stricter prompt; the two-retry failure branch is covered deterministically rather than by intentionally inducing a live provider failure. No user resume was sent.
- The refreshed network-enabled backend remains available at `http://localhost:5173/` through the existing Vite proxy.

## 2026-09-26 V2.0 template library and career-context slice

- Current result: passed. This browser pass supersedes the historical infrastructure blocker at the top of this file; the earlier entry remains as history.
- Visual source of truth: `docs/selected-homepage.png` for the homepage and the existing wide review/diagnosis workspace for secondary pages. The new side tab preserves the approved black homepage hero, Song-style typography, static copy and OFFER composition. The template library uses the same black, restrained card and gold-accent system without introducing a competing visual theme.
- Template preview: the library renders `public/assets/recommended-template-preview.pdf`, generated from fictional data through the real enabled `recommended` renderer. The sample now includes a locally generated fictional square portrait in the upper-right identity area. A 144 DPI rendered-page inspection confirmed that the portrait crop is sharp, the name/contact block remains aligned, education stays directly below, and no text is clipped or overlapped. The browser displayed the same updated white A4 page; this is not a CSS wireframe or a fixed one-page promise.
- Desktop browser flow: homepage `模板库` -> rendered template -> `使用此模板并上传简历` -> synthetic `tests/fixtures/resume.pdf` -> full material-review workspace. From review, `查看模板` reopened the library and `返回` restored the same uploaded review state. A fresh browser session reported no console warnings or errors after the round trip.
- Homepage discovery: the upload panel now places a secondary `简历模板` button immediately to the left of the primary `上传简历` action while retaining the side `模板库` entry. Both open the same library. Desktop inspection confirmed clear primary/secondary hierarchy; at 390 x 844 the two actions remain equal-width on one row without horizontal overflow. The new-button jump was exercised in the browser and the console remained clean.
- Responsive review: the template page was also visually inspected at a 390 x 844 viewport. The preview and detail panel stacked without horizontal overflow, and the primary action remained reachable. The viewport override was reset after the check.
- Accessibility and copy: page headings receive focus on entry; upload and return actions are real buttons; the template sample has an accessible page label; privacy consent remains required; copy states that the sample is fictional and that page count/content density vary with real material.
- Career-context presentation: a synthetic online-fill diagnosis visibly separated direct evidence, transferable evidence and missing evidence, with conservative language and source details. Candidate directions are explicitly presented as references rather than definitive career conclusions or numeric fit scores.
- Verification: focused career/methodology/diagnosis tests passed 10/10; broader changed-surface tests passed 23/23; production build passed; Sites packaging passed 4/4; `git diff --check` found no whitespace errors. The repository-wide suite currently has 231 passes and 11 failures in older extraction, provider-quality, spacing and validation-boundary expectations; none of those failing source areas were changed by this slice, so this QA result is limited to the V2.0 surfaces above rather than claiming a clean full suite.

final result: passed
