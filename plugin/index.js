/**
 * @file data/default-user/extensions/personalyze/plugin/index.js
 * @stamp {"utc":"2026-04-17T14:40:00.000Z"}
 * @architectural-role Server-Side Plugin Entry Point
 * @description
 * Modular orchestrator for PersonaLyze server-side operations.
 * Routes requests to specialized handlers for different image engines.
 * 
 * Updated:
 * 1. Added /keys-status route to verify existence of custom extension keys (runware, fal, piapi)
 *    that are excluded from SillyTavern's default frontend secret state.
 * 
 * @contract
 *   assertions:
 *     purity: Orchestrator
 *     state_ownership: []
 *     external_io: [Route Registration, SillyTavern Secret Reader]
 */

import { registerFalRoutes } from './routes/fal.js';
import { registerPiapiRoutes } from './routes/piapi.js';
import { registerRunwareRoutes } from './routes/runware.js';
import { readSecret } from '../../src/endpoints/secrets.js';

export const info = {
    id: 'personalyze',
    name: 'PersonaLyze',
    description: 'Modular proxy for Fal AI, PiAPI, and Runware.ai generation services',
};

/**
 * Initializes the PersonaLyze plugin routes.
 * 
 * @param {import('express').Router} router 
 */
export async function init(router) {
    console.log('[PLZ] Initializing modular plugin routes...');

    // ─── Custom Secret Verification ──────────────────────────────────────────
    // Checks if keys exist in secrets.json without exposing their values.
    router.post('/keys-status', (req, res) => {
        try {
            const { keys } = req.body;
            if (!Array.isArray(keys)) return res.status(400).json({ error: 'Keys must be an array.' });

            const results = {};
            for (const key of keys) {
                const val = readSecret(req.user.directories, key);
                results[key] = !!(val && String(val).trim().length > 0);
            }
            return res.json(results);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Register engine-specific route handlers
    registerFalRoutes(router);
    registerPiapiRoutes(router);
    registerRunwareRoutes(router);

    console.log('[PLZ] Plugin routes active: Status, Fal, PiAPI, Runware.');
}

/**
 * Plugin exit handler.
 */
export async function exit() {}