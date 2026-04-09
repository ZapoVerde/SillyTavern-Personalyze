/**
 * @file data/default-user/extensions/personalyze/reconstruction.js
 * @stamp {"utc":"2026-04-07T12:05:00.000Z"}
 * @architectural-role State Derivation (Pure)
 * @description
 * Derives PersonaLyze runtime state from a single forward pass over the chat log.
 * Reads the Array Pattern DNA records written by dnaWriter.js.
 *
 * Builds three major outputs:
 *   1. chatCharacters — the active local wardrobe and definitions for this specific chat.
 *   2. characterChain — the last-known visual state per character (branch safe).
 *   3. Derived "active" pointers — the globally last-active visual state used to 
 *      restore the portrait on chat load.
 *
 * Handles legacy V1 flat-object pointer arrays seamlessly during the scan.
 *
 * @api-declaration
 * reconstruct(chat) → {
 *   chatCharacters:      { [characterId]: { identityAnchor, seed, outfits, expressions } },
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
 * Reads all PLZ DNA records from the chat array and builds the runtime state.
 *
 * @param {object[]} chat The full context.chat array.
 * @returns {object} Derived state bundle.
 */
export function reconstruct(chat) {
    const chatCharacters = {};
    const characterChain = {};

    let activeRoster        = [];
    let activeCharacterId   = null;
    let activeOutfitKey     = null;
    let activeExpressionKey = null;
    let activeImageFile     = null;

    /** Helper to guarantee a valid character structure exists during the scan. */
    const ensureChar = (id) => {
        if (!chatCharacters[id]) {
            chatCharacters[id] = { identityAnchor: '', seed: 1, outfits: {}, expressions: {} };
        }
        return chatCharacters[id];
    };

    for (const message of chat) {
        const plzData = message.extra?.personalyze;
        if (!plzData) continue;

        // Normalize to array to handle both legacy V1 and new DNA Pattern
        let records = [];
        if (Array.isArray(plzData)) {
            records = plzData;
        } else if (typeof plzData === 'object') {
            if (plzData.roster !== undefined) {
                records.push({ type: 'roster', roster: plzData.roster });
            }
            if (plzData.characterId) {
                records.push({
                    type: 'visual_state',
                    characterId: plzData.characterId,
                    outfit: plzData.outfit,
                    expression: plzData.expression,
                    image: plzData.image ?? null
                });
            }
        }

        for (const rec of records) {
            if (!rec || typeof rec !== 'object') continue;

            switch (rec.type) {
                case 'roster':
                    activeRoster = Array.isArray(rec.roster) ? rec.roster : [];
                    break;

                case 'character_def': {
                    if (!rec.characterId) break;
                    const char = ensureChar(rec.characterId);
                    if (rec.anchor !== undefined) char.identityAnchor = rec.anchor;
                    if (rec.seed !== undefined) char.seed = rec.seed;
                    break;
                }

                case 'outfit_def': {
                    if (!rec.characterId || !rec.key) break;
                    const char = ensureChar(rec.characterId);
                    char.outfits[rec.key] = {
                        label: rec.label,
                        description: rec.description,
                        provider: rec.provider || 'pollinations'
                    };
                    break;
                }

                case 'outfit_delete': {
                    if (!rec.characterId || !rec.key) break;
                    const char = ensureChar(rec.characterId);
                    delete char.outfits[rec.key];
                    break;
                }

                case 'expression_def': {
                    if (!rec.characterId || !rec.key) break;
                    const char = ensureChar(rec.characterId);
                    char.expressions[rec.key] = {
                        label: rec.label,
                        description: rec.description
                    };
                    break;
                }

                case 'visual_state': {
                    const id = rec.characterId;
                    if (!id) break;

                    const prior = characterChain[id] ?? {};
                    characterChain[id] = {
                        outfit:     rec.outfit     ?? prior.outfit     ?? null,
                        expression: rec.expression ?? prior.expression ?? null,
                        image:      rec.image      ?? prior.image      ?? null,
                    };

                    // Track globally last-active
                    activeCharacterId   = id;
                    activeOutfitKey     = characterChain[id].outfit;
                    activeExpressionKey = characterChain[id].expression;
                    activeImageFile     = characterChain[id].image;
                    break;
                }
            }
        }
    }

    return {
        chatCharacters,
        characterChain,
        activeRoster,
        activeCharacterId,
        activeOutfitKey,
        activeExpressionKey,
        activeImageFile,
    };
}