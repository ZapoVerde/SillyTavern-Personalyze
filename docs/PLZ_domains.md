# PLZ Domains — UI & Logging Principles

## UI Principles

### Alignment
- All text, labels, and button content is **left-justified** throughout the extension.
- Never use centered text for functional UI elements (buttons, labels, prompt titles).
- Override SillyTavern's `.menu_button` centering with the `.plz-btn-left` CSS class, which uses `!important` to win the specificity battle. Do not fight this with inline styles — they cannot use `!important`.

### Buttons
- Buttons in action rows (modal footers, toolbar rows) must be **horizontally oriented** — use `display:flex; flex-wrap:wrap; gap:8px;`.
- `flex-wrap:wrap` is mandatory: it allows reflow on narrow/mobile screens without overflow.
- Button labels must never word-wrap. Add `white-space: nowrap` to any button that risks wrapping.
- Full-width prompt buttons in the settings panel use `.plz-btn-left` and stack vertically one per row — this is intentional (each button has a long descriptive label).

### Mobile Friendliness
- Every flex container that holds variable-width content must use `flex-wrap: wrap`.
- Avoid fixed pixel widths on interactive elements that could overflow small viewports.
- `min-width: 0` on flex children that contain text prevents overflow blowout.
- Modals use percentage widths on textareas (`width: 100%`), never fixed widths.

### Prompt Modals
- Every prompt modal shows the title **left-justified** via `.plz-modal-title`.
- Below the title, list every `{{variable}}` available in that template with a copy button and a one-line description. Use the `.plz-var-list` / `.plz-var-row` classes.
- If a template genuinely has no variables, show a brief italic note (`plz-var-none`) rather than leaving blank space. Do not assume a template has no variables without checking the substitution code.
- Copy buttons sit inline to the left of the variable name. The description wraps freely on narrow screens (`flex: 1; min-width: 0`).
- The modal footer action row uses `.plz-modal-actions` (flex, wrap, nowrap buttons).

### CSS Classes vs Inline Styles
- Structural layout (flex, gap, padding) may use inline styles for one-off cases.
- Any style that needs `!important` to override ST's base CSS **must** be in `style.css` as a named class.
- Do not scatter `!important` into template HTML strings.

---

## LLM Call Logging Principles

### What Gets Logged
Every LLM call made by PLZ — both text and image — must appear in the call log. No silent calls.

| Call type | How to log |
|---|---|
| Text (LLM prompt/response) | `logCall(label, prompt, response, errorMsg)` in the IO executor's `dispatch()` |
| Image generation (async) | `logCall(label, prompt, null, null)` immediately on dispatch; `logPatchLast(filename, null, meta)` on success; `logPatchLast(null, errorMsg)` on failure |

### Log Entry Shape
```js
{
  label:     string,       // e.g. 'SubjectDetect', 'PortraitGenerate'
  prompt:    string,       // full prompt sent
  response:  string|null,  // LLM text response, or filename for image calls
  error:     string|null,  // error message if the call failed
  meta:      object|null,  // structured provider metadata (see below)
  timestamp: number,       // Date.now() at time of call
}
```

### Provider Metadata (meta field)
When a provider returns structured task metadata, the server plugin forwards it as a response header (`X-PLZ-Meta` / `X-PiAPI-Meta`). The client reads it in `imageCache.js` and stores it in the `meta` field via `logPatchLast`.

Currently implemented: **PiAPI** — metadata forwarded includes:
- `task_id`, `model`, `status`
- `created_at`, `started_at`, `ended_at` (ISO timestamps)
- `points` (API credit cost)
- `image_url` (CDN URL of the generated image)
- `error` (API-level error message, if any)

Future providers should follow the same pattern: plugin sets a header, client reads it, `logPatchLast` stores it.

### Log Stores
- **Pipeline store** — last 4 pipeline runs (≈ 2 full turn pairs). Opened by `startTurn(label)`.
- **Workshop store** — last 3 workshop/modal queries. Opened by `startWorkshopTurn(label)`.
- `logCall()` routes to whichever store was most recently opened. A 10-second stale-fallback auto-creates a `Standalone` entry if a call arrives long after the last `start*`.

### Log Modal Display
- All sections default to **collapsed** (`<details>` elements, no `open` attribute).
- Layout is **left-justified** throughout.
- Three collapse levels: section (Pipeline / Settings & Modal) → turn → individual call.
- Text calls: show copyable Prompt block, then copyable Response block.
- Image calls: show copyable Prompt block, thumbnail (linked to full image), then PiAPI Task Metadata as a collapsible sub-section with the structured fields from `meta`.
- Errors shown in `var(--SmartThemeErrorColor)` at the call level.
- A call in the "generating…" state (response and error both null) shows a brief italic placeholder.
