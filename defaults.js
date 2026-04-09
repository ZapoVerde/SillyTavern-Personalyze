/**
 * @file data/default-user/extensions/personalyze/defaults.js
 * @stamp {"utc":"2026-04-10T10:00:00.000Z"}
 * @architectural-role Default Configuration
 * @description
 * Default constants for the Layered State Pipeline.
 * 
 * Defines the slots for visual tracking: Outerwear, Top, Bottom, Accessories, and Emotion.
 * Establishes the standard for Dual-Engine (Fast/Smart) profile routing.
 *
 * @api-declaration
 * PLZ_SLOTS
 * POLLINATIONS_BASE_URL
 * POLLINATIONS_MODELS
 * DEFAULT_IMAGE_MODEL
 * DEFAULT_IMAGE_WIDTH
 * DEFAULT_IMAGE_HEIGHT
 * DEFAULT_FAST_PROFILE_ID
 * DEFAULT_SMART_PROFILE_ID
 * DEFAULT_VN_STYLE_SUFFIX
 * DEFAULT_TEST_PROMPT
 * FAL_MODELS
 * DEFAULT_FAL_MODEL
 * PIAPI_MODELS
 * DEFAULT_PIAPI_MODEL
 */

/** Primary API gateway for Pollinations. */
export const POLLINATIONS_BASE_URL = 'https://gen.pollinations.ai';

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

/** Portrait dimensions. */
export const DEFAULT_IMAGE_WIDTH  = 512;
export const DEFAULT_IMAGE_HEIGHT = 768;

/** Default split percentage for split-screen. */
export const DEFAULT_PLZ_VN_SPLIT = 40;

/** Dev mode settings. */
export const DEFAULT_DEV_MODE = false;
export const DEV_IMAGE_WIDTH  = 256;
export const DEV_IMAGE_HEIGHT = 384;

/** Verbose logging preference. */
export const DEFAULT_VERBOSE_LOGGING = false;

/** History window defaults. */
export const DEFAULT_DETECTION_HISTORY = 2;
export const DEFAULT_DESCRIBER_HISTORY = 3;

/** 
 * Layered State Slots.
 * These are the keys used in DNA visual_state and LLM communication.
 */
export const PLZ_SLOTS = [
    'outerwear',
    'top',
    'bottom',
    'accessories',
    'emotion',
];

/** 
 * Default Model Routing.
 * Placeholders for ST Connection Profile IDs. 
 */
export const DEFAULT_FAST_PROFILE_ID = null; // Phase 1 & 2 (Mistral Small)
export const DEFAULT_SMART_PROFILE_ID = null; // Phase 3 (Gemini 3.1 Flash Lite)

/** Default test prompt for engine validation. */
export const DEFAULT_TEST_PROMPT = 'a simple illustration of a blue bird, white background';

/** Fal AI models. */
export const FAL_MODELS = [
    'fal-ai/flux/schnell',
    'fal-ai/flux/dev',
    'fal-ai/flux-pro',
    'fal-ai/stable-diffusion-v35-large',
    'fal-ai/z-image/turbo',
];

/** Default Fal AI model. */
export const DEFAULT_FAL_MODEL = 'fal-ai/z-image/turbo';

/** PiAPI models. */
export const PIAPI_MODELS = [
    'Qubico/z-image',
];

/** Default PiAPI model. */
export const DEFAULT_PIAPI_MODEL = 'Qubico/z-image';

/** HuggingFace inference provider → model list map. */
export const HF_PROVIDER_MODELS = {};

/** 
 * Visual Style Suffix.
 * Updated to support slot-based variables.
 * Note the emphasis on 'emotion' including body language and hands.
 */
export const DEFAULT_VN_STYLE_SUFFIX =
    'A highly detailed anime-style character illustration of {{identity_anchor}}. ' +
    'Wearing: {{layers_description}}. ' +
    'State: Expressing {{emotion}} through facial features, hand positioning, and physical posture. ' +
    'semi-realistic anime character illustration, painterly rendering, soft shading, cinematic lighting, ' +
    'high-detail eyes, smooth stylized skin, refined facial features, delicate linework, moody atmosphere, ' +
    'medium full shot, framed from knees up, full upper legs visible, centered composition, body fully facing forward, ' +
    'polished illustration, studio-quality anime rendering';

/** Legacy Prompt placeholders (removed - now managed in logic/prompts.js) */