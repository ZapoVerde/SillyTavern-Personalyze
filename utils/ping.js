/**
 * @file data/default-user/extensions/personalyze/utils/ping.js
 * @stamp {"utc":"2026-04-07T00:00:00.000Z"}
 * @architectural-role Utility (Connectivity)
 * @description
 * Centralized utility for pinging image generation engines.
 * 
 * Supports Pollinations (direct), Hugging Face (proxy), and Fal AI (proxy).
 * Validates API connectivity and key status via the PersonaLyze server plugin.
 *
 * @api-declaration
 * pingPollinations() → Promise<{ ok: boolean, status?: number, error?: string }>
 * pingHFRouter()      → Promise<{ ok: boolean, user?: string, error?: string }>
 * pingHFSpace(id)     → Promise<{ ok: boolean, info?: object, error?: string }>
 * pingFal()           → Promise<{ ok: boolean, user?: string, error?: string }>
 *
 * @contract
 *   assertions:
 *     purity: IO
 *     state_ownership: []
 *     external_io: [fetch, getRequestHeaders]
 */

import { getRequestHeaders } from '../../../../../script.js';

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
 * @param {string} spaceId - e.g. "owner/space-name"
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

/**
 * Pings Fal AI via the server plugin.
 * Validates the stored API key.
 */
export async function pingFal() {
    try {
        const response = await fetch('/api/plugins/personalyze/fal-ping', {
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