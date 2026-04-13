/**
 * @file data/default-user/extensions/personalyze/plugin/routes/piapi.js
 * @stamp {"utc":"2026-04-16T12:30:00.000Z"}
 * @architectural-role Server-Side Route Handler
 * @description
 * Implements the PiAPI proxy routes for image generation, task status, 
 * background removal, and binary fetching.
 * 
 * @api-declaration
 * registerPiapiRoutes(router) -> void
 * 
 * @contract
 *   assertions:
 *     purity: Route Handler
 *     external_io: [PiAPI API, SillyTavern Secrets]
 */

import { readSecret } from '../../src/endpoints/secrets.js';
import { 
    fetchChecked, 
    withRetry, 
    FATAL_HTTP_CODES, 
    piapiAcquire, 
    piapiRelease 
} from '../utils/network.js';

/**
 * Extracts an image URL from a PiAPI task output object.
 */
function extractPiapiImageUrl(output) {
    if (!output || typeof output !== 'object') return null;
    if (typeof output.image_url === 'string' && output.image_url.startsWith('http')) return output.image_url;
    if (Array.isArray(output.image_urls) && typeof output.image_urls[0] === 'string') return output.image_urls[0];
    if (Array.isArray(output.images) && output.images[0]?.url) return output.images[0].url;
    if (typeof output.image === 'string' && output.image.startsWith('http')) return output.image;
    if (typeof output.url === 'string' && output.url.startsWith('http')) return output.url;
    for (const val of Object.values(output)) {
        if (typeof val === 'string' && val.startsWith('http')) return val;
        if (val && typeof val === 'object') {
            const found = extractPiapiImageUrl(val);
            if (found) return found;
        }
    }
    return null;
}

/**
 * Registers PiAPI proxy routes.
 * @param {import('express').Router} router 
 */
export function registerPiapiRoutes(router) {

    // ─── PiAPI: Submit Generation ─────────────────────────────────────────────
    router.post('/piapi-generate', async (req, res) => {
        const { model, prompt, negative_prompt, width, height, seed, flow_shift, batch_size } = req.body;
        const apiKey = readSecret(req.user.directories, 'api_key_piapi');
        const modelId = model ?? 'Qubico/z-image';

        if (!apiKey) return res.status(401).json({ error: 'PiAPI key not configured.' });

        try {
            const taskResponse = await withRetry(
                () => fetchChecked('https://api.piapi.ai/api/v1/task', {
                    method: 'POST',
                    headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: modelId,
                        task_type: 'txt2img',
                        input: { prompt, negative_prompt, width, height, seed: seed ?? -1, flow_shift: flow_shift ?? 3, batch_size: batch_size ?? 1 }
                    }),
                }),
                'PiAPI'
            );

            const taskData = await taskResponse.json();
            const taskId = (taskData.data ?? taskData).task_id;
            if (!taskId) throw new Error('PiAPI returned no task_id.');
            return res.json({ task_id: taskId });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ─── PiAPI: Status Check ──────────────────────────────────────────────────
    router.get('/piapi-status/:task_id', async (req, res) => {
        try {
            const { task_id } = req.params;
            const apiKey = readSecret(req.user.directories, 'api_key_piapi');
            if (!apiKey) return res.status(401).json({ error: 'PiAPI key not configured.' });

            const statusResponse = await fetch(`https://api.piapi.ai/api/v1/task/${task_id}`, {
                headers: { 'X-API-Key': apiKey },
            });

            const statusData = await statusResponse.json();
            const taskPayload = statusData.data ?? statusData;
            const status = taskPayload.status ?? 'unknown';
            const result = { task_id, status };

            if (/^(completed|success)$/i.test(status)) {
                const outputObj = taskPayload.output ?? taskPayload.task_result?.task_output;
                result.image_url = extractPiapiImageUrl(outputObj);
                result.meta = { task_id, model: taskPayload.model, status, created_at: taskPayload.meta?.created_at, started_at: taskPayload.meta?.started_at, ended_at: taskPayload.meta?.ended_at, points: taskPayload.meta?.usage?.consume, image_url: result.image_url };
            } else if (/^failed$/i.test(status)) {
                result.error = taskPayload.error?.message || 'task failed';
            }
            return res.json(result);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ─── PiAPI: Fetch Binary (Concurrency Limited) ────────────────────────────
    router.post('/piapi-fetch', async (req, res) => {
        const { image_url } = req.body;
        await piapiAcquire();
        try {
            const imgRes = await withRetry(() => fetchChecked(image_url), 'PiAPICDN');
            res.setHeader('Content-Type', imgRes.headers.get('Content-Type') ?? 'image/png');
            res.send(Buffer.from(await imgRes.arrayBuffer()));
        } catch (err) {
            res.status(500).json({ error: err.message });
        } finally {
            piapiRelease();
        }
    });

    // ─── PiAPI: Background Removal ────────────────────────────────────────────
    router.post('/piapi-remove-bg', async (req, res) => {
        const { image_url, image_base64, rmbg_model } = req.body;
        const apiKey = readSecret(req.user.directories, 'api_key_piapi');
        if (!apiKey) return res.status(401).json({ error: 'PiAPI key not configured.' });

        try {
            const taskResponse = await withRetry(
                () => fetchChecked('https://api.piapi.ai/api/v1/task', {
                    method: 'POST',
                    headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: 'Qubico/image-toolkit',
                        task_type: 'background-remove',
                        input: { image: image_url || image_base64, rmbg_model: rmbg_model ?? 'BEN2' }
                    }),
                }),
                'PiAPIRmbg'
            );
            const taskData = await taskResponse.json();
            return res.json({ task_id: (taskData.data ?? taskData).task_id });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ─── PiAPI: Ping ──────────────────────────────────────────────────────────
    router.post('/piapi-ping', async (req, res) => {
        try {
            const apiKey = readSecret(req.user.directories, 'api_key_piapi');
            if (!apiKey) return res.status(401).json({ error: 'PiAPI key not configured.' });
            const probe = await fetch('https://api.piapi.ai/api/v1/task/ping-probe', { headers: { 'X-API-Key': apiKey } });
            if (probe.status === 401) return res.status(401).json({ error: 'PiAPI key invalid.' });
            return res.json({ ok: true, user: 'authenticated' });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
}