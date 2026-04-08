/**
 * @file data/default-user/extensions/personalyze/imageCache.js
 * @stamp {"utc":"2026-04-07T00:00:00.000Z"}
 * @architectural-role IO Executor (Image)
 * @description
 * Owns all image-related IO for Personalyze.
 * 
 * Implements the Multi-Engine architecture supporting Pollinations, 
 * Hugging Face (Router/Spaces), and Fal AI. Handles prompt processing 
 * and API communication with all providers via server-side proxies 
 * where necessary to avoid CORS restrictions.
 *
 * @api-declaration
 * buildFilenamePrefix(characterId, outfitKey, expressionKey) → string
 * findCachedImage(prefix, fileIndex) → string|null
 * buildPortraitPrompt(anchor, outfitDesc, exprDesc, provider) → string
 * fetchFileIndex() → Promise<{ fileIndex: Set<string>, allImages: string[] }>
 * fetchPreviewBlob(prompt, characterId, provider) → Promise<string>
 * generate(characterId, outfitKey, expressionKey, outfitDef, expressionDef, anchor) → Promise<string>
 *
 * @contract
 *   assertions:
 *     purity: IO
 *     state_ownership: []
 *     external_io: [findSecret, Pollinations API, Personalyze Plugin (HF/Fal)]
 */

import { getRequestHeaders } from '../../../../script.js';
import { findSecret } from '../../../secrets.js';
import { getCharacter } from './registry.js';
import {
    POLLINATIONS_BASE_URL,
    DEFAULT_IMAGE_MODEL,
    DEFAULT_IMAGE_WIDTH,
    DEFAULT_IMAGE_HEIGHT,
    DEV_IMAGE_WIDTH,
    DEV_IMAGE_HEIGHT,
    DEFAULT_VN_STYLE_SUFFIX,
} from './defaults.js';
import { getSettings } from './settings.js';
import { log, warn } from './utils/logger.js';
import { logCall } from './utils/callLog.js';

const SECRET_POLLINATIONS = 'api_key_pollinations';
const SECRET_HUGGINGFACE  = 'api_key_huggingface';
const SECRET_FAL          = 'api_key_fal';
const SECRET_PIAPI        = 'api_key_piapi';
const FILE_PREFIX         = 'plz_';

export const PLZ_IMAGE_FOLDER = 'personalyze';

// ─── Naming ───────────────────────────────────────────────────────────────────

export function buildFilenamePrefix(characterId, outfitKey, expressionKey) {
    return `${FILE_PREFIX}${characterId}_${outfitKey}_${expressionKey}_`;
}

