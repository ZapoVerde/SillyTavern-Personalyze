/**
 * @file data/default-user/extensions/personalyze/plugin/utils/network.js
 * @stamp {"utc":"2026-04-16T12:20:00.000Z"}
 * @architectural-role Server-Side Utility
 * @description
 * Shared networking utilities for PersonaLyze server-side components.
 * Provides exponential backoff retry logic and concurrency management for external APIs.
 * 
 * @api-declaration
 * piapiAcquire() -> Promise<void>
 * piapiRelease() -> void
 * fetchChecked(url, options) -> Promise<Response>
 * withRetry(fn, label) -> Promise<any>
 * FATAL_HTTP_CODES: Set<number>
 * 
 * @contract
 *   assertions:
 *     purity: IO Utility
 *     state_ownership: [Concurrency Queue]
 *     external_io: [fetch]
 */

// ─── PiAPI Concurrency Limiter ─────────────────────────────────────────────────
const MAX_PIAPI_CONCURRENT = 2;
let _piapiActive = 0;
const _piapiQueue = [];

/**
 * Acquires a slot for a PiAPI network operation.
 */
export function piapiAcquire() {
    return new Promise(resolve => {
        if (_piapiActive < MAX_PIAPI_CONCURRENT) { 
            _piapiActive++; 
            resolve(); 
        } else { 
            _piapiQueue.push(resolve); 
        }
    });
}

/**
 * Releases a PiAPI concurrency slot.
 */
export function piapiRelease() {
    if (_piapiQueue.length > 0) { 
        _piapiActive++; 
        _piapiQueue.shift()(); 
    } else { 
        _piapiActive--; 
    }
}

// ─── Retry Utility ────────────────────────────────────────────────────────────

/** Network error codes that indicate a transient connectivity failure. */
const TRANSIENT_NET_CODES = new Set(['EAI_AGAIN', 'ECONNRESET', 'ETIMEDOUT']);

/** HTTP status codes that should never be retried (client/auth errors). */
export const FATAL_HTTP_CODES = new Set([400, 401, 403, 404]);

const MAX_RETRY_ATTEMPTS = 5;
const RETRY_BASE_MS      = 100;

/**
 * Performs a fetch and throws a typed error for non-ok HTTP responses.
 * 
 * @param {string} url
 * @param {object} [options]
 * @returns {Promise<Response>}
 */
export async function fetchChecked(url, options) {
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
 * @param {() => Promise<any>} fn    - Async task to execute.
 * @param {string}             label - Tag for console warnings.
 * @returns {Promise<any>}
 */
export async function withRetry(fn, label) {
    let lastErr;
    for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastErr = err;

            const httpStatus = err.httpStatus;
            if (httpStatus && FATAL_HTTP_CODES.has(httpStatus)) throw err;

            const netCode  = err.cause?.code || err.code;
            const isTransient =
                TRANSIENT_NET_CODES.has(netCode)                             ||
                httpStatus === 429                                            ||
                (httpStatus !== undefined && httpStatus >= 500 && httpStatus <= 599);

            if (!isTransient) throw err;

            const base  = RETRY_BASE_MS * Math.pow(2, attempt - 1);
            const delay = Math.round(base * (0.9 + Math.random() * 0.2));
            const reason = netCode || `HTTP ${httpStatus}`;

            if (attempt < MAX_RETRY_ATTEMPTS) {
                console.warn(`[PLZ:${label}] Connection blip (${reason}), retrying in ${delay}ms... (attempt ${attempt}/${MAX_RETRY_ATTEMPTS})`);
                await new Promise(r => setTimeout(r, delay));
            } else {
                console.warn(`[PLZ:${label}] All ${MAX_RETRY_ATTEMPTS} attempts failed. Last error: ${reason}`);
                const exhausted = new Error(`${label} failed after ${MAX_RETRY_ATTEMPTS} attempts: ${lastErr.message}`);
                exhausted.exhausted = true;
                throw exhausted;
            }
        }
    }
}