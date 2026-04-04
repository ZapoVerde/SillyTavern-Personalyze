# PersonaLyze — Technical Specification (v1: Global Portfolio)
*A SillyTavern Extension for Persistent Visual Novel Portraits*

---

## 1. Core Philosophy

**PersonaLyze (PLZ)** automates a character's visual state (Outfits and Expressions) and displays them as a high-resolution, framed portrait floating over the chat interface.

Unlike environments (which change per story), **a character's identity is persistent**. The system treats characters as valuable, growing assets. Every new outfit or expression discovered in *any* chat is permanently added to that character's Global Portfolio, making them visually richer the more you use them.

**V1 Scope:** Single active character per chat turn (the most recent AI speaker). Multi-character portrait display is deferred to V2, but the data model is forward-compatible by design.

---

## 2. The Data Model: Global Definitions, Local Pointers

We strictly separate **what an outfit is** (Global) from **when it is worn** (Local).

### A. The Global Character Registry (`extension_settings.personalyze`)

The single source of truth for all character definitions. Keyed by the character's unique SillyTavern identifier (their avatar filename slug).

```json
"claire_the_knight": {
    "identityAnchor": "A 25-year-old athletic woman with silver hair in a ponytail and blue eyes.",
    "outfits": {
        "casual": {
            "label": "Casual",
            "description": "A simple linen tunic and leather trousers"
        },
        "armor": {
            "label": "Armor",
            "description": "Scuffed steel plate mail with a red cape"
        }
    },
    "expressions": {
        "neutral": {
            "label": "Neutral",
            "description": "A calm, focused stare"
        },
        "smug": {
            "label": "Smug",
            "description": "A confident, arrogant half-smile"
        }
    }
}
```

**Key/Label split:** The dictionary key (e.g. `"armor"`) is assigned at creation time via slugification and is **immutable**. The `label` field is what the user sees and edits. This prevents key renames from silently corrupting pointer history.

### B. The Chat Ledger (`message.extra.personalyze`)

The chat log stores only **Pointers**. This keeps chat files lean and allows accurate visual reconstruction on scroll or reload.

```json
{
    "characterId": "claire_the_knight",
    "outfit": "armor",
    "expression": "smug"
}
```

`characterId` is always written, even in V1 where only one character is tracked per turn. This makes all existing chat records unambiguous when V2 multi-character support is added.

**Portability note:** Pointers are only meaningful alongside the Global Registry in `extension_settings`. Chats shared across ST instances or copied to a device without the registry will have unresolvable pointers. Reconstruction must treat any unresolvable pointer key as `null` and degrade gracefully rather than throwing.

---

## 3. The Asset Bank (On-Demand Combo Generation)

Generated images are stored in SillyTavern's public directory with a deterministic naming convention:

`plz_{characterId}_{outfitKey}_{expressionKey}.png`
*(Example: `plz_claire_the_knight_armor_smug.png`)*

**Cache Lookup:** Before any generation, the system checks if the exact `outfit × expression` file exists. If it does, the UI crossfades to it instantly — zero API calls, zero tokens.

**Cache Miss Handling:** An outfit or expression may exist in the registry without every combination having been generated. The pipeline generates on demand when a new combination is encountered. The three possible states are:

| Outfit key exists | Expression key exists | Image file exists | Action |
|---|----|---|---|
| Yes | Yes | Yes | Instant replay |
| Yes | Yes | No | Generate (known combo, new render) |
| No | — | No | Step 3: Wardrobe Expansion |
| Yes | No | No | Step 3: Wardrobe Expansion (expression only) |

---

## 4. The "Falling Water" Pipeline

Triggered on every incoming AI message. Halts as early as possible.

### Step 0: Character Resolution
Identify `characterId` from the current message. In V1, this is the name/avatar of the AI character who sent the message, slugified. If resolution fails, halt.

### Step 1: The Dual-Boolean Gate (Fast/Cheap)
*Prompt:* "Based on the last message, did the character put on or remove clothing? Did their facial expression significantly change? Reply only in JSON."

```json
{ "outfit_changed": false, "expression_changed": false }
```

