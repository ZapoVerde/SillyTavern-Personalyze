/**
 * @file data/default-user/extensions/personalyze/defaults.js
 * @stamp {"utc":"2026-04-15T10:00:00.000Z"}
 * @architectural-role Default Configuration
 * @description
 * Default constants for the Layered State Pipeline.
 * 
 * Updated for the Generation Economy:
 * 1. Added RESOLUTION_TIERS for multi-tier image generation.
 * 2. Added defaults for Dynamic Resolution and Ephemeral Caching.
 * 
 * @api-declaration
 * POLLINATIONS_BASE_URL
 * PLZ_IMAGE_FOLDER
 * RESOLUTION_TIERS
 * DEFAULT_MAX_RESOLUTION
 * DEFAULT_DYNAMIC_RESOLUTION
 * DEFAULT_KEEP_CACHE
 * ...
 */

/** Primary API gateway for Pollinations. */
export const POLLINATIONS_BASE_URL = 'https://gen.pollinations.ai';

/** Registry folder for all PersonaLyze portraits. */
export const PLZ_IMAGE_FOLDER = 'personalyze';

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

/** 
 * Resolution Tiers.
 * Used by the Dynamic Dimension Resolver to scale generation based on DOM size.
 */
export const RESOLUTION_TIERS = {
    MAX:   { width: 512, height: 768 },
    HIGH:  { width: 448, height: 672 },
    MED:   { width: 384, height: 576 },
    SMALL: { width: 320, height: 480 }
};

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
 * Generation Economy Defaults.
 */
export const DEFAULT_MAX_RESOLUTION = 'MAX';
export const DEFAULT_DYNAMIC_RESOLUTION = false;
export const DEFAULT_KEEP_CACHE = false;

/**
 * Meta-slot keys.
 * These slots store a plain string value instead of { item, modifier }.
 */
export const META_SLOT_EMOTION = 'emotion';
export const META_SLOT_POSE    = 'pose';
export const META_SLOTS        = [META_SLOT_EMOTION, META_SLOT_POSE];

/**
 * Base Clothing Slots.
 * Used as the default schema template for all characters.
 */
export const BASE_SLOTS = [
    'outerwear',
    'top',
    'bottom',
    'accessories',
];

/**
 * Legacy Default Slots (Backward Compatibility).
 */
export const DEFAULT_SLOTS = [
    ...BASE_SLOTS,
    META_SLOT_EMOTION,
    META_SLOT_POSE,
];

/** 
 * Default Model Routing.
 */
export const DEFAULT_FAST_PROFILE_ID = null;
export const DEFAULT_SMART_PROFILE_ID = null;

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

/** Background removal via PiAPI Image Toolkit. */
export const DEFAULT_PIAPI_REMOVE_BG  = false;
export const DEFAULT_PIAPI_RMBG_MODEL = 'BEN2';

/** Valid rmbg_model values accepted by Qubico/image-toolkit. */
export const PIAPI_RMBG_MODELS = ['BEN2', 'RMBG-2.0', 'RMBG-1.4'];

/**
 * Visual Style Suffix.
 * Supports slot-based variables: {{identity_anchor}}, {{layers_description}},
 * {{emotion}}, {{pose}}.
 */
export const DEFAULT_VN_STYLE_SUFFIX =
    'A highly detailed anime-style character illustration of {{identity_anchor}}. ' +
    'Wearing: {{layers_description}}. ' +
    'State: Expressing {{emotion}} through facial features, hand positioning, and physical posture. ' +
    'semi-realistic anime character illustration, painterly rendering, soft shading, cinematic lighting, ' +
    'high-detail eyes, smooth stylized skin, refined facial features, delicate linework, moody atmosphere, ' +
    'medium full shot, framed from knees up, full upper legs visible, centered composition, body fully facing forward, ' +
    'polished illustration, studio-quality anime rendering';