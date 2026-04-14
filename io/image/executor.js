/**
 * @file data/default-user/extensions/personalyze/io/image/executor.js
 * @stamp {"utc":"2026-04-16T22:00:00.000Z"}
 * @architectural-role IO Executor (Generation Logic)
 * @description
 * Primary execution engine for PersonaLyze image generation.
 * Coordinates routing and post-processing based on Style-assigned Render Pipelines.
 * 
 * Updated for Style-Specific Render Pipeline:
 * 1. generate() derives engine/model/LoRAs from resolveStyle().
 * 2. fetchPreviewBlob() refactored to pure-parameter signature for decoupled testing.
 * 3. LayerDiffuse style setting acts as a short-circuit for post-process RMBG.
 * 
 * @api-declaration
 * fetchPreviewBlob(engine, model, positivePrompt, negativePrompt, width, height, seed, loras, useLayerDiffuse) -> Promise<string>
 * generate(characterId, tag, emotion, subjectPrompt, emotionLabel, poseLabel, anchor, seed, forceCacheBust) -> Promise<string>
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
} from '../../defaults.js';
import { getSettings } from '../../settings.js';
import { log, error } from '../../utils/logger.js';
import { logCall, logPatchLast } from '../../utils/callLog.js';
import { buildFilenamePrefix } from './registry.js';
import { resolveDimensions, resolveStyle, finalizePrompt } from './compiler.js';

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

/**
 * Pure executor for preview/test generation.
 * Parameters are passed explicitly to support testing "dirty" configurations
 * before they are saved to the Style Library.
 */
export async function fetchPreviewBlob(engine, model, positivePrompt, negativePrompt, width, height, seed = 1, loras = [], useLayerDiffuse = false) {
    let res;

    if (engine === 'fal') {
        res = await fetch('/api/plugins/personalyze/fal-generate', {
            method: 'POST', headers: getRequestHeaders(),
            body: JSON.stringify({ model, prompt: positivePrompt, width, height }),
        });
    } else if (engine === 'piapi') {
        const submitRes = await fetch('/api/plugins/personalyze/piapi-generate', {
            method: 'POST', headers: getRequestHeaders(),
            body: JSON.stringify({ model, prompt: positivePrompt, negative_prompt: negativePrompt, width, height, seed }),
        });
        const { task_id } = await submitRes.json();
        const genResult = await _pollPiapiTask(task_id, 120000, () => { });
        res = await fetch('/api/plugins/personalyze/piapi-fetch', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ image_url: genResult.image_url }) });
    } else if (engine === 'runware') {
        res = await fetch('/api/plugins/personalyze/runware-generate', {
            method: 'POST', headers: getRequestHeaders(),
            body: JSON.stringify({ positivePrompt, negativePrompt, model, width, height, seed, loras, useLayerDiffuse }),
        });
    } else {
        const key = await findSecret('api_key_pollinations');
        const params = new URLSearchParams({ width: String(width), height: String(height), model: model || DEFAULT_IMAGE_MODEL, nologo: 'true', seed: String(seed) });
        res = await fetch(`${POLLINATIONS_BASE_URL}/image/${encodeURIComponent(positivePrompt)}?${params.toString()}`, {
            headers: key ? { 'Authorization': `Bearer ${key}` } : {}
        });
    }

    await validateImageResponse(res);
    return URL.createObjectURL(await res.blob());
}

/**
 * Standard character generation.
 * Routes based on the character's active Style Package.
 */
export async function generate(characterId, tag, emotion, subjectPrompt, emotionLabel, poseLabel, anchor, seed = 1, forceCacheBust = false) {
    const styleObj = resolveStyle(characterId);
    const engine   = styleObj.engine;
    const model    = styleObj.model;
    const fullPrompt = finalizePrompt(subjectPrompt, anchor, emotionLabel, poseLabel, styleObj.template);
    
    logCall('PortraitGenerate', `[${engine}:${model}]\n${fullPrompt}`, null, null);
    
    const s = getSettings();
    const { width: w, height: h } = resolveDimensions(characterId, styleObj);
    _dispatchPortraitStatus(characterId, { status: 'generating' });

    try {
        let sourceUrl = null, imgRes = null, meta = null, fallbackB64 = null;
        let nativeTransparency = !!styleObj.useLayerDiffuse;

        if (engine === 'fal') {
            imgRes = await fetch('/api/plugins/personalyze/fal-generate', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ model, prompt: fullPrompt, width: w, height: h }) });
        } else if (engine === 'piapi') {
            const subRes = await fetch('/api/plugins/personalyze/piapi-generate', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ model, prompt: fullPrompt, negative_prompt: styleObj.negativePrompt, width: w, height: h, seed }) });
            const { task_id } = await subRes.json();
            const resData = await _pollPiapiTask(task_id, 120000, st => _dispatchPortraitStatus(characterId, { status: st }));
            sourceUrl = resData.image_url; meta = resData.meta;
        } else if (engine === 'runware') {
            imgRes = await fetch('/api/plugins/personalyze/runware-generate', { 
                method: 'POST', 
                headers: getRequestHeaders(), 
                body: JSON.stringify({ 
                    positivePrompt: fullPrompt, 
                    negativePrompt: styleObj.negativePrompt,
                    model: model, 
                    width: w, 
                    height: h, 
                    seed, 
                    loras: styleObj.loras, 
                    useLayerDiffuse: nativeTransparency 
                }) 
            });
        } else {
            const key = await findSecret('api_key_pollinations');
            const params = new URLSearchParams({ width: String(w), height: String(h), model: model || DEFAULT_IMAGE_MODEL, nologo: 'true', seed: String(seed), safe: 'false' });
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

        // Post-Process RMBG Block: Short-circuited if style uses native transparency (LayerDiffuse)
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