/**
 * @file data/default-user/extensions/personalyze/imageCache.js
 * @stamp {"utc":"2026-04-10T14:20:00.000Z"}
 * @architectural-role IO Executor (Image)
 * @description
 * Owns all image-related network and filesystem IO for Personalyze.
 * Supports Multi-Engine architecture (Pollinations, HF, Fal, PiAPI).
 * 
 * @api-declaration
 * buildFilenamePrefix(characterId, tag, emotion) → string
 * findCachedImage(prefix, fileIndex) → string|null
 * fetchFileIndex() → Promise<{ fileIndex: Set<string>, allImages: string[] }>
 * fetchPreviewBlob(prompt, characterId, provider, seed) → Promise<string>
 * generate(characterId, tag, emotion, subjectPrompt, emotionLabel, anchor, seed, provider) → Promise<string>
 * 
 * @contract
 *   assertions:
 *     purity: IO Executor
 *     state_ownership: []
 *     external_io: [findSecret, Image APIs, Personalyze Plugin, fetch]
 */

import { getRequestHeaders } from '../../../../script.js';
import { findSecret } from '../../../secrets.js';
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
import { log, warn, error } from './utils/logger.js';
import { logCall, logPatchLast } from './utils/callLog.js';

const SECRET_POLLINATIONS = 'api_key_pollinations';
const SECRET_HUGGINGFACE  = 'api_key_huggingface';
const SECRET_FAL          = 'api_key_fal';
const SECRET_PIAPI        = 'api_key_piapi';
const FILE_PREFIX         = 'plz_';

export const PLZ_IMAGE_FOLDER = 'personalyze';

// ─── Naming ───────────────────────────────────────────────────────────────────

export function buildFilenamePrefix(characterId, tag, emotion) {
    return `${FILE_PREFIX}${characterId}_${tag}_${emotion}_`;
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
    const map = { 
        huggingface: SECRET_HUGGINGFACE, 'hf-space': SECRET_HUGGINGFACE, 
        fal: SECRET_FAL, piapi: SECRET_PIAPI, pollinations: SECRET_POLLINATIONS 
    };
    const key = await findSecret(map[provider]);
    if (!key && provider !== 'pollinations') throw new Error(`${provider.toUpperCase()} key missing.`);
    return key;
}

// ─── Networking ───────────────────────────────────────────────────────────────

