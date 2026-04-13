/**
 * @file data/default-user/extensions/personalyze/reconstruction.js
 * @stamp {"utc":"2026-04-16T12:15:00.000Z"}
 * @architectural-role State Derivation (Pure)
 * @description
 * Derives PersonaLyze runtime state from a single forward pass over the chat DNA.
 * Reconstructs character definitions, saved ensembles, and the layered visual state.
 *
 * Updated for Runware.ai Integration:
 * 1. Added support for the lora_update record type to hydrate pinned LoRAs.
 *
 * @api-declaration
 * reconstruct(chat) → {
 *   chatCharacters:      { [characterId]: { label, identityAnchor, seed, ensembles, aka, defaultEnsemble, slots, runwareLoraAir, runwareLoraWeight } },
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

import { BASE_SLOTS } from './defaults.js';

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
        outerwear: null, top: null, bottom: null, accessories: null, emotion: 'neutral', pose: 'upright'
    };

    /** Helper to guarantee a valid character structure exists. */
    const ensureChar = (id) => {
        if (!chatCharacters[id]) {
            chatCharacters[id] = {
                label:           id.replace(/_/g, ' '),
                identityAnchor:  '',
                seed:            1,
                engine:          null,
                ensembles:       {},
                aka:             [],
                defaultEnsemble: null,
                styleName:       null,
                slots:           [...BASE_SLOTS], // Default minimalist template
                runwareLoraAir:  null,
                runwareLoraWeight: 0.8
            };
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
                    if (rec.engine !== undefined) char.engine = rec.engine || null;
                    break;
                }

                case 'label_update': {
                    if (!rec.characterId || !rec.label) break;
                    const char = ensureChar(rec.characterId);
                    char.label = rec.label;
                    break;
                }

                case 'aka_update': {
                    if (!rec.characterId || !rec.aka) break;
                    const char = ensureChar(rec.characterId);
                    char.aka = Array.isArray(rec.aka) ? [...rec.aka] : [];
                    break;
                }

                case 'slots_update': {
                    if (!rec.characterId || !rec.slots) break;
                    const char = ensureChar(rec.characterId);
                    char.slots = Array.isArray(rec.slots) ? [...rec.slots] : [...BASE_SLOTS];
                    break;
                }

                case 'default_ensemble_set': {
                    if (!rec.characterId) break;
                    const char = ensureChar(rec.characterId);
                    char.defaultEnsemble = rec.key ?? null;
                    break;
                }

                case 'style_update': {
                    if (!rec.characterId) break;
                    const char = ensureChar(rec.characterId);
                    char.styleName = rec.styleName || null;
                    break;
                }

                case 'lora_update': {
                    if (!rec.characterId) break;
                    const char = ensureChar(rec.characterId);
                    char.runwareLoraAir = rec.loraAir || null;
                    char.runwareLoraWeight = rec.weight ?? 0.8;
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

                case 'ensemble_delete': {
                    if (!rec.characterId || !rec.key) break;
                    const char = ensureChar(rec.characterId);
                    delete char.ensembles[rec.key];
                    if (char.defaultEnsemble === rec.key) char.defaultEnsemble = null;
                    break;
                }

                case 'visual_state': {
                    const id = rec.characterId;
                    if (!id) break;

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
                            emotion: rec.expression ?? 'neutral',
                            pose: 'upright',
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