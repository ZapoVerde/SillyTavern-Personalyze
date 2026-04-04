/**
 * @file data/default-user/extensions/personalyze/defaults.js
 * @stamp {"utc":"2026-04-04T00:00:00.000Z"}
 * @architectural-role Default Configuration
 * @description
 * Default prompt strings, API constants, and tunable values for PersonaLyze.
 *
 * All prompt templates use {{double_brace}} interpolation tokens that are
 * replaced by the pipeline at call time.
 *
 * @api-declaration
 * POLLINATIONS_BASE_URL
 * POLLINATIONS_APP_KEY
 * POLLINATIONS_MODELS
 * DEFAULT_IMAGE_MODEL
 * DEFAULT_IMAGE_WIDTH
 * DEFAULT_IMAGE_HEIGHT
 * DEFAULT_DEV_MODE
 * DEFAULT_VERBOSE_LOGGING
 * DEFAULT_BOOLEAN_HISTORY
 * DEFAULT_OUTFIT_CLASSIFIER_HISTORY
 * DEFAULT_EXPRESSION_CLASSIFIER_HISTORY
 * DEFAULT_DESCRIBER_HISTORY
 * DEFAULT_VN_STYLE_SUFFIX
 * DEFAULT_BOOLEAN_PROMPT
 * DEFAULT_OUTFIT_CLASSIFIER_PROMPT
 * DEFAULT_EXPRESSION_CLASSIFIER_PROMPT
 * DEFAULT_OUTFIT_DESCRIBER_PROMPT
 * DEFAULT_EXPRESSION_DESCRIBER_PROMPT
 */

/** Primary API gateway for Pollinations. */
export const POLLINATIONS_BASE_URL = 'https://image.pollinations.ai'

/** Publishable app key — identifies PersonaLyze to Pollinations for attribution. */
export const POLLINATIONS_APP_KEY = ''

/** Available Pollinations image models. */
export const POLLINATIONS_MODELS = [
    'flux',
    'zimage',
    'klein',
    'gptimage',
    'grok-imagine',
    'seedream',
    'qwen-image',
]

/** Default Pollinations model. */
export const DEFAULT_IMAGE_MODEL = 'flux'

/** Portrait dimensions — tall aspect ratio for VN-style character cards. */
export const DEFAULT_IMAGE_WIDTH  = 512
export const DEFAULT_IMAGE_HEIGHT = 768

/** Dev mode — generates recognizable but low-cost images. */
export const DEFAULT_DEV_MODE = false
export const DEV_IMAGE_WIDTH  = 256
export const DEV_IMAGE_HEIGHT = 384

/** Verbose logging — set to true to enable informational log/warn output. Errors always surface. */
export const DEFAULT_VERBOSE_LOGGING = true

/** Default turn-pair history windows for LLM calls. */
export const DEFAULT_BOOLEAN_HISTORY               = 3
export const DEFAULT_OUTFIT_CLASSIFIER_HISTORY     = 3
export const DEFAULT_EXPRESSION_CLASSIFIER_HISTORY = 3
export const DEFAULT_DESCRIBER_HISTORY             = 3

/**
 * Style suffix appended to every Pollinations prompt.
 * Targets the visual novel / character portrait aesthetic.
 */
export const DEFAULT_VN_STYLE_SUFFIX =
    'visual novel character portrait, centered composition, plain or softly blurred background, ' +
    'high detail, anime-adjacent illustration style, front-facing or three-quarter view'

// ─── Prompt Templates ────────────────────────────────────────────────────────

export const DEFAULT_BOOLEAN_PROMPT =
`[SYSTEM: TASK — VISUAL CHANGE DETECTOR]
You are monitoring a roleplay for meaningful visual changes to a character.

CHARACTER: {{character_name}}
CURRENT OUTFIT: {{current_outfit}}
CURRENT EXPRESSION: {{current_expression}}

{{history}}
LATEST MESSAGE:
{{message}}

Did the character's clothing or outfit meaningfully change in this message?
Did the character's facial expression or emotional state meaningfully change in this message?

Reply with only valid JSON matching this schema exactly:
{ "outfit_changed": boolean, "expression_changed": boolean }`

export const DEFAULT_OUTFIT_CLASSIFIER_PROMPT =
`[SYSTEM: TASK — OUTFIT CLASSIFIER]
Match the character's current clothing to one of their known outfits.

CHARACTER: {{character_name}}

KNOWN OUTFITS:
{{outfit_list}}

{{history}}
LATEST MESSAGE:
{{message}}

INSTRUCTIONS:
1. Compare the clothing described in the message to each known outfit's label and description.
2. If a match is found, reply with only the exact key shown in brackets (e.g. [casual] → casual).
3. If the clothing is entirely new and does not match any known outfit, reply with: NEW
4. If no outfit is mentioned or visible, reply with: NULL`

export const DEFAULT_EXPRESSION_CLASSIFIER_PROMPT =
`[SYSTEM: TASK — EXPRESSION CLASSIFIER]
Match the character's current facial expression or emotional state to one of their known expressions.

CHARACTER: {{character_name}}

KNOWN EXPRESSIONS:
{{expression_list}}

{{history}}
LATEST MESSAGE:
{{message}}

INSTRUCTIONS:
1. Compare the emotion or expression described in the message to each known expression's label and description.
2. If a match is found, reply with only the exact key shown in brackets (e.g. [neutral] → neutral).
3. If the expression is entirely new and does not match any known expression, reply with: NEW
4. If no expression is discernible, reply with: NULL`

export const DEFAULT_OUTFIT_DESCRIBER_PROMPT =
`[SYSTEM: TASK — OUTFIT ARCHIVIST]
Extract a precise visual description of a character's new outfit from the roleplay transcript.

CHARACTER: {{character_name}}
IDENTITY ANCHOR: {{identity_anchor}}

TRANSCRIPT:
{{context}}

INSTRUCTIONS:
1. Identify the new outfit or clothing change at the end of the transcript.
2. Provide a short display label and a visual description suitable for an image generator.
3. Focus on garment type, colors, materials, and any notable accessories. Do not describe the character's face or body.

### OUTPUT FORMAT:
Label: [Short display name, e.g. "Red Evening Dress"]
Description: [2-3 sentences of visual detail for an image generator]`

export const DEFAULT_EXPRESSION_DESCRIBER_PROMPT =
`[SYSTEM: TASK — EXPRESSION ARCHIVIST]
Extract a precise visual description of a character's new facial expression or emotional state from the roleplay transcript.

CHARACTER: {{character_name}}
IDENTITY ANCHOR: {{identity_anchor}}

TRANSCRIPT:
{{context}}

INSTRUCTIONS:
1. Identify the new expression or emotional state at the end of the transcript.
2. Provide a short display label and a visual description suitable for an image generator.
3. Focus on facial features: eyes, brow, mouth, posture. Do not describe clothing.

### OUTPUT FORMAT:
Label: [Short display name, e.g. "Tearful Smile"]
Description: [1-2 sentences of visual detail for an image generator]`
