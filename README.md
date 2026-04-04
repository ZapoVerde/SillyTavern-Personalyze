# PersonaLyze

A SillyTavern extension that automatically tracks character outfit and expression changes in roleplay chat, maintains a persistent Global Character Portfolio, generates Visual Novel-style portrait images via the Pollinations API, and displays them as a floating framed portrait over the chat interface.

## Features

- **"Falling Water" Detection Pipeline:** Automatic visual state detection on every AI message (Boolean gate → Classifier → Wardrobe Expansion) with independent outfit and expression tracking to minimize LLM costs.
- **Global Character Portfolio:** Character definitions (outfits, expressions, identity anchors) persist across all chats. A new outfit discovered in Chat A is immediately available in Chat B.
- **Zero-Cost Replay:** Generated portraits are cached by deterministic filename (`plz_{character}_{outfit}_{expression}.png`). If the exact combination has been rendered before, it displays instantly with no API calls.
- **The Dressing Room:** Approval modal for newly discovered outfits and expressions — review the LLM-extracted description, generate a preview thumbnail, edit the label, then confirm before it joins the Global Portfolio.
- **Portfolio Manager:** Full gallery UI to browse every character's registered outfits and expressions, manually override the active portrait for any chat turn, and edit identity anchors.
- **Per-Message Badges:** Visual state indicators injected onto every AI message showing the active character, outfit, and expression at that point in the conversation.
- **VN Portrait Frame:** CSS-styled floating portrait container with smooth crossfade transitions, configurable position (bottom-right or center-left).
- **Portrait Image Generation:** Integration with Pollinations API using the "Prompt Sandwich": Identity Anchor + Outfit + Expression + VN Style Suffix.

## Requirements

- SillyTavern with `allowKeysExposure: true` set in `config.yaml`
- A Pollinations API key (saved to the ST secret vault via the extension settings)

## Installation

1. Place the `personalyze` folder in `SillyTavern/data/default-user/extensions/`
2. Enable the extension in ST's Extensions panel.
3. Open `SillyTavern/config.yaml` and set `allowKeysExposure: true`.
4. Restart your SillyTavern server and reload the page.
5. Enter your Pollinations API key in the PersonaLyze settings panel and click **Save to Vault**.

## How It Works

### The Detection Pipeline

On every incoming AI message, PersonaLyze runs a cascading pipeline designed to halt as early as possible:

**Step 0 — Character Resolution**
Identifies the character from the message's name field. If the character has no portfolio entry registered, the pipeline halts silently.

**Step 1 — Dual-Boolean Gate (fast/cheap)**
Asks the LLM two questions simultaneously: did the outfit change? Did the expression change? If both are false, the pipeline halts — no further API calls.

**Step 2 — Classifiers (one per changed dimension)**
Each changed dimension runs its own classifier against that character's known portfolio. The outfit classifier compares against known outfits; the expression classifier against known expressions. They run independently, so a known outfit change and a new expression discovery can be handled in the same turn.

- Matched key → write pointer, update portrait.
- `NEW` → proceed to Step 3 for that dimension.
- `NULL` → no change resolved, keep current.

**Step 3 — Wardrobe Expansion (new discovery)**
For any dimension that returned `NEW`:
1. The describer LLM extracts a label and visual description from the recent chat context.
2. The **Dressing Room** modal opens for user review. You can edit the label and description, generate a preview thumbnail, or reject it entirely.
3. On approval, an immutable slug key is derived from the label and the entry is permanently added to the Global Portfolio.
4. The portrait is generated and applied.

### The Global Portfolio

Character data lives in `extension_settings.personalyze` — not in the chat log. This means:

- Every outfit and expression a character gains in any chat is immediately available everywhere.
- Chat files stay lean: only pointer records (`characterId`, `outfit`, `expression`, `image`) are written to `message.extra.personalyze`.
- **Portability note:** Pointers require the Global Registry to resolve. Chats shared to a different ST instance will degrade gracefully (unresolvable pointers are treated as null, not errors).

### Immutable Keys

Outfit and expression dictionary keys are slugified at the moment of creation and never changed. Only the display `label` is user-editable. This ensures that renaming "Armor" to "Plate Mail" in the Portfolio Manager does not silently break all existing pointer history.

