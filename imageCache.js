/**
 * @file data/default-user/extensions/personalyze/imageCache.js
 * @stamp {"utc":"2026-04-15T10:30:00.000Z"}
 * @architectural-role IO Executor (Image)
 * @description
 * Owns all image-related network and filesystem IO for Personalyze.
 * Supports Multi-Engine architecture (Pollinations, Fal, PiAPI).
 * 
 * Updated for Generation Economy:
 * 1. resolveDimensions() handles Dynamic Resolution tiers based on DOM card size.
 * 2. deleteFiles() provides pure IO for asset cleanup.
 * 3. generate() supports forceCacheBust for manual refreshes.
 * 
 * @api-declaration
 * buildFilenamePrefix(characterId, tag, emotion) → string
 * findCachedImage(prefix, fileIndex) → string|null
 * fetchFileIndex() → Promise<{ fileIndex: Set<string>, allImages: string[] }>
 * fetchPreviewBlob(prompt, characterId, provider, seed, emotion, pose) → Promise<string>
 * generate(characterId, tag, emotion, subjectPrompt, emotionLabel, poseLabel, anchor, seed, provider, forceCacheBust) → Promise<string>
 * deleteFiles(filenames) → Promise<string[]>
 * flushAllImages() → Promise<string[]>
 * flushChatImages(characterIds) → Promise<string[]>
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
    PLZ_IMAGE_FOLDER,
    DEFAULT_IMAGE_MODEL,
    RESOLUTION_TIERS,
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

// ─── Dimensions ───────────────────────────────────────────────────────────────

/**
 * Resolves the target generation dimensions.
 * Respects devMode, user-selected max tiers, and Dynamic Resolution DOM-measuring.
 * 
 * @param {string} characterId 
 * @returns {{ width: number, height: number }}
 */
function resolveDimensions(characterId) {
    const s = getSettings();
    if (s.devMode) return { width: DEV_IMAGE_WIDTH, height: DEV_IMAGE_HEIGHT };
    
    const tier = RESOLUTION_TIERS[s.maxResolution] || RESOLUTION_TIERS.MAX;
    if (!s.dynamicResolution) return tier;

    // Measurement logic: find the card in the DOM to see its current display footprint
    const el = document.querySelector(`.plz-portrait-card[data-id="${CSS.escape(characterId)}"]`);
    if (!el || el.clientWidth === 0) return tier; // Fallback to max if hidden or not rendered

    // Snap to multiples of 32 for AI generation safety, clamp between 256x384 and the user's max tier
    const targetW = Math.max(256, Math.min(Math.ceil(el.clientWidth / 32) * 32, tier.width));
    const targetH = Math.max(384, Math.min(Math.ceil(el.clientHeight / 32) * 32, tier.height));
    
    return { width: targetW, height: targetH };
}

// ─── Networking ───────────────────────────────────────────────────────────────

