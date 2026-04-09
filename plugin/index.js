/**
 * @file data/default-user/extensions/personalyze/plugin/index.js
 * @stamp {"utc":"2026-04-07T00:00:00.000Z"}
 * @architectural-role Server-Side Plugin
 * @description
 * Proxies Hugging Face, Fal AI, and PiAPI calls for the PersonaLyze extension.
 * This server-side component bypasses CORS restrictions and handles secure
 * API key injection from the SillyTavern secrets vault.
 *
 * Routes provided:
 * - /hf-generate    : Hugging Face Inference Router proxy
 * - /hf-ping        : HF API key validation
 * - /space-generate : Hugging Face Gradio Space (Gradio API) proxy
 * - /space-ping     : HF Space status check
 * - /fal-generate   : Fal AI generation proxy (JSON -> Image pipe)
 * - /fal-ping       : Fal AI API key validation
 * - /piapi-generate : PiAPI task submission — returns {task_id} immediately
 * - /piapi-status   : PiAPI single status check for a task_id
 * - /piapi-fetch    : PiAPI image download for a completed task_id
 * - /piapi-ping     : PiAPI API key validation
 *
 * @contract
 *   assertions:
 *     external_io: [HuggingFace API, Fal AI API, PiAPI, SillyTavern Secrets]
 */

import { readSecret } from '../src/endpoints/secrets.js';

// ─── PiAPI Concurrency Limiter ─────────────────────────────────────────────────
// Max simultaneous image-fetch (CDN download) requests. Raise if your server
// has ample outbound bandwidth; lower if you see connection errors under load.
const MAX_PIAPI_CONCURRENT = 2;
let _piapiActive = 0;
const _piapiQueue = [];

function piapiAcquire() {
    return new Promise(resolve => {
        if (_piapiActive < MAX_PIAPI_CONCURRENT) { _piapiActive++; resolve(); }
        else { _piapiQueue.push(resolve); }
    });
}
function piapiRelease() {
    if (_piapiQueue.length > 0) { _piapiActive++; _piapiQueue.shift()(); }
    else { _piapiActive--; }
}

