/**
 * @file data/default-user/extensions/personalyze/defaults.js
 * @stamp {"utc":"2026-04-06T00:00:00.000Z"}
 * @architectural-role Default Configuration
 * @description
 * Default prompt strings, API constants, and tunable values for Personalyze.
 * 
 * Updated to support the Dual-Engine (Pollinations/HuggingFace) architecture.
 * Includes the default test prompt for engine validation.
 *
 * @api-declaration
 * POLLINATIONS_BASE_URL
 * POLLINATIONS_APP_KEY
 * POLLINATIONS_MODELS
 * DEFAULT_IMAGE_MODEL
 * HUGGINGFACE_BASE_URL
 * DEFAULT_HF_IMAGE_MODEL
 * DEFAULT_HF_ENGINE
 * DEFAULT_HF_SPACE_ID
 * DEFAULT_HF_SAVED_SPACES
 * DEFAULT_IMAGE_WIDTH
 * DEFAULT_IMAGE_HEIGHT
 * DEFAULT_DEV_MODE
 * DEFAULT_VERBOSE_LOGGING
 * DEFAULT_DETECTION_HISTORY
 * DEFAULT_DESCRIBER_HISTORY
 * DEFAULT_EXPRESSION_LABELS
 * DEFAULT_VN_STYLE_SUFFIX
 * DEFAULT_SUBJECT_MATCH_PROMPT
 * DEFAULT_SUBJECT_LIST_PROMPT
 * DEFAULT_CHANGE_CHECK_PROMPT
 * DEFAULT_COMBINED_CLASSIFIER_PROMPT
 * DEFAULT_OUTFIT_DESCRIBER_PROMPT
 * DEFAULT_EXPRESSION_DESCRIBER_PROMPT
 * DEFAULT_TEST_PROMPT
 */

/** Primary API gateway for Pollinations. */
export const POLLINATIONS_BASE_URL = 'https://gen.pollinations.ai';

/** Base URL for the HuggingFace Inference Router. Provider and model are appended at call time. */
export const HUGGINGFACE_ROUTER_BASE = 'https://router.huggingface.co';

/**
 * Available HuggingFace inference providers and the text-to-image models each supports.
 * Source: https://huggingface.co/docs/inference-providers/en/index (verified 2026-04-06)
 */
export const HF_PROVIDER_MODELS = {
    'fal-ai': {
        label: 'Fal AI',
        models: [
            'black-forest-labs/FLUX.1-schnell',
            'black-forest-labs/FLUX.1-dev',
            'Tongyi-MAI/Z-Image-Turbo',
            'Tongyi-MAI/Z-Image',
            'stabilityai/stable-diffusion-3.5-large',
            'stabilityai/stable-diffusion-3-medium',
            'stabilityai/stable-diffusion-xl-base-1.0',
            'Qwen/Qwen-Image',
            'Qwen/Qwen-Image-2512',
        ],
    },
    'replicate': {
        label: 'Replicate',
        models: [
            'black-forest-labs/FLUX.1-schnell',
            'black-forest-labs/FLUX.1-dev',
            'black-forest-labs/FLUX.1-Krea-dev',
            'Tongyi-MAI/Z-Image-Turbo',
            'stabilityai/stable-diffusion-3.5-large',
            'stabilityai/stable-diffusion-3.5-large-turbo',
            'stabilityai/stable-diffusion-3.5-medium',
            'stabilityai/stable-diffusion-xl-base-1.0',
            'stabilityai/stable-diffusion-3-medium',
            'tencent/HunyuanImage-3.0',
            'ByteDance/SDXL-Lightning',
            'Qwen/Qwen-Image',
            'Qwen/Qwen-Image-2512',
        ],
    },
    'wavespeed': {
        label: 'WaveSpeed AI',
        models: [
            'black-forest-labs/FLUX.1-schnell',
            'black-forest-labs/FLUX.1-dev',
            'Tongyi-MAI/Z-Image-Turbo',
            'Qwen/Qwen-Image-Edit',
            'Qwen/Qwen-Image-Edit-2509',
        ],
    },
    'together': {
        label: 'Together AI',
        models: [
            'black-forest-labs/FLUX.1-schnell',
        ],
    },
    'nscale': {
        label: 'Nscale',
        models: [
            'black-forest-labs/FLUX.1-schnell',
            'stabilityai/stable-diffusion-xl-base-1.0',
        ],
    },
};

