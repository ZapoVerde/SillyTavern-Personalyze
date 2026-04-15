/**
 * @file data/default-user/extensions/personalyze/io/image/executor.js
 * @stamp {"utc":"2026-04-19T14:00:00.000Z"}
 * @architectural-role IO Executor (Generation Logic)
 * @description
 * Primary execution engine for PersonaLyze image generation.
 * Implements the Forensic Total Mirror Protocol: every outbound request 
 * and inbound response document is mirrored to the Call Logs.
 * 
 * Updated for Dynamic Blueprint Architecture:
 * 1. Integrates scrubEngineParams to strip UI metadata before dispatch.
 * 2. Ensures engineParams are passed to Fal and PiAPI proxy routes.
 * 
 * @api-declaration
 * fetchPreviewBlob(engine, model, pos, neg, w, h, seed, loras, useLayerDiffuse, engineParams) -> Promise<string>
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
import { getModelBlueprint } from '../../modelRegistry.js';
import { scrubEngineParams } from '../../logic/blueprintProcessor.js';

// ─── Forensic Helpers ─────────────────────────────────────────────────────────

/**
 * Validates response status and content-type.
 * Throws enriched errors for log capture.
 */
async function validateImageResponse(response) {
    if (!response.ok) {
        let body;
        try {
            body = await response.clone().json();
        } catch {
            body = await response.clone().text();
        }
        const err = new Error(`Image API Error (${response.status})`);
        err.responseDocument = body;
        throw err;
    }
    const contentType = response.headers.get('Content-Type') ?? '';
    if (contentType.startsWith('text/') || contentType.startsWith('application/json')) {
        throw new Error(`Received ${contentType || 'unknown content-type'} instead of image binary.`);
    }
}

/**
 * Clones a response and attempts to extract a forensic document (JSON or Text).
 */
async function _extractForensicDocument(response) {
    if (!response) return null;
    try {
        const clone = response.clone();
        const text = await clone.text();
        try {
            return JSON.parse(text);
        } catch {
            return text.slice(0, 1000);
        }
    } catch {
        return "[Unreadable Response]";
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
        if (/^failed$/i.test(data.status)) {
            const err = new Error(`PiAPI task failed: ${data.error || 'unknown'}`);
            err.responseDocument = data;
            throw err;
        }
    }
    throw new Error(`PiAPI task ${taskId} timed out.`);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Pure executor for preview/test generation.
 */
export async function fetchPreviewBlob(engine, model, positivePrompt, negativePrompt, width, height, seed = 1, loras = [], useLayerDiffuse = false, engineParams = {}) {
    let res;
    
    // Scouring Logic: Strip UI metadata from engineParams before dispatch
    const blueprint = getModelBlueprint(model);
    const scrubbedParams = scrubEngineParams(blueprint, engineParams);

    const reqBundle = { engine, model, positivePrompt, negativePrompt, width, height, seed, loras, useLayerDiffuse, engineParams: scrubbedParams };
    logCall('StyleTest', `[${engine}:${model}]`, null, null, reqBundle);

    try {
        if (engine === 'fal') {
            res = await fetch('/api/plugins/personalyze/fal-generate', {
                method: 'POST', headers: getRequestHeaders(),
                body: JSON.stringify({ model, prompt: positivePrompt, width, height, engineParams: scrubbedParams }),
            });
        } else if (engine === 'piapi') {
            const submitRes = await fetch('/api/plugins/personalyze/piapi-generate', {
                method: 'POST', headers: getRequestHeaders(),
                body: JSON.stringify({ model, prompt: positivePrompt, negative_prompt: negativePrompt, width, height, seed, engineParams: scrubbedParams }),
            });
            const { task_id } = await submitRes.json();
            const genResult = await _pollPiapiTask(task_id, 120000, () => { });
            res = await fetch('/api/plugins/personalyze/piapi-fetch', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ image_url: genResult.image_url }) });
        } else if (engine === 'runware') {
            res = await fetch('/api/plugins/personalyze/runware-generate', {
                method: 'POST', headers: getRequestHeaders(),
                body: JSON.stringify({ positivePrompt, negativePrompt, model, width, height, seed, loras, useLayerDiffuse, engineParams: scrubbedParams }),
            });
        } else {
            const key = await findSecret('api_key_pollinations');
            const params = new URLSearchParams({ width: String(width), height: String(height), model: model || DEFAULT_IMAGE_MODEL, nologo: 'true', seed: String(seed) });
            res = await fetch(`${POLLINATIONS_BASE_URL}/image/${encodeURIComponent(positivePrompt)}?${params.toString()}`, {
                headers: key ? { 'Authorization': `Bearer ${key}` } : {}
            });
        }

        const doc = await _extractForensicDocument(res);
        await validateImageResponse(res);
        logPatchLast('Blob Generated', null, null, doc);
        return URL.createObjectURL(await res.blob());
    } catch (err) {
        logPatchLast(null, err.message, null, err.responseDocument);
        throw err;
    }
}

