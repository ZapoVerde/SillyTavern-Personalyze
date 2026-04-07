import { readSecret } from '../../src/endpoints/secrets.js';

export const info = {
    id: 'personalyze',
    name: 'PersonaLyze',
    description: 'Proxies image generation API calls for PersonaLyze extension to avoid CORS restrictions',
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

    // ── Pollinations ping ─────────────────────────────────────────────────────
    router.post('/poll-ping', async (req, res) => {
        try {
            const response = await fetch('https://gen.pollinations.ai', { method: 'HEAD' });
            if (response.ok || response.status < 500) {
                return res.json({ ok: true, status: response.status });
            }
            return res.status(503).json({ error: `Pollinations returned ${response.status}` });
        } catch (err) {
            res.status(503).json({ error: err.message });
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

            // Discover the first named Gradio endpoint (falls back to 'predict')
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
            } catch (_) { /* fall through to default */ }

            // Step 1: submit job
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

            // Step 2: read SSE result
            const sseRes = await fetch(`${spaceUrl}/call/${endpoint}/${event_id}`, {
                headers: authHeaders,
            });
            if (!sseRes.ok) {
                return res.status(sseRes.status).json({
                    error: `Gradio SSE failed: ${sseRes.status}`,
                });
            }

            const outputs = await readGradioSSE(sseRes);

            // Find image URL in output array
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
}

export async function exit() {}