export function findCachedImage(prefix, fileIndex) {
    let best = null;
    for (const f of fileIndex) {
        if (f.startsWith(prefix) && (!best || f > best)) best = f;
    }
    return best;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function getAuthKey(provider) {
    let secretName;
    switch (provider) {
        case 'huggingface':
        case 'hf-space':    secretName = SECRET_HUGGINGFACE; break;
        case 'fal':         secretName = SECRET_FAL; break;
        case 'piapi':       secretName = SECRET_PIAPI; break;
        default:            secretName = SECRET_POLLINATIONS; break;
    }

    const key = await findSecret(secretName);
    if (!key && provider !== 'pollinations') {
        throw new Error(
            `${provider.toUpperCase()} API key not found.\n` +
            `Ensure it is set in PLZ settings / ST secrets.`
        );
    }
    return key;
}

// ─── Prompt Builder ───────────────────────────────────────────────────────────

/**
 * Assembles the portrait prompt and applies provider-specific transformations.
 * 
 * BRACKET LOGIC:
 * - Pollinations: Strip brackets and their contents: <tag> -> ""
 * - HuggingFace/Fal: Strip just the brackets: <tag> -> "tag" (keeps trigger words)
 * 
 * @param {string} anchor
 * @param {string} outfitDescription
 * @param {string} expressionDescription
 * @param {'pollinations'|'huggingface'|'hf-space'|'fal'} provider
 * @returns {string}
 */
export function buildPortraitPrompt(anchor, outfitDescription, expressionDescription, provider = 'pollinations') {
    const s = getSettings();
    const suffix = s.vnStyleSuffix ?? DEFAULT_VN_STYLE_SUFFIX;

    let processedOutfit = outfitDescription ?? '';

    if (provider !== 'pollinations') {
        // Leave the trigger words, just remove the brackets
        processedOutfit = processedOutfit.replace(/[<>]/g, '');
    } else {
        // Completely remove the bracketed tags
        processedOutfit = processedOutfit.replace(/<[^>]+>/g, '');
    }

    const hasVars = /\{\{(character|outfit|expression)\}\}/.test(suffix);
    let fullPrompt;

    if (hasVars) {
        fullPrompt = suffix
            .replace(/\{\{character\}\}/g,  anchor              ?? '')
            .replace(/\{\{outfit\}\}/g,      processedOutfit    ?? '')
            .replace(/\{\{expression\}\}/g,  expressionDescription ?? '')
            .replace(/(,\s*)+,/g, ',')
            .replace(/^[,\s]+|[,\s]+$/g, '')
            .trim();
    } else {
        fullPrompt = [anchor, processedOutfit, expressionDescription, suffix]
            .filter(Boolean)
            .join(', ');
    }

    return fullPrompt;
}

// ─── Network IO ───────────────────────────────────────────────────────────────

/**
 * Fetch from Pollinations with standard retries.
 */
async function fetchPollinationsWithRetry(url, key, maxRetries = 3) {
    const headers = key ? { 'Authorization': `Bearer ${key}` } : {};
    let lastResponse;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetch(url, { headers });
            if (response.status < 500) return response;
            lastResponse = response;
        } catch (err) {
            if (attempt === maxRetries) throw err;
        }
        const delay = 1000 * Math.pow(2, attempt);
        await new Promise(r => setTimeout(r, delay));
    }
    return lastResponse;
}

/**
 * Fetch from a HuggingFace Gradio Space via the personalyze server plugin.
 */
async function fetchSpaceWithRetry(prompt, maxRetries = 3) {
    const s = getSettings();
    const spaceId = s.hfSpaceId;

    if (!spaceId) {
        throw new Error('No HuggingFace Space ID configured. Set one in the Engines modal (HF tab).');
    }

    const body = JSON.stringify({
        spaceId,
        prompt,
        width: DEFAULT_IMAGE_WIDTH,
        height: DEFAULT_IMAGE_HEIGHT,
    });

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const response = await fetch('/api/plugins/personalyze/space-generate', {
            method: 'POST',
            headers: getRequestHeaders(),
            body,
        });

        if (response.ok) return response;

        if (response.status === 503) {
            const data = await response.json().catch(() => ({}));
            const waitTime = (data.estimated_time || 15) * 1000;
            warn('ImageCache', `Space loading. Waiting ${waitTime}ms (Attempt ${attempt + 1}/${maxRetries})`);
            await new Promise(r => setTimeout(r, Math.min(waitTime, 30000)));
            continue;
        }

        const errText = await response.text();
        throw new Error(`Space API Error (${response.status}): ${errText}`);
    }
    throw new Error('HuggingFace Space failed to respond after multiple retries.');
}

/**
 * Fetch from Hugging Face via the personalyze server plugin.
 */
async function fetchHuggingFaceWithRetry(prompt, maxRetries = 5) {
    const s = getSettings();

    const body = JSON.stringify({
        provider: s.hfProvider,
        model: s.hfImageModel,
        prompt,
        width: DEFAULT_IMAGE_WIDTH,
        height: DEFAULT_IMAGE_HEIGHT,
    });

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const response = await fetch('/api/plugins/personalyze/hf-generate', {
            method: 'POST',
            headers: getRequestHeaders(),
            body,
        });

        if (response.ok) return response;

        if (response.status === 503) {
            const data = await response.json();
            const waitTime = (data.estimated_time || 10) * 1000;
            warn('ImageCache', `HF Model loading. Waiting ${waitTime}ms (Attempt ${attempt + 1}/${maxRetries})`);
            await new Promise(r => setTimeout(r, Math.min(waitTime, 20000)));
            continue;
        }

        const errText = await response.text();
        throw new Error(`Hugging Face API Error (${response.status}): ${errText}`);
    }
    throw new Error('Hugging Face model failed to load after multiple retries.');
}