async function validateImageResponse(response) {
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Image API Error (${response.status}): ${text.slice(0,100)}`);
    }
    const contentType = response.headers.get('Content-Type') ?? '';
    if (contentType.startsWith('text/') || contentType.startsWith('application/json')) {
        throw new Error(`Received ${contentType || 'unknown content-type'} instead of image.`);
    }
}

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

function _dispatchPortraitStatus(characterId, detail) {
    if (!getSettings().showPortraitStatus) return;
    document.dispatchEvent(new CustomEvent('plz:portrait-status', { detail: { characterId, ...detail } }));
}

async function _pollPiapiTask(taskId, timeoutMs, onStatus) {
    const POLL_INTERVAL_MS = 1500;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
        const statusRes = await fetch(`/api/plugins/personalyze/piapi-status/${taskId}`, {
            headers: getRequestHeaders(),
        });
        if (!statusRes.ok) {
            const errData = await statusRes.json().catch(() => ({}));
            throw new Error(errData.error || `PiAPI status check failed (${statusRes.status})`);
        }
        const statusData = await statusRes.json();
        onStatus(statusData.status);
        if (/^(completed|success)$/i.test(statusData.status)) {
            return {
                image_url:    statusData.image_url,
                image_base64: statusData.image_base64 ?? null,
                meta:         statusData.meta ?? null,
            };
        }
        if (/^failed$/i.test(statusData.status)) {
            throw new Error(`PiAPI task failed: ${statusData.error || 'unknown error'}`);
        }
    }
    throw new Error(`PiAPI task ${taskId} timed out after ${timeoutMs / 1000}s`);
}

export async function generate(characterId, tag, emotion, subjectPrompt, emotionLabel, poseLabel, anchor, seed = 1, provider = 'pollinations', forceCacheBust = false) {
    const fullPrompt = finalizePrompt(subjectPrompt, anchor, emotionLabel, poseLabel, resolveStyle(characterId));
    logCall('PortraitGenerate', `[${provider}]\n${fullPrompt}`, null, null);

    const POLL_TIMEOUT_MS = 120_000;
    const RMBG_TIMEOUT_MS =  60_000;

    try {
        const s = getSettings();
        const { width: w, height: h } = resolveDimensions(characterId);

        _dispatchPortraitStatus(characterId, { status: 'generating' });

        let sourceUrl    = null;
        let imgRes       = null;
        let piapiMeta    = null;
        let fallbackB64  = null;

        if (provider === 'fal') {
            imgRes = await fetch('/api/plugins/personalyze/fal-generate', {
                method: 'POST', headers: getRequestHeaders(),
                body: JSON.stringify({ model: s.falModel, prompt: fullPrompt, width: w, height: h }),
            });
        } else if (provider === 'piapi') {
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

            const genResult = await _pollPiapiTask(task_id, POLL_TIMEOUT_MS,
                status => _dispatchPortraitStatus(characterId, { status }));
            sourceUrl = genResult.image_url;
            piapiMeta = genResult.meta;

        } else {
            const key = await getAuthKey('pollinations');
            const params = new URLSearchParams({
                width: String(w), height: String(h),
                model: s.imageModel ?? DEFAULT_IMAGE_MODEL,
                nologo: 'true', seed: String(seed), safe: 'false',
            });
            
            if (forceCacheBust) {
                params.append('cb', String(Date.now()));
            }

            const polRes = await fetch(
                `${POLLINATIONS_BASE_URL}/image/${encodeURIComponent(fullPrompt)}?${params.toString()}`,
                { headers: key ? { 'Authorization': `Bearer ${key}` } : {} },
            );
            if (s.piapiRemoveBackground) {
                await validateImageResponse(polRes);
                const blob = await polRes.blob();
                fallbackB64 = await new Promise(r => {
                    const fr = new FileReader(); fr.onload = () => r(fr.result.split(',')[1]); fr.readAsDataURL(blob);
                });
            } else {
                imgRes = polRes;
            }
        }

        if (s.piapiRemoveBackground && (sourceUrl || fallbackB64)) {
            try {
                _dispatchPortraitStatus(characterId, { status: 'removing_bg' });
                const rmbgBody = fallbackB64
                    ? { image_base64: fallbackB64, rmbg_model: s.piapiRmbgModel }
                    : { image_url: sourceUrl,      rmbg_model: s.piapiRmbgModel };
                const rmbgSubmitRes = await fetch('/api/plugins/personalyze/piapi-remove-bg', {
                    method: 'POST', headers: getRequestHeaders(),
                    body: JSON.stringify(rmbgBody),
                });
                if (!rmbgSubmitRes.ok) {
                    const errData = await rmbgSubmitRes.json().catch(() => ({}));
                    throw new Error(errData.error || `RMBG submit failed (${rmbgSubmitRes.status})`);
                }
                const { task_id: rmbgTaskId } = await rmbgSubmitRes.json();
                const rmbgResult = await _pollPiapiTask(rmbgTaskId, RMBG_TIMEOUT_MS,
                    () => _dispatchPortraitStatus(characterId, { status: 'removing_bg' }));
                sourceUrl = rmbgResult.image_url;
                fallbackB64 = null;
            } catch (rmbgErr) {
                warn('ImageCache', `Background removal failed: ${rmbgErr.message}`);
            }
        }

        if (!imgRes) {
            if (fallbackB64) {
                // Re-use binary already in memory
            } else {
                imgRes = await fetch('/api/plugins/personalyze/piapi-fetch', {
                    method: 'POST', headers: getRequestHeaders(),
                    body: JSON.stringify({ image_url: sourceUrl }),
                });
            }
        }

        const filename = `${buildFilenamePrefix(characterId, tag, emotion)}${Date.now()}.png`;
        let base64;
        if (fallbackB64) {
            base64 = fallbackB64;
        } else {
            await validateImageResponse(imgRes);
            const blob = await imgRes.blob();
            base64 = await new Promise(r => {
                const fr = new FileReader(); fr.onload = () => r(fr.result.split(',')[1]); fr.readAsDataURL(blob);
            });
        }

        await fetch('/api/images/upload', {
            method: 'POST', headers: getRequestHeaders(),
            body: JSON.stringify({ image: base64, format: 'png', filename, ch_name: PLZ_IMAGE_FOLDER }),
        });

        logPatchLast(filename, null, piapiMeta);
        _dispatchPortraitStatus(characterId, { status: 'success' });
        return filename;

    } catch (err) {
        _dispatchPortraitStatus(characterId, { status: 'failed', error: err.message });
        logPatchLast(null, err.message);
        throw err;
    }
}

/**
 * Pure IO Executor for batch asset deletion.
 * Caller is responsible for state reconciliation (removeFromFileIndex).
 * 
 * @param {string[]} filenames 
 * @returns {Promise<string[]>} List of deleted filenames.
 */
export async function deleteFiles(filenames) {
    if (!filenames || filenames.length === 0) return [];
    await Promise.all(filenames.map(f =>
        fetch('/api/images/delete', {
            method: 'POST', headers: getRequestHeaders(),
            body: JSON.stringify({ path: `user/images/${PLZ_IMAGE_FOLDER}/${f}` }),
        })
    ));
    return filenames;
}

/**
 * Maintenance: Deletes all images in the extension folder.
 * @returns {Promise<string[]>} List of deleted filenames.
 */
export async function flushAllImages() {
    const { fileIndex } = await fetchFileIndex();
    const toDelete = Array.from(fileIndex);
    return await deleteFiles(toDelete);
}

/**
 * Maintenance: Deletes images for a specific set of characters.
 * @param {string[]} characterIds 
 * @returns {Promise<string[]>} List of deleted filenames.
 */
export async function flushChatImages(characterIds) {
    if (!characterIds || characterIds.length === 0) return [];
    const { fileIndex } = await fetchFileIndex();
    const toDelete = Array.from(fileIndex).filter(f => 
        characterIds.some(id => f.startsWith(`${FILE_PREFIX}${id}_`))
    );
    return await deleteFiles(toDelete);
}