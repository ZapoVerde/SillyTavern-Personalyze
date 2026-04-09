/**
 * @file data/default-user/extensions/personalyze/reconstruction.js
 * @stamp {"utc":"2026-04-10T11:20:00.000Z"}
 * @architectural-role State Derivation (Pure)
 * @description
 * Derives PersonaLyze runtime state from a single forward pass over the chat DNA.
 * Reconstructs character definitions, saved ensembles, and the layered visual state.
 *
 * Built to handle the transition from monolithic outfit keys to the new
 * 5-slot (outerwear, top, bottom, accessories, emotion) state object.
 *
 * @api-declaration
 * reconstruct(chat) → {
 *   chatCharacters:      { [characterId]: { identityAnchor, seed, ensembles } },
 *   characterChain:      { [characterId]: { layers, image } },
 *   activeRoster:        string[],
 *   activeCharacterId:   string|null,
 *   activeLayers:        object,
 *   activeImageFile:     string|null,
 * }
 *
 * @contract
 *   assertions:
 *     purity: Pure Function
 *     state_ownership: []
 *     external_io: []
 */

/**
 * Reads all PLZ DNA records from the chat array and builds the runtime state.
 *
 * @param {object[]} chat - The full context.chat array.
 * @returns {object} Derived state bundle.
 */
export function reconstruct(chat) {
    const chatCharacters = {};
    const characterChain = {};

    let activeRoster      = [];
    let activeCharacterId = null;
    let activeImageFile   = null;
    
    // Default empty state for the active layers
    let activeLayers = {
        outerwear: null, top: null, bottom: null, accessories: null, emotion: 'neutral'
    };

    /** Helper to guarantee a valid character structure exists. */
    const ensureChar = (id) => {
        if (!chatCharacters[id]) {
            chatCharacters[id] = { identityAnchor: '', seed: 1, ensembles: {} };
        }
        return chatCharacters[id];
    };

    for (const message of chat) {
        const plzData = message.extra?.personalyze;
        if (!plzData) continue;

        // DNA Pattern is always an array of event objects
        const records = Array.isArray(plzData) ? plzData : [];

        for (const rec of records) {
            if (!rec || typeof rec !== 'object') continue;

            switch (rec.type) {
                case 'roster':
                    activeRoster = Array.isArray(rec.roster) ? [...rec.roster] : [];
                    break;

                case 'character_def': {
                    if (!rec.characterId) break;
                    const char = ensureChar(rec.characterId);
                    if (rec.anchor !== undefined) char.identityAnchor = rec.anchor;
                    if (rec.seed !== undefined)   char.seed = rec.seed;
                    break;
                }

                case 'ensemble_def': {
                    if (!rec.characterId || !rec.key) break;
                    const char = ensureChar(rec.characterId);
                    char.ensembles[rec.key] = {
                        label:  rec.label,
                        layers: structuredClone(rec.layers ?? {})
                    };
                    break;
                }

                case 'visual_state': {
                    const id = rec.characterId;
                    if (!id) break;

                    // Support new layered format, with legacy fallback
                    let layers;
                    if (rec.layers) {
                        layers = structuredClone(rec.layers);
                    } else if (rec.outfit) {
                        // Migration fallback: map monolithic outfit to 'top' slot
                        layers = {
                            outerwear: null,
                            top: { item: rec.outfit, modifier: null },
                            bottom: null,
                            accessories: null,
                            emotion: rec.expression ?? 'neutral'
                        };
                    } else {
                        layers = structuredClone(activeLayers);
                    }

                    characterChain[id] = {
                        layers: layers,
                        image:  rec.image ?? null
                    };

                    // Track globally last-active
                    activeCharacterId = id;
                    activeLayers      = layers;
                    activeImageFile   = rec.image ?? null;
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
        activeLayers,
        activeImageFile,
    };
}