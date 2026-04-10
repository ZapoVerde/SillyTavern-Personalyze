/**
 * @file data/default-user/extensions/personalyze/plugin/index.js
 * @stamp {"utc":"2026-04-11T10:00:00.000Z"}
 * @architectural-role Server-Side Plugin
 * @description
 * Proxies Fal AI and PiAPI calls for the PersonaLyze extension.
 * This server-side component bypasses CORS restrictions and handles secure
 * API key injection from the SillyTavern secrets vault.
 *
 * Updated to wrap PiAPI CDN fetching in the withRetry block to catch
 * transient EAI_AGAIN DNS resolution errors on newly generated URLs.
 *
 * @contract
 *   assertions:
 *     external_io: [Fal AI API, PiAPI, SillyTavern Secrets]
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

// ─── Retry Utility ────────────────────────────────────────────────────────────

/** Network error codes that indicate a transient connectivity failure. */
const TRANSIENT_NET_CODES = new Set(['EAI_AGAIN', 'ECONNRESET', 'ETIMEDOUT']);

/** HTTP status codes that should never be retried (client/auth errors). */
const FATAL_HTTP_CODES = new Set([400, 401, 403, 404]);

const MAX_RETRY_ATTEMPTS = 5;
const RETRY_BASE_MS      = 100;

/**
 * Performs a fetch and throws a typed error for non-ok HTTP responses.
 * The thrown error carries `httpStatus` and `responseText` for classification
 * and frontend passthrough.
 *
 * @param {string} url
 * @param {object} [options]
 * @returns {Promise<Response>}
 */
async function fetchChecked(url, options) {
    const response = await fetch(url, options);
    if (!response.ok) {
        const text = await response.text();
        const err = new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
        err.httpStatus   = response.status;
        err.responseText = text;
        throw err;
    }
    return response;
}

/**
 * Executes an async task with exponential backoff retry on transient failures.
 *
 * Transient (retry): EAI_AGAIN, ECONNRESET, ETIMEDOUT, HTTP 429, HTTP 5xx.
 * Fatal (abort):     HTTP 400, 401, 403, 404, unknown errors.
 *
 * Backoff schedule (±10% jitter):
 *   Attempt 1 – immediate
 *   Attempt 2 – 100 ms
 *   Attempt 3 – 200 ms
 *   Attempt 4 – 400 ms
 *   Attempt 5 – 800 ms
 *   Final throw – after 1 600 ms additional wait
 *
 * @param {() => Promise<any>} fn    - Async task to execute (should use fetchChecked).
 * @param {string}             label - Tag for console warnings.
 * @returns {Promise<any>}
 */
async function withRetry(fn, label) {
    let lastErr;
    for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastErr = err;

            // Fatal HTTP codes — abort immediately, let the route handle the response
            const httpStatus = err.httpStatus;
            if (httpStatus && FATAL_HTTP_CODES.has(httpStatus)) throw err;

            const netCode  = err.cause?.code || err.code;
            const isTransient =
                TRANSIENT_NET_CODES.has(netCode)                             ||
                httpStatus === 429                                            ||
                (httpStatus !== undefined && httpStatus >= 500 && httpStatus <= 599);

            // Unknown or non-transient errors — abort immediately
            if (!isTransient) throw err;

            const base  = RETRY_BASE_MS * Math.pow(2, attempt - 1);
            const delay = Math.round(base * (0.9 + Math.random() * 0.2));
            const reason = netCode || `HTTP ${httpStatus}`;

            if (attempt < MAX_RETRY_ATTEMPTS) {
                console.warn(`[PLZ:${label}] Connection blip (${reason}), retrying in ${delay}ms... (attempt ${attempt}/${MAX_RETRY_ATTEMPTS})`);
                await new Promise(r => setTimeout(r, delay));
            } else {
                // All attempts exhausted — wait the final backoff step (1 600 ms) then throw
                console.warn(`[PLZ:${label}] All ${MAX_RETRY_ATTEMPTS} attempts failed. Last error: ${reason}`);
                await new Promise(r => setTimeout(r, delay));
                const exhausted = new Error(`${label} failed after ${MAX_RETRY_ATTEMPTS} attempts: ${lastErr.message}`);
                exhausted.exhausted = true;
                throw exhausted;
            }
        }
    }
}