/**
 * Fetch from PiAPI via the personalyze server plugin.
 */
async function fetchPiAPIWithRetry(prompt, maxRetries = 3) {
    const s = getSettings();

    const body = JSON.stringify({
        model: s.piapiModel,
        prompt,
        width: DEFAULT_IMAGE_WIDTH,
        height: DEFAULT_IMAGE_HEIGHT,
    });

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const response = await fetch('/api/plugins/personalyze/piapi-generate', {
            method: 'POST',
            headers: getRequestHeaders(),
            body,
        });

        if (response.ok) return response;

        const errText = await response.text();

        if (response.status < 500) {
            throw new Error(`PiAPI Error (${response.status}): ${errText}`);
        }

        if (attempt < maxRetries) {
            const delay = 1000 * Math.pow(2, attempt);
            warn('ImageCache', `PiAPI server error ${response.status}. Retrying in ${delay}ms (Attempt ${attempt + 1}/${maxRetries})`);
            await new Promise(r => setTimeout(r, delay));
        }
    }
    throw new Error('PiAPI failed to respond after multiple retries.');
}

/**
 * Fetch from Fal AI via the personalyze server plugin.
 */
async function fetchFalWithRetry(prompt, maxRetries = 3) {
    const s = getSettings();

    const body = JSON.stringify({
        model: s.falModel,
        prompt,
        width: DEFAULT_IMAGE_WIDTH,
        height: DEFAULT_IMAGE_HEIGHT,
    });

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const response = await fetch('/api/plugins/personalyze/fal-generate', {
            method: 'POST',
            headers: getRequestHeaders(),
            body,
        });

        if (response.ok) return response;

        const errText = await response.text();

        if (response.status < 500) {
            throw new Error(`Fal AI API Error (${response.status}): ${errText}`);
        }

        if (attempt < maxRetries) {
            const delay = 1000 * Math.pow(2, attempt);
            warn('ImageCache', `Fal AI server error ${response.status}. Retrying in ${delay}ms (Attempt ${attempt + 1}/${maxRetries})`);
            await new Promise(r => setTimeout(r, delay));
        }
    }
    throw new Error('Fal AI failed to respond after multiple retries.');
}

