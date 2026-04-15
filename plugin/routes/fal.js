/**
 * @file data/default-user/extensions/personalyze/plugin/routes/fal.js
 * @stamp {"utc":"2026-04-19T14:10:00.000Z"}
 * @architectural-role Server-Side Route Handler
 * @description
 * Implements the Fal AI generation and validation proxy routes.
 * Updated to support Dynamic Blueprint parameters by spreading engineParams 
 * into the upstream API request.
 * 
 * @api-declaration
 * registerFalRoutes(router) -> void
 * 
 * @contract
 *   assertions:
 *     purity: Route Handler
 *     external_io: [Fal AI API, SillyTavern Secrets]
 */

import { readSecret } from '../../../src/endpoints/secrets.js';
import { fetchChecked, withRetry, FATAL_HTTP_CODES } from '../utils/network.js';

/**
 * Registers Fal AI proxy routes.
 * @param {import('express').Router} router 
 */
export function registerFalRoutes(router) {

    // ─── Fal AI: Image Generation ─────────────────────────────────────────────
    router.post('/fal-generate', async (req, res) => {
        try {
            const { model, prompt, width, height, engineParams } = req.body;
            const apiKey = readSecret(req.user.directories, 'api_key_fal');

            if (!apiKey) {
                return res.status(401).json({ error: 'Fal AI API key not configured.' });
            }

            // Step 1: Request generation (Sync mode)
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
                        // DYNAMIC BRIDGE: Spread parameters from the Blueprint
                        ...(engineParams || {})
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
            if (err.httpStatus) {
                const fatal = FATAL_HTTP_CODES.has(err.httpStatus);
                return res.status(err.httpStatus).json({ 
                    error: err.responseText || err.message,
                    fatal 
                });
            }
            res.status(500).json({ error: err.message });
        }
    });

    // ─── Fal AI: Key Validation ───────────────────────────────────────────────
    router.post('/fal-ping', async (req, res) => {
        try {
            const apiKey = readSecret(req.user.directories, 'api_key_fal');
            if (!apiKey) {
                return res.status(401).json({ error: 'Fal AI API key not configured.' });
            }

            // Lightweight check for key presence
            return res.json({ ok: true, user: 'authenticated' });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
}