/**
 * @file data/default-user/extensions/personalyze/io/image/executor.js
 * @stamp {"utc":"2026-04-16T19:00:00.000Z"}
 * @architectural-role IO Executor (Generation Logic)
 * @description
 * Primary execution engine for PersonaLyze image generation.
 * Coordinates multi-provider routing (Runware, Fal, PiAPI, Pollinations),
 * manages asynchronous task polling, and handles the post-processing pipeline.
 * 
 * Updated for Style-Specific Negative Prompts:
 * 1. fetchPreviewBlob and generate now extract negativePrompt from the Style Package.
 * 2. negativePrompt is passed to the Runware provider backend.
 * 
 * @api-declaration
 * fetchPreviewBlob(prompt, characterId, provider, seed, emotion, pose) -> Promise<string>
 * generate(characterId, tag, emotion, subjectPrompt, emotionLabel, poseLabel, anchor, seed, provider, forceCacheBust) -> Promise<string>
 * 
 * @contract
 *   assertions:
 *     purity: IO Executor
 *     state_ownership: []
 *     external_io: [Server Plugins, Image APIs, DOM Events]
 */

import { getRequestHeaders } from '../../../../../../script.js';
import { findSecret } from '../../../../../secrets.js';
import { 
    POLLINATIONS_BASE_URL, 
    DEFAULT_IMAGE_MODEL, 
    PLZ_IMAGE_FOLDER, 
    DEV_IMAGE_WIDTH, 
    DEV_IMAGE_HEIGHT 
} from '../../defaults.js';
import { getSettings } from '../../settings.js';
import { state } from '../../state.js';
import { log, warn, error } from '../../utils/logger.js';
import { logCall, logPatchLast } from '../../utils/callLog.js';
import { buildFilenamePrefix, findCachedImage } from './registry.js';
import { resolveDimensions, resolveStyle, finalizePrompt } from './compiler.js';
import { deleteFiles } from './maintenance.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function validateImageResponse(response) {
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Image API Error (${response.status}): ${text.slice(0, 100)}`);
    }
    const contentType = response.headers.get('Content-Type') ?? '';
    if (contentType.startsWith('text/') || contentType.startsWith('application/json')) {
        throw new Error(`Received ${contentType || 'unknown content-type'} instead of image.`);
    }
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
        const res = await fetch(`/api/plugins/personalyze/piapi-status/${taskId}`, { headers: getRequestHeaders() });
        if (!res.ok) throw new Error(`PiAPI status check failed (${res.status})`);
        const data = await res.json();
        onStatus(data.status);
        if (/^(completed|success)$/i.test(data.status)) return data;
        if (/^failed$/i.test(data.status)) throw new Error(`PiAPI task failed: ${data.error || 'unknown'}`);
    }
    throw new Error(`PiAPI task ${taskId} timed out.`);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function fetchPreviewBlob(prompt, characterId, provider = 'pollinations', seed = 1, emotion = '', pose = '') {
    const styleObj = resolveStyle(characterId);
    const fullPrompt = finalizePrompt(prompt, '', emotion, pose, styleObj.template);
    const s = getSettings();
    let res;

    if (provider === 'fal') {
        res = await fetch('/api/plugins/personalyze/fal-generate', {
            method: 'POST', headers: getRequestHeaders(),
            body: JSON.stringify({ model: s.falModel, prompt: fullPrompt, width: DEV_IMAGE_WIDTH, height: DEV_IMAGE_HEIGHT }),
        });
    } else if (provider === 'piapi') {
        const submitRes = await fetch('/api/plugins/personalyze/piapi-generate', {
            method: 'POST', headers: getRequestHeaders(),
            body: JSON.stringify({ model: s.piapiModel, prompt: fullPrompt, width: DEV_IMAGE_WIDTH, height: DEV_IMAGE_HEIGHT, seed }),
        });
        const { task_id } = await submitRes.json();
        const genResult = await _pollPiapiTask(task_id, 120000, () => { });
        res = await fetch('/api/plugins/personalyze/piapi-fetch', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ image_url: genResult.image_url }) });
    } else if (provider === 'runware') {
        // Pull LoRAs and Negative Prompt from the style package
        const loras = styleObj.loras || [];
        const negativePrompt = styleObj.negativePrompt || '';
        res = await fetch('/api/plugins/personalyze/runware-generate', {
            method: 'POST', headers: getRequestHeaders(),
            body: JSON.stringify({ 
                positivePrompt: fullPrompt, 
                negativePrompt: negativePrompt,
                model: s.runwareModel, 
                width: DEV_IMAGE_WIDTH, 
                height: DEV_IMAGE_HEIGHT, 
                seed, 
                loras, 
                useLayerDiffuse: s.runwareUseLayerDiffuse 
            }),
        });
    } else {
        const key = await findSecret('api_key_pollinations');
        const params = new URLSearchParams({ width: String(DEV_IMAGE_WIDTH), height: String(DEV_IMAGE_HEIGHT), model: s.imageModel ?? DEFAULT_IMAGE_MODEL, nologo: 'true', seed: String(seed) });
        res = await fetch(`${POLLINATIONS_BASE_URL}/image/${encodeURIComponent(fullPrompt)}?${params.toString()}`, {
            headers: key ? { 'Authorization': `Bearer ${key}` } : {}
        });
    }

    await validateImageResponse(res);
    return URL.createObjectURL(await res.blob());
}

export async function generate(characterId, tag, emotion, subjectPrompt, emotionLabel, poseLabel, anchor, seed = 1, provider = 'pollinations', forceCacheBust = false) {
    const styleObj = resolveStyle(characterId);
    const fullPrompt = finalizePrompt(subjectPrompt, anchor, emotionLabel, poseLabel, styleObj.template);
    
    logCall('PortraitGenerate', `[${provider}]\n${fullPrompt}`, null, null);
    const s = getSettings();
    const { width: w, height: h } = resolveDimensions(characterId);
    _dispatchPortraitStatus(characterId, { status: 'generating' });

    try {
        let sourceUrl = null, imgRes = null, meta = null, fallbackB64 = null, nativeTransparency = false;

        if (provider === 'fal') {
            imgRes = await fetch('/api/plugins/personalyze/fal-generate', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ model: s.falModel, prompt: fullPrompt, width: w, height: h }) });
        } else if (provider === 'piapi') {
            const subRes = await fetch('/api/plugins/personalyze/piapi-generate', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ model: s.piapiModel, prompt: fullPrompt, width: w, height: h, seed }) });
            const { task_id } = await subRes.json();
            const resData = await _pollPiapiTask(task_id, 120000, st => _dispatchPortraitStatus(characterId, { status: st }));
            sourceUrl = resData.image_url; meta = resData.meta;
        } else if (provider === 'runware') {
            // Pull LoRAs and Negative Prompt from the style package
            const loras = styleObj.loras || [];
            const negativePrompt = styleObj.negativePrompt || '';
            imgRes = await fetch('/api/plugins/personalyze/runware-generate', { 
                method: 'POST', 
                headers: getRequestHeaders(), 
                body: JSON.stringify({ 
                    positivePrompt: fullPrompt, 
                    negativePrompt: negativePrompt,
                    model: s.runwareModel, 
                    width: w, 
                    height: h, 
                    seed, 
                    loras, 
                    useLayerDiffuse: s.runwareUseLayerDiffuse 
                }) 
            });
            if (s.runwareUseLayerDiffuse) nativeTransparency = true;
        } else {
            const key = await findSecret('api_key_pollinations');
            const params = new URLSearchParams({ width: String(w), height: String(h), model: s.imageModel ?? DEFAULT_IMAGE_MODEL, nologo: 'true', seed: String(seed), safe: 'false' });
            if (forceCacheBust) params.append('cb', String(Date.now()));
            const polRes = await fetch(`${POLLINATIONS_BASE_URL}/image/${encodeURIComponent(fullPrompt)}?${params.toString()}`, {
                headers: key ? { 'Authorization': `Bearer ${key}` } : {}
            });
            if (s.piapiRemoveBackground || s.runwareRemoveBackground) {
                await validateImageResponse(polRes);
                const blob = await polRes.blob();
                fallbackB64 = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result.split(',')[1]); fr.readAsDataURL(blob); });
            } else imgRes = polRes;
        }

        if ((s.piapiRemoveBackground || s.runwareRemoveBackground) && !nativeTransparency && (sourceUrl || fallbackB64 || imgRes)) {
            _dispatchPortraitStatus(characterId, { status: 'removing_bg' });
            if (!fallbackB64 && !sourceUrl && imgRes) {
                await validateImageResponse(imgRes);
                const b = await imgRes.blob();
                fallbackB64 = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result.split(',')[1]); fr.readAsDataURL(b); });
                imgRes = null;
            }
            if (s.runwareRemoveBackground) {
                imgRes = await fetch('/api/plugins/personalyze/runware-remove-bg', { 
                    method: 'POST', 
                    headers: getRequestHeaders(), 
                    body: JSON.stringify({ 
                        image_url: sourceUrl, 
                        image_base64: fallbackB64,
                        model: s.runwareRmbgModel
                    }) 
                });
                fallbackB64 = null;
            } else {
                const subRmbg = await fetch('/api/plugins/personalyze/piapi-remove-bg', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify(fallbackB64 ? { image_base64: fallbackB64, rmbg_model: s.piapiRmbgModel } : { image_url: sourceUrl, rmbg_model: s.piapiRmbgModel }) });
                const { task_id } = await subRmbg.json();
                const rmbgRes = await _pollPiapiTask(task_id, 60000, () => _dispatchPortraitStatus(characterId, { status: 'removing_bg' }));
                sourceUrl = rmbgRes.image_url; fallbackB64 = null; imgRes = null;
            }
        }

        if (!imgRes && !fallbackB64) imgRes = await fetch('/api/plugins/personalyze/piapi-fetch', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ image_url: sourceUrl }) });
        
        const filename = `${buildFilenamePrefix(characterId, tag, emotion)}${Date.now()}.png`;
        let base64 = fallbackB64;
        if (!base64) {
            await validateImageResponse(imgRes);
            const b = await imgRes.blob();
            base64 = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result.split(',')[1]); fr.readAsDataURL(b); });
        }

        await fetch('/api/images/upload', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ image: base64, format: 'png', filename, ch_name: PLZ_IMAGE_FOLDER }) });
        logPatchLast(filename, null, meta);
        _dispatchPortraitStatus(characterId, { status: 'success' });
        return filename;
    } catch (err) {
        _dispatchPortraitStatus(characterId, { status: 'failed', error: err.message });
        logPatchLast(null, err.message);
        throw err;
    }
}