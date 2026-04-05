/**
 * @file data/default-user/extensions/personalyze/reconstruction.js
 * @stamp {"utc":"2026-04-05T00:00:00.000Z"}
 * @architectural-role State Derivation (Pure)
 * @description
 * Derives PersonaLyze runtime state from a single forward pass over the chat log.
 * Reads pointer records written by pointerWriter.js.
 *
 * Builds two outputs:
 *   1. characterChain — last-known visual state per character.
 *      This is the DNA chain: every character seen in this chat branch retains
 *      their own outfit/expression slot, independent of which character spoke last.
 *      On a branched chat, the chain correctly reflects only the history that
 *      exists in that branch.
 *
 *   2. Derived "active" pointers — the last character seen and their state,
 *      used to restore the portrait on chat load.
 *
 * Because character definitions live in the Global Registry (extension_settings),
 * this module only tracks which keys were active — not what they mean.
 * Unresolvable keys are silently treated as null rather than throwing.
 *
 * @api-declaration
 * reconstruct(chat) → {
 *   characterChain:      { [characterId]: { outfit, expression, image } },
 *   activeRoster:        string[],
 *   activeCharacterId:   string|null,
 *   activeOutfitKey:     string|null,
 *   activeExpressionKey: string|null,
 *   activeImageFile:     string|null,
 * }
 *
 * @contract
 *   assertions:
 *     purity: pure
 *     state_ownership: []
 *     external_io: []
 */

/**
 * Reads all PLZ pointer records from the chat array and returns:
 *  - A per-character chain of last-known visual state (characterChain)
 *  - The globally last-seen active state (for portrait restoration)
 *
 * @param {object[]} chat  The full context.chat array.
 * @returns {{
 *   characterChain:      object,
 *   activeRoster:        string[],
 *   activeCharacterId:   string|null,
 *   activeOutfitKey:     string|null,
 *   activeExpressionKey: string|null,
 *   activeImageFile:     string|null,
 * }}
 */
export function reconstruct(chat) {
    const characterChain = {};

    let activeRoster        = [];   // last roster record wins (forward pass)
    let activeCharacterId   = null;
    let activeOutfitKey     = null;
    let activeExpressionKey = null;
    let activeImageFile     = null;

    for (const message of chat) {
        const plz = message.extra?.personalyze;
        if (!plz || typeof plz !== 'object') continue;

        // Roster record — independent of character pointer presence.
        // Every time the user changed the roster a new record was written here.
        if (Array.isArray(plz.roster)) {
            activeRoster = plz.roster;
        }

        // Character pointer records require a characterId — skip roster-only records.
        if (!plz.characterId) continue;

        const id      = plz.characterId;
        const prior   = characterChain[id] ?? {};

        // Update this character's chain slot. Null values fall back to whatever
        // this character had previously — a partial record never erases good data.
        characterChain[id] = {
            outfit:     plz.outfit     ?? prior.outfit     ?? null,
            expression: plz.expression ?? prior.expression ?? null,
            image:      plz.image      ?? prior.image      ?? null,
        };

        // Track the globally last-active character for portrait restoration.
        activeCharacterId   = id;
        activeOutfitKey     = characterChain[id].outfit;
        activeExpressionKey = characterChain[id].expression;
        activeImageFile     = characterChain[id].image;
    }

    return {
        characterChain,
        activeRoster,
        activeCharacterId,
        activeOutfitKey,
        activeExpressionKey,
        activeImageFile,
    };
}