/** Default HuggingFace provider. */
export const DEFAULT_HF_PROVIDER = 'fal-ai';

/** Default HuggingFace engine mode. */
export const DEFAULT_HF_ENGINE = 'router';

/** Default active Space ID. */
export const DEFAULT_HF_SPACE_ID = '';

/** Default saved Spaces list. */
export const DEFAULT_HF_SAVED_SPACES = [];

/** Publishable app key — identifies Personalyze to Pollinations for attribution. */
export const POLLINATIONS_APP_KEY = '';

/** Available Pollinations image models. */
export const POLLINATIONS_MODELS = [
    'flux',
    'zimage',
    'klein',
    'gptimage',
    'grok-imagine',
    'seedream',
    'qwen-image',
];

/** Default Pollinations model. */
export const DEFAULT_IMAGE_MODEL = 'flux';

/** Default Hugging Face model (typically a Flux variant for consistency). */
export const DEFAULT_HF_IMAGE_MODEL = 'black-forest-labs/FLUX.1-schnell';

/** Portrait dimensions — tall aspect ratio for VN-style character cards. */
export const DEFAULT_IMAGE_WIDTH  = 512;
export const DEFAULT_IMAGE_HEIGHT = 768;

/** Default split percentage for PLZ split-screen character view (portrait area height as % of screen). */
export const DEFAULT_PLZ_VN_SPLIT = 40;

/** Dev mode — generates recognizable but low-cost images. */
export const DEFAULT_DEV_MODE = false;
export const DEV_IMAGE_WIDTH  = 256;
export const DEV_IMAGE_HEIGHT = 384;

/** Verbose logging — off by default. Enable in the settings panel to see log/warn output. Errors always surface. */
export const DEFAULT_VERBOSE_LOGGING = false;

/** History window for detection calls (subject match, change check, combined classifier). */
export const DEFAULT_DETECTION_HISTORY = 2;

/** History window for describer calls. */
export const DEFAULT_DESCRIBER_HISTORY = 3;

/**
 * Standard expression labels — mirrors the SillyTavern Expressions extension default set.
 */
export const DEFAULT_EXPRESSION_LABELS = [
    'admiration',
    'amusement',
    'anger',
    'annoyance',
    'approval',
    'caring',
    'confusion',
    'curiosity',
    'desire',
    'disappointment',
    'disapproval',
    'disgust',
    'embarrassment',
    'excitement',
    'fear',
    'gratitude',
    'grief',
    'joy',
    'love',
    'nervousness',
    'optimism',
    'pride',
    'realization',
    'relief',
    'remorse',
    'sadness',
    'surprise',
    'neutral',
];

/**
 * Default test prompt for engine connectivity checks.
 */
export const DEFAULT_TEST_PROMPT = 'a simple illustration of a blue bird, white background';

/**
 * Image prompt template for Pollinations portrait generation.
 * Supports {{character}}, {{outfit}}, and {{expression}} variables.
 */
