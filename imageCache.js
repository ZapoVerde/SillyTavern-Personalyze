/**
 * @file data/default-user/extensions/personalyze/imageCache.js
 * @stamp {"utc":"2026-04-04T00:00:00.000Z"}
 * @architectural-role IO Executor (Image)
 * @description
 * Owns all image-related IO for PersonaLyze.
 *
 * Builds the "Prompt Sandwich" from character data and delegates to Pollinations
 * for generation. Uploads resulting images to ST's backgrounds store under the
 * deterministic PLZ naming convention:
 *   plz_{characterId}_{outfitKey}_{expressionKey}.png
 *
 * Provides a file-index fetch scoped to PLZ-prefixed files, and a preview blob
 * fetcher used by the Dressing Room modal before committing a new entry.
 *
 * @api-declaration
 * buildFilenamePrefix(characterId, outfitKey, expressionKey) → string  (no extension, used as search prefix)
 * findCachedImage(prefix, fileIndex) → string|null
 * buildPortraitPrompt(anchor, outfitDescription, expressionDescription) → string
 * fetchFileIndex() → Promise<{ fileIndex: Set<string>, allImages: string[] }>
 * fetchPreviewBlob(prompt, characterId) → Promise<string> (Object URL)
 * generate(characterId, outfitKey, expressionKey, outfitDef, expressionDef, anchor) → Promise<string> (filename)
 *
 * @contract
 *   assertions:
 *     purity: IO
 *     state_ownership: []
 *     external_io: [findSecret, fetch(/api/backgrounds/all), fetch(/api/backgrounds/upload), Pollinations API]
 */

import { getRequestHeaders } from '../../../../script.js';
import { findSecret } from '../../../secrets.js';
import { getCharacter } from './registry.js';
import {
    POLLINATIONS_BASE_URL,
    DEFAULT_IMAGE_MODEL,
    DEFAULT_IMAGE_WIDTH,
    DEFAULT_IMAGE_HEIGHT,
    DEV_IMAGE_WIDTH,
    DEV_IMAGE_HEIGHT,
    DEFAULT_VN_STYLE_SUFFIX,
} from './defaults.js';
import { getSettings } from './settings.js';

const SECRET_KEY_NAME = 'api_key_pollinations';
const FILE_PREFIX     = 'plz_';

// ─── Naming ───────────────────────────────────────────────────────────────────

/**
 * Returns the filename prefix for an outfit × expression combination.
 * Actual saved files append a Unix-ms timestamp before the extension:
 *   plz_{characterId}_{outfitKey}_{expressionKey}_{timestamp}.png
 * Use this prefix with findCachedImage() to locate existing files.
 * @param {string} characterId
 * @param {string} outfitKey
 * @param {string} expressionKey
 * @returns {string}  e.g. "plz_claire_armor_joy_"
 */
export function buildFilenamePrefix(characterId, outfitKey, expressionKey) {
    return `${FILE_PREFIX}${characterId}_${outfitKey}_${expressionKey}_`;
}

/**
 * Finds the most recent cached image file for a given prefix.
 * Returns the matching filename, or null if none exists.
 * When multiple timestamped versions exist the last one (highest timestamp) wins.
 * @param {string}      prefix     From buildFilenamePrefix().
 * @param {Set<string>} fileIndex
 * @returns {string|null}
 */
export function findCachedImage(prefix, fileIndex) {
    let best = null;
    for (const f of fileIndex) {
        if (f.startsWith(prefix) && (!best || f > best)) best = f;
    }
    return best;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function getAuthHeaders() {
    const userKey = await findSecret(SECRET_KEY_NAME);

    if (!userKey) {
        throw new Error(
            'Pollinations API key not found or blocked.\n\n' +
            '1. Ensure the key is set in ST API settings (Pollinations).\n' +
            '2. In SillyTavern/config.yaml, set "allowKeysExposure: true" then restart the server.'
        );
    }

    return { 'Authorization': `Bearer ${userKey}` };
}

// ─── Prompt Builder ───────────────────────────────────────────────────────────

/**
 * Assembles the portrait prompt.
 *
 * When the suffix template contains any of {{character}}, {{outfit}}, or
 * {{expression}}, those variables are substituted and the result is used as
 * the entire prompt.  Unresolved variables (empty value) are replaced with an
 * empty string and the surrounding comma+space is collapsed.
 *
 * When the suffix contains no variables the legacy "sandwich" behaviour is
 * preserved: [anchor, outfit, expression, suffix] joined by ", ".
 *
 * @param {string} anchor           The character's permanent appearance description.
 * @param {string} outfitDescription
 * @param {string} expressionDescription
 * @returns {string}
 */
export function buildPortraitPrompt(anchor, outfitDescription, expressionDescription) {
    const s = getSettings();
    const suffix = s.vnStyleSuffix ?? DEFAULT_VN_STYLE_SUFFIX;

    const hasVars = /\{\{(character|outfit|expression)\}\}/.test(suffix);
    if (hasVars) {
        return suffix
            .replace(/\{\{character\}\}/g,  anchor              ?? '')
            .replace(/\{\{outfit\}\}/g,      outfitDescription   ?? '')
            .replace(/\{\{expression\}\}/g,  expressionDescription ?? '')
            // collapse ", , " or leading/trailing ", " left by empty vars
            .replace(/(,\s*)+,/g, ',')
            .replace(/^[,\s]+|[,\s]+$/g, '')
            .trim();
    }

    return [anchor, outfitDescription, expressionDescription, suffix]
        .filter(Boolean)
        .join(', ');
}

// ─── Pollinations Helpers ─────────────────────────────────────────────────────

function buildPollinationsUrl(prompt, width, height, seed) {
    const s = getSettings();
    const params = new URLSearchParams({
        width:  String(width),
        height: String(height),
        model:  s.imageModel ?? DEFAULT_IMAGE_MODEL,
        nologo: 'true',
        seed:   String(seed),
        safe:   'false',
    });
    return `${POLLINATIONS_BASE_URL}/image/${encodeURIComponent(prompt)}?${params.toString()}`;
}

/**
 * Fetches a Pollinations URL with up to 3 automatic retries on 5xx errors,
 * using exponential backoff (1 s, 2 s, 4 s).
 * 4xx and network errors on the final attempt are re-thrown as-is.
 * @param {string} url
 * @param {Record<string, string>} headers
 * @param {number} [maxRetries=3]
 * @returns {Promise<Response>}
 */
async function fetchPollinationsWithRetry(url, headers, maxRetries = 3) {
    let lastResponse;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetch(url, { headers });
            if (response.status < 500) return response;
            lastResponse = response;
        } catch (err) {
            if (attempt < maxRetries) {
                const delay = 1000 * Math.pow(2, attempt);
                console.debug(`PersonaLyze: Pollinations network error – retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})…`);
                await new Promise(r => setTimeout(r, delay));
                continue;
            }
            console.error('PersonaLyze: Pollinations network error after all retries:', err);
            throw err;
        }
        if (attempt < maxRetries) {
            const delay = 1000 * Math.pow(2, attempt);
            console.debug(`PersonaLyze: Pollinations ${lastResponse.status} – retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})…`);
            await new Promise(r => setTimeout(r, delay));
        }
    }
    console.error(`PersonaLyze: Pollinations ${lastResponse.status} after all retries – giving up.`);
    return lastResponse;
}

