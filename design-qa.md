# Homepage Design QA

final result: blocked

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
