/**
 * @file data/default-user/extensions/personalyze/imageCache.js
 * @stamp {"utc":"2026-04-11T09:00:00.000Z"}
 * @architectural-role IO Executor (Image)
 * @description
 * Owns all image-related network and filesystem IO for Personalyze.
 * Supports Multi-Engine architecture (Pollinations, Fal, PiAPI).
 * 
 * Updated to support the {{pose}} variable in portrait style templates.
 * 
 * @api-declaration
 * buildFilenamePrefix(characterId, tag, emotion) → string
 * findCachedImage(prefix, fileIndex) → string|null
 * fetchFileIndex() → Promise<{ fileIndex: Set<string>, allImages: string[] }>
 * fetchPreviewBlob(prompt, characterId, provider, seed, emotion, pose) → Promise<string>
 * generate(characterId, tag, emotion, subjectPrompt, emotionLabel, poseLabel, anchor, seed, provider) → Promise<string>
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
import { getSettings, getMetaSettings } from './settings.js';
import { state } from './state.js';
import { log, warn, error } from './utils/logger.js';
import { logCall, logPatchLast } from './utils/callLog.js';

const SECRET_POLLINATIONS = 'api_key_pollinations';
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

/**
 * Resolves the portrait style template for a given character.
 * Fallback chain: character pin → library default → profile vnStyleSuffix → hardcoded default.
 *
 * @param {string} characterId
 * @returns {string}
 */
function resolveStyle(characterId) {
    const meta = getMetaSettings();
    const lib = meta.styleLibrary;
    if (lib) {
        const pin = state.chatCharacters[characterId]?.styleName;
        if (pin && lib[pin]) return lib[pin];
        const def = meta.defaultStyleName;
        if (def && lib[def]) return lib[def];
    }
    return getSettings().vnStyleSuffix || DEFAULT_VN_STYLE_SUFFIX;
}

/**
 * Builds the final image generation prompt from the compiled subject and style template.
 *
 * If the style contains {{variables}}, they are substituted and the result is
 * used as the complete prompt. If it contains no variables, it is appended as a
 * style suffix to the compiled subject prompt (legacy behaviour).
 *
 * @param {string} subjectPrompt - Compiled layers description from promptCompiler.
 * @param {string} [anchor]      - Character's permanent identity anchor.
 * @param {string} [emotion]     - Current emotion label.
 * @param {string} [pose]        - Current pose label.
 * @param {string} [style]       - Resolved style template string.
 */