/**
 * Standard character generation with total mirroring and dynamic parameters.
 */
export async function generate(characterId, tag, emotion, subjectPrompt, emotionLabel, poseLabel, anchor, seed = 1, forceCacheBust = false) {
    const styleObj = resolveStyle(characterId);
    const engine   = styleObj.engine;
    const model    = styleObj.model;
    
    // Scouring Logic: Strip UI metadata from engineParams before dispatch
    const blueprint = getModelBlueprint(model);
    const scrubbedParams = scrubEngineParams(blueprint, styleObj.engineParams || {});

    const fullPrompt = finalizePrompt(subjectPrompt, anchor, emotionLabel, poseLabel, styleObj.template);
    
    const { width: w, height: h } = resolveDimensions(characterId, styleObj);
    const reqBundle = { 
        characterId, tag, emotion, engine, model, 
        width: w, height: h, seed, forceCacheBust, 
        positivePrompt: fullPrompt, 
        negativePrompt: styleObj.negativePrompt,
        loras: styleObj.loras,
        useLayerDiffuse: styleObj.useLayerDiffuse,
        engineParams: scrubbedParams
    };

    logCall('PortraitGenerate', `[${engine}:${model}]\n${fullPrompt}`, null, null, reqBundle);
    
    const s = getSettings();
    _dispatchPortraitStatus(characterId, { status: 'generating' });

    try {
        let sourceUrl = null, imgRes = null, meta = null, fallbackB64 = null;
        let nativeTransparency = (engine === 'runware') ? !!styleObj.useLayerDiffuse : false;
        let finalDoc = null;

        if (engine === 'fal') {
            imgRes = await fetch('/api/plugins/personalyze/fal-generate', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ model, prompt: fullPrompt, width: w, height: h, engineParams: scrubbedParams }) });
            finalDoc = await _extractForensicDocument(imgRes);
        } else if (engine === 'piapi') {
            const subRes = await fetch('/api/plugins/personalyze/piapi-generate', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ model, prompt: fullPrompt, negative_prompt: styleObj.negativePrompt, width: w, height: h, seed, engineParams: scrubbedParams }) });
            const { task_id } = await subRes.json();
            const resData = await _pollPiapiTask(task_id, 120000, st => _dispatchPortraitStatus(characterId, { status: st }));
            sourceUrl = resData.image_url; meta = resData.meta; finalDoc = resData;
        } else if (engine === 'runware') {
            imgRes = await fetch('/api/plugins/personalyze/runware-generate', { 
                method: 'POST', headers: getRequestHeaders(), 
                body: JSON.stringify({ 
                    positivePrompt: fullPrompt, 
                    negativePrompt: styleObj.negativePrompt, 
                    model, 
                    width: w, 
                    height: h, 
                    seed, 
                    loras: styleObj.loras, 
                    useLayerDiffuse: nativeTransparency,
                    engineParams: scrubbedParams 
                }) 
            });
            finalDoc = await _extractForensicDocument(imgRes);
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
            finalDoc = "[Pollinations Image Stream]";
        }

        // Post-Process RMBG
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
                    method: 'POST', headers: getRequestHeaders(), 
                    body: JSON.stringify({ image_url: sourceUrl, image_base64: fallbackB64, model: s.runwareRmbgModel }) 
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
        
        logPatchLast(filename, null, meta, finalDoc);
        _dispatchPortraitStatus(characterId, { status: 'success' });
        return filename;
    } catch (err) {
        _dispatchPortraitStatus(characterId, { status: 'failed', error: err.message });
        logPatchLast(null, err.message, null, err.responseDocument);
        throw err;
    }
}