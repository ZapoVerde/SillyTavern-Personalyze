/**
 * @file data/default-user/extensions/personalyze/utils/ping.js
 * @stamp {"utc":"2026-04-07T00:00:00.000Z"}
 * @architectural-role Utility (Connectivity)
 * @description
 * Centralized utility for pinging image generation engines.
 *
 * Supports Pollinations (direct), Fal AI (proxy), and PiAPI (proxy).
 * Validates API connectivity and key status via the PersonaLyze server plugin.
 *
 * @api-declaration
 * pingPollinations() → Promise<{ ok: boolean, status?: number, error?: string }>
 * pingFal()           → Promise<{ ok: boolean, user?: string, error?: string }>
 * pingPiAPI()         → Promise<{ ok: boolean, user?: string, error?: string }>
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
 * Pings Fal AI via the server plugin.
 * Validates the stored API key.
 */
export async function pingFal() {
    try {
        const response = await fetch('/api/plugins/personalyze/fal-ping', {
            method: 'POST',
            headers: getRequestHeaders(),
        });

        const contentType = response.headers.get('Content-Type') ?? '';
        if (!contentType.includes('application/json')) {
            return { ok: false, error: `Plugin not responding (HTTP ${response.status}). Server restart may be required.` };
        }

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
 * Pings PiAPI via the server plugin.
 * Validates the stored API key.
 */
export async function pingPiAPI() {
    try {
        const response = await fetch('/api/plugins/personalyze/piapi-ping', {
            method: 'POST',
            headers: getRequestHeaders(),
        });

        const contentType = response.headers.get('Content-Type') ?? '';
        if (!contentType.includes('application/json')) {
            return { ok: false, error: `Plugin not responding (HTTP ${response.status}). Server restart may be required.` };
        }

        const data = await response.json();

        if (response.ok) {
            return { ok: true, user: data.user };
        }

        return { ok: false, error: data.error || `HTTP ${response.status}` };
    } catch (err) {
        return { ok: false, error: err.message };
    }
}