export const info = {
    id: 'personalyze',
    name: 'PersonaLyze',
    description: 'Proxies Hugging Face, Fal AI, and PiAPI calls for PersonaLyze extension',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Converts a HuggingFace Space ID (owner/space-name) to its .hf.space URL.
 * @param {string} spaceId
 * @returns {string}
 */
function spaceIdToUrl(spaceId) {
    const [owner, name] = spaceId.split('/');
    const domain = `${owner}-${name}`.toLowerCase().replace(/_/g, '-');
    return `https://${domain}.hf.space`;
}

/**
 * Extracts an image URL from a PiAPI task output object.
 * Checks known field paths first, then falls back to a recursive scan
 * for the first http string value in the object tree.
 * @param {object} output
 * @returns {string|null}
 */
function extractPiapiImageUrl(output) {
    if (!output || typeof output !== 'object') return null;
    // Known paths in priority order
    if (typeof output.image_url === 'string' && output.image_url.startsWith('http')) return output.image_url;
    if (Array.isArray(output.image_urls) && typeof output.image_urls[0] === 'string') return output.image_urls[0];
    if (Array.isArray(output.images) && output.images[0]?.url) return output.images[0].url;
    if (typeof output.image === 'string' && output.image.startsWith('http')) return output.image;
    if (typeof output.url === 'string' && output.url.startsWith('http')) return output.url;
    // Recursive fallback: first http string found anywhere in the output tree
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
 * Reads a Gradio SSE stream to completion, returns the outputs array.
 * @param {Response} sseResponse
 * @returns {Promise<any[]>}
 */
async function readGradioSSE(sseResponse) {
    const reader = sseResponse.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let lastEvent = null;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
            if (line.startsWith('event: ')) {
                lastEvent = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
                if (lastEvent === 'complete') {
                    return JSON.parse(line.slice(6));
                }
                if (lastEvent === 'error') {
                    throw new Error(`Gradio error: ${line.slice(6)}`);
                }
            }
        }
    }
    throw new Error('Gradio SSE stream ended without a complete event');
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function init(router) {

    // ── HuggingFace Router: image generation ──────────────────────────────────
    router.post('/hf-generate', async (req, res) => {
        try {
            const { provider, model, prompt, width, height } = req.body;
            const apiKey = readSecret(req.user.directories, 'api_key_huggingface');

            if (!apiKey) {
                return res.status(401).json({ error: 'HuggingFace API key not configured.' });
            }

            const url = `https://router.huggingface.co/${provider}/models/${model}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    inputs: prompt,
                    parameters: { width, height },
                }),
            });

            if (!response.ok) {
                const text = await response.text();
                return res.status(response.status).send(text);
            }

            const contentType = response.headers.get('Content-Type');
            if (contentType) res.setHeader('Content-Type', contentType);
            const buffer = await response.arrayBuffer();
            res.send(Buffer.from(buffer));
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ── HuggingFace key ping (whoami) ─────────────────────────────────────────
    router.post('/hf-ping', async (req, res) => {
        try {
            const apiKey = readSecret(req.user.directories, 'api_key_huggingface');
            if (!apiKey) {
                return res.status(401).json({ error: 'HuggingFace API key not configured.' });
            }
            const response = await fetch('https://huggingface.co/api/whoami', {
                headers: { 'Authorization': `Bearer ${apiKey}` },
            });
            if (response.ok) {
                const data = await response.json();
                return res.json({ ok: true, user: data.name || data.fullname || 'authenticated' });
            }
            const text = await response.text();
            return res.status(response.status).json({
                error: `HF returned ${response.status}: ${text.slice(0, 100)}`,
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ── HuggingFace Space ping ────────────────────────────────────────────────
    router.post('/space-ping', async (req, res) => {
        try {
            const { spaceId } = req.body;
            if (!spaceId || !spaceId.includes('/')) {
                return res.status(400).json({ error: 'Invalid spaceId. Expected owner/space-name.' });
            }
            const spaceUrl = spaceIdToUrl(spaceId);
            const response = await fetch(`${spaceUrl}/info`);
            if (response.ok) {
                const data = await response.json();
                return res.json({ ok: true, info: { space_id: spaceId, ...data } });
            }
            return res.status(response.status).json({ error: `Space returned ${response.status}` });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ── HuggingFace Space image generation (Gradio) ───────────────────────────
    router.post('/space-generate', async (req, res) => {
        try {
            const { spaceId, prompt, width, height } = req.body;
            if (!spaceId || !spaceId.includes('/')) {
                return res.status(400).json({ error: 'Invalid spaceId. Expected owner/space-name.' });
            }

            const apiKey = readSecret(req.user.directories, 'api_key_huggingface');
            const spaceUrl = spaceIdToUrl(spaceId);
            const authHeaders = apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {};

            let endpoint = 'predict';
            try {
                const infoRes = await fetch(`${spaceUrl}/info`, { headers: authHeaders });
                if (infoRes.ok) {
                    const apiInfo = await infoRes.json();
                    const named = apiInfo.named_endpoints;
                    if (named && Object.keys(named).length > 0) {
                        endpoint = Object.keys(named)[0];
                    }
                }
            } catch (_) { /* fall through */ }

            const submitRes = await fetch(`${spaceUrl}/call/${endpoint}`, {
                method: 'POST',
                headers: { ...authHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({ data: [prompt, width ?? 512, height ?? 768] }),
            });
            if (!submitRes.ok) {
                const text = await submitRes.text();
                return res.status(submitRes.status).json({
                    error: `Gradio submit failed: ${text.slice(0, 200)}`,
                });
            }
            const { event_id } = await submitRes.json();

            const sseRes = await fetch(`${spaceUrl}/call/${endpoint}/${event_id}`, {
                headers: authHeaders,
            });
            if (!sseRes.ok) {
                return res.status(sseRes.status).json({
                    error: `Gradio SSE failed: ${sseRes.status}`,
                });
            }

            const outputs = await readGradioSSE(sseRes);

            let imageUrl = null;
            for (const out of outputs) {
                if (out && typeof out === 'object') {
                    imageUrl = out.url || (out.path ? `${spaceUrl}/file=${out.path}` : null);
                    if (imageUrl) break;
                }
            }
            if (!imageUrl) {
                return res.status(500).json({ error: 'No image URL in Gradio output' });
            }

            const imgRes = await fetch(imageUrl, { headers: authHeaders });
            if (!imgRes.ok) {
                return res.status(imgRes.status).json({
                    error: `Image fetch failed: ${imgRes.status}`,
                });
            }

            const contentType = imgRes.headers.get('Content-Type') ?? 'image/png';
            res.setHeader('Content-Type', contentType);
            res.send(Buffer.from(await imgRes.arrayBuffer()));

        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ── Fal AI: image generation ──────────────────────────────────────────────
    router.post('/fal-generate', async (req, res) => {
        try {
            const { model, prompt, width, height } = req.body;
            const apiKey = readSecret(req.user.directories, 'api_key_fal');

            if (!apiKey) {
                return res.status(401).json({ error: 'Fal AI API key not configured.' });
            }

            // Step 1: Request generation (Fal returns JSON with a URL)
            const falResponse = await fetch(`https://fal.run/${model}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Key ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    prompt,
                    image_size: { width: width ?? 512, height: height ?? 768 },
                    sync_mode: true,
                    enable_safety_checker: false,
                }),
            });

            if (!falResponse.ok) {
                const text = await falResponse.text();
                return res.status(falResponse.status).send(text);
            }

            const data = await falResponse.json();
            const imageUrl = data.images?.[0]?.url || data.image?.url;

            if (!imageUrl) {
                return res.status(500).json({ error: 'No image URL returned from Fal AI' });
            }

            // Step 2: Fetch the actual image binary
            const imgRes = await fetch(imageUrl);
            if (!imgRes.ok) {
                return res.status(imgRes.status).json({ error: `Failed to fetch image from Fal CDN: ${imgRes.status}` });
            }

            const contentType = imgRes.headers.get('Content-Type') ?? 'image/png';
            res.setHeader('Content-Type', contentType);
            const buffer = await imgRes.arrayBuffer();
            res.send(Buffer.from(buffer));

        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ── Fal AI: key ping ──────────────────────────────────────────────────────
    router.post('/fal-ping', async (req, res) => {
        try {
            const apiKey = readSecret(req.user.directories, 'api_key_fal');
            if (!apiKey) {
                return res.status(401).json({ error: 'Fal AI API key not configured.' });
            }

            // Fal doesn't have a specific "whoami" endpoint, so we try a lightweight
            // metadata check or just confirm key presence/format.
            // For now, we return success if the key is present.
            return res.json({ ok: true, user: 'authenticated' });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ── PiAPI: submit task, return task_id immediately ────────────────────────
    router.post('/piapi-generate', async (req, res) => {
        try {
            const { model, prompt, negative_prompt, width, height, seed, flow_shift, batch_size } = req.body;
            const apiKey = readSecret(req.user.directories, 'api_key_piapi');
            const modelId = model ?? 'Qubico/z-image';

            if (!apiKey) {
                return res.status(401).json({ error: 'PiAPI key not configured.' });
            }

            const taskResponse = await fetch('https://api.piapi.ai/api/v1/task', {
                method: 'POST',
                headers: {
                    'X-API-Key': apiKey,
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (compatible; PersonaLyze/1.0)',
                },
                body: JSON.stringify({
                    model: modelId,
                    task_type: 'txt2img',
                    input: {
                        prompt,
                        negative_prompt,
                        width:      width      ?? 1024,
                        height:     height     ?? 1024,
                        seed:       seed       ?? -1,
                        flow_shift: flow_shift ?? 3,
                        batch_size: batch_size ?? 1,
                    },
                }),
            });

            if (!taskResponse.ok) {
                const text = await taskResponse.text();
                return res.status(taskResponse.status).json({
                    error: `PiAPI submit failed (HTTP ${taskResponse.status}) for model "${modelId}": ${text.slice(0, 300)}`,
                });
            }

            const taskData = await taskResponse.json();
            const taskPayload = taskData.data ?? taskData;
            const taskId = taskPayload.task_id;

            if (!taskId) {
                return res.status(500).json({
                    error: `PiAPI returned no task_id. Response: ${JSON.stringify(taskData).slice(0, 300)}`,
                });
            }

            return res.json({ task_id: taskId });

        } catch (err) {
            const cause = err.cause?.message || err.cause?.code || '';
            res.status(500).json({ error: `${err.message}${cause ? ` (${cause})` : ''}` });
        }
    });

    // ── PiAPI: single status check for a task_id ──────────────────────────────
    router.get('/piapi-status/:task_id', async (req, res) => {
        try {
            const { task_id } = req.params;
            const apiKey = readSecret(req.user.directories, 'api_key_piapi');

            if (!apiKey) {
                return res.status(401).json({ error: 'PiAPI key not configured.' });
            }

            const statusResponse = await fetch(`https://api.piapi.ai/api/v1/task/${task_id}`, {
                headers: { 'X-API-Key': apiKey },
            });

            if (!statusResponse.ok) {
                const text = await statusResponse.text();
                return res.status(statusResponse.status).json({
                    error: `PiAPI status check failed (HTTP ${statusResponse.status}): ${text.slice(0, 200)}`,
                });
            }

            const statusData = await statusResponse.json();
            const taskPayload = statusData.data ?? statusData;
            const status = taskPayload.status ?? 'unknown';
            const result = { task_id, status };

            if (/^(completed|success)$/i.test(status)) {
                const imageUrl = extractPiapiImageUrl(taskPayload.output);
                if (!imageUrl) {
                    return res.status(500).json({
                        error: `PiAPI task "${task_id}" completed but returned no image URL. Output: ${JSON.stringify(taskPayload.output).slice(0, 200)}`,
                    });
                }
                result.image_url = imageUrl;
                result.meta = {
                    task_id:    taskPayload.task_id,
                    model:      taskPayload.model,
                    status:     taskPayload.status,
                    created_at: taskPayload.meta?.created_at,
                    started_at: taskPayload.meta?.started_at,
                    ended_at:   taskPayload.meta?.ended_at,
                    points:     taskPayload.meta?.usage?.consume,
                    image_url:  imageUrl,
                    error:      taskPayload.error?.message || taskPayload.error?.raw_message || null,
                };
            } else if (/^failed$/i.test(status)) {
                result.error = taskPayload.error?.message
                    || taskPayload.error?.raw_message
                    || (taskPayload.error?.code ? `error code ${taskPayload.error.code}` : null)
                    || JSON.stringify(taskPayload.error_reason ?? {});
            }

            return res.json(result);

        } catch (err) {
            const cause = err.cause?.message || err.cause?.code || '';
            res.status(500).json({ error: `${err.message}${cause ? ` (${cause})` : ''}` });
        }
    });

    // ── PiAPI: fetch completed image binary (concurrency-limited CDN download) ─
    router.post('/piapi-fetch', async (req, res) => {
        const { image_url } = req.body;
        if (!image_url || !image_url.startsWith('http')) {
            return res.status(400).json({ error: 'Missing or invalid image_url.' });
        }

        await piapiAcquire();
        try {
            const imgRes = await fetch(image_url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PersonaLyze/1.0)' },
            });
            if (!imgRes.ok) {
                return res.status(imgRes.status).json({
                    error: `CDN fetch failed (HTTP ${imgRes.status}) for ${image_url.slice(0, 80)}`,
                });
            }
            const contentType = imgRes.headers.get('Content-Type') ?? 'image/png';
            res.setHeader('Content-Type', contentType);
            res.send(Buffer.from(await imgRes.arrayBuffer()));
        } catch (err) {
            const cause = err.cause?.message || err.cause?.code || '';
            res.status(500).json({ error: `${err.message}${cause ? ` (${cause})` : ''}` });
        } finally {
            piapiRelease();
        }
    });

    // ── PiAPI: key ping ───────────────────────────────────────────────────────
    router.post('/piapi-ping', async (req, res) => {
        try {
            const apiKey = readSecret(req.user.directories, 'api_key_piapi');
            if (!apiKey) {
                return res.status(401).json({ error: 'PiAPI key not configured.' });
            }

            // Probe with a task fetch for a non-existent ID; 401 = bad key, anything else = key valid
            const probeResponse = await fetch('https://api.piapi.ai/api/v1/task/ping-probe', {
                headers: { 'X-API-Key': apiKey },
            });

            if (probeResponse.status === 401) {
                return res.status(401).json({ error: 'PiAPI key is invalid.' });
            }

            return res.json({ ok: true, user: 'authenticated' });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
}

export async function exit() {}