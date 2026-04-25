/**
 * @file data/default-user/extensions/personalyze/logic/lorebookUtils.js
 * @stamp {"utc":"2026-04-25T00:00:00.000Z"}
 * @architectural-role Pure Functions
 * @description
 * Pure data manipulation functions for PLZ lorebook operations.
 * No network calls, no side effects, no module state.
 *
 * The protected space model: PLZ owns everything below the -\*-\*- delimiter.
 * CNZ owns everything above it. Neither extension touches the other's half.
 * The delimiter must be written as \n\n-\*-\*-\n so CNZ's stitchProtectedBlock
 * regex (/\n\n-\*-\*-[\s\S]*/) can locate and re-attach it correctly.
 *
 * @api-declaration
 * findEntryUid, formatIdentityMarker, stitchIdentityMarker,
 * keywordUnion, nextEntryUid, makeLbEntry
 *
 * @contract
 *   assertions:
 *     purity: pure
 *     state_ownership: [none]
 *     external_io: [none]
 */

// Split on the marker itself, tolerating optional surrounding whitespace.
// Matches CNZ's PROTECTED_DELIMITER_REGEX so strip/stitch behaviour is symmetric.
const SPLIT_REGEX = /[ \t]*-\*-\*-[ \t]*/;

// ─── Entry Searcher ───────────────────────────────────────────────────────────

/**
 * Finds a lorebook entry matching this PLZ character.
 * Priority 1 — key intersection: any existing entry key matches characterId or
 *   an AKA (case-insensitive).
 * Priority 2 — comment match: entry.comment matches the display label.
 *
 * @param {object}   lbData      Full lorebook object { entries: {} }.
 * @param {string}   characterId Canonical PLZ ID.
 * @param {string}   label       Display name / entry comment.
 * @param {string[]} akaList     Alias list.
 * @returns {string|null}        String uid key, or null if not found.
 */
export function findEntryUid(lbData, characterId, label, akaList = []) {
    const plzKeys  = new Set([characterId, ...akaList].map(k => k.toLowerCase()));
    const entries  = lbData?.entries ?? {};

    for (const [uid, entry] of Object.entries(entries)) {
        const entryKeys = (Array.isArray(entry.key) ? entry.key : []).map(k => k.toLowerCase());
        if (entryKeys.some(k => plzKeys.has(k))) return uid;
    }

    const labelLower = label.toLowerCase();
    for (const [uid, entry] of Object.entries(entries)) {
        if ((entry.comment ?? '').toLowerCase() === labelLower) return uid;
    }

    return null;
}

// ─── Marker Formatter ─────────────────────────────────────────────────────────

/**
 * Formats a granular identity map into the PLZ protected block string.
 * The block begins with \n\n-*-*-\n so CNZ's stitchProtectedBlock can locate it.
 * Empty values are omitted.
 *
 * @param {object} identityMap  { hair: '...', eyes: '...', ... }
 * @returns {string}
 */
export function formatIdentityMarker(identityMap) {
    const lines = Object.entries(identityMap)
        .filter(([, val]) => val && String(val).trim())
        .map(([key, val]) => {
            const label = key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
            return `${label}: ${String(val).trim()}`;
        });
    if (!lines.length) return '';
    return '\n\n-*-*-\n' + lines.join('\n');
}

// ─── Content Stitcher ─────────────────────────────────────────────────────────

/**
 * Replaces the PLZ protected block in `existingContent` with `newMarker`,
 * preserving whatever narrative biography sits above the delimiter.
 * If no delimiter is present, appends the marker to the bottom.
 *
 * @param {string} existingContent  Current full entry content (may have a marker).
 * @param {string} newMarker        New formatted PLZ block (from formatIdentityMarker).
 * @returns {string}
 */
export function stitchIdentityMarker(existingContent, newMarker) {
    if (!existingContent) return newMarker;
    const narrative = existingContent.split(SPLIT_REGEX)[0].trimEnd();
    return narrative + newMarker;
}

// ─── Keyword Union ────────────────────────────────────────────────────────────

/**
 * Merges existing lorebook entry keys with PLZ's canonical keys,
 * deduplicating case-insensitively (existing casing wins).
 *
 * @param {string[]} existingKeys  Current entry.key array.
 * @param {string[]} plzKeys       [characterId, ...akaList].
 * @returns {string[]}
 */
export function keywordUnion(existingKeys, plzKeys) {
    const seen = new Map((existingKeys ?? []).map(k => [k.toLowerCase(), k]));
    for (const key of plzKeys) {
        if (!seen.has(key.toLowerCase())) seen.set(key.toLowerCase(), key);
    }
    return [...seen.values()];
}

// ─── UID Generator ────────────────────────────────────────────────────────────

/**
 * Returns the next available integer UID for a new lorebook entry.
 * @param {object} lbData  Full lorebook object.
 * @returns {number}
 */
export function nextEntryUid(lbData) {
    const keys = Object.keys(lbData?.entries ?? {}).map(Number).filter(n => !isNaN(n));
    return keys.length ? Math.max(...keys) + 1 : 0;
}

// ─── Entry Builder ────────────────────────────────────────────────────────────

/**
 * Constructs a complete ST worldinfo entry object.
 * Mirrors the canonical entry schema used by ST and CNZ.
 *
 * @param {number}   uid      Integer UID.
 * @param {string}   comment  Entry display name.
 * @param {string[]} keys     Trigger keys.
 * @param {string}   content  Full entry content string.
 * @returns {object}
 */
export function makeLbEntry(uid, comment, keys, content) {
    return {
        uid,
        key:                       keys,
        keysecondary:              [],
        comment,
        content,
        constant:                  false,
        vectorized:                false,
        selective:                 true,
        selectiveLogic:            0,
        addMemo:                   true,
        order:                     100,
        position:                  0,
        disable:                   false,
        ignoreBudget:              false,
        excludeRecursion:          false,
        preventRecursion:          false,
        matchPersonaDescription:   false,
        matchCharacterDescription: false,
        matchCharacterPersonality: false,
        matchCharacterDepthPrompt: false,
        matchScenario:             false,
        matchCreatorNotes:         false,
        delayUntilRecursion:       0,
        probability:               100,
        useProbability:            true,
        depth:                     4,
        outletName:                '',
        group:                     '',
        groupOverride:             false,
        groupWeight:               100,
        scanDepth:                 null,
        caseSensitive:             null,
        matchWholeWords:           null,
        useGroupScoring:           null,
        automationId:              '',
        role:                      0,
        sticky:                    null,
        cooldown:                  null,
        delay:                     null,
        triggers:                  [],
        displayIndex:              uid,
    };
}