async function validateImageResponse(response) {
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Image API Error (${response.status}): ${text}`);
    }
    const contentType = response.headers.get('Content-Type');
    if (!contentType || !contentType.startsWith('image/')) {
        throw new Error(`Expected image, but received ${contentType}`);
    }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function fetchFileIndex() {
    const res = await fetch('/api/images/list', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ folder: PLZ_IMAGE_FOLDER }),
    });
    const allImages = await res.json();
    const fileIndex = new Set(allImages.filter(f => f.startsWith(FILE_PREFIX)));
    return { fileIndex, allImages };
}

/**
 * Fetches a preview image.
 */
export async function fetchPreviewBlob(prompt, characterId, provider = 'pollinations') {
    const logTag = `[${provider.toUpperCase()}]`;
    log('ImageCache', `${logTag} Preview Prompt:`, prompt);
    logCall('ImagePreview', `${logTag} ${prompt}`, null, null);

    let res;
    if (provider === 'piapi') {
        res = await fetchPiAPIWithRetry(prompt);
    } else if (provider === 'fal') {
        res = await fetchFalWithRetry(prompt);
    } else if (provider === 'hf-space') {
        res = await fetchSpaceWithRetry(prompt);
    } else if (provider === 'huggingface') {
        res = await fetchHuggingFaceWithRetry(prompt);
    } else {
        const s = getSettings();
        const key = await getAuthKey('pollinations');
        const seed = getCharacter(characterId)?.seed ?? 1;
        const params = new URLSearchParams({
            width: String(DEV_IMAGE_WIDTH),
            height: String(DEV_IMAGE_HEIGHT),
            model: s.imageModel ?? DEFAULT_IMAGE_MODEL,
            nologo: 'true',
            seed: String(seed),
        });
        const url = `${POLLINATIONS_BASE_URL}/image/${encodeURIComponent(prompt)}?${params.toString()}`;
        res = await fetchPollinationsWithRetry(url, key);
    }

    await validateImageResponse(res);
    return URL.createObjectURL(await res.blob());
}

/**
 * Generates and uploads a full-res portrait.
 */
export async function generate(
    characterId,
    outfitKey,
    expressionKey,
    outfitDescription,
    expressionLabel,
    anchor
) {
    const character = getCharacter(characterId);
    const outfit    = character?.outfits[outfitKey];
    
    let provider = outfit?.provider ?? 'pollinations';

    // If using Hugging Face, check the global engine setting
    if (provider === 'huggingface') {
        const s = getSettings();
        provider = s.hfEngine === 'space' ? 'hf-space' : 'huggingface';
    }

    const logTag = `[${provider.toUpperCase()}]`;
    const prompt = buildPortraitPrompt(anchor, outfitDescription, expressionLabel, provider);
    logCall('PortraitGenerate', `${logTag} ${prompt}`, null, null);
    
    let imgRes;

    if (provider === 'piapi') {
        imgRes = await fetchPiAPIWithRetry(prompt);
    } else if (provider === 'fal') {
        imgRes = await fetchFalWithRetry(prompt);
    } else if (provider === 'hf-space') {
        imgRes = await fetchSpaceWithRetry(prompt);
    } else if (provider === 'huggingface') {
        imgRes = await fetchHuggingFaceWithRetry(prompt);
    } else {
        const s = getSettings();
        const key = await getAuthKey('pollinations');
        const devMode = s.devMode ?? false;
        const width  = devMode ? DEV_IMAGE_WIDTH  : DEFAULT_IMAGE_WIDTH;
        const height = devMode ? DEV_IMAGE_HEIGHT : DEFAULT_IMAGE_HEIGHT;
        const seed   = character?.seed ?? 1;
        
        const params = new URLSearchParams({
            width: String(width),
            height: String(height),
            model: s.imageModel ?? DEFAULT_IMAGE_MODEL,
            nologo: 'true',
            seed: String(seed),
            safe: 'false',
        });
        const url = `${POLLINATIONS_BASE_URL}/image/${encodeURIComponent(prompt)}?${params.toString()}`;
        imgRes = await fetchPollinationsWithRetry(url, key);
    }

    await validateImageResponse(imgRes);

    const filename = `${buildFilenamePrefix(characterId, outfitKey, expressionKey)}${Date.now()}.png`;
    const blob     = await imgRes.blob();

    const base64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.readAsDataURL(blob);
    });

    const uploadRes = await fetch('/api/images/upload', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({
            image: base64,
            format: 'png',
            filename,
            ch_name: PLZ_IMAGE_FOLDER,
        }),
    });

    if (!uploadRes.ok) {
        throw new Error(`Portrait upload failed: ${uploadRes.status}`);
    }

    return filename;
}

export async function flushCharacterImages(characterId) {
    const { fileIndex } = await fetchFileIndex();
    const prefix = `${FILE_PREFIX}${characterId}_`;
    const toDelete = [...fileIndex].filter(f => f.startsWith(prefix));

    await Promise.all(toDelete.map(f =>
        fetch('/api/images/delete', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ path: `user/images/${PLZ_IMAGE_FOLDER}/${f}` }),
        })
    ));

    return toDelete;
}