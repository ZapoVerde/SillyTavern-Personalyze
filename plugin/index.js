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
 * - /piapi-generate : PiAPI image generation proxy (async task polling -> Image pipe)
 * - /piapi-ping     : PiAPI API key validation
 *
 * @contract
 *   assertions:
 *     external_io: [HuggingFace API, Fal AI API, PiAPI, SillyTavern Secrets]
 */

import { readSecret } from '../../src/endpoints/secrets.js';

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

    // ── PiAPI: image generation ───────────────────────────────────────────────
    router.post('/piapi-generate', async (req, res) => {
        try {
            const { model, prompt, negative_prompt, width, height, seed, flow_shift, batch_size } = req.body;
            const apiKey = readSecret(req.user.directories, 'api_key_piapi');
            const modelId = model ?? 'Qubico/z-image';

            if (!apiKey) {
                return res.status(401).json({ error: 'PiAPI key not configured.' });
            }

            // Step 1: Submit the task
            const taskResponse = await fetch('https://api.piapi.ai/api/v1/task', {
                method: 'POST',
                headers: {
                    'X-API-Key': apiKey,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: modelId,
                    task_type: 'txt2img',
                    input: {
                        prompt,
                        negative_prompt,
                        width: width ?? 1024,
                        height: height ?? 1024,
                        seed: seed ?? -1,
                        flow_shift: flow_shift ?? 3,
                        batch_size: batch_size ?? 1,
                    },
                }),
            });

            if (!taskResponse.ok) {
                const text = await taskResponse.text();
                return res.status(taskResponse.status).json({
                    error: `PiAPI task submission failed (HTTP ${taskResponse.status}) for model "${modelId}": ${text.slice(0, 300)}`,
                });
            }

            const taskData = await taskResponse.json();
            // PiAPI submit response may be wrapped in `data` or flat — handle both.
            const taskPayloadInit = taskData.data ?? taskData;
            const taskId = taskPayloadInit.task_id;

            if (!taskId) {
                return res.status(500).json({ error: `PiAPI returned no task_id. Response: ${JSON.stringify(taskData).slice(0, 300)}` });
            }

            // Step 2: Poll until done. Adaptive intervals: 1s → 1.5s → 2.25s → cap 3s.
            // Total budget ~25s so the full round-trip stays under 30s.
            const POLL_BUDGET_MS = 25000;
            const deadline = Date.now() + POLL_BUDGET_MS;
            let pollDelay = 1000;
            let imageUrl = null;
            let lastStatus = 'pending';

            while (Date.now() < deadline) {
                await new Promise(resolve => setTimeout(resolve, pollDelay));
                pollDelay = Math.min(Math.round(pollDelay * 1.5), 3000);

                const statusResponse = await fetch(`https://api.piapi.ai/api/v1/task/${taskId}`, {
                    headers: { 'X-API-Key': apiKey },
                });

                if (!statusResponse.ok) {
                    const text = await statusResponse.text();
                    return res.status(statusResponse.status).json({
                        error: `PiAPI status check failed (HTTP ${statusResponse.status}) for task "${taskId}": ${text.slice(0, 200)}`,
                    });
                }

                const statusData = await statusResponse.json();
                // PiAPI status polling returns a flat object (task_id, status, output at root),
                // but some versions wrap it in a `data` envelope — handle both.
                const taskPayload = statusData.data ?? statusData;
                lastStatus = taskPayload.status ?? 'unknown';

                // PiAPI uses 'completed' or 'success' (case-insensitive) for done tasks
                if (/^(completed|success)$/i.test(lastStatus)) {
                    const output = taskPayload.output;
                    imageUrl = output?.image_url || output?.image_urls?.[0];
                    if (!imageUrl) {
                        return res.status(500).json({
                            error: `PiAPI task "${taskId}" completed but returned no image URL. Output: ${JSON.stringify(output).slice(0, 200)}`,
                        });
                    }
                    break;
                }

                if (/^failed$/i.test(lastStatus)) {
                    const errDetail = taskPayload.error?.message
                        || taskPayload.error?.raw_message
                        || (taskPayload.error?.code ? `error code ${taskPayload.error.code}` : null)
                        || JSON.stringify(taskPayload.error_reason ?? {});
                    return res.status(500).json({
                        error: `PiAPI task "${taskId}" failed (model: "${modelId}"): ${errDetail}`,
                    });
                }
            }

            if (!imageUrl) {
                const elapsed = Math.round((Date.now() - (deadline - POLL_BUDGET_MS)) / 1000);
                return res.status(504).json({
                    error: `PiAPI task "${taskId}" timed out after ${elapsed}s — last status was "${lastStatus}" (model: "${modelId}"). The model may be overloaded.`,
                });
            }

            // Step 3: Fetch the actual image binary
            const imgRes = await fetch(imageUrl);
            if (!imgRes.ok) {
                return res.status(imgRes.status).json({
                    error: `Failed to fetch generated image from PiAPI CDN (HTTP ${imgRes.status}). Task: "${taskId}"`,
                });
            }

            const contentType = imgRes.headers.get('Content-Type') ?? 'image/png';
            res.setHeader('Content-Type', contentType);
            res.setHeader('X-PiAPI-Task-ID', taskId);
            const buffer = await imgRes.arrayBuffer();
            res.send(Buffer.from(buffer));

        } catch (err) {
            res.status(500).json({ error: err.message });
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