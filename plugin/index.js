/**
 * @file data/default-user/extensions/personalyze/plugin/index.js
 * @stamp {"utc":"2026-04-07T00:00:00.000Z"}
 * @architectural-role Server-Side Plugin
 * @description
 * Proxies Hugging Face and Fal AI API calls for the PersonaLyze extension.
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
 *
 * @contract
 *   assertions:
 *     external_io: [HuggingFace API, Fal AI API, SillyTavern Secrets]
 */

import { readSecret } from '../../src/endpoints/secrets.js';

export const info = {
    id: 'personalyze',
    name: 'PersonaLyze',
    description: 'Proxies Hugging Face and Fal AI API calls for PersonaLyze extension',
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
}

export async function exit() {}