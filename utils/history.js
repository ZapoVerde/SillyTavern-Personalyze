/**
 * @file data/default-user/extensions/personalyze/utils/history.js
 * @stamp {"utc":"2026-04-04T00:00:00.000Z"}
 * @architectural-role Pure Functions / Text Processor
 * @description
 * Pure string and array utilities for the PersonaLyze pipeline.
 *
 * Provides transcript builders for LLM context windows and the slugify
 * function used to derive immutable registry keys from user-facing labels.
 *
 * @api-declaration
 * escapeHtml(str)                                → string
 * slugify(label)                                 → string
 * buildHistoryText(chat, beforeIndex, numPairs)  → string
 * buildDescriberContext(chat, messageId, numPairs) → string
 *
 * @contract
 *   assertions:
 *     purity: pure
 *     state_ownership: none
 *     external_io: none
 */

/**
 * Escapes HTML special characters for safe rendering in popups and UI elements.
 * @param {string|null|undefined} str
 * @returns {string}
 */
export function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Derives an immutable, URL-safe registry key from a display label.
 * Called once at entry creation time. The resulting key is never modified.
 *
 * Examples:
 *   "Red Evening Dress" → "red_evening_dress"
 *   "Tearful Smile!"    → "tearful_smile"
 *
 * @param {string|null|undefined} label
 * @returns {string}
 */
export function slugify(label) {
    return (label ?? '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '');
}

/**
 * Builds a formatted transcript of preceding turns for LLM context.
 * Excludes the message at beforeIndex itself — only prior context is included.
 *
 * @param {object[]} chat        The full context.chat array.
 * @param {number}   beforeIndex The index of the message currently being evaluated.
 * @param {number}   numPairs    Number of (User + AI) turn pairs to include.
 * @returns {string}
 */
export function buildHistoryText(chat, beforeIndex, numPairs) {
    if (numPairs <= 0) return '';

    const start = Math.max(0, beforeIndex - (numPairs * 2));
    const slice = chat.slice(start, beforeIndex);
    if (!slice.length) return '';

    const transcript = slice
        .map(m => `${m.name ?? 'Unknown'}: ${m.mes ?? ''}`)
        .join('\n\n');

    return `Preceding turns:\n${transcript}\n\n`;
}

/**
 * Builds a formatted transcript for Step 3 (Describer) calls.
 * Unlike buildHistoryText, includes the trigger message at messageId as the
 * final turn so the LLM can extract the visual detail from the most recent text.
 *
 * @param {object[]} chat       The full context.chat array.
 * @param {number}   messageId  The index of the trigger message.
 * @param {number}   numPairs   Number of preceding (User + AI) pairs to include.
 * @returns {string}
 */
export function buildDescriberContext(chat, messageId, numPairs) {
    const start = Math.max(0, messageId - (numPairs * 2));
    const slice = chat.slice(start, messageId + 1);

    return slice
        .map(m => `${m.name ?? 'Unknown'}: ${m.mes ?? ''}`)
        .join('\n\n');
}