export const info = {
    id: 'personalyze',
    name: 'PersonaLyze',
    description: 'Proxies Fal AI and PiAPI calls for PersonaLyze extension',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function init(router) {

    // ── Fal AI: image generation ──────────────────────────────────────────────
    router.post('/fal-generate', async (req, res) => {
        try {
            const { model, prompt, width, height } = req.body;
            const apiKey = readSecret(req.user.directories, 'api_key_fal');

            if (!apiKey) {
                return res.status(401).json({ error: 'Fal AI API key not configured.' });
            }

            // Step 1: Request generation (Fal returns JSON with a URL)
            const falResponse = await withRetry(
                () => fetchChecked(`https://fal.run/${model}`, {
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
                }),
                'Fal'
            );

            const data = await falResponse.json();
            const imageUrl = data.images?.[0]?.url || data.image?.url;

            if (!imageUrl) {
                return res.status(500).json({ error: 'No image URL returned from Fal AI' });
            }

            // Step 2: Fetch the actual image binary
            const imgRes = await withRetry(() => fetchChecked(imageUrl), 'FalCDN');

            const contentType = imgRes.headers.get('Content-Type') ?? 'image/png';
            res.setHeader('Content-Type', contentType);
            res.send(Buffer.from(await imgRes.arrayBuffer()));

        } catch (err) {
            if (err.httpStatus) return res.status(err.httpStatus).send(err.responseText || '');
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
        const { model, prompt, negative_prompt, width, height, seed, flow_shift, batch_size } = req.body;
        const apiKey = readSecret(req.user.directories, 'api_key_piapi');
        const modelId = model ?? 'Qubico/z-image';

        if (!apiKey) {
            return res.status(401).json({ error: 'PiAPI key not configured.' });
        }

        try {
            const taskResponse = await withRetry(
                () => fetchChecked('https://api.piapi.ai/api/v1/task', {
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
                }),
                'PiAPI'
            );

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
            if (err.httpStatus) {
                return res.status(err.httpStatus).json({
                    error: `PiAPI submit failed (HTTP ${err.httpStatus}) for model "${modelId}": ${err.responseText?.slice(0, 300)}`,
                });
            }
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
                // Generation tasks expose the image at `output`; removal tasks at `task_result.task_output`
                const outputObj = taskPayload.output ?? taskPayload.task_result?.task_output;
                const imageUrl = extractPiapiImageUrl(outputObj);
                if (!imageUrl) {
                    return res.status(500).json({
                        error: `PiAPI task "${task_id}" completed but returned no image URL. Output: ${JSON.stringify(outputObj).slice(0, 200)}`,
                    });
                }
                result.image_url = imageUrl;
                // Removal tasks also return base64 — pass it through so callers can skip the CDN fetch
                if (typeof outputObj?.image_base64 === 'string' && outputObj.image_base64.length > 0) {
                    result.image_base64 = outputObj.image_base64;
                }
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
            const imgRes = await withRetry(() => fetchChecked(image_url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PersonaLyze/1.0)' },
            }), 'PiAPICDN');

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

    // ── PiAPI: submit background-removal task, return task_id immediately ────
    router.post('/piapi-remove-bg', async (req, res) => {
        const { image_url, rmbg_model } = req.body;
        const apiKey = readSecret(req.user.directories, 'api_key_piapi');

        if (!apiKey) {
            return res.status(401).json({ error: 'PiAPI key not configured.' });
        }
        if (!image_url || !image_url.startsWith('http')) {
            return res.status(400).json({ error: 'Missing or invalid image_url.' });
        }

        try {
            const taskResponse = await withRetry(
                () => fetchChecked('https://api.piapi.ai/api/v1/task', {
                    method: 'POST',
                    headers: {
                        'X-API-Key': apiKey,
                        'Content-Type': 'application/json',
                        'User-Agent': 'Mozilla/5.0 (compatible; PersonaLyze/1.0)',
                    },
                    body: JSON.stringify({
                        model: 'Qubico/image-toolkit',
                        task_type: 'background-remove',
                        input: {
                            image:      image_url,
                            rmbg_model: rmbg_model ?? 'BEN2',
                        },
                    }),
                }),
                'PiAPIRmbg'
            );

            const taskData = await taskResponse.json();
            const taskPayload = taskData.data ?? taskData;
            const taskId = taskPayload.task_id;

            if (!taskId) {
                return res.status(500).json({
                    error: `PiAPI remove-bg returned no task_id. Response: ${JSON.stringify(taskData).slice(0, 300)}`,
                });
            }

            return res.json({ task_id: taskId });

        } catch (err) {
            if (err.httpStatus) {
                return res.status(err.httpStatus).json({
                    error: `PiAPI remove-bg submit failed (HTTP ${err.httpStatus}): ${err.responseText?.slice(0, 300)}`,
                });
            }
            const cause = err.cause?.message || err.cause?.code || '';
            res.status(500).json({ error: `${err.message}${cause ? ` (${cause})` : ''}` });
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