### The Two-Write Pattern

When a portrait image needs to be generated:
1. **Write 1:** The pointer is written immediately with `image: null` (preserves narrative intent in the chat record).
2. **Async generation** runs in the background.
3. **Write 2:** The pointer is patched with the resulting filename once the file is confirmed on disk.

On next boot, if `image: null` is found for the active state, the bootstrapper queues a silent background regeneration.

### The Portfolio Manager

Open via the **Open Portfolio Manager** button in the PersonaLyze settings panel.

- **Character selector** — switch between all registered characters.
- **Identity Anchor editor** — update the permanent appearance description used as the base of every generation prompt for this character.
- **Wardrobe grid** — all outfit × expression combinations as portrait thumbnails. Missing (ungenerated) combinations show as empty slots. Click a generated portrait to instantly apply it as a manual override to the last AI message. Click an empty slot to trigger on-demand generation.
- **Expression strip** — reference row of all known expressions for the selected character.

## Configuration

Open ST's Extensions panel and scroll to the **PersonaLyze** section.

### LLM Connection Profiles

Each pipeline step (Boolean, Outfit Classifier, Expression Classifier, Describer) has a Connection Profile dropdown. Leave blank to use the chat's active API.

### Prompt Variables

Click **Edit Prompt** next to any step to customize the template. Available placeholders:

| Step | Variables |
| :--- | :--- |
| **Boolean** | `{{character_name}}`, `{{current_outfit}}`, `{{current_expression}}`, `{{history}}`, `{{message}}` |
| **Outfit Classifier** | `{{character_name}}`, `{{outfit_list}}`, `{{history}}`, `{{message}}` |
| **Expression Classifier** | `{{character_name}}`, `{{expression_list}}`, `{{history}}`, `{{message}}` |
| **Outfit Describer** | `{{character_name}}`, `{{identity_anchor}}`, `{{context}}` |
| **Expression Describer** | `{{character_name}}`, `{{identity_anchor}}`, `{{context}}` |
| **VN Style Suffix** | *(appended verbatim to all Pollinations prompts)* |

### History Windows

Each step has a configurable **History** value (turn pairs). Set to 0 to send only the latest message with no prior context.

### Image Generation

- **Model** — select the Pollinations model used for portrait generation.
- **VN Style Suffix** — the style string appended to every prompt. Defaults to a visual novel / character portrait aesthetic.
- **Dev mode** — generates small low-resolution images to conserve API credits during testing.

## Architecture

PersonaLyze uses a strict Gatekeeper / Stateful Owner pattern. No module may mutate state it does not own.

```text
personalyze/
├── index.js              — Event orchestrator; extension entry point
├── state.js              — [GATEKEEPER] Single source of truth for runtime state
├── registry.js           — [GATEKEEPER] Global character portfolio (extension_settings)
├── settings.js           — [GATEKEEPER] Extension settings / pipeline configuration
├── reconstruction.js     — [PURE] Derives active state from chat pointer history
├── detector.js           — LLM dispatch and response parsing
├── imageCache.js         — Pollinations API IO; deterministic filename builder
├── portrait.js           — Floating VN portrait DOM injector and crossfade controller
├── defaults.js           — Prompt templates, API constants, default values
├── logic/
│   ├── pipeline.js       — "Falling Water" detection orchestrator
│   ├── bootstrapper.js   — Boot sequence: reconstruction, file index, self-healing queue
│   └── pointerWriter.js  — [IO] Mutex-locked writes to message.extra.personalyze
├── ui/
│   ├── panel.js          — Settings panel injector and event bindings
│   ├── portfolio.js      — Global Portfolio Manager modal
│   ├── dressingRoom.js   — New outfit/expression discovery approval modal
│   └── badge.js          — Per-message visual state badge injector
└── utils/
    ├── history.js        — Pure text utilities: slugify, escapeHtml, transcript builders
    ├── logger.js         — Verbose-gated console wrapper ([PLZ:Tag] format)
    └── lock.js           — AsyncLock mutex for serialized chat writes
```
