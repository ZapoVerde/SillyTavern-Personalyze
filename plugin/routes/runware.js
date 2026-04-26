/**
 * @file data/default-user/extensions/personalyze/plugin/routes/runware.js
 * @stamp {"utc":"2026-04-18T18:20:00.000Z"}
 * @architectural-role Server-Side Route Handler
 * @description
 * Implements proxy routes for the Runware.ai API. 
 * Updated to support Schema-Driven parameters: the generate route now 
 * dynamically spreads engineParams into the inference task.
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
import { readSecret } from '../../../src/endpoints/secrets.js';
import { fetchChecked, withRetry, FATAL_HTTP_CODES } from '../utils/network.js';

/**
 * Registers Runware proxy routes.
 * @param {import('express').Router} router 
 */
export function registerRunwareRoutes(router) {

    // ─── Runware: Model/LoRA Search ───────────────────────────────────────────
    router.post('/runware-search', async (req, res) => {
        try {
            const { category, limit, search } = req.body;
            const apiKey = readSecret(req.user.directories, 'api_key_runware');

            if (!apiKey) {
                return res.status(401).json({ error: 'Runware API key not configured.' });
            }

            const taskUUID = crypto.randomUUID();
            
            const task = {
                taskType: "modelSearch",
                taskUUID: taskUUID,
                category: category || "checkpoint",
                limit: limit || 100,
            };

            if (search) {
                task.search = search;
            }

            const response = await withRetry(() => fetchChecked('https://api.runware.ai/v1', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}` 
                },
                body: JSON.stringify([task])
            }), 'RunwareSearch');

            const data = await response.json();
            
            if (data.error) {
                throw new Error(`Runware API Error: ${data.errorMessage || data.error}`);
            }

            const taskResult = data.data?.find(t => t.taskUUID === taskUUID);
            const models = taskResult?.models || [];

            return res.json({ models });

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

    // ─── Runware: Image Generation ────────────────────────────────────────────
    router.post('/runware-generate', async (req, res) => {
        try {
            const { 
                positivePrompt, 
                negativePrompt, 
                model, 
                width, 
                height, 
                seed, 
                loras, 
                useLayerDiffuse,
                engineParams 
            } = req.body;
            
            const apiKey = readSecret(req.user.directories, 'api_key_runware');

            if (!apiKey) {
                return res.status(401).json({ error: 'Runware API key not configured.' });
            }

            const taskUUID = crypto.randomUUID();
            
            const finalPrompt = useLayerDiffuse 
                ? `${positivePrompt}, transparent background, isolated on white background`
                : positivePrompt;

            // Construct Base Task Object
            const task = {
                taskType: "imageInference",
                taskUUID: taskUUID,
                positivePrompt: finalPrompt,
                model: model || "runware:100@1",
                width: width || 512,
                height: height || 768,
                numberResults: 1,
                outputType: ["URL"], 
                outputFormat: useLayerDiffuse ? "PNG" : "JPG",
                seed: seed || -1,
                loras: loras || [], 
                layerDiffuse: !!useLayerDiffuse, 
                checkNSFW: false,
                // DYNAMIC BRIDGE: Spread all schema-driven parameters directly into the task.
                // This allows the frontend to send "steps", "guidance", "scheduler", etc.
                ...(engineParams || {})
            };

            if (negativePrompt && String(negativePrompt).trim().length > 0) {
                task.negativePrompt = String(negativePrompt).trim();
            }

            const response = await withRetry(() => fetchChecked('https://api.runware.ai/v1', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}` 
                },
                body: JSON.stringify([task])
            }), 'RunwareGen');

            const data = await response.json();
            
            if (data.error) {
                const err = new Error(`Runware API Error: ${data.errorMessage || data.error}`);
                err.responseDocument = data;
                throw err;
            }

            const taskResult = data.data?.find(t => t.taskUUID === taskUUID);

            if (taskResult?.errorCode) {
                const err = new Error(`Runware task error [${taskResult.errorCode}]: ${taskResult.message || taskResult.errorCode}`);
                err.responseDocument = taskResult;
                throw err;
            }

            const imageUrl = taskResult?.imageURL;

            if (!imageUrl) {
                const err = new Error('Runware failed to return an image URL for the generated task.');
                err.responseDocument = data;
                throw err;
            }

            const imgRes = await withRetry(() => fetchChecked(imageUrl), 'RunwareCDN');

            res.setHeader('Content-Type', useLayerDiffuse ? 'image/png' : 'image/jpeg');
            res.send(Buffer.from(await imgRes.arrayBuffer()));

        } catch (err) {
            if (err.httpStatus) {
                const fatal = FATAL_HTTP_CODES.has(err.httpStatus);
                return res.status(err.httpStatus).json({ 
                    error: err.responseText || err.message,
                    fatal,
                    responseDocument: err.responseDocument
                });
            }
            res.status(500).json({ error: err.message, responseDocument: err.responseDocument });
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

            if (taskResult?.errorCode) {
                throw new Error(`Runware RMBG task error [${taskResult.errorCode}]: ${taskResult.message || taskResult.errorCode}`);
            }

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

    // ─── Runware: Model Upload ────────────────────────────────────────────────
    router.post('/runware-upload-model', async (req, res) => {
        try {
            const { name, air, downloadURL, architecture, category, format, version } = req.body;
            const apiKey = readSecret(req.user.directories, 'api_key_runware');

            if (!apiKey) {
                return res.status(401).json({ error: 'Runware API key not configured.' });
            }

            const taskUUID = crypto.randomUUID();

            const task = {
                taskType: "modelUpload",
                taskUUID,
                air,
                name,
                downloadURL,
                architecture,
                category,
                format: format || "safetensors",
                uniqueIdentifier: crypto.randomUUID().replace(/-/g, ''),
                version: version || "v1",
                private: true,
            };

            const response = await withRetry(() => fetchChecked('https://api.runware.ai/v1', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify([task])
            }), 'RunwareUpload');

            const data = await response.json();

            if (data.error) {
                const err = new Error(`Runware API Error: ${data.errorMessage || data.error}`);
                err.responseDocument = data;
                throw err;
            }

            const taskResult = data.data?.find(t => t.taskUUID === taskUUID);

            if (taskResult?.errorCode) {
                const err = new Error(`Runware upload error [${taskResult.errorCode}]: ${taskResult.message || taskResult.errorCode}`);
                err.responseDocument = taskResult;
                throw err;
            }

            return res.json({ ok: true, result: taskResult, responseDocument: data });

        } catch (err) {
            if (err.httpStatus) {
                const fatal = FATAL_HTTP_CODES.has(err.httpStatus);
                return res.status(err.httpStatus).json({
                    error: err.responseText || err.message,
                    fatal,
                    responseDocument: err.responseDocument
                });
            }
            res.status(500).json({ error: err.message, responseDocument: err.responseDocument });
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