export const DEFAULT_VN_STYLE_SUFFIX =
    'A highly detailed anime-style character illustration of {{character}}, wearing {{outfit}}, expressing {{expression}} through subtle facial expression and minimal hand gesture, body kept symmetrical and front-facing. ' +
    'semi-realistic anime character illustration, painterly rendering, soft gradient shading, cinematic low-key lighting, high-detail eyes with natural reflections, smooth stylized skin (not photorealistic), refined facial features, delicate linework, controlled highlights, moody atmosphere, shallow depth of field, soft anime facial structure, rounded features, subtle nose definition' +
    'medium full shot, framed from knees up, full upper legs visible, character fully in frame from knees to head, centered composition, body fully facing forward, chest, shoulders, and hips square to the camera, perfectly frontal pose, no contrapposto, no torso rotation, no angled stance, head aligned with body and looking straight ahead, upright neutral stance' +
    'Soft cinematic lighting with gentle volumetric glow, subtle rim light, natural skin shading with soft gradients, detailed hair strands with controlled highlights' +
    'Simple blurred background with soft bokeh, neutral tones' +
    'Ultra-detailed, sharp focus, high resolution, polished illustration, studio-quality anime rendering';

// ─── Prompt Templates ────────────────────────────────────────────────────────

export const DEFAULT_SUBJECT_MATCH_PROMPT =
`[SYSTEM: TASK — SUBJECT CHECK]
You are monitoring a roleplay.

CURRENT CHARACTER: {{character_name}}

{{history}}
LATEST MESSAGE:
{{message}}

Is {{character_name}} the main subject being actively described or acting in this message?
Ignore the narrator voice. Focus on who is physically present and doing things.

Reply with exactly one word: YES or NO`;

export const DEFAULT_SUBJECT_LIST_PROMPT =
`[SYSTEM: TASK — SUBJECT IDENTIFICATION]
You are monitoring a roleplay.

KNOWN CHARACTERS:
{{character_list}}

USER: {{user_name}}

{{history}}
LATEST MESSAGE:
{{message}}

Who is the main character being actively described or acting in this message?
Ignore the narrator voice. Do not pick {{user_name}}.

Reply with one of the keys shown in brackets above (e.g. [claire] → claire), or NONE if no known character is the main subject.`;

export const DEFAULT_CHANGE_CHECK_PROMPT =
`[SYSTEM: TASK — VISUAL CHANGE CHECK]
You are monitoring a roleplay for visual changes to a character.

CHARACTER: {{character_name}}
CURRENT OUTFIT: {{current_outfit}}
CURRENT EXPRESSION: {{current_expression}}

{{history}}
LATEST MESSAGE:
{{message}}

Is {{character_name}} still wearing the same outfit and showing the same expression as described above?

Reply with exactly one word: YES or NO`;

export const DEFAULT_COMBINED_CLASSIFIER_PROMPT =
`[SYSTEM: TASK — VISUAL STATE CLASSIFIER]
Identify the current outfit and expression of a character based on the roleplay.

CHARACTER: {{character_name}}

KNOWN OUTFITS:
{{outfit_list}}

EXPRESSION OPTIONS:
{{expression_list}}

{{history}}
LATEST MESSAGE:
{{message}}

INSTRUCTIONS:
- Outfit: match to a known key, or NEW if it is an unregistered outfit, or NULL if outfit is unchanged or unclear
- Expression: pick the single closest label from the expression options above, or NULL if unclear

Reply with exactly two lines:
Outfit: [key] or NEW or NULL
Expression: [label] or NULL`;

export const DEFAULT_ANCHOR_SCAN_PROMPT =
`[SYSTEM: TASK — CHARACTER ARCHIVIST]
Analyze the roleplay transcript to identify and describe a character's permanent physical appearance.

{{character_focus}}
TRANSCRIPT:
{{context}}

INSTRUCTIONS:
1. Identify the main character being actively described or present{{focus_note}}.
2. Extract only their permanent physical features: face, hair, eye colour, build, distinctive marks.
3. Do NOT include clothing, outfits, or current emotional state — permanent appearance only.
4. The Name must exactly match how the character is referred to in the transcript.

### OUTPUT FORMAT:
Name: [Exact character name as used in the transcript]
Identity Anchor: [2-3 sentences of permanent physical appearance for an image generator]`;

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
Description: [2-3 sentences of visual detail for an image generator]`;

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
Description: [1-2 sentences of visual detail for an image generator]`;