function finalizePrompt(subjectPrompt, anchor = '', emotion = '', pose = '', style = '') {
    const effectiveStyle = style || getSettings().vnStyleSuffix || '';

    if (effectiveStyle.includes('{{')) {
        return effectiveStyle
            .replace(/\{\{identity_anchor\}\}/g, anchor)
            .replace(/\{\{layers_description\}\}/g, subjectPrompt)
            .replace(/\{\{emotion\}\}/g, emotion)
            .replace(/\{\{pose\}\}/g, pose)
            .replace(/(,\s*)+/g, ', ')
            .trim();
    }

    // Legacy: no variables — append as style suffix
    return `${subjectPrompt}, ${effectiveStyle}`.replace(/(,\s*)+/g, ', ').trim();
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

export async function fetchPreviewBlob(prompt, characterId, provider = 'pollinations', seed = 1, emotion = '', pose = '') {
    const fullPrompt = finalizePrompt(prompt, '', emotion, pose, resolveStyle(characterId));
    log('ImageCache', `Preview [${provider}]: ${fullPrompt}`);

    let res;
    if (provider === 'fal') {
        res = await fetch('/api/plugins/personalyze/fal-generate', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ model: getSettings().falModel, prompt: fullPrompt, width: DEV_IMAGE_WIDTH, height: DEV_IMAGE_HEIGHT }),
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

/**
 * Dispatches a portrait generation status event if showPortraitStatus is enabled.
 * Consumed by portrait.js and vnPanel.js to drive the per-character progress bar.
 */
function _dispatchPortraitStatus(characterId, detail) {
    if (!getSettings().showPortraitStatus) return;
    document.dispatchEvent(new CustomEvent('plz:portrait-status', { detail: { characterId, ...detail } }));
}

export async function generate(characterId, tag, emotion, subjectPrompt, emotionLabel, poseLabel, anchor, seed = 1, provider = 'pollinations') {
    const fullPrompt = finalizePrompt(subjectPrompt, anchor, emotionLabel, poseLabel, resolveStyle(characterId));
    logCall('PortraitGenerate', `[${provider}]\n${fullPrompt}`, null, null);

    try {
        let imgRes;
        let piapiMeta = null;
        const s = getSettings();
        const w = s.devMode ? DEV_IMAGE_WIDTH : DEFAULT_IMAGE_WIDTH;
        const h = s.devMode ? DEV_IMAGE_HEIGHT : DEFAULT_IMAGE_HEIGHT;

        if (provider === 'fal') {
            _dispatchPortraitStatus(characterId, { status: 'generating' });
            imgRes = await fetch('/api/plugins/personalyze/fal-generate', {
                method: 'POST', headers: getRequestHeaders(),
                body: JSON.stringify({ model: s.falModel, prompt: fullPrompt, width: w, height: h }),
            });
        } else if (provider === 'piapi') {
            // Step 1: Submit — returns {task_id} immediately
            _dispatchPortraitStatus(characterId, { status: 'generating' });
            const submitRes = await fetch('/api/plugins/personalyze/piapi-generate', {
                method: 'POST', headers: getRequestHeaders(),
                body: JSON.stringify({ model: s.piapiModel, prompt: fullPrompt, width: w, height: h, seed }),
            });
            if (!submitRes.ok) {
                const errData = await submitRes.json().catch(() => ({}));
                throw new Error(errData.error || `PiAPI submit failed (${submitRes.status})`);
            }
            const { task_id } = await submitRes.json();
            _dispatchPortraitStatus(characterId, { status: 'pending' });

            // Step 2: Poll until done. Fixed timeout and interval — independent of each other.
            const POLL_INTERVAL_MS = 1500;
            const POLL_TIMEOUT_MS  = 120_000;
            const deadline = Date.now() + POLL_TIMEOUT_MS;
            let imageUrl = null;
            while (Date.now() < deadline) {
                await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
                const statusRes = await fetch(`/api/plugins/personalyze/piapi-status/${task_id}`, {
                    headers: getRequestHeaders(),
                });
                if (!statusRes.ok) {
                    const errData = await statusRes.json().catch(() => ({}));
                    throw new Error(errData.error || `PiAPI status check failed (${statusRes.status})`);
                }
                const statusData = await statusRes.json();
                _dispatchPortraitStatus(characterId, { status: statusData.status });
                if (/^(completed|success)$/i.test(statusData.status)) {
                    imageUrl = statusData.image_url;
                    piapiMeta = statusData.meta ?? null;
                    break;
                }
                if (/^failed$/i.test(statusData.status)) {
                    throw new Error(`PiAPI task failed: ${statusData.error || 'unknown error'}`);
                }
            }
            if (!imageUrl) {
                throw new Error(`PiAPI task ${task_id} timed out after ${POLL_TIMEOUT_MS / 1000}s`);
            }

            // Step 3: Fetch image binary through concurrency-limited proxy
            imgRes = await fetch('/api/plugins/personalyze/piapi-fetch', {
                method: 'POST', headers: getRequestHeaders(),
                body: JSON.stringify({ image_url: imageUrl }),
            });
        } else {
            _dispatchPortraitStatus(characterId, { status: 'generating' });
            const key = await getAuthKey('pollinations');
            const params = new URLSearchParams({ width: String(w), height: String(h), model: s.imageModel ?? DEFAULT_IMAGE_MODEL, nologo: 'true', seed: String(seed), safe: 'false' });
            imgRes = await fetch(`${POLLINATIONS_BASE_URL}/image/${encodeURIComponent(fullPrompt)}?${params.toString()}`, { headers: key ? { 'Authorization': `Bearer ${key}` } : {} });
        }

        await validateImageResponse(imgRes);

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
        _dispatchPortraitStatus(characterId, { status: 'failed', error: err.message });
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