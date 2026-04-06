/**
 * @file data/default-user/extensions/personalyze/imageCache.js
 * @stamp {"utc":"2026-04-06T00:00:00.000Z"}
 * @architectural-role IO Executor (Image)
 * @description
 * Owns all image-related IO for PersonaLyze.
 * 
 * Implements the Dual-Engine (Pollinations/HuggingFace) architecture. 
 * Handles prompt processing (stripping <lora> tags for Pollinations) and 
 * manages API communication with both providers.
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
 *     external_io: [findSecret, Pollinations API, Hugging Face API]
 */

import { getRequestHeaders } from '../../../../script.js';
import { findSecret } from '../../../secrets.js';
import { getCharacter } from './registry.js';
import {
    POLLINATIONS_BASE_URL,
    HUGGINGFACE_BASE_URL,
    DEFAULT_IMAGE_MODEL,
    DEFAULT_IMAGE_WIDTH,
    DEFAULT_IMAGE_HEIGHT,
    DEV_IMAGE_WIDTH,
    DEV_IMAGE_HEIGHT,
    DEFAULT_VN_STYLE_SUFFIX,
} from './defaults.js';
import { getSettings } from './settings.js';
import { log, warn, error as logError } from './utils/logger.js';
import { logCall } from './utils/callLog.js';

const SECRET_POLLINATIONS = 'api_key_pollinations';
const SECRET_HUGGINGFACE  = 'api_key_huggingface';
const FILE_PREFIX         = 'plz_';

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
    const secretName = provider === 'huggingface' ? SECRET_HUGGINGFACE : SECRET_POLLINATIONS;
    const key = await findSecret(secretName);
    if (!key) {
        throw new Error(
            `${provider === 'huggingface' ? 'Hugging Face' : 'Pollinations'} API key not found.\n` +
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
 * - HuggingFace: Strip just the brackets: <tag> -> "tag"
 * 
 * @param {string} anchor
 * @param {string} outfitDescription
 * @param {string} expressionDescription
 * @param {'pollinations'|'huggingface'} provider
 * @returns {string}
 */
export function buildPortraitPrompt(anchor, outfitDescription, expressionDescription, provider = 'pollinations') {
    const s = getSettings();
    const suffix = s.vnStyleSuffix ?? DEFAULT_VN_STYLE_SUFFIX;

    let processedOutfit = outfitDescription ?? '';

    if (provider === 'huggingface') {
        // Leave the triggers, just remove the brackets
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
    const headers = { 'Authorization': `Bearer ${key}` };
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
 * Fetch from Hugging Face with "Cold Start" (503) awareness.
 */
async function fetchHuggingFaceWithRetry(prompt, key, maxRetries = 5) {
    const s = getSettings();
    const url = `${HUGGINGFACE_BASE_URL}/${s.hfImageModel}`;
    const headers = {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
    };

    const body = JSON.stringify({
        inputs: prompt,
        parameters: {
            width: DEFAULT_IMAGE_WIDTH,
            height: DEFAULT_IMAGE_HEIGHT,
        },
        options: { wait_for_model: true }
    });

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const response = await fetch(url, { method: 'POST', headers, body });

        if (response.ok) return response;

        if (response.status === 503) {
            const data = await response.json();
            const waitTime = (data.estimated_time || 10) * 1000;
            warn('ImageCache', `HF Model loading. Waiting ${waitTime}ms (Attempt ${attempt + 1}/${maxRetries})`);
            await new Promise(r => setTimeout(r, Math.min(waitTime, 20000))); // Cap at 20s per retry
            continue;
        }

        const errText = await response.text();
        throw new Error(`Hugging Face API Error (${response.status}): ${errText}`);
    }
    throw new Error('Hugging Face model failed to load after multiple retries.');
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
    const res = await fetch('/api/backgrounds/all', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({}),
    });
    const data = await res.json();
    const allImages = data.images ?? [];
    const fileIndex = new Set(allImages.filter(f => f.startsWith(FILE_PREFIX)));
    return { fileIndex, allImages };
}

/**
 * Fetches a preview image. Respects the provided provider.
 */
export async function fetchPreviewBlob(prompt, characterId, provider = 'pollinations') {
    const logTag = `[${provider.toUpperCase()}]`;
    log('ImageCache', `${logTag} Preview Prompt:`, prompt);
    logCall('ImagePreview', `${logTag} ${prompt}`, null, null);

    const key = await getAuthKey(provider);
    let res;

    if (provider === 'huggingface') {
        res = await fetchHuggingFaceWithRetry(prompt, key);
    } else {
        const s = getSettings();
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
    const provider  = outfit?.provider ?? 'pollinations';
    const logTag    = `[${provider.toUpperCase()}]`;

    const prompt = buildPortraitPrompt(anchor, outfitDescription, expressionLabel, provider);
    logCall('PortraitGenerate', `${logTag} ${prompt}`, null, null);
    
    const key = await getAuthKey(provider);
    let imgRes;

    if (provider === 'huggingface') {
        imgRes = await fetchHuggingFaceWithRetry(prompt, key);
    } else {
        const s = getSettings();
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
    const file     = new File([blob], filename, { type: 'image/png' });

    const formData = new FormData();
    formData.append('avatar', file);

    const uploadRes = await fetch('/api/backgrounds/upload', {
        method: 'POST',
        headers: getRequestHeaders({ omitContentType: true }),
        body: formData,
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
        fetch('/api/backgrounds/delete', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ bg: f }),
        })
    ));

    return toDelete;
}