async function validateImageResponse(response) {
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Image API Error (${response.status}): ${text.slice(0,100)}`);
    }
    const contentType = response.headers.get('Content-Type') ?? '';
    // Reject only clearly wrong types (error pages, JSON blobs).
    // Allow image/*, application/octet-stream, and missing content-type (some CDNs omit it).
    if (contentType.startsWith('text/') || contentType.startsWith('application/json')) {
        throw new Error(`Received ${contentType || 'unknown content-type'} instead of image.`);
    }
}

/** Wraps the subject prompt with global style tags from settings. */
function finalizePrompt(subjectPrompt) {
    const s = getSettings();
    const style = s.vnStyleSuffix || '';
    // If the style suffix uses variables, we assume they were already resolved 
    // in promptCompiler or we just append the style.
    return `${subjectPrompt}, ${style}`.replace(/(,\s*)+/g, ', ').trim();
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function fetchFileIndex() {
    const res = await fetch('/api/images/list', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ folder: PLZ_IMAGE_FOLDER }),
    });
    const allImages = await res.json();
    return { fileIndex: new Set(allImages.filter(f => f.startsWith(FILE_PREFIX))), allImages };
}

export async function fetchPreviewBlob(prompt, characterId, provider = 'pollinations', seed = 1) {
    const fullPrompt = finalizePrompt(prompt);
    log('ImageCache', `Preview [${provider}]: ${fullPrompt}`);

    let res;
    if (provider === 'fal') {
        res = await fetch('/api/plugins/personalyze/fal-generate', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ model: getSettings().falModel, prompt: fullPrompt, width: DEV_IMAGE_WIDTH, height: DEV_IMAGE_HEIGHT }),
        });
    } else if (provider === 'huggingface') {
        res = await fetch('/api/plugins/personalyze/hf-generate', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ provider: getSettings().hfProvider, model: getSettings().hfImageModel, prompt: fullPrompt, width: DEV_IMAGE_WIDTH, height: DEV_IMAGE_HEIGHT }),
        });
    } else {
        const s = getSettings();
        const key = await getAuthKey('pollinations');
        const params = new URLSearchParams({ width: String(DEV_IMAGE_WIDTH), height: String(DEV_IMAGE_HEIGHT), model: s.imageModel ?? DEFAULT_IMAGE_MODEL, nologo: 'true', seed: String(seed) });
        res = await fetch(`${POLLINATIONS_BASE_URL}/image/${encodeURIComponent(fullPrompt)}?${params.toString()}`, { headers: key ? { 'Authorization': `Bearer ${key}` } : {} });
    }

    await validateImageResponse(res);
    return URL.createObjectURL(await res.blob());
}

export async function generate(characterId, tag, emotion, subjectPrompt, emotionLabel, anchor, seed = 1, provider = 'pollinations') {
    const fullPrompt = finalizePrompt(subjectPrompt);
    logCall('PortraitGenerate', `[${provider}]\n${fullPrompt}`, null, null);

    try {
        let imgRes;
        const s = getSettings();
        const w = s.devMode ? DEV_IMAGE_WIDTH : DEFAULT_IMAGE_WIDTH;
        const h = s.devMode ? DEV_IMAGE_HEIGHT : DEFAULT_IMAGE_HEIGHT;

        if (provider === 'fal') {
            imgRes = await fetch('/api/plugins/personalyze/fal-generate', {
                method: 'POST', headers: getRequestHeaders(),
                body: JSON.stringify({ model: s.falModel, prompt: fullPrompt, width: w, height: h }),
            });
        } else if (provider === 'piapi') {
            imgRes = await fetch('/api/plugins/personalyze/piapi-generate', {
                method: 'POST', headers: getRequestHeaders(),
                body: JSON.stringify({ model: s.piapiModel, prompt: fullPrompt, width: w, height: h, seed }),
            });
        } else {
            const key = await getAuthKey('pollinations');
            const params = new URLSearchParams({ width: String(w), height: String(h), model: s.imageModel ?? DEFAULT_IMAGE_MODEL, nologo: 'true', seed: String(seed), safe: 'false' });
            imgRes = await fetch(`${POLLINATIONS_BASE_URL}/image/${encodeURIComponent(fullPrompt)}?${params.toString()}`, { headers: key ? { 'Authorization': `Bearer ${key}` } : {} });
        }

        await validateImageResponse(imgRes);

        // Read PiAPI task metadata forwarded by the plugin (piapi provider only)
        const piapiMetaHeader = imgRes.headers.get('X-PiAPI-Meta');
        const piapiMeta = piapiMetaHeader ? (() => {
            try { return JSON.parse(piapiMetaHeader); } catch { return null; }
        })() : null;

        const filename = `${buildFilenamePrefix(characterId, tag, emotion)}${Date.now()}.png`;
        const blob = await imgRes.blob();
        const base64 = await new Promise(r => {
            const fr = new FileReader(); fr.onload = () => r(fr.result.split(',')[1]); fr.readAsDataURL(blob);
        });

        await fetch('/api/images/upload', {
            method: 'POST', headers: getRequestHeaders(),
            body: JSON.stringify({ image: base64, format: 'png', filename, ch_name: PLZ_IMAGE_FOLDER }),
        });

        logPatchLast(filename, null, piapiMeta);
        return filename;
    } catch (err) {
        logPatchLast(null, err.message);
        throw err;
    }
}

export async function flushCharacterImages(characterId) {
    const { fileIndex } = await fetchFileIndex();
    const prefix = `${FILE_PREFIX}${characterId}_`;
    const toDelete = [...fileIndex].filter(f => f.startsWith(prefix));
    await Promise.all(toDelete.map(f =>
        fetch('/api/images/delete', {
            method: 'POST', headers: getRequestHeaders(),
            body: JSON.stringify({ path: `user/images/${PLZ_IMAGE_FOLDER}/${f}` }),
        })
    ));
    return toDelete;
}