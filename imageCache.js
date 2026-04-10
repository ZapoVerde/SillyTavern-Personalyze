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

/**
 * Polls a PiAPI task_id until completed/failed or the deadline is exceeded.
 * Returns { image_url, image_base64?, meta? } on success, throws on failure/timeout.
 *
 * @param {string} taskId
 * @param {number} timeoutMs
 * @param {(status: string) => void} onStatus - Called with each raw status string from PiAPI.
 */
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

export async function generate(characterId, tag, emotion, subjectPrompt, emotionLabel, poseLabel, anchor, seed = 1, provider = 'pollinations') {
    const fullPrompt = finalizePrompt(subjectPrompt, anchor, emotionLabel, poseLabel, resolveStyle(characterId));
    logCall('PortraitGenerate', `[${provider}]\n${fullPrompt}`, null, null);

    const POLL_TIMEOUT_MS = 120_000;
    const RMBG_TIMEOUT_MS =  60_000;

    try {
        const s = getSettings();
        const w = s.devMode ? DEV_IMAGE_WIDTH : DEFAULT_IMAGE_WIDTH;
        const h = s.devMode ? DEV_IMAGE_HEIGHT : DEFAULT_IMAGE_HEIGHT;

        // ── Stage 1: Source Generation ────────────────────────────────────────
        // Produces either a binary Response (imgRes) or a public source URL.
        // Fal returns the binary directly; PiAPI and Pollinations produce a URL.

        _dispatchPortraitStatus(characterId, { status: 'generating' });

        let sourceUrl = null;  // public URL for Stage 2 (RMBG) and Stage 3 (CDN fetch)
        let imgRes    = null;  // binary Response — set when the binary is already in hand
        let piapiMeta = null;

        if (provider === 'fal') {
            imgRes = await fetch('/api/plugins/personalyze/fal-generate', {
                method: 'POST', headers: getRequestHeaders(),
                body: JSON.stringify({ model: s.falModel, prompt: fullPrompt, width: w, height: h }),
            });
            // Fal returns the binary directly; no stable public URL is available,
            // so background removal is not chainable for Fal generations.

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
            // Pollinations: construct the deterministic public URL (binary fetch deferred to Stage 3)
            const params = new URLSearchParams({
                width: String(w), height: String(h),
                model: s.imageModel ?? DEFAULT_IMAGE_MODEL,
                nologo: 'true', seed: String(seed), safe: 'false',
            });
            sourceUrl = `${POLLINATIONS_BASE_URL}/image/${encodeURIComponent(fullPrompt)}?${params.toString()}`;
        }

        // ── Stage 2: Background Removal (optional) ────────────────────────────
        // Available whenever sourceUrl is set (PiAPI and Pollinations).
        // Fal is excluded because it returns a binary rather than a CDN URL.
        // On failure, logs a warning and falls back gracefully to the Stage 1 result.

        if (s.piapiRemoveBackground && sourceUrl) {
            try {
                _dispatchPortraitStatus(characterId, { status: 'removing_bg' });

                const rmbgSubmitRes = await fetch('/api/plugins/personalyze/piapi-remove-bg', {
                    method: 'POST', headers: getRequestHeaders(),
                    body: JSON.stringify({ image_url: sourceUrl, rmbg_model: s.piapiRmbgModel }),
                });
                if (!rmbgSubmitRes.ok) {
                    const errData = await rmbgSubmitRes.json().catch(() => ({}));
                    throw new Error(errData.error || `RMBG submit failed (${rmbgSubmitRes.status})`);
                }
                const { task_id: rmbgTaskId } = await rmbgSubmitRes.json();

                const rmbgResult = await _pollPiapiTask(rmbgTaskId, RMBG_TIMEOUT_MS,
                    () => _dispatchPortraitStatus(characterId, { status: 'removing_bg' }));

                // Prefer the base64 payload — avoids a second CDN round-trip entirely
                if (rmbgResult.image_base64) {
                    const filename = `${buildFilenamePrefix(characterId, tag, emotion)}${Date.now()}.png`;
                    await fetch('/api/images/upload', {
                        method: 'POST', headers: getRequestHeaders(),
                        body: JSON.stringify({ image: rmbgResult.image_base64, format: 'png', filename, ch_name: PLZ_IMAGE_FOLDER }),
                    });
                    logPatchLast(filename, null, piapiMeta);
                    return filename;
                }

                // No base64 — update sourceUrl; Stage 3 will fetch from the RMBG CDN URL
                sourceUrl = rmbgResult.image_url;
                imgRes = null;

            } catch (rmbgErr) {
                warn('ImageCache', `Background removal failed, using source image: ${rmbgErr.message}`);
                // sourceUrl / imgRes from Stage 1 are unchanged — Stage 3 proceeds normally
            }
        }

        // ── Stage 3: Final Download & Save ────────────────────────────────────

        if (!imgRes) {
            // Route via the concurrency-limited proxy for PiAPI/RMBG CDN URLs;
            // fetch directly for Pollinations and other public URLs.
            const isPiapiUrl = sourceUrl.includes('piapi.ai');
            if (isPiapiUrl) {
                imgRes = await fetch('/api/plugins/personalyze/piapi-fetch', {
                    method: 'POST', headers: getRequestHeaders(),
                    body: JSON.stringify({ image_url: sourceUrl }),
                });
            } else {
                const key = provider === 'pollinations' ? await getAuthKey('pollinations') : null;
                imgRes = await fetch(sourceUrl, { headers: key ? { 'Authorization': `Bearer ${key}` } : {} });
            }
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