async function validateImageResponse(response) {
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Pollinations API Error (${response.status}): ${text}`);
    }
    const contentType = response.headers.get('Content-Type');
    if (!contentType || !contentType.startsWith('image/')) {
        const text = await response.text();
        throw new Error(`Expected image, but received ${contentType}: ${text}`);
    }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetches all background filenames from the server and returns those that belong to PLZ.
 * @returns {Promise<{ fileIndex: Set<string>, allImages: string[] }>}
 */
export async function fetchFileIndex() {
    const res = await fetch('/api/backgrounds/all', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({}),
    });
    const data = await res.json();
    const allImages = data.images ?? [];
    const fileIndex = new Set(allImages.filter(f => f.startsWith(FILE_PREFIX)));
    return { fileIndex, allImages };
}

/**
 * Fetches a small preview image from Pollinations and returns a local blob URL.
 * Used by the Dressing Room modal before the user approves a new definition.
 * @param {string} prompt        The fully assembled image prompt.
 * @param {string} characterId   Used to look up the character's seed (1–98).
 * @returns {Promise<string>}  An object URL valid for this session.
 */
export async function fetchPreviewBlob(prompt, characterId) {
    const seed    = getCharacter(characterId)?.seed ?? 1;
    const url     = buildPollinationsUrl(prompt, DEV_IMAGE_WIDTH, DEV_IMAGE_HEIGHT, seed);
    const headers = await getAuthHeaders();
    const res     = await fetchPollinationsWithRetry(url, headers);
    await validateImageResponse(res);
    return URL.createObjectURL(await res.blob());
}

/**
 * Generates a full-resolution portrait for an outfit × expression combination,
 * uploads it to the server, and returns the deterministic filename.
 * @param {string} characterId
 * @param {string} outfitKey
 * @param {string} expressionKey
 * @param {string} outfitDescription
 * @param {string} expressionLabel     The ST expression label (e.g. "joy") — used directly in prompt.
 * @param {string} anchor              The character's identity anchor string.
 * @returns {Promise<string>}          The saved filename (e.g. plz_claire_armor_joy.png).
 */
export async function generate(
    characterId,
    outfitKey,
    expressionKey,
    outfitDescription,
    expressionLabel,
    anchor
) {
    const s        = getSettings();
    const devMode  = s.devMode ?? false;
    const width    = devMode ? DEV_IMAGE_WIDTH  : DEFAULT_IMAGE_WIDTH;
    const height   = devMode ? DEV_IMAGE_HEIGHT : DEFAULT_IMAGE_HEIGHT;

    const prompt   = buildPortraitPrompt(anchor, outfitDescription, expressionLabel);
    const seed     = getCharacter(characterId)?.seed ?? 1;
    const url      = buildPollinationsUrl(prompt, width, height, seed);
    const headers  = await getAuthHeaders();

    const imgRes = await fetchPollinationsWithRetry(url, headers);
    await validateImageResponse(imgRes);

    const filename = `${buildFilenamePrefix(characterId, outfitKey, expressionKey)}${Date.now()}.png`;
    const blob     = await imgRes.blob();
    const file     = new File([blob], filename, { type: 'image/png' });

    const formData = new FormData();
    formData.append('avatar', file);

    const uploadRes = await fetch('/api/backgrounds/upload', {
        method: 'POST',
        headers: getRequestHeaders({ omitContentType: true }),
        body: formData,
    });

    if (!uploadRes.ok) {
        throw new Error(`Portrait upload failed: ${uploadRes.status} ${uploadRes.statusText}`);
    }

    return filename;
}