If both are `false` → **Halt.**

### Step 2: The Classifier (Portfolio Match)
Runs **once per changed dimension**. If `outfit_changed` is true, run the outfit classifier against the character's `outfits` dictionary. If `expression_changed` is true, run the expression classifier against `expressions`. These are independent calls and may both run in the same turn.

*Prompt (per dimension):* "Which of these known [Outfits / Expressions] best matches the current text? If none match and this is something entirely new, reply 'NEW'. Otherwise reply with the exact key."

- If a key is matched for both dimensions → Write the pointer to the chat message → Update UI → **Halt.**
- If either dimension returns `'NEW'` → proceed to Step 3 for that dimension only.

### Step 3: Wardrobe Expansion (New Discovery)
Triggered only for the dimension(s) that returned `'NEW'`.

1. **Describe:** Extract the visual description of the new outfit or expression from the message text.
2. **Approve:** A "Dressing Room" modal shows the user the proposed description for review and edit.
3. **Register:** On approval, slugify a key from the label and write the new entry to the Global Registry under the character. The key is immutable from this point.
4. **Generate:** Request the image from Pollinations using the Prompt Sandwich:
   `[Identity Anchor] + [Outfit Description] + [Expression Description] + [VN Portrait Style suffix]`
5. **Commit:** Write the pointer to the chat message. Apply the new image to the portrait.

---

## 5. UI Architecture: The VN Portrait & Portfolio

### The Visual Novel Layer

- **The Container (`#plz-portrait-container`):** Floating above the chat (configurable: bottom-right or center-left).
- **The Frame (`.plz-portrait-frame`):** CSS-styled border and drop shadow that frames the generated image as a character card.
- **Crossfade:** Transitions between images use a CSS opacity crossfade on two stacked `<img>` elements, identical to how Localyze handles background transitions.

### The Global Portfolio Manager

A dedicated UI panel accessible from the extensions menu.

- **Character Selector:** Choose any character registered with PLZ.
- **Wardrobe Grid:** Visual gallery of every generated asset (outfit × expression combo) for the selected character. Missing combos shown as empty slots.
- **Manual Override:** Click any generated portrait to instantly force the character into that state for the current chat turn. Writes a pointer to the last AI message.
- **Edit Labels:** Update the display label for any outfit or expression (does not change the immutable key).
- **Edit Anchor:** Update the Identity Anchor (used as the base of all generation prompts for this character).

---

## 6. Project Architecture (File Map)

```text
personalyze/
├── docs/
│   └── spec.md
├── index.js              # Orchestrator & ST Event Bindings
├── defaults.js           # Prompt templates, Pollinations API constants
├── registry.js           # [GATEKEEPER] Manages extension_settings.personalyze (The Portfolio)
├── state.js              # [GATEKEEPER] Runtime state (active characterId, outfit, expression pointers)
├── portrait.js           # [IO] Injects and crossfades the floating VN frame
├── imageCache.js         # [IO] Pollinations generator and deterministic file downloader
├── reconstruction.js     # [PURE] Reads chat pointer history on reload/scroll to restore state
├── logic/
│   ├── pipeline.js       # The Falling Water execution logic
│   └── pointerWriter.js  # [IO] Writes pointer records to message.extra.personalyze
├── ui/
│   ├── panel.js          # Main settings (global toggles)
│   ├── portfolio.js      # Global Character Wardrobe manager/gallery
│   ├── dressingRoom.js   # Approval modal for new outfit/expression discovery
│   └── badge.js          # Per-message state indicator [Character | Outfit | Expression]
└── utils/
    ├── logger.js
    └── history.js        # Context builders for LLM calls
```

---

## 7. Open Questions (V2 Scope)

- **Multi-character scenes:** When multiple AI characters are active in a group chat, do we display one portrait (last speaker) or multiple? Stacked? Side by side?
- **Per-chat enable/disable:** Should PLZ be suppressible for specific chats without touching global settings?
- **Combo pre-generation:** After Wardrobe Expansion, optionally pre-generate all existing expression variants for the new outfit in the background.
