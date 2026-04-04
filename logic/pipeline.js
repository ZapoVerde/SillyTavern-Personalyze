/**
 * @file data/default-user/extensions/personalyze/logic/pipeline.js
 * @stamp {"utc":"2026-04-04T00:00:00.000Z"}
 * @architectural-role Orchestrator / Narrative Logic
 * @description
 * Implements the PersonaLyze "Falling Water" detection pipeline.
 *
 * Triggered on every incoming AI message. Designed to halt as early as possible
 * to minimize LLM token spend. The three-step cascade is:
 *
 *   Step 0 — Character Resolution: identify the character from the message.
 *   Step 1 — Dual-Boolean Gate:    did outfit or expression change? (fast/cheap)
 *   Step 2 — Classifiers:          match changed dimensions against known portfolio.
 *   Step 3 — Wardrobe Expansion:   describe and register a NEW outfit/expression.
 *
 * Steps 2 and 3 run independently per dimension (outfit vs expression) so that
 * a known outfit change and a new expression discovery can be handled in the
 * same turn without either blocking the other.
 *
 * @api-declaration
 * runPipeline(messageId) → Promise<void>
 *
 * @contract
 *   assertions:
 *     purity: Stateful IO
 *     state_ownership: [state (mutates via setters)]
 *     external_io: [LLM calls, chat writes, image generation, portrait UI]
 */

import { getContext } from '../../../../extensions.js';
import { error } from '../utils/logger.js';
import { state, updateActiveCharacter, updateActivePointers, updateActiveImage, addToFileIndex } from '../state.js';
import { getSettings } from '../settings.js';
import { getCharacter, upsertOutfit, upsertExpression } from '../registry.js';
import { buildHistoryText, buildDescriberContext, slugify } from '../utils/history.js';
import {
    detectBoolean,
    detectOutfitClassifier,
    detectExpressionClassifier,
    detectOutfitDescriber,
    detectExpressionDescriber,
} from '../detector.js';
import { generate, buildFilename } from '../imageCache.js';
import { setPortrait } from '../portrait.js';
import { lockedWritePointer, lockedPatchPointerImage } from './pointerWriter.js';
import { openDressingRoom } from '../ui/dressingRoom.js';

// ─── Entry Point ──────────────────────────────────────────────────────────────

/**
 * Main entry point for the per-turn detection logic.
 * @param {number} messageId
 */
export async function runPipeline(messageId) {
    const context = getContext();
    const message = context.chat[messageId];

    if (!message || message.is_user) return;

    const s = getSettings();

    // Step 0: Character Resolution
    const characterId = resolveCharacterId(message);
    if (!characterId) return;

    const character = getCharacter(characterId);
    if (!character) return;  // Character not registered with PLZ — skip silently.

    updateActiveCharacter(characterId);

    // Step 1: Dual-Boolean Gate
    const historyText = buildHistoryText(context.chat, messageId, s.booleanHistory ?? 0);
    const { outfit_changed, expression_changed } = await detectBoolean(
        message.mes,
        message.name,
        state.activeOutfitKey    ? character.outfits[state.activeOutfitKey]?.label     ?? state.activeOutfitKey     : 'Unknown',
        state.activeExpressionKey ? character.expressions[state.activeExpressionKey]?.label ?? state.activeExpressionKey : 'Unknown',
        historyText,
        s.booleanPrompt,
        s.booleanProfileId
    );

    if (!outfit_changed && !expression_changed) return;

    // Step 2 + 3: Handle each changed dimension independently.
    // Both may run in the same turn; we await them sequentially to avoid
    // concurrent writes to the same message record.
    let resolvedOutfitKey     = state.activeOutfitKey;
    let resolvedExpressionKey = state.activeExpressionKey;

    if (outfit_changed) {
        resolvedOutfitKey = await handleDimension({
            messageId,
            message,
            context,
            characterId,
            character,
            dimension:      'outfit',
            currentKey:     state.activeOutfitKey,
            portfolio:      character.outfits,
            s,
        }) ?? resolvedOutfitKey;
    }

    if (expression_changed) {
        resolvedExpressionKey = await handleDimension({
            messageId,
            message,
            context,
            characterId,
            character,
            dimension:      'expression',
            currentKey:     state.activeExpressionKey,
            portfolio:      character.expressions,
            s,
        }) ?? resolvedExpressionKey;
    }

    // Commit resolved pointers and update UI.
    if (resolvedOutfitKey && resolvedExpressionKey) {
        updateActivePointers(resolvedOutfitKey, resolvedExpressionKey);
        await applyVisual(messageId, characterId, resolvedOutfitKey, resolvedExpressionKey, character);
    }
}

