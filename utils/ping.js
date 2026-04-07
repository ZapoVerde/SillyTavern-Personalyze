/**
 * @file data/default-user/extensions/personalyze/utils/ping.js
 * @stamp {"utc":"2026-04-06T00:00:00.000Z"}
 * @architectural-role Utility (Connectivity)
 * @description
 * Centralized utility for pinging image generation engines.
 * 
 * Pollinations is pinged directly via the browser (CORS-safe).
 * Hugging Face engines (Router and Spaces) are pinged via the PersonaLyze
 * server plugin to handle API keys and Gradio info discovery safely.
 *
 * @api-declaration
 * pingPollinations() → Promise<{ ok: boolean, status?: number, error?: string }>
 * pingHFRouter()      → Promise<{ ok: boolean, user?: string, error?: string }>
 * pingHFSpace(id)     → Promise<{ ok: boolean, info?: object, error?: string }>
 *
 * @contract
 *   assertions:
 *     purity: IO
 *     state_ownership: []
 *     external_io: [fetch, getRequestHeaders]
 */

import { getRequestHeaders } from '../../../../script.js';

/**
 * Pings the Pollinations gateway directly from the browser.
 * Uses a HEAD request to minimize bandwidth.
 */
export async function pingPollinations() {
    try {
        const response = await fetch('https://gen.pollinations.ai', { 
            method: 'HEAD',
            mode: 'cors' 
        });
        
        if (response.ok || response.status < 500) {
            return { ok: true, status: response.status };
        }
        
        return { ok: false, error: `Server returned ${response.status}` };
    } catch (err) {
        return { ok: false, error: err.message };
    }
}

/**
 * Pings the Hugging Face Inference Router via the server plugin.
 * Validates the stored API key and returns the authenticated username.
 */
export async function pingHFRouter() {
    try {
        const response = await fetch('/api/plugins/personalyze/hf-ping', {
            method: 'POST',
            headers: getRequestHeaders(),
        });
        
        const data = await response.json();
        
        if (response.ok) {
            return { ok: true, user: data.user };
        }
        
        return { ok: false, error: data.error || `HTTP ${response.status}` };
    } catch (err) {
        return { ok: false, error: err.message };
    }
}

/**
 * Pings a Hugging Face Space via the server plugin.
 * Returns metadata about the Space's Gradio status and hardware.
 * 
 * @param {string} spaceId - e.g. "black-forest-labs/FLUX.1-schnell"
 */
export async function pingHFSpace(spaceId) {
    if (!spaceId || !spaceId.includes('/')) {
        return { ok: false, error: 'Invalid Space ID format (expected owner/name)' };
    }

    try {
        const response = await fetch('/api/plugins/personalyze/space-ping', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ spaceId }),
        });
        
        const data = await response.json();
        
        if (response.ok) {
            return { ok: true, info: data.info };
        }
        
        return { ok: false, error: data.error || `HTTP ${response.status}` };
    } catch (err) {
        return { ok: false, error: err.message };
    }
}