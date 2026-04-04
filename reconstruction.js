/**
 * @file data/default-user/extensions/personalyze/reconstruction.js
 * @stamp {"utc":"2026-04-04T00:00:00.000Z"}
 * @architectural-role State Derivation (Pure)
 * @description
 * Derives the active PersonaLyze runtime state from a single forward pass over
 * the chat log. Reads pointer records written by pointerWriter.js and returns
 * the resolved state at the end of the chat.
 *
 * Because character definitions live in the Global Registry (extension_settings),
 * this module only needs to track which keys were active — not what they mean.
 * Unresolvable pointer keys (e.g. from a registry that no longer contains them)
 * are silently treated as null rather than throwing.
 *
 * @api-declaration
 * reconstruct(chat) → { activeCharacterId, activeOutfitKey, activeExpressionKey, activeImageFile }
 *
 * @contract
 *   assertions:
 *     purity: pure
 *     state_ownership: []
 *     external_io: []
 */

/**
 * Reads all PLZ pointer records from the chat array and returns the final
 * visual state at the end of the conversation.
 *
 * @param {object[]} chat  The full context.chat array.
 * @returns {{
 *   activeCharacterId:   string|null,
 *   activeOutfitKey:     string|null,
 *   activeExpressionKey: string|null,
 *   activeImageFile:     string|null,
 * }}
 */
export function reconstruct(chat) {
    let activeCharacterId   = null;
    let activeOutfitKey     = null;
    let activeExpressionKey = null;
    let activeImageFile     = null;

    for (const message of chat) {
        const plzData = message.extra?.personalyze;
        if (!plzData || typeof plzData !== 'object') continue;

        // A pointer record must always include a characterId.
        // Records missing characterId are legacy/corrupt — skip them.
        if (!plzData.characterId) continue;

        activeCharacterId   = plzData.characterId;
        activeOutfitKey     = plzData.outfit     ?? activeOutfitKey;
        activeExpressionKey = plzData.expression ?? activeExpressionKey;
        activeImageFile     = plzData.image      ?? activeImageFile;
    }

    return {
        activeCharacterId,
        activeOutfitKey,
        activeExpressionKey,
        activeImageFile,
    };
}
