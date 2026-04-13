/**
 * @file data/default-user/extensions/personalyze/plugin/routes/runware.js
 * @stamp {"utc":"2026-04-16T19:10:00.000Z"}
 * @architectural-role Server-Side Route Handler
 * @description
 * Implements proxy routes for the Runware.ai API. 
 * Supports high-performance image inference with native transparency (LayerDiffuse),
 * visual preset LoRAs, and standalone background removal.
 * 
 * Updated for Style-Specific Negative Prompts:
 * 1. The /runware-generate route now accepts negativePrompt from the frontend.
 * 2. negativePrompt is included in the imageInference task payload.
 * 
 * @api-declaration
 * registerRunwareRoutes(router) -> void
 * 
 * @contract
 *   assertions:
 *     purity: Route Handler
 *     external_io: [Runware REST API, SillyTavern Secrets]
 */

import crypto from 'crypto';
import { readSecret } from '../../src/endpoints/secrets.js';
import { fetchChecked, withRetry, FATAL_HTTP_CODES } from '../utils/network.js';

/**
 * Registers Runware proxy routes.
 * @param {import('express').Router} router 
 */
export function registerRunwareRoutes(router) {

    // ─── Runware: Image Generation ────────────────────────────────────────────
    router.post('/runware-generate', async (req, res) => {
        try {
            const { positivePrompt, negativePrompt, model, width, height, seed, loras, useLayerDiffuse } = req.body;
            const apiKey = readSecret(req.user.directories, 'api_key_runware');

            if (!apiKey) {
                return res.status(401).json({ error: 'Runware API key not configured.' });
            }

            // Runware requires a strict UUID v4 for taskUUID
            const taskUUID = crypto.randomUUID();
            
            // Server-side prompt enhancement for better isolation during LayerDiffuse
            const finalPrompt = useLayerDiffuse 
                ? `${positivePrompt}, transparent background, isolated on white background`
                : positivePrompt;

            // Construct Runware Task Array
            const payload = [{
                taskType: "imageInference",
                taskUUID: taskUUID,
                positivePrompt: finalPrompt,
                negativePrompt: negativePrompt || "",
                model: model || "runware:101@1",
                width: width || 512,
                height: height || 768,
                numberResults: 1,
                outputType: ["URL"], // Schema Fix: Must be array
                outputFormat: useLayerDiffuse ? "PNG" : "JPG",
                seed: seed || -1,
                loras: loras || [], // Schema Fix: Must be plural 'loras'
                layerDiffuse: !!useLayerDiffuse, 
                checkNSFW: false
            }];

            const response = await withRetry(() => fetchChecked('https://api.runware.ai/v1', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}` 
                },
                body: JSON.stringify(payload)
            }), 'RunwareGen');

            const data = await response.json();
            
            if (data.error) {
                throw new Error(`Runware API Error: ${data.errorMessage || data.error}`);
            }

            const taskResult = data.data?.find(t => t.taskUUID === taskUUID);
            const imageUrl = taskResult?.imageURL;

            if (!imageUrl) {
                throw new Error('Runware failed to return an image URL for the generated task.');
            }

            // Step 2: Fetch binary from CDN
            const imgRes = await withRetry(() => fetchChecked(imageUrl), 'RunwareCDN');

            res.setHeader('Content-Type', useLayerDiffuse ? 'image/png' : 'image/jpeg');
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

    // ─── Runware: Background Removal (Post-Process) ───────────────────────────
    router.post('/runware-remove-bg', async (req, res) => {
        try {
            const { image_url, image_base64, model } = req.body;
            const apiKey = readSecret(req.user.directories, 'api_key_runware');

            if (!apiKey) {
                return res.status(401).json({ error: 'Runware API key not configured.' });
            }

            const taskUUID = crypto.randomUUID();
            
            const payload = [{
                taskType: "imageBackgroundRemoval",
                taskUUID: taskUUID,
                inputImage: image_url || image_base64,
                outputFormat: "PNG",
                model: model || "rembg:1@4"
            }];

            const response = await withRetry(() => fetchChecked('https://api.runware.ai/v1', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}` 
                },
                body: JSON.stringify(payload)
            }), 'RunwareRmbg');

            const data = await response.json();

            if (data.error) {
                throw new Error(`Runware API Error: ${data.errorMessage || data.error}`);
            }

            const taskResult = data.data?.find(t => t.taskUUID === taskUUID);
            const imageUrl = taskResult?.imageURL;

            if (!imageUrl) {
                throw new Error('Runware RMBG failed to return a result URL.');
            }

            const imgRes = await withRetry(() => fetchChecked(imageUrl), 'RunwareCDN');
            res.setHeader('Content-Type', 'image/png');
            res.send(Buffer.from(await imgRes.arrayBuffer()));

        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ─── Runware: Key Validation ──────────────────────────────────────────────
    router.post('/runware-ping', async (req, res) => {
        try {
            const apiKey = readSecret(req.user.directories, 'api_key_runware');
            if (!apiKey) {
                return res.status(401).json({ error: 'Runware API key not configured.' });
            }

            const response = await fetch('https://api.runware.ai/v1', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}` 
                },
                body: JSON.stringify([{
                    taskType: "modelSearch",
                    taskUUID: crypto.randomUUID(),
                    search: "pony",
                    category: "checkpoint",
                    limit: 1
                }])
            });

            if (response.ok) {
                const data = await response.json();
                if (data.error) return res.status(401).json({ error: data.errorMessage });
                return res.json({ ok: true });
            }

            return res.status(response.status).json({ error: `Runware Ping failed (${response.status})` });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
}