// ─── Dimension Handler ────────────────────────────────────────────────────────

/**
 * Runs Steps 2 and 3 for a single dimension (outfit or expression).
 * Returns the resolved key, or null if the dimension could not be resolved.
 *
 * @param {object} opts
 * @returns {Promise<string|null>}  The resolved key, or null.
 */
async function handleDimension({ messageId, message, context, characterId, character, dimension, currentKey, portfolio, s }) {
    const isOutfit     = dimension === 'outfit';
    const portfolioKeys = Object.keys(portfolio);
    const historyText  = buildHistoryText(
        context.chat,
        messageId,
        isOutfit ? (s.outfitClassifierHistory ?? 0) : (s.expressionClassifierHistory ?? 0)
    );

    // Step 2: Classifier
    const matchedKey = portfolioKeys.length > 0
        ? await (isOutfit
            ? detectOutfitClassifier(message.mes, message.name, portfolioKeys, portfolio, historyText, s.outfitClassifierPrompt, s.outfitClassifierProfileId)
            : detectExpressionClassifier(message.mes, message.name, portfolioKeys, portfolio, historyText, s.expressionClassifierPrompt, s.expressionClassifierProfileId))
        : 'NEW';

    if (matchedKey === null) return null;   // No change resolved — keep current.
    if (matchedKey !== 'NEW') return matchedKey;

    // Step 3: Wardrobe Expansion — describe and register the new entry.
    const contextText = buildDescriberContext(context.chat, messageId, s.describerHistory ?? 0);
    const described   = isOutfit
        ? await detectOutfitDescriber(contextText, message.name, character.identityAnchor, s.outfitDescriberPrompt, s.describerProfileId)
        : await detectExpressionDescriber(contextText, message.name, character.identityAnchor, s.expressionDescriberPrompt, s.describerProfileId);

    if (!described) return null;

    const newKey = slugify(described.label);

    // Approval via Dressing Room modal.
    const approved = await openDressingRoom({ dimension, ...described, key: newKey });
    if (!approved) return null;

    // Register in the Global Portfolio.
    if (isOutfit) {
        upsertOutfit(characterId, approved.key, approved.label, approved.description);
    } else {
        upsertExpression(characterId, approved.key, approved.label, approved.description);
    }

    return approved.key;
}

// ─── Visual Commit ────────────────────────────────────────────────────────────

/**
 * Resolves the portrait image for the given outfit × expression combination,
 * writes the pointer to the chat message, and applies the portrait to the UI.
 * Generates a new image if the combination has not been rendered before.
 *
 * @param {number} messageId
 * @param {string} characterId
 * @param {string} outfitKey
 * @param {string} expressionKey
 * @param {object} character      The full character record from the registry.
 */
async function applyVisual(messageId, characterId, outfitKey, expressionKey, character) {
    const filename = buildFilename(characterId, outfitKey, expressionKey);

    // Write pointer immediately so the chat record is consistent even before
    // the image is available.
    await lockedWritePointer(messageId, {
        characterId,
        outfit:     outfitKey,
        expression: expressionKey,
        image:      state.fileIndex.has(filename) ? filename : null,
    });

    if (state.fileIndex.has(filename)) {
        // Cache hit — instant replay.
        updateActiveImage(filename);
        setPortrait(filename);
        return;
    }

    // Cache miss — generate in background, patch the pointer when done.
    const outfitDef  = character.outfits[outfitKey];
    const exprDef    = character.expressions[expressionKey];

    if (!outfitDef || !exprDef) return;

    const capturedMsgId = messageId;

    generate(characterId, outfitKey, expressionKey, outfitDef.description, exprDef.description, character.identityAnchor)
        .then(async newFile => {
            addToFileIndex(newFile);
            await lockedPatchPointerImage(capturedMsgId, newFile);
            updateActiveImage(newFile);
            setPortrait(newFile);
        })
        .catch(err => {
            error('Pipeline', 'Portrait generation failed:', err);
            if (window.toastr) window.toastr.error(`Generation failed: ${err.message}`, 'PersonaLyze');
        });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extracts a stable character ID from an AI message.
 * In V1, uses the message's `name` field slugified as the character identifier.
 * @param {object} message
 * @returns {string|null}
 */
function resolveCharacterId(message) {
    // TODO: Cross-reference against ST's character list to get the avatar filename
    // slug, which is more stable than the display name across renames.
    // For V1, the name slug is sufficient.
    if (!message.name) return null;
    return slugify(message.name);
}
