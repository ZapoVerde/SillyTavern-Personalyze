/**
 * @file data/default-user/extensions/personalyze/plugin/index.js
 * @stamp {"utc":"2026-04-16T12:40:00.000Z"}
 * @architectural-role Server-Side Plugin Entry Point
 * @description
 * Modular orchestrator for PersonaLyze server-side operations.
 * Routes requests to specialized handlers for different image engines.
 * 
 * Satisfies Rule: Broken down into sub-modules (<300 LOC).
 * 
 * @contract
 *   assertions:
 *     purity: Orchestrator
 *     state_ownership: []
 *     external_io: [Route Registration]
 */

import { registerFalRoutes } from './routes/fal.js';
import { registerPiapiRoutes } from './routes/piapi.js';
import { registerRunwareRoutes } from './routes/runware.js';

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

    // Register engine-specific route handlers
    registerFalRoutes(router);
    registerPiapiRoutes(router);
    registerRunwareRoutes(router);

    console.log('[PLZ] Plugin routes active: Fal, PiAPI, Runware.');
}

/**
 * Plugin exit handler.
 */
export async function exit() {}