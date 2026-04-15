/**
 * @file data/default-user/extensions/personalyze/defaults.js
 * @stamp {"utc":"2026-04-19T21:00:00.000Z"}
 * @architectural-role Default Configuration
 * @description
 * Default constants for the Layered State Pipeline.
 * 
 * Updated for Explicit Seed Architecture:
 * 1. Added DEFAULT_AUTO_INCREMENT_SEED for global workflow preference.
 * 
 * @api-declaration
 * POLLINATIONS_BASE_URL
 * PLZ_IMAGE_FOLDER
 * RESOLUTION_TIERS
 * RESOLUTION_OVERRIDES
 * DEFAULT_STYLE_PACKAGE
 * DEFAULT_MAX_RESOLUTION
 * DEFAULT_DYNAMIC_RESOLUTION
 * DEFAULT_KEEP_CACHE
 * DEFAULT_AUTO_INCREMENT_SEED
 * SECRET_RUNWARE
 * RUNWARE_MODELS
 * RUNWARE_LORA_REGISTRY
 * RUNWARE_RMBG_MODELS
 * DEFAULT_RUNWARE_RMBG_MODEL
 * DEFAULT_BLUEPRINTS
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
    SuperMAX:   { width: 768, height: 1152 },
    MAX:   { width: 512, height: 768 },
    HIGH:  { width: 448, height: 672 },
    MED:   { width: 384, height: 576 },
    SMALL: { width: 320, height: 480 }
};

/** Precise resolution overrides for specific model requirements (Style-level) */
export const RESOLUTION_OVERRIDES = [
    { label: 'Use Global/Auto', value: null },
    { label: '512 x 512 (1:1)', value: '512x512' },
    { label: '512 x 768 (2:3)', value: '512x768' },
    { label: '768 x 512 (3:2)', value: '768x512' },
    { label: '768 x 768 (1:1)', value: '768x768' },
    { label: '832 x 1216 (SDXL)', value: '832x1216' },
    { label: '1024 x 1024 (1:1 XL)', value: '1024x1024' },
];

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

/** Global workflow for seed rotation on refresh. */
export const DEFAULT_AUTO_INCREMENT_SEED = false;

/**
 * Runware API & Registry.
 */
export const SECRET_RUNWARE = 'api_key_runware';

/** Verified Runware Model AIRs */
export const RUNWARE_MODELS = [
    { label: 'Pony Diffusion V6 XL', air: 'civitai:257749@290640' },
    { label: 'V6 Turbo DPO merge', air: 'civitai:257749@298112' },
    { label: 'Flux.1 Dev', air: 'runware:100@1' },
    { label: 'Z-image turbo', air: 'runware:z-image@turbo' },
];

/** 
 * Global LoRA Registry.
 * Hardcoded to avoid Civitai API/VPN lag.
 */
export const RUNWARE_LORA_REGISTRY = [
    { label: 'None', air: '' },
    { label: 'Hourglass Flux', air: 'civitai:129130@155255', defaultWeight: 0.8 },
    { label: 'Frank Cho Flux', air: 'civitai:1905015@2145391', defaultWeight: 0.7 },
    { label: 'Elusarca  ZIT', air: 'civitai:2176274@2145391', defaultWeight: 0.7 },
    { label: 'Anime Style v2.52 - Dream ZIT', air: 'civitai:2186398', defaultWeight: 0.7 },
    { label: 'Z-Image Anime 01 ZIT', air: 'civitai:2174642', defaultWeight: 0.7 },
    { label: 'ZNSFW LoRA ZIT', air: 'civitai:2279079', defaultWeight: 0.7 },
    { label: 'Anime NSFW Characters and Style ZIT', air: 'civitai:2221829', defaultWeight: 0.7 },    
    { label: 'Z-Image-Turbo-Anime ZIT', air: 'civitai:2259646', defaultWeight: 0.7 },
    { label: 'PhotorealTouch ZIT', air: 'civitai:1464286', defaultWeight: 0.7 },
    { label: 'Tits Size Slider ZIT', air: 'civitai:2201141', defaultWeight: 0.7 },
];

/** 
 * Runware Background Removal Models.
 */
export const RUNWARE_RMBG_MODELS = [
    { label: 'BiRefNet (High Precision)', air: 'runware:112@9' },
    { label: 'Bria RMBG 2.0', air: 'bria:51@1' },
    { label: 'RemBG (Fast/Standard)', air: 'rembg:1@4' },
];

/** Runware Settings Defaults */
export const DEFAULT_RUNWARE_MODEL = 'runware:100@1';
export const DEFAULT_RUNWARE_USE_LAYER_DIFFUSE = true;
export const DEFAULT_RUNWARE_REMOVE_BG = false;
export const DEFAULT_RUNWARE_RMBG_MODEL = 'runware:112@9';

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

/** The new robust Style Package schema */
export const DEFAULT_STYLE_PACKAGE = {
    engine: 'pollinations',
    model: 'flux',
    useLayerDiffuse: false,
    resolutionOverride: null,
    template: DEFAULT_VN_STYLE_SUFFIX,
    negativePrompt: '',
    loras: []
};

/** Default Dynamic Blueprints for Model Parameters */
export const DEFAULT_BLUEPRINTS = {
    'flux': {
        "steps": { "type": "slider", "min": 1, "max": 50, "default": 20, "label": "Steps" },
        "guidance": { "type": "slider", "min": 1, "max": 20, "default": 3.5, "step": 0.1, "label": "Guidance" }
    },
    'sdxl': {
        "steps": { "type": "slider", "min": 1, "max": 100, "default": 30, "label": "Steps" },
        "cfgScale": { "type": "slider", "min": 1, "max": 30, "default": 7, "step": 0.5, "label": "CFG Scale" },
        "scheduler": { "type": "select", "options": ["Euler A", "DPM++ 2M Karras", "UniPC"], "default": "Euler A", "label": "Scheduler" }
    },
    'sd15': {
        "steps": { "type": "slider", "min": 1, "max": 100, "default": 20, "label": "Steps" },
        "cfgScale": { "type": "slider", "min": 1, "max": 30, "default": 7, "step": 0.5, "label": "CFG Scale